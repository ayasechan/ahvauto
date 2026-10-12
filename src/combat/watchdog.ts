import { snapshotOptions, isDisabled } from '../config/store';
import { qs, qsa } from '../platform/dom';
import { logger } from '../platform/logger';
import { after } from '../app/fsm';
import { get } from 'svelte/store';
import { battle } from '../config/battle-state';
import { readSnapshot, resolveTarget, orderTargets } from './snapshot';
import { click, goto } from './driver';
import type { DebugSurface } from './driver';

/** 读页世界钩子记录的最近一次 api_call 发送时间（无则为 0） */
export function readLastSend(): number {
  try {
    return (window as unknown as { __ahvauto?: DebugSurface }).__ahvauto?.lastSend ?? 0;
  } catch {
    return 0;
  }
}
/** 发后看门狗（恢复策略见 docs/COMBAT.md 看门狗节） */
export function armWatchdog(
  sendBefore: number,
  logBefore: number,
  ctx: { rule: string; action: string; sent: boolean },
): void {
  after('watchdog-retry', 8000, () => {
    try {
      if (isDisabled()) return;
      if (qs('#btcp')) return;
      if (readLastSend() !== sendBefore) return;
      logger.warning(
        'no request sent after action (rule={rule} action={action} clicked={sent}), retry target click',
        { rule: ctx.rule, action: ctx.action, sent: ctx.sent },
      );
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
