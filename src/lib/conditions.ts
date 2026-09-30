import { get } from 'svelte/store';
import { battle } from './store';
import { qs } from './dom';
import { logger } from './logger';
import { evaluateExpression } from './expr/index';
import type { EvalContext, Value } from './expr/index';

export interface BattleVars {
  hp: number;
  mp: number;
  sp: number;
  oc: number;
  monsterAll: number;
  monsterAlive: number;
  bossAll: number;
  bossAlive: number;
  roundNow: number;
  roundAll: number;
  roundLeft: number;
  roundType: string;
  attackStatus: number;
  turn: number;
}

export function battleVars(): BattleVars {
  const b = get(battle);
  return {
    hp: b.hp,
    mp: b.mp,
    sp: b.sp,
    oc: b.oc,
    monsterAll: b.monsterAll,
    monsterAlive: b.monsterAlive,
    bossAll: b.bossAll,
    bossAlive: b.bossAlive,
    roundNow: b.roundNow,
    roundAll: b.roundAll,
    roundLeft: b.roundAll - b.roundNow,
    roundType: b.roundType,
    attackStatus: b.attackStatus,
    turn: b.turn,
  };
}

/** isCd(<id>) : 可用=0 / CD中=1 */
function isCd(id: Value): Value {
  if (typeof id !== 'number' || !Number.isFinite(id))
    throw new Error(`isCd 参数必须是技能 id 数字`);
  const key = String(id);
  if (Number(key) > 10000) return qs(`.bti3>div[onmouseover*="${key}"]`) ? 0 : 1;
  const node = document.getElementById(key);
  return node && (node as HTMLElement).style.opacity !== '0.5' ? 0 : 1;
}

/** buffTurn("<img>") : buff 剩余回合，不存在=0 */
function buffTurn(img: Value): Value {
  if (typeof img !== 'string' || img === '') throw new Error(`buffTurn 参数必须是非空字符串`);
  const buff = qs(`#pane_effects>img[src*="${img}"]`);
  if (!buff) return 0;
  const m = (buff.getAttribute('onmouseover') ?? '').match(/\(.*,.*, (.*?)\)$/);
  const v = m ? Number(m[1]) : NaN;
  return Number.isNaN(v) ? Infinity : v;
}

export function evalCtx(): EvalContext {
  const vars: Record<string, Value> = {};
  for (const [k, v] of Object.entries(battleVars())) {
    if (typeof v === 'number' && !Number.isFinite(v)) continue;
    vars[k] = v;
  }
  return { vars, funcs: { isCd, buffTurn } };
}

/**
 * 条件求值：表达式字符串，空串/缺省恒成立。
 * 求值失败 fail-closed（记日志后返回 false）。
 */
export function checkCondition(expr: string | undefined): boolean {
  if (!expr || !expr.trim()) return true;
  return checkExpression(expr);
}

/** 表达式直调入口（文本编辑器、迁移校验共用） */
export function checkExpression(expr: string): boolean {
  try {
    return evaluateExpression(expr, evalCtx());
  } catch (e) {
    logger.warning('condition fail-closed: {err} expr={expr}', { err: String(e), expr });
    return false;
  }
}

/** 文本编辑器的变量/函数提示（点击插入，均为真实可用名） */
export const EXPR_HINTS: { label: string; insert: string }[] = [
  { label: 'hp', insert: 'hp' },
  { label: 'mp', insert: 'mp' },
  { label: 'sp', insert: 'sp' },
  { label: 'oc', insert: 'oc' },
  { label: 'turn', insert: 'turn' },
  { label: 'monsterAlive', insert: 'monsterAlive' },
  { label: 'monsterAll', insert: 'monsterAll' },
  { label: 'bossAlive', insert: 'bossAlive' },
  { label: 'bossAll', insert: 'bossAll' },
  { label: 'roundNow', insert: 'roundNow' },
  { label: 'roundAll', insert: 'roundAll' },
  { label: 'roundLeft', insert: 'roundLeft' },
  { label: 'roundType', insert: 'roundType' },
  { label: 'attackStatus', insert: 'attackStatus' },
  { label: 'isCd(id)', insert: 'isCd(411)' },
  { label: 'buffTurn(img)', insert: 'buffTurn("haste")' },
];
