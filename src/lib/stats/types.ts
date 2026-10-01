/**
 * 数据收集 v2 类型＋工厂（stats/ 纯类型层，不依赖 store/kv）。
 * 工厂函数集中于此，供 parse（空轮）与 lifecycle/queries（空合计/空对局/旧存档回填）共用。
 */

export interface TurnStat {
  damage: number;
  damageByType: Record<string, number>;
  crits: number;
  /** 施法成本（老 hurt.mp/oc）：textlog 里没有，由 capture-agent 经 addCost 补 */
  mpCost: number;
  ocCost: number;
  taken: number;
  takenByType: Record<string, number>;
  /** 承伤物/魔拆分（老 hurt._ptotal/_mtotal）：pierc|crush|slash→物理，其余→魔法 */
  takenPhys: number;
  takenMag: number;
  /** 物/魔各自计数（老 hurt._pcount/_mcount）：均值各除各的 */
  takenPhysCount: number;
  takenMagCount: number;
  /** 承伤次数（老 hurt._count）：均值读时算（takenAvg），不存 avg 字段 */
  takenCount: number;
  /** 护盾吸收掉的量（未实际扣血，仅统计） */
  absorbed: number;
  evades: number;
  misses: number;
  focus: number;
  healedHp: number;
  restoredMp: number;
  restoredSp: number;
  /** 回复按来源归因（老 restore{defend/drain/<技能|物品|攻击者名>}，HP/MP/SP 混记） */
  restoreBySource: Record<string, number>;
  proficiency: Record<string, number>;
  exp: number;
  credit: number;
  kills: number;
  casts: Record<string, number>;
  itemsUsed: Record<string, number>;
  buffs: Record<string, number>;
}

export interface Totals extends TurnStat {
  turns: number;
  battles: number;
  /** 生涯击杀怪/Boss 数（老 self._monster/_boss）：终局由 capture-agent 经 addKills 补 */
  monsters: number;
  bosses: number;
  /** 动作模式计数（老 stats.self[mode]：attack/defend…），由 recordMode 在动作派发时累加 */
  modes: Record<string, number>;
  /** 累计开始时间（老 self._startTime），首轮落盘时记 */
  startedAt: number;
}

/** 单场详情分布（仅 recordEach 开时落盘，关时为 null 以控体积） */
export interface BattleDetail {
  damageByType: Record<string, number>;
  takenByType: Record<string, number>;
  casts: Record<string, number>;
  itemsUsed: Record<string, number>;
  restoreBySource: Record<string, number>;
  proficiency: Record<string, number>;
}

export interface BattleRow {
  key: string;
  startedAt: number;
  /** 终局时间（老 self._endTime） */
  endedAt: number;
  /** 战斗类型：ar 竞技场 / rb RB / gr Grindfest / iw Item World / ba 遭遇战 / ? 未知 */
  type: string;
  /** 战斗代号（老 __name=battleCode，如 ar 1/35） */
  code: string;
  /** 胜负：victory / defeat / interrupted（被新战斗顶掉） */
  result: string;
  /** 包含轮数 */
  rounds: number;
  turns: number;
  damage: number;
  taken: number;
  exp: number;
  credit: number;
  kills: number;
  /** 本局怪/Boss 构成（addKills 在终局补，供单场台账；行落盘用） */
  monsters: number;
  bosses: number;
  drops: string[];
  /** 本局动作模式计数（attack/defend…，与 totals.modes 同口径） */
  modes: Record<string, number>;
  /** 单场详情分布（recordEach 关时为 null） */
  detail: BattleDetail | null;
}

export interface CurBattle {
  startedAt: number;
  type: string;
  code: string;
  rounds: number;
  turns: number;
  damage: number;
  taken: number;
  exp: number;
  credit: number;
  kills: number;
  monsters: number;
  bosses: number;
  drops: string[];
  /** 本局分布累加（recordEach 开时随行落盘进 detail） */
  damageByType: Record<string, number>;
  takenByType: Record<string, number>;
  casts: Record<string, number>;
  itemsUsed: Record<string, number>;
  restoreBySource: Record<string, number>;
  proficiency: Record<string, number>;
  modes: Record<string, number>;
}

export const emptyTurn = (): TurnStat => ({
  damage: 0,
  damageByType: {},
  crits: 0,
  mpCost: 0,
  ocCost: 0,
  taken: 0,
  takenByType: {},
  takenPhys: 0,
  takenMag: 0,
  takenPhysCount: 0,
  takenMagCount: 0,
  takenCount: 0,
  absorbed: 0,
  evades: 0,
  misses: 0,
  focus: 0,
  healedHp: 0,
  restoredMp: 0,
  restoredSp: 0,
  restoreBySource: {},
  proficiency: {},
  exp: 0,
  credit: 0,
  kills: 0,
  casts: {},
  itemsUsed: {},
  buffs: {},
});

export const emptyTotals = (): Totals => ({
  ...emptyTurn(),
  turns: 0,
  battles: 0,
  monsters: 0,
  bosses: 0,
  modes: {},
  startedAt: 0,
});

export const newCur = (type = '?', code = ''): CurBattle => ({
  startedAt: Date.now(),
  type,
  code,
  rounds: 0,
  turns: 0,
  damage: 0,
  taken: 0,
  exp: 0,
  credit: 0,
  kills: 0,
  monsters: 0,
  bosses: 0,
  drops: [],
  damageByType: {},
  takenByType: {},
  casts: {},
  itemsUsed: {},
  restoreBySource: {},
  proficiency: {},
  modes: {},
});

/** 分布累加小工具（parse 的 RULES 与 lifecycle 的合并共用，单一起源） */
export const bump = (rec: Record<string, number>, key: string, n = 1): void => {
  rec[key] = (rec[key] ?? 0) + n;
};
