/** 战斗决策纯类型：快照进，动作出。无 DOM，无副作用，可单测。 */

export interface SnapMonster {
  /** mkey id（第 10 只为 0） */
  id: string;
  alive: boolean;
  /** 当前血量估计（死＝Infinity） */
  hpNow: number;
  /** 满血 */
  maxHp: number;
  /** 身上已知 buff/debuff 的 img 子串（去重） */
  marks: string[];
  /** btm6 格内 img 总数（6 格上限判定用） */
  markCount: number;
  /** 最后一格剩余回合（解析不出为 NaN） */
  lastTurns: number;
  /** mkey 带 onclick（死怪没有） */
  clickable: boolean;
}

export interface PaneBuff {
  src: string;
  /** 元素 id（含 effect_expire 倒计时类） */
  bid: string;
  /** onmouseover 里的技能名（解析不出为空） */
  name: string;
  /** 剩余回合（解析不出为 NaN） */
  turns: number;
  /** 卷轴 buff（_scroll.png 后缀，ReBuff 时跳过） */
  scroll: boolean;
}

export interface Snapshot {
  hp: number;
  mp: number;
  sp: number;
  oc: number;
  turn: number;
  roundNow: number;
  roundAll: number;
  roundType: string;
  attackStatus: number;
  monsters: SnapMonster[];
  monsterAlive: number;
  bossAll: number;
  bossAlive: number;
  buffs: PaneBuff[];
  /** 技能 id → 是否可用（含物品栏存在性） */
  skills: Record<string, boolean>;
  /** 技能 id → 展示名（快照时从 DOM 解析，缺失回退 id） */
  skillNames: Record<string, string>;
  /** 宝石文本（无则 null） */
  gem: string | null;
  /** Spirit 开启中 */
  spiritOn: boolean;
  /** Channeling 窗口中 */
  channeling: boolean;
  /** Ether Tap (x2) 存在 */
  etherTapX2: boolean;
  /** 武器 Ether Tap 效果快过期 */
  etherTapExpiring: boolean;
  fightingStyle: string;
}

export type Action =
  | { kind: 'none' }
  | { kind: 'gem' }
  | { kind: 'item'; id: string; key: string }
  | { kind: 'defend' }
  | { kind: 'focus' }
  | { kind: 'spirit'; on: boolean }
  | { kind: 'scroll'; id: string }
  | { kind: 'buff'; id: string }
  | { kind: 'draught'; id: string }
  | { kind: 'infusion'; id: string }
  | { kind: 'imperil'; target: string }
  | { kind: 'debuff'; id: string; target: string }
  | { kind: 'magic'; id: string; target: string }
  | { kind: 'weapon'; id: string; key: string; target: string }
  | { kind: 'attack'; target: string }
  /** 无法正常施放：执行侧 alert + 暂停 */
  | { kind: 'halt'; message: string };

export interface DecideResult {
  action: Action;
  /** 命中的规则名（观测用） */
  rule?: string;
  /** 一回合一次计数器键（执行后由调用方累加） */
  consumeOnce?: string;
}

/** 每轮清零的一次计数器 */
export function freshOtos(): Record<string, number> {
  return { OFC: 0, FRD: 0, T3: 0, T2: 0, T1: 0 };
}
