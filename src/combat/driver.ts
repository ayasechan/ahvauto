import { battle } from '../config/battle-state';
import { click as rawClick } from '../platform/dom';
import { snapshotOptions } from '../config/store';

export function patchBattle(partial: Partial<import('../config/types').BattleState>): void {
  battle.update((b) => ({ ...b, ...partial }));
}
/** 带观测的点击：debug 开启时把目标记到 __ahvauto.lastAction */
export function click(sel: string | Element | null): boolean {
  if (typeof sel === 'string') debugAct(sel);
  else if (sel) debugAct(`#${(sel as Element).id || (sel as Element).tagName}`);
  else debugAct('null');
  return rawClick(sel);
}
export function goto(): void {
  location.href = location.search;
  setTimeout(goto, 5000);
}
/** 调试面（仅 debug 开启时写入）：CDP 可读 step/lastError，定位 stall */
export interface TurnRecord {
  turn: number;
  rule: string;
  action: string;
}

/** 单轮执行结果（供看门狗带上下文）。 */
export interface TurnOutcome {
  sent: boolean;
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
export function debugSurface(): DebugSurface {
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
