import { evaluateExpression } from '../expr/index';
import type { EvalContext, Value } from '../expr/index';
import type { Snapshot } from './types';

/** 快照 → 条件求值上下文（纯）。isCd: 可用=0/冷却=1；buffTurn: 剩余回合，不存在=0。 */
export function evalContext(snap: Snapshot): EvalContext {
  const vars: Record<string, Value> = {
    hp: snap.hp,
    mp: snap.mp,
    sp: snap.sp,
    oc: snap.oc,
    monsterAll: snap.monsters.length,
    monsterAlive: snap.monsterAlive,
    bossAll: snap.bossAll,
    bossAlive: snap.bossAlive,
    roundNow: snap.roundNow,
    roundAll: snap.roundAll,
    roundLeft: snap.roundAll - snap.roundNow,
    roundType: snap.roundType,
    attackStatus: snap.attackStatus,
    turn: snap.turn,
  };
  return {
    vars,
    funcs: {
      isCd: (id: Value): Value => {
        if (typeof id !== 'number' || !Number.isFinite(id)) throw new Error('isCd 参数必须是技能 id 数字');
        return snap.skills[String(id)] ? 0 : 1;
      },
      buffTurn: (img: Value): Value => {
        if (typeof img !== 'string' || img === '') throw new Error('buffTurn 参数必须是非空字符串');
        const hit = snap.buffs.find((b) => b.src.includes(img));
        if (!hit) return 0;
        return Number.isNaN(hit.turns) ? Infinity : hit.turns;
      },
    },
  };
}

/** 条件求值（空＝成立，失败 fail-closed）。纯。 */
export function checkExpr(expr: string | undefined, ctx: EvalContext): boolean {
  if (!expr) return true;
  try {
    return evaluateExpression(expr, ctx);
  } catch {
    return false;
  }
}
