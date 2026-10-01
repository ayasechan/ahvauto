import { pruneDebugRecords } from './recorder';
import { pruneBattles } from './stats';
import { logger } from './logger';

/** 页面空闲回调：有 requestIdleCallback 用它（带 5s 超时兜底），否则 setTimeout 1s。 */
function onIdle(fn: () => void): void {
  try {
    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    };
    if (typeof w.requestIdleCallback === 'function') {
      w.requestIdleCallback(() => fn(), { timeout: 5000 });
      return;
    }
  } catch {
    /* 无 requestIdleCallback 则走 fallback */
  }
  setTimeout(fn, 1000);
}

/** 非战斗时集中修剪全部记录：IDB records/turns/logs ＋ battles2。失败静默，绝不挡页面。 */
export async function pruneAllNow(): Promise<void> {
  try {
    await pruneDebugRecords();
  } catch {
    /* ignore */
  }
  try {
    pruneBattles();
  } catch {
    /* ignore */
  }
  logger.debug('maintenance pruned');
}

/** 非战斗入口调用：在页面空闲时修剪一次。 */
export function scheduleIdlePrune(): void {
  onIdle(() => void pruneAllNow());
}
