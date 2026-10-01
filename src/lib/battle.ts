import { get } from 'svelte/store';
import {
  battle,
  kvGet,
  kvSet,
  kvDel,
  snapshotOptions,
  isDisabled,
  publishSpellDelays,
  readSpellDelays,
} from './store';
import { qs, qsa, el, click as rawClick } from './dom';
import { checkCondition } from './conditions';
import { setAlarm } from './notify';
import { logger } from './logger';
import { recordTurn, handleRec } from './recorder';
import { pause, resume, after } from './fsm';
import { requestRetry, httpGet, sleep } from './http';
import {
  beginBattle,
  beginRound,
  endBattle,
  addCost,
  addKills,
  getTotals,
  recordMode,
} from './stats';
import type { Totals, CurBattle } from './stats';
import type { Action } from './combat/types';
import { readSnapshot, resolveTarget, orderTargets } from './combat/snapshot';
import { decide, shouldEmergencyPause } from './combat/decide';
import { executeAction, describeAction } from './combat/execute';
import { tt } from './i18n';
import {
  ROUND_TYPE_KEY,
  ROUND_NOW_KEY,
  ROUND_ALL_KEY,
  MONSTER_STATUS_KEY,
  MONSTER_BASE_KEY,
  STATS_KEY,
  CUR_BATTLE_KEY,
  ENCOUNTER_KEY,
  STAMINA_LOG_KEY,
} from './storage-keys';
import { LOG_CLASS, PAUSE_BOX_ID } from './dom-ids';

function patchBattle(partial: Partial<import('./types').BattleState>): void {
  battle.update((b) => ({ ...b, ...partial }));
}

/** 带观测的点击：debug 开启时把目标记到 __ahvauto.lastAction */
function click(sel: string | Element | null): boolean {
  if (typeof sel === 'string') debugAct(sel);
  else if (sel) debugAct(`#${(sel as Element).id || (sel as Element).tagName}`);
  else debugAct('null');
  return rawClick(sel);
}

function goto(): void {
  location.href = location.search;
  setTimeout(goto, 5000);
}

export function pauseChange(): void {
  if (!isDisabled()) {
    const btn = qs('.pauseChange');
    if (btn) btn.innerHTML = tt('resume');
    pause('button');
  } else {
    const btn = qs('.pauseChange');
    if (btn) btn.innerHTML = tt('pause');
    resume('button');
    void main();
  }
}

function fixMonsterStatus(): void {
  const all = get(battle).monsterAll || qsa('div.btm1').length;
  const bossAll = get(battle).bossAll;
  const status = Array.from({ length: all }, (_, i) => (i < bossAll ? 100000 : 1000));
  patchBattle({ monsterStatus: status, monsterBase: [...status] });
  kvSet(MONSTER_STATUS_KEY, status);
  kvSet(MONSTER_BASE_KEY, status);
  goto();
}

/** 回合初始化：解析 roundType / roundNow / monsterStatus，原 newRound */
export async function newRound(): Promise<void> {
  patchBattle({ turn: 0, otos: { OFC: 0, FRD: 0, T3: 0, T2: 0, T1: 0 } });
  try {
    debugSurface().history = [];
  } catch {
    /* ignore */
  }
  if (location.hash !== '') {
    goto();
    return;
  }
  const monsterAll = qsa('div.btm1').length;
  const monsterDead = qsa('img[src*="nbardead"]').length;
  const bossAll = qsa('div.btm2[style^="background"]').length;
  const bossDead = qsa('div.btm1[style*="opacity"] div.btm2[style*="background"]').length;
  patchBattle({
    monsterAll,
    monsterAlive: monsterAll - monsterDead,
    bossAll,
    bossAlive: bossAll - bossDead,
  });

  const opt = snapshotOptions();
  if (opt.main.autoFlee && checkCondition(opt.main.fleeCondition)) {
    click('1001');
    await sleep(3000);
    goto();
    return;
  }

  const battleLog = qsa('#textlog>tbody>tr>td');
  const last = battleLog[battleLog.length - 1]?.textContent ?? '';
  try {
    if (snapshotOptions().main.debug) {
      const dbg = debugSurface();
      dbg.step = `newRound:n=${battleLog.length}:last=${last.slice(0, 60)}`;
      dbg.nr = `last=${last.slice(0, 60)}`;
    }
  } catch {
    /* ignore */
  }
  let roundType = (kvGet(ROUND_TYPE_KEY) as string | null) ?? '';
  if (!roundType) {
    if (!last.startsWith('Initializing')) roundType = '';
    else if (
      last.startsWith('Initializing arena challenge') &&
      Number(last.match(/\d+/)?.[0]) <= 35
    )
      roundType = 'ar';
    else if (last.startsWith('Initializing arena challenge')) roundType = 'rb';
    else if (last.startsWith('Initializing random encounter')) {
      roundType = 'ba';
      if (opt.main.encounter) {
        const enc = (kvGet(ENCOUNTER_KEY, true) as { lastTime: number; time: number } | null) ?? {
          lastTime: 0,
          time: 0,
        };
        enc.lastTime = Date.now();
        enc.time += 1;
        kvSet(ENCOUNTER_KEY, enc);
      }
    } else if (last.startsWith('Initializing Item World')) roundType = 'iw';
    else if (last.startsWith('Initializing Grindfest')) roundType = 'gr';
    else roundType = '';
    kvSet(ROUND_TYPE_KEY, roundType);
  }
  patchBattle({ roundType });

  if (/You lose \d+ Stamina/.test(battleLog[0]?.textContent ?? '')) {
    const log = (kvGet(STAMINA_LOG_KEY, true) as Record<string, number> | null) ?? {};
    const lost = Number(battleLog[0].textContent.match(/You lose (\d+) Stamina/)?.[1] ?? 0);
    log[new Date().toLocaleString()] = lost;
    kvSet(STAMINA_LOG_KEY, log);
    if (lost >= opt.main.staminaLose) {
      await setAlarm('Error');
      if (!confirm('Continue?\nStamina lost too much')) {
        pauseChange();
        return;
      }
    }
  }

  if (/Initializing/.test(last)) {
    const status: { order: number; id: number; hp: number }[] = [];
    let prevHp = 0;
    for (let i = battleLog.length - 2, id = 0; i > battleLog.length - 2 - monsterAll; i--, id++) {
      const m = battleLog[i]?.textContent.match(/HP=(\d+)$/);
      const hp = m ? Number(m[1]) : prevHp;
      prevHp = hp;
      status.push({ order: id, id: id === 9 ? 0 : id + 1, hp });
    }
    kvSet(
      MONSTER_STATUS_KEY,
      status.map((s) => s.hp),
    );
    kvSet(
      MONSTER_BASE_KEY,
      status.map((s) => s.hp),
    );
    patchBattle({
      monsterStatus: status.map((s) => s.hp),
      monsterBase: status.map((s) => s.hp),
    });
    const round = last.match(/\(Round (\d+) \/ (\d+)\)/);
    const [roundNow, roundAll] =
      roundType !== 'ba' && round ? [Number(round[1]), Number(round[2])] : [1, 1];
    kvSet(ROUND_NOW_KEY, String(roundNow));
    kvSet(ROUND_ALL_KEY, String(roundAll));
    patchBattle({ roundNow, roundAll });
    // 注意：每轮的拉取页日志都以新的 Initializing 行收尾，
    // 因此只有 Round 1 才是真正开局，其余是同局换轮
    if (roundNow === 1) {
      beginBattle(roundType || '?', `${roundType || '?'} ${roundNow}/${roundAll}`);
    } else {
      beginRound();
    }
  } else {
    beginRound();
    patchBattle({
      roundNow: Number(kvGet(ROUND_NOW_KEY) ?? 1),
      roundAll: Number(kvGet(ROUND_ALL_KEY) ?? 1),
    });
  }
}

function battleInfo(): void {
  const b = get(battle);
  let log = qs(`.${LOG_CLASS}`);
  if (!log) {
    const box = qs(`#${PAUSE_BOX_ID}`);
    if (!box) return;
    log = box.appendChild(el('div'));
    log.className = LOG_CLASS;
  }
  const names = ['物理', '火', '冰', '雷', '风', '圣', '暗'];
  const hist = (debugSurface().history ?? []).slice(-10).reverse();
  log.innerHTML =
    `Turns: ${b.turn}<br>Speed: ${b.runSpeed} t/s` +
    `<br>Round: ${b.roundNow}/${b.roundAll}` +
    `<br>攻击模式: ${names[b.attackStatus] ?? ''}` +
    `<br>敌人: ${b.monsterAlive}/${b.monsterAll}` +
    (hist.length > 0
      ? '<br>——<br>' +
        hist.map((h) => `Turn ${h.turn} [${tt(`r.${h.rule}`)}] ${h.action}`).join('<br>')
      : '');
  document.title = `${b.turn}||${b.runSpeed}||${b.roundNow}/${b.roundAll}||${b.monsterAlive}/${b.monsterAll}`;
}

/**
 * 数据收集 v2 接入（capture-agent，只读 DOM，失败静默，绝不挡战斗）：
 * - 施法成本 MP/OC：老版在 eventStart 读技能 DOM 的 onmouseover（legacy L2167-2173）。
 *   新架构等价点是 mainInner 里 decide 命中法术动作时读同一 DOM；
 *   本函数同步写 kv，响应侧 handleRec 直调 recordBattleTurn（同任务内、eventEnd 点击前），
 *   故成本先落盘、回合统计后合并，是同一 turn 的 kv 对象，无竞态。
 * - 怪/Boss 构成：终局 endBattle 调用前以本局 monsterAll/bossAll 补记，随行落盘。
 */

/** 技能 DOM onmouseover → 本次施法 MP/OC（legacy 正则原样沿用，读不到记 0） */
function spellCost(skillId: string): { mp: number; oc: number } {
  try {
    const over = document.getElementById(skillId)?.getAttribute('onmouseover') ?? '';
    const m = over.match(/\('.*', '.*', '.*', (\d+), (\d+), \d+\)/);
    if (!m) return { mp: 0, oc: 0 };
    return { mp: Number(m[1]) || 0, oc: Number(m[2]) || 0 };
  } catch {
    return { mp: 0, oc: 0 };
  }
}

/**
 * 法术动作（法术书施放，游戏侧 mode=magic）→ MP/OC 累进 totals（STATS_KEY）。
 * 注：CurBattle/BattleRow 无成本列，成本只记 totals（与 stats-legacy 类型一致）。
 */
function recordSpellCost(action: Action): void {
  try {
    const id =
      action.kind === 'magic' || action.kind === 'debuff' || action.kind === 'buff'
        ? action.id
        : action.kind === 'imperil'
          ? '213'
          : null;
    if (!id) return;
    const opt = snapshotOptions();
    if (!opt.recordUsage) return;
    const { mp, oc } = spellCost(id);
    if (!mp && !oc) return;
    const totals: Totals = getTotals();
    addCost(totals, mp, oc);
    kvSet(STATS_KEY, totals);
  } catch {
    /* 读不到记 0，绝不挡战斗 */
  }
}

/** 终局怪/Boss 构成补记（老 self._monster/_boss）：endBattle 前并入 cur+totals 并回写 */
function recordEndKills(): void {
  try {
    const opt = snapshotOptions();
    if (!opt.recordUsage) return;
    const b = get(battle);
    const cur = kvGet(CUR_BATTLE_KEY, true) as CurBattle | null;
    if (!cur) return;
    const totals: Totals = getTotals();
    addKills(cur, totals, b.monsterAll ?? 0, b.bossAll ?? 0);
    kvSet(CUR_BATTLE_KEY, cur);
    kvSet(STATS_KEY, totals);
  } catch {
    /* ignore */
  }
}

/** 页世界作用域：油猴下用 unsafeWindow 直接挂钩（真闭包，无需序列化），直接运行则走 window。 */
function pageScope(): Record<string, unknown> {
  try {
    const uw = (globalThis as unknown as { unsafeWindow?: Record<string, unknown> }).unsafeWindow;
    if (uw) return uw;
  } catch {
    /* 取不到则回落 window */
  }
  return window as unknown as Record<string, unknown>;
}

/** Stamina 台账读（newRound 记账，供 Usage 面板展示；与 ui-agent 约定签名） */
export function getStaminaLog(): Record<string, number> {
  try {
    return (kvGet(STAMINA_LOG_KEY, true) as Record<string, number> | null) ?? {};
  } catch {
    return {};
  }
}

/** 遭遇战计数读（newRound 记账，供 Usage 面板展示；与 ui-agent 约定签名） */
export function getEncounter(): { lastTime: number; time: number } {
  try {
    return (
      (kvGet(ENCOUNTER_KEY, true) as { lastTime: number; time: number } | null) ?? {
        lastTime: 0,
        time: 0,
      }
    );
  } catch {
    return { lastTime: 0, time: 0 };
  }
}

/** 战斗主循环：每 turn 只做一个动作，原 main() */
export async function main(): Promise<void> {
  const on = snapshotOptions().main.debug;
  const dbg: DebugSurface = debugSurface();
  if (on) dbg.lastAction = '';
  const sendBefore = readLastSend();
  const logBefore = qsa('#textlog>tbody>tr>td').length;
  try {
    await mainInner(dbg, on);
  } catch (e) {
    dbg.lastError = String(e);
    logger.error('main stalled: {err}', { err: String(e) });
    document.title = `ERR: ${String(e).slice(0, 80)}`;
    return;
  }
  armWatchdog(sendBefore, logBefore);
}

/** 读页世界钩子记录的最近一次 api_call 发送时间（无则为 0） */
function readLastSend(): number {
  try {
    return (window as unknown as { __ahvauto?: DebugSurface }).__ahvauto?.lastSend ?? 0;
  } catch {
    return 0;
  }
}

/**
 * 发后看门狗：游戏在 n（忙）/v（已锁目标）/f（请求在途）时静默吞掉点击，
 * 此时不会有响应、循环会饿死。这里做两级恢复：
 * 1. 8 秒无新请求 → 补点一次当前集火目标（若真有请求在途会被游戏侧吞掉，无害）；
 * 2. 25 秒 textlog 无增长 → 整页重载（原版各失败路径同理）。
 */
function armWatchdog(sendBefore: number, logBefore: number): void {
  after('watchdog-retry', 8000, () => {
    try {
      if (isDisabled()) return;
      if (qs('#btcp')) return;
      if (readLastSend() !== sendBefore) return;
      logger.warning('no request sent after action, retry target click');
      const snap = readSnapshot(get(battle).monsterBase);
      const opt = snapshotOptions();
      const fin = orderTargets(snap.monsters, opt.rule.weights ?? {}, opt.rule.reverse)[0];
      const tid = resolveTarget(snap.monsters, fin);
      if (tid) click(`#mkey_${tid}`);
    } catch {
      /* ignore */
    }
  });
  after('watchdog-reload', 25000, () => {
    try {
      if (isDisabled()) return;
      if (qs('#btcp')) return;
      if (qsa('#textlog>tbody>tr>td').length !== logBefore) return;
      if (readLastSend() !== sendBefore) return;
      logger.warning('no battle progress in 25s, reload');
      goto();
    } catch {
      /* ignore */
    }
  });
}

/** 调试面（仅 debug 开启时写入）：CDP 可读 step/lastError，定位 stall */
export interface TurnRecord {
  turn: number;
  rule: string;
  action: string;
}

export interface DebugSurface {
  step: string;
  lastError: string;
  lastAction: string;
  /** newRound 诊断（sticky，mainInner 不覆盖）：最近一次换轮时的日志尾 */
  nr?: string;
  /** 本轮决策历史（newRound 清空，面板展示用） */
  history: TurnRecord[];
  /** 页世界钩子附加：发包计数/末次请求摘要/末次发送时间/响应计数 */
  apiCalls: number;
  lastReq: string;
  lastSend: number;
  fired: number;
}

function debugSurface(): DebugSurface {
  const w = window as unknown as { __ahvauto?: DebugSurface };
  if (!w.__ahvauto)
    w.__ahvauto = {
      step: '',
      lastError: '',
      lastAction: '',
      history: [],
      apiCalls: 0,
      lastReq: '',
      lastSend: 0,
      fired: 0,
    };
  if (!w.__ahvauto.history) w.__ahvauto.history = [];
  return w.__ahvauto;
}

export function debugAct(action: string): void {
  try {
    if (!snapshotOptions().main.debug) return;
    const s = debugSurface().lastAction;
    debugSurface().lastAction = (s ? `${s}+` : '') + action;
  } catch {
    /* 观测不影响战斗 */
  }
}

/** 战斗主循环：每 turn 只做一个动作，原 main() */
async function mainInner(dbg: DebugSurface, trace: boolean): Promise<void> {
  const step = (s: string): void => {
    if (trace) dbg.step = s;
  };
  if (isDisabled()) {
    document.title = 'ahvauto暂停中';
    return;
  }
  // JSON 序列化会把 Infinity 丢成 null，重载后必须还原，否则死亡判定失效
  const norm = (a: unknown): number[] | null =>
    Array.isArray(a)
      ? a.map((v) => (v === null || v === undefined ? Infinity : (v as number)))
      : null;
  const saved = norm(kvGet(MONSTER_STATUS_KEY, true));
  const savedBase = norm(kvGet(MONSTER_BASE_KEY, true));
  const b0 = get(battle);
  if (saved && saved.length === b0.monsterAll) {
    patchBattle({
      monsterStatus: saved,
      monsterBase: savedBase && savedBase.length === b0.monsterAll ? savedBase : [...saved],
    });
  } else if (b0.monsterAll > 0) fixMonsterStatus();

  patchBattle({ turn: get(battle).turn + 1 });

  const opt = snapshotOptions();
  const b = get(battle);
  const snap = readSnapshot(b.monsterBase);
  snap.turn = get(battle).turn;
  snap.roundNow = b.roundNow;
  snap.roundAll = b.roundAll;
  snap.roundType = b.roundType;
  snap.attackStatus = b.attackStatus;
  snap.fightingStyle = opt.main.fightingStyle;

  battleInfo();
  if (shouldEmergencyPause(snap.hp, opt.main.hpFloorPause, opt.main.hpFloor)) {
    step('emergency');
    logger.error('emergency pause at hp {hp}', { hp: Math.round(snap.hp) });
    await setAlarm('Error');
    pauseChange();
    return;
  }
  step('decide');
  const decided = decide(snap, opt, get(battle).otos);
  if (decided.consumeOnce) {
    patchBattle({
      otos: {
        ...get(battle).otos,
        [decided.consumeOnce]: (get(battle).otos[decided.consumeOnce] ?? 0) + 1,
      },
    });
  }
  step(decided.rule ?? 'none');
  try {
    const hist = debugSurface().history;
    hist.push({
      turn: snap.turn,
      rule: decided.rule ?? 'none',
      action: describeAction(decided.action, snap.skillNames),
    });
    if (hist.length > 20) hist.splice(0, hist.length - 20);
  } catch {
    /* ignore */
  }
  void recordTurn({
    round: `${snap.roundType} ${snap.roundNow}/${snap.roundAll}`,
    turn: snap.turn,
    rule: decided.rule ?? 'none',
    action: decided.action,
    otos: { ...get(battle).otos },
    snap,
  });
  executeAction(
    decided.action,
    (label) => debugAct(label),
    (msg) => {
      alert(msg);
      pauseChange();
    },
  );
  recordSpellCost(decided.action);
  recordMode(decided.action.kind);
  step('done');
}

/**
 * 循环驱动器：保留对游戏 api_call/api_response 的劫持（经 pageScope 直接赋值），
 * 但后续换轮请求改为 await httpGet。
 */
export function installReloader(): void {
  const opt = snapshotOptions();
  const eventStart = el('a');
  eventStart.id = 'eventStart';
  eventStart.onclick = () => {
    if (opt.main.delayAlert) {
      (eventStart as unknown as { _t1?: number })._t1 = window.setTimeout(
        () => void setAlarm('Common'),
        opt.main.delayAlertTime * 1000,
      );
    }
    if (opt.main.delayReload) {
      (eventStart as unknown as { _t2?: number })._t2 = window.setTimeout(
        goto,
        opt.main.delayReloadTime * 1000,
      );
    }
  };
  document.body.appendChild(eventStart);

  const eventEnd = el('a');
  eventEnd.id = 'eventEnd';
  eventEnd.onclick = () => {
    void (async () => {
      const mark = (s: string): void => {
        try {
          if (snapshotOptions().main.debug) debugSurface().step = s;
        } catch {
          /* ignore */
        }
      };
      try {
        mark('ee-start');
        const s = eventStart as unknown as { _t1?: number; _t2?: number };
        if (s._t1) clearTimeout(s._t1);
        if (s._t2) clearTimeout(s._t2);
        const now = Date.now();
        patchBattle({
          runSpeed: Number((1000 / Math.max(1, now - get(battle).timeNow)).toFixed(2)),
          timeNow: now,
        });
        const monsterDead = qsa('img[src*="nbardead"]').length;
        const b = get(battle);
        patchBattle({ monsterAlive: b.monsterAll - monsterDead });
        const o = snapshotOptions();
        if (qs('#btcp')) {
          const nb = get(battle);
          if (nb.monsterAlive > 0) {
            await setAlarm('Defeat');
            recordEndKills();
            endBattle('defeat');
            kvDel(ROUND_TYPE_KEY);
            kvDel(MONSTER_STATUS_KEY);
            kvDel(MONSTER_BASE_KEY);
          } else if (nb.roundNow !== nb.roundAll) {
            qs('#pane_completion')?.removeChild(qs('#btcp')!);
            let data: Document;
            try {
              data = await requestRetry(() => httpGet<Document>(location.href));
            } catch (e) {
              logger.error('next round fetch failed, reload: {err}', { err: String(e) });
              goto();
              return;
            }
            if (qs('#riddlecounter', data)) {
              if (o.main.riddlePopup && !window.opener) {
                window.open(
                  location.href,
                  'riddleWindow',
                  'resizable,scrollbars,width=1241,height=707',
                );
                return;
              }
              goto();
              return;
            }
            const right = qs('#battle_right', data);
            const left = qs('#battle_left', data);
            if (right && left) {
              qs('#battle_main')?.replaceChild(document.adoptNode(right), qs('#battle_right')!);
              qs('#battle_main')?.replaceChild(document.adoptNode(left), qs('#battle_left')!);
            }
            const w = window as unknown as {
              battle?: unknown;
              Battle?: new () => unknown;
              clear_infopane?: () => void;
            };
            if (w.Battle) {
              w.battle = new w.Battle();
              (w.battle as { clear_infopane?: () => void }).clear_infopane?.();
            }
            await newRound();
            await main();
          } else {
            await setAlarm('Victory');
            recordEndKills();
            endBattle('victory');
            kvDel(ROUND_TYPE_KEY);
            kvDel(MONSTER_STATUS_KEY);
            kvDel(MONSTER_BASE_KEY);
            setTimeout(goto, 3000);
          }
        } else {
          mark('ee-main');
          await main();
        }
      } catch (e) {
        try {
          debugSurface().lastError = `eventEnd: ${String(e)}`;
        } catch {
          /* ignore */
        }
        logger.error('eventEnd failed: {err}', { err: String(e) });
        document.title = `ERR-EE: ${String(e).slice(0, 80)}`;
      }
    })();
  };
  document.body.appendChild(eventEnd);

  publishSpellDelays(opt.main.spellDelay, opt.main.noSpellDelay);
  // 页世界钩子经 unsafeWindow/window 直接赋值，真闭包：常量直接引用，无序列化陷阱。
  const w = pageScope();
  w['api_call'] = function (
    b: XMLHttpRequest,
    a: { mode: string; skill: number },
    d: () => void,
  ): void {
    const { spellDelay, noSpellDelay } = readSpellDelays();
    (window as unknown as Record<string, unknown>)['info'] = a;
    // 发包序号：req/res 同号，录制侧按 seq 配对。存页面全局，reload 清零。
    let seq = 0;
    try {
      const w2 = window as unknown as { __ahvautoSeq?: number };
      seq = (w2.__ahvautoSeq ?? 0) + 1;
      w2.__ahvautoSeq = seq;
    } catch {
      /* ignore */
    }
    try {
      const h = (window as unknown as { __ahvauto?: DebugSurface }).__ahvauto;
      if (h) {
        h.apiCalls += 1;
        h.lastReq = JSON.stringify(a).slice(0, 120);
        h.lastSend = Date.now();
      }
    } catch {
      /* 观测不影响战斗 */
    }
    try {
      handleRec('req', a, seq);
    } catch {
      /* 录制上报失败不影响战斗 */
    }
    try {
      (b as unknown as Record<string, unknown>).__ahvautoSeq = seq;
    } catch {
      /* ignore */
    }
    b.open('POST', (w['MAIN_URL'] as string) + 'json');
    b.setRequestHeader('Content-Type', 'application/json');
    b.withCredentials = true;
    b.onreadystatechange = d;
    b.onload = () => {
      try {
        const h = (window as unknown as { __ahvauto?: DebugSurface }).__ahvauto;
        if (h) h.fired += 1;
      } catch {
        /* ignore */
      }
      document.getElementById('eventEnd')?.click();
    };
    document.getElementById('eventStart')?.click();
    const base = a.mode === 'magic' && a.skill >= 200 ? spellDelay : noSpellDelay;
    if (base <= 0) b.send(JSON.stringify(a));
    else setTimeout(() => b.send(JSON.stringify(a)), (base * (Math.random() * 100 + 50)) / 100);
  };
  w['api_response'] = function (b: {
    readyState: number;
    status: number;
    responseText: string;
  }): unknown {
    const seq = (b as unknown as Record<string, unknown>).__ahvautoSeq as number | undefined;
    if (b.readyState === 4) {
      if (b.status === 200) {
        const a = JSON.parse(b.responseText) as {
          login?: unknown;
          error?: unknown;
          reload?: unknown;
        };
        try {
          handleRec('res', { status: b.status, body: a }, seq ?? 0);
        } catch {
          /* 录制上报失败不影响战斗 */
        }
        if (a.login !== undefined) {
          (window.top as Window).location.href = w['login_url'] as string;
        } else {
          if (a.error || a.reload) location.href = location.search;
          return a;
        }
      } else {
        try {
          handleRec('res', { status: b.status, body: null }, seq ?? 0);
        } catch {
          /* ignore */
        }
        location.href = location.search;
      }
    }
    return false;
  };
}
