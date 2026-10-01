/**
 * 数据收集 v2 状态机＋落盘层（stats/ 唯一碰 kv/store 的地方）。
 * 分段由战斗引擎驱动：一局＝从 Initializing 到终局（多轮），类型来自引擎。
 * - recordBattleTurn()：累加 totals + 当前战斗，遇 Victory/Defeat 落盘；
 * - 存储 key 全用 stats2* 新命名空间（老 stats 数据不可靠，不做迁移）。
 */
import { kvGet, kvSet, kvDel, snapshotOptions } from '../store';
import { STATS_KEY, BATTLES_KEY, CUR_BATTLE_KEY } from '../storage-keys';
import { logger } from '../logger';
import { bump, emptyTotals, newCur } from './types';
import type { BattleDetail, BattleRow, CurBattle, Totals, TurnStat } from './types';
import { parseTurn, stripHtml } from './parse';

function mergeTotals(t: Totals, s: TurnStat): void {
  t.turns++;
  if (!t.startedAt) t.startedAt = Date.now();
  t.damage += s.damage;
  t.crits += s.crits;
  t.mpCost = (t.mpCost ?? 0) + s.mpCost;
  t.ocCost = (t.ocCost ?? 0) + s.ocCost;
  t.taken += s.taken;
  t.takenPhys = (t.takenPhys ?? 0) + s.takenPhys;
  t.takenMag = (t.takenMag ?? 0) + s.takenMag;
  t.takenPhysCount = (t.takenPhysCount ?? 0) + (s.takenPhysCount ?? 0);
  t.takenMagCount = (t.takenMagCount ?? 0) + (s.takenMagCount ?? 0);
  t.takenCount = (t.takenCount ?? 0) + s.takenCount;
  t.absorbed += s.absorbed;
  t.evades += s.evades;
  t.misses += s.misses;
  t.focus += s.focus;
  t.healedHp += s.healedHp;
  t.restoredMp += s.restoredMp;
  t.restoredSp += s.restoredSp;
  t.exp += s.exp;
  t.credit += s.credit;
  t.kills += s.kills;
  // Totals-only 台账（monsters/bosses/modes/startedAt）不在 TurnStat 里，合并时只保底不累加
  t.monsters ??= 0;
  t.bosses ??= 0;
  t.modes ??= {};
  t.restoreBySource ??= {};
  for (const [k, v] of Object.entries(s.damageByType)) bump(t.damageByType, k, v);
  for (const [k, v] of Object.entries(s.takenByType)) bump(t.takenByType, k, v);
  for (const [k, v] of Object.entries(s.restoreBySource)) bump(t.restoreBySource, k, v);
  for (const [k, v] of Object.entries(s.casts)) bump(t.casts, k, v);
  for (const [k, v] of Object.entries(s.itemsUsed)) bump(t.itemsUsed, k, v);
  for (const [k, v] of Object.entries(s.buffs)) bump(t.buffs, k, v);
  for (const [k, v] of Object.entries(s.proficiency)) bump(t.proficiency, k, v);
}

/** 旧存档回填（缺字段补默认，保证 UI bind 永不拿 undefined；原地修改） */
export function backfillTotals(t: Totals): Totals {
  const d = emptyTotals();
  const r = t as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(d)) {
    if (r[k] === undefined) r[k] = v;
  }
  t.modes ??= {};
  t.takenPhysCount ??= 0;
  t.takenMagCount ??= 0;
  return t;
}

export function backfillCur(c: CurBattle): CurBattle {
  const d = newCur(c.type, c.code);
  const r = c as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(d)) {
    if (r[k] === undefined) r[k] = v;
  }
  return c;
}

export function backfillRow(b: BattleRow): BattleRow {
  b.code ??= '';
  b.endedAt ??= b.startedAt ?? 0;
  b.modes ??= {};
  if (b.detail === undefined) b.detail = null;
  return b;
}

/**
 * 记录生命周期状态机（idle → open → idle）。
 * - 状态唯一真相：CUR_BATTLE_KEY 是否存在（存在＝open）；
 * - 转移：begin（idle/open→open，开新局时顶掉旧局记 interrupted）、
 *   turn（仅 open 累加；idle 收到 turn 则自动以 '?' 开局，保证 totals 可对账）、
 *   end（open→idle 落盘）；
 * - 每次转移记 logtape，UI/调试可查当前态（recState）。
 * parseTurn 保持纯函数，不进状态机。
 */
export type RecState = 'idle' | 'open';

export function recState(): RecState {
  return kvGet(CUR_BATTLE_KEY) === null ? 'idle' : 'open';
}

function transition(action: string, detail = ''): void {
  logger.debug('rec {action} {detail}', { action, detail });
}

function battleKey(at: number): string {
  const d = new Date(at);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 单场列表保留条数：战斗热路径只追加，修剪统一在非战斗页面空闲时经 pruneBattles() 一次完成。 */
export const BATTLES_CAP = 50;

function flushBattle(cur: CurBattle, result: string): void {
  const totals = backfillTotals((kvGet(STATS_KEY, true) as Totals | null) ?? emptyTotals());
  totals.battles++;
  kvSet(STATS_KEY, totals);
  backfillCur(cur);
  let detail: BattleDetail | null = null;
  try {
    if (snapshotOptions().main.recordEach) {
      detail = {
        damageByType: { ...cur.damageByType },
        takenByType: { ...cur.takenByType },
        casts: { ...cur.casts },
        itemsUsed: { ...cur.itemsUsed },
        restoreBySource: { ...cur.restoreBySource },
        proficiency: { ...cur.proficiency },
      };
    }
  } catch {
    detail = null;
  }
  const list = (kvGet(BATTLES_KEY, true) as BattleRow[] | null) ?? [];
  list.push({
    key: battleKey(cur.startedAt),
    startedAt: cur.startedAt,
    endedAt: Date.now(),
    type: cur.type,
    code: cur.code ?? '',
    result,
    rounds: cur.rounds,
    turns: cur.turns,
    damage: cur.damage,
    taken: cur.taken,
    exp: cur.exp,
    credit: cur.credit,
    kills: cur.kills,
    monsters: cur.monsters ?? 0,
    bosses: cur.bosses ?? 0,
    drops: cur.drops,
    modes: { ...cur.modes },
    detail,
  });
  kvSet(BATTLES_KEY, list);
  kvDel(CUR_BATTLE_KEY);
}

/** 非战斗页面空闲时集中驱逐一次：BATTLES_KEY 只留最新 BATTLES_CAP 场。失败静默。 */
export function pruneBattles(): void {
  try {
    const list = (kvGet(BATTLES_KEY, true) as BattleRow[] | null) ?? [];
    if (list.length > BATTLES_CAP) kvSet(BATTLES_KEY, list.slice(-BATTLES_CAP));
  } catch {
    /* 修剪失败不影响页面 */
  }
}

/** 一局开始（引擎在 newRound 看到 Round 1 时调用）：顶掉未落盘的上一局 */
export function beginBattle(type: string, code: string): void {
  const opt = snapshotOptions();
  if (!opt.recordUsage) return;
  const prev = kvGet(CUR_BATTLE_KEY, true) as CurBattle | null;
  if (prev && prev.turns > 0) {
    transition('begin:flush-interrupted', `type=${prev.type} turns=${prev.turns}`);
    flushBattle(prev, 'interrupted');
  }
  transition('begin', `type=${type} code=${code}`);
  kvSet(CUR_BATTLE_KEY, { ...newCur(type, code), rounds: 1 });
}

/** 新一轮开始（同局内轮数累加；无局时先开未知局，保证 totals 可对账） */
export function beginRound(): void {
  const opt = snapshotOptions();
  if (!opt.recordUsage) return;
  const cur = (kvGet(CUR_BATTLE_KEY, true) as CurBattle | null) ?? newCur('?', '?');
  if (cur.rounds === 0 && cur.turns === 0) transition('begin:auto', 'round-without-battle');
  cur.rounds++;
  kvSet(CUR_BATTLE_KEY, cur);
}

/** 一局结束（引擎在 Victory/Defeat 分支调用）；无局时忽略 */
export function endBattle(result: 'victory' | 'defeat'): void {
  const cur = kvGet(CUR_BATTLE_KEY, true) as CurBattle | null;
  if (!cur) return;
  transition('end', `result=${result} type=${cur.type} rounds=${cur.rounds} turns=${cur.turns}`);
  flushBattle(cur, result);
}

/**
 * 动作模式计数（老 stats.self[mode]）：在动作派发时调用（与 recordSpellCost 同模式），
 * 同步累加 totals.modes + cur.modes。失败静默，绝不挡战斗。
 */
export function recordMode(kind: string): void {
  try {
    if (!kind) return;
    const opt = snapshotOptions();
    if (!opt.recordUsage) return;
    const totals = backfillTotals((kvGet(STATS_KEY, true) as Totals | null) ?? emptyTotals());
    bump(totals.modes, kind);
    kvSet(STATS_KEY, totals);
    const cur = kvGet(CUR_BATTLE_KEY, true) as CurBattle | null;
    if (cur) {
      backfillCur(cur);
      bump(cur.modes, kind);
      kvSet(CUR_BATTLE_KEY, cur);
    }
  } catch {
    /* ignore */
  }
}

/**
 * 记录一轮战斗响应。rows 为该响应的 textlog 原始行（含 HTML，颜色供掉落折叠用）。
 * 只累加 totals + 当前局；分段（开局/终局）由引擎经 beginBattle/beginRound/endBattle 驱动。
 * 仅在 recordUsage 开启时工作。
 */
export function recordBattleTurn(rows: string[]): void {
  const opt = snapshotOptions();
  if (!opt.recordUsage) return;
  const raw = rows.filter((r) => stripHtml(r).trim());
  if (raw.length === 0) return;
  const { stat: st, drops } = parseTurn(
    raw,
    (opt as unknown as { dropQuality?: string }).dropQuality ?? '',
  );
  const totals = backfillTotals((kvGet(STATS_KEY, true) as Totals | null) ?? emptyTotals());
  mergeTotals(totals, st);
  kvSet(STATS_KEY, totals);

  const cur = backfillCur((kvGet(CUR_BATTLE_KEY, true) as CurBattle | null) ?? newCur('?', '?'));
  if (cur.rounds === 0 && cur.turns === 0) transition('turn:auto-open', 'turn-without-battle');
  cur.turns++;
  cur.damage += st.damage;
  cur.taken += st.taken;
  cur.exp += st.exp;
  cur.credit += st.credit;
  cur.kills += st.kills;
  cur.monsters ??= 0;
  cur.bosses ??= 0;
  cur.drops.push(...drops);
  for (const [k, v] of Object.entries(st.damageByType)) bump(cur.damageByType, k, v);
  for (const [k, v] of Object.entries(st.takenByType)) bump(cur.takenByType, k, v);
  for (const [k, v] of Object.entries(st.casts)) bump(cur.casts, k, v);
  for (const [k, v] of Object.entries(st.itemsUsed)) bump(cur.itemsUsed, k, v);
  for (const [k, v] of Object.entries(st.restoreBySource)) bump(cur.restoreBySource, k, v);
  for (const [k, v] of Object.entries(st.proficiency)) bump(cur.proficiency, k, v);
  kvSet(CUR_BATTLE_KEY, cur);
}
