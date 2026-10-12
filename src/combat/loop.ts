import { get } from 'svelte/store';
import { battle } from '../config/battle-state';
import { kvGet, snapshotOptions, isDisabled } from '../config/store';
import { qs, qsa } from '../platform/dom';
import { pause, resume } from '../app/fsm';
import { tr } from '../platform/i18n';
import { logger } from '../platform/logger';
import { setAlarm } from '../notify/notify';
import { recordTurn } from '../data/debug';
import { recordMode } from '../data/stats';
import { describeAction, executeAction } from './execute';
import { decide, shouldEmergencyPause, HALT_MSG } from './decide';
import { readSnapshot } from './snapshot';
import { patchBattle, debugSurface, debugAct } from './driver';
import type { DebugSurface, TurnOutcome } from './driver';
import { fixMonsterStatus } from './round';
import { battleInfo } from './battle-info';
import { recordSpellCost } from './cost';
import { armWatchdog, readLastSend } from './watchdog';
import { MONSTER_STATUS_KEY, MONSTER_BASE_KEY } from '../platform/storage-keys';

export function pauseChange(): void {
  const lang = snapshotOptions().lang;
  if (!isDisabled()) {
    const btn = qs('.pauseChange');
    if (btn) btn.innerHTML = tr(lang, 'app.resume');
    pause('button');
  } else {
    const btn = qs('.pauseChange');
    if (btn) btn.innerHTML = tr(lang, 'app.pause');
    resume('button');
    void main();
  }
}
/** 战斗主循环：每 turn 只做一个动作，原 main() */
export async function main(): Promise<void> {
  const on = snapshotOptions().main.debug;
  const dbg: DebugSurface = debugSurface();
  if (on) dbg.lastAction = '';
  const sendBefore = readLastSend();
  const logBefore = qsa('#textlog>tbody>tr>td').length;
  let outcome: TurnOutcome;
  try {
    outcome = await mainInner(dbg, on);
  } catch (e) {
    dbg.lastError = String(e);
    logger.error('main stalled: {err}', { err: String(e) });
    document.title = `ERR: ${String(e).slice(0, 80)}`;
    return;
  }
  armWatchdog(sendBefore, logBefore, {
    rule: outcome.rule,
    action: outcome.action,
    sent: outcome.sent,
  });
}
/** 战斗主循环：每 turn 只做一个动作，原 main() */
async function mainInner(dbg: DebugSurface, trace: boolean): Promise<TurnOutcome> {
  const step = (s: string): void => {
    if (trace) dbg.step = s;
  };
  const idleAction = describeAction(snapshotOptions().lang, { kind: 'none' });
  if (isDisabled()) {
    document.title = tr(snapshotOptions().lang, 'battle.paused');
    return { sent: false, rule: 'none', action: idleAction };
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

  battleInfo(opt.lang);
  if (shouldEmergencyPause(snap.hp, opt.main.hpFloorPause, opt.main.hpFloor)) {
    step('emergency');
    logger.error('emergency pause at hp {hp}', { hp: Math.round(snap.hp) });
    await setAlarm('Error');
    pauseChange();
    return { sent: false, rule: 'none', action: idleAction };
  }
  step('decide');
  const decided = decide(snap, opt, get(battle).otos);
  const rule = decided.rule ?? 'none';
  const actionLabel = describeAction(opt.lang, decided.action, snap.skillNames);
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
      action: describeAction(opt.lang, decided.action, snap.skillNames),
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
  const sent = executeAction(
    decided.action,
    (label) => debugAct(label),
    (msg) => {
      alert(msg === HALT_MSG ? tr(opt.lang, 'battle.haltDebuff') : msg);
      pauseChange();
    },
  );
  recordSpellCost(decided.action);
  void recordMode(decided.action.kind);
  step('done');
  return { sent, rule, action: actionLabel };
}
