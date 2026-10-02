/**
 * 数据收集 v3 状态机＋落盘层（单场行存 IDB battles/cur 表，总数读时求和）。
 * 分段由战斗引擎驱动：一局＝从 Initializing 到终局（多轮），类型来自引擎。
 * - 写路径只碰 cur 表（异步 fire-and-forget，串行化保证回合顺序），endBattle 落整行；
 * - 总数无累计键，由 queries.deriveTotals 对单场求和；
 * - 行恒全量（TurnStat 全字段＋drops＋modes），无 recordEach 门控。
 */
import { snapshotOptions } from '../store';
import { logger } from '../logger';
import {
  getDb,
  idbPut,
  idbGet,
  idbDelete,
  pruneStore,
  BATTLES_STORE,
  CUR_STORE,
} from '../recorder';
import { addCost, addKills, parseTurn, stripHtml } from './parse';
import { bump, emptyTurn, newCur } from './types';
import type { BattleRow, CurBattle, TurnStat } from './types';

const CUR_KEY = 'cur';

/** 单场列表保留条数：战斗热路径只追加，修剪统一在非战斗页面空闲时经 pruneStats() 一次完成。 */
export const BATTLES_CAP = 2000;

/** 写串行化：IDB 请求异步，并发 turn/动作按调用顺序依次落盘。 */
let writeChain: Promise<void> = Promise.resolve();

function chain<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeChain.then(fn, fn);
  writeChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

/**
 * 记录生命周期状态机（idle → open → idle）。
 * - 状态唯一真相：cur 表是否存在单行（存在＝open）；
 * - 转移：begin（idle/open→open，开新局时顶掉旧局记 interrupted）、
 *   turn（仅 open 累加；idle 收到 turn 则自动以 '?' 开局）、
 *   end（open→idle 落盘）；
 * - 每次转移记 logtape，UI/调试可查当前态。
 * parseTurn 保持纯函数，不进状态机。
 */
export type RecState = 'idle' | 'open';

/** 当前记录态（IDB 读；私密浏览等 IDB 不可用时回落 idle）。 */
export async function recState(): Promise<RecState> {
  try {
    const cur = await idbGet<CurBattle>(CUR_STORE, CUR_KEY);
    return cur ? 'open' : 'idle';
  } catch {
    return 'idle';
  }
}

function transition(action: string, detail = ''): void {
  logger.debug('rec {action} {detail}', { action, detail });
}

function battleKey(at: number): string {
  const d = new Date(at);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 旧行回填（缺字段补默认，保证 UI bind 永不拿 undefined；原地修改） */
export function backfillCur(c: CurBattle): CurBattle {
  const d = newCur(c.type, c.code);
  const base = emptyTurn();
  const r = c as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries({ ...base, ...d })) {
    if (r[k] === undefined) r[k] = v;
  }
  c.drops ??= [];
  c.modes ??= {};
  return c;
}

export function backfillRow(b: BattleRow): BattleRow {
  const base = emptyTurn();
  const r = b as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(base)) {
    if (r[k] === undefined) r[k] = v;
  }
  b.key ??= '';
  b.type ??= '?';
  b.code ??= '';
  b.result ??= '?';
  b.rounds ??= 0;
  b.turns ??= 0;
  b.startedAt ??= 0;
  b.endedAt ??= b.startedAt ?? 0;
  b.monsters ??= 0;
  b.bosses ??= 0;
  b.drops ??= [];
  b.modes ??= {};
  return b;
}

/** 纯函数：单轮统计并入当前局（全 TurnStat 字段＋掉落；mpCost/ocCost 由 addCostToCur 补）。可单测。 */
export function applyTurnToCur(cur: CurBattle, st: TurnStat, drops: string[]): CurBattle {
  backfillCur(cur);
  cur.turns++;
  cur.damage += st.damage;
  cur.crits += st.crits;
  cur.taken += st.taken;
  cur.takenPhys = (cur.takenPhys ?? 0) + st.takenPhys;
  cur.takenMag = (cur.takenMag ?? 0) + st.takenMag;
  cur.takenPhysCount = (cur.takenPhysCount ?? 0) + (st.takenPhysCount ?? 0);
  cur.takenMagCount = (cur.takenMagCount ?? 0) + (st.takenMagCount ?? 0);
  cur.takenCount = (cur.takenCount ?? 0) + st.takenCount;
  cur.absorbed += st.absorbed;
  cur.evades += st.evades;
  cur.misses += st.misses;
  cur.focus += st.focus;
  cur.healedHp += st.healedHp;
  cur.restoredMp += st.restoredMp;
  cur.restoredSp += st.restoredSp;
  cur.exp += st.exp;
  cur.credit += st.credit;
  cur.kills += st.kills;
  cur.drops.push(...drops);
  for (const [k, v] of Object.entries(st.damageByType)) bump(cur.damageByType, k, v);
  for (const [k, v] of Object.entries(st.takenByType)) bump(cur.takenByType, k, v);
  for (const [k, v] of Object.entries(st.restoreBySource)) bump(cur.restoreBySource, k, v);
  for (const [k, v] of Object.entries(st.casts)) bump(cur.casts, k, v);
  for (const [k, v] of Object.entries(st.itemsUsed)) bump(cur.itemsUsed, k, v);
  for (const [k, v] of Object.entries(st.buffs)) bump(cur.buffs, k, v);
  for (const [k, v] of Object.entries(st.proficiency)) bump(cur.proficiency, k, v);
  return cur;
}

/** 纯函数：当前局＋终局结果→落盘行（剥离 cur 表主键 k）。可单测。 */
export function rowFromCur(cur: CurBattle, result: string, endedAt = Date.now()): BattleRow {
  backfillCur(cur);
  const { k: _k, ...rest } = cur as CurBattle & { k?: unknown };
  void _k;
  return {
    ...emptyTurn(),
    ...rest,
    key: battleKey(cur.startedAt),
    endedAt,
    result,
    drops: [...cur.drops],
    damageByType: { ...cur.damageByType },
    takenByType: { ...cur.takenByType },
    casts: { ...cur.casts },
    itemsUsed: { ...cur.itemsUsed },
    buffs: { ...cur.buffs },
    restoreBySource: { ...cur.restoreBySource },
    proficiency: { ...cur.proficiency },
    modes: { ...cur.modes },
  };
}

async function flushBattle(cur: CurBattle, result: string): Promise<void> {
  backfillCur(cur);
  const db = await getDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(BATTLES_STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(BATTLES_STORE).add(rowFromCur(cur, result));
  });
  await idbDelete(CUR_STORE, CUR_KEY);
}

/** 非战斗页面空闲时集中驱逐一次：battles 表只留最新 BATTLES_CAP 场。失败静默。 */
export function pruneStats(): Promise<void> {
  return pruneStore(BATTLES_STORE, BATTLES_CAP);
}

/** 一局开始（引擎在 newRound 看到 Round 1 时调用）：顶掉未落盘的上一局 */
export function beginBattle(type: string, code: string): Promise<void> {
  return chain(async () => {
    try {
      const opt = snapshotOptions();
      if (!opt.recordUsage) return;
      const prev = await idbGet<CurBattle>(CUR_STORE, CUR_KEY);
      if (prev && (prev.turns ?? 0) > 0) {
        transition('begin:flush-interrupted', `type=${prev.type} turns=${prev.turns}`);
        await flushBattle(prev, 'interrupted');
      }
      transition('begin', `type=${type} code=${code}`);
      await idbPut(CUR_STORE, { k: CUR_KEY, ...newCur(type, code), rounds: 1 });
    } catch {
      /* 记录失败不影响战斗 */
    }
  });
}

/** 新一轮开始（同局内轮数累加；无局时先开未知局） */
export function beginRound(): Promise<void> {
  return chain(async () => {
    try {
      const opt = snapshotOptions();
      if (!opt.recordUsage) return;
      const cur = (await idbGet<CurBattle>(CUR_STORE, CUR_KEY)) ?? newCur('?', '?');
      if (cur.rounds === 0 && cur.turns === 0) transition('begin:auto', 'round-without-battle');
      cur.rounds++;
      await idbPut(CUR_STORE, { k: CUR_KEY, ...backfillCur(cur) });
    } catch {
      /* ignore */
    }
  });
}

/** 一局结束（引擎在 Victory/Defeat 分支调用）；无局时忽略 */
export function endBattle(result: 'victory' | 'defeat'): Promise<void> {
  return chain(async () => {
    try {
      const cur = await idbGet<CurBattle>(CUR_STORE, CUR_KEY);
      if (!cur) return;
      transition(
        'end',
        `result=${result} type=${cur.type} rounds=${cur.rounds} turns=${cur.turns}`,
      );
      await flushBattle(cur, result);
    } catch {
      /* ignore */
    }
  });
}

/**
 * 动作模式计数（老 stats.self[mode]）：在动作派发时调用（与 recordSpellCost 同模式），
 * 只累加当前局，落盘时随行持久化，总数读时求和。失败静默，绝不挡战斗。
 */
export function recordMode(kind: string): Promise<void> {
  return chain(async () => {
    try {
      if (!kind) return;
      const opt = snapshotOptions();
      if (!opt.recordUsage) return;
      const cur = await idbGet<CurBattle>(CUR_STORE, CUR_KEY);
      if (!cur) return;
      backfillCur(cur);
      bump(cur.modes, kind);
      await idbPut(CUR_STORE, { k: CUR_KEY, ...cur });
    } catch {
      /* ignore */
    }
  });
}

/**
 * 施法成本补记（老 hurt.mp/oc；成本来自 DOM onmouseover，textlog 里没有）。
 * 只累加当前局。失败静默。
 */
export function addCostToCur(mp: number, oc: number): Promise<void> {
  return chain(async () => {
    try {
      const opt = snapshotOptions();
      if (!opt.recordUsage) return;
      if (!mp && !oc) return;
      const cur = await idbGet<CurBattle>(CUR_STORE, CUR_KEY);
      if (!cur) return;
      backfillCur(cur);
      addCost(cur, mp, oc);
      await idbPut(CUR_STORE, { k: CUR_KEY, ...cur });
    } catch {
      /* ignore */
    }
  });
}

/**
 * 终局怪/Boss 构成补记（老 self._monster/_boss）：endBattle 前调用，只改当前局，随行落盘。
 * 与 endBattle 同走串行链，调用顺序即落盘顺序。失败静默。
 */
export function addKillsToCur(monsters: number, bosses: number): Promise<void> {
  return chain(async () => {
    try {
      const opt = snapshotOptions();
      if (!opt.recordUsage) return;
      const cur = await idbGet<CurBattle>(CUR_STORE, CUR_KEY);
      if (!cur) return;
      backfillCur(cur);
      addKills(cur, monsters, bosses);
      await idbPut(CUR_STORE, { k: CUR_KEY, ...cur });
    } catch {
      /* ignore */
    }
  });
}

/**
 * 记录一轮战斗响应。rows 为该响应的 textlog 原始行（含 HTML，颜色供掉落折叠用）。
 * 只累加当前局；分段（开局/终局）由引擎经 beginBattle/beginRound/endBattle 驱动。
 * 仅在 recordUsage 开启时工作。失败静默，绝不挡战斗。
 */
export function recordBattleTurn(rows: string[]): Promise<void> {
  return chain(async () => {
    try {
      const opt = snapshotOptions();
      if (!opt.recordUsage) return;
      const raw = rows.filter((r) => stripHtml(r).trim());
      if (raw.length === 0) return;
      const { stat: st, drops } = parseTurn(
        raw,
        (opt as unknown as { dropQuality?: string }).dropQuality ?? '',
      );
      const cur = backfillCur((await idbGet<CurBattle>(CUR_STORE, CUR_KEY)) ?? newCur('?', '?'));
      if (cur.rounds === 0 && cur.turns === 0) transition('turn:auto-open', 'turn-without-battle');
      applyTurnToCur(cur, st, drops);
      await idbPut(CUR_STORE, { k: CUR_KEY, ...cur });
    } catch {
      /* ignore */
    }
  });
}
