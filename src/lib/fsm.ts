import { logger } from './logger';
import { isDisabled, setDisabled } from './store';

/**
 * 顶层状态机：收敛原来散落在各处的隐式状态。
 * - 页面生命周期：boot → field / battle / riddle（单向进入，不回退）；
 * - 暂停是正交位（isDisabled），各循环检查它，不进状态图；
 * - 所有自调度 setTimeout 必须经 after() 登记命名，同名覆盖。
 */
export type MachineState = 'boot' | 'field' | 'battle' | 'riddle';

const timers = new Map<string, number>();

/** 命名延时（语义见 docs/ARCHITECTURE.md 状态机节） */
export function after(name: string, ms: number, fn: () => void): void {
  clearTimer(name);
  timers.set(
    name,
    window.setTimeout(() => {
      timers.delete(name);
      fn();
    }, ms),
  );
}

function clearTimer(name: string): void {
  const t = timers.get(name);
  if (t !== undefined) {
    clearTimeout(t);
    timers.delete(name);
  }
}

type EnterHook = () => void;
const enterHooks = new Map<MachineState, EnterHook[]>();

export function onEnter(state: MachineState, fn: EnterHook): void {
  const arr = enterHooks.get(state) ?? [];
  arr.push(fn);
  enterHooks.set(state, arr);
}

let current: MachineState = 'boot';

export function transition(to: MachineState, why = ''): void {
  const from = current;
  if (from === to) return;
  current = to;
  logger.info('fsm {from} -> {to} ({why})', { from, to, why });
  for (const fn of enterHooks.get(to) ?? []) {
    try {
      fn();
    } catch (e) {
      logger.error('fsm enter {to} failed: {err}', { to, err: String(e) });
    }
  }
}

/** 暂停：置位即停新动作（各循环检查 isDisabled） */
export function pause(why = ''): void {
  if (isDisabled()) return;
  setDisabled(true);
  logger.info('paused ({why})', { why });
}

/** 恢复：只清位，调用方负责重启循环 */
export function resume(why = ''): void {
  if (!isDisabled()) return;
  setDisabled(false);
  logger.info('resumed ({why})', { why });
}
