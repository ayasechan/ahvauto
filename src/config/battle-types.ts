/** 运行时战斗状态类型（BattleState/ArenaCache）。纯类型，无依赖。 */

export interface BattleState {
  turn: number;
  hp: number;
  mp: number;
  sp: number;
  oc: number;
  monsterAll: number;
  monsterAlive: number;
  bossAll: number;
  bossAlive: number;
  monsterStatus: number[];
  /** 每只怪的满血（开局从 textlog 解析，供血条宽度换算 hpNow） */
  monsterBase: number[];
  /** 一回合一次计数器（OFC/FRD/T3/T2/T1），每轮清零 */
  otos: Record<string, number>;
  roundType: string;
  roundNow: number;
  roundAll: number;
  attackStatus: number;
  runSpeed: number;
  timeNow: number;
}

export interface ArenaCache {
  date: string;
  gr: number;
  token: Record<string, string | number | undefined>;
  array?: string[];
  isOk?: boolean;
  /** 连续开战失败计数（key 为队列项 id，gr 记 'gr'），达上限则跳过，避免提前完成/永久拒绝时 60s 无限重试 */
  fails?: Record<string, number>;
}
