/** 核心类型：替代原脚本 window.hvAA 全局杂物袋 + localStorage 零散 key */

/** 新脚本存储命名空间。旧脚本用 hvAA- 前缀；新脚本只读写 hvAA3- 下的 key，绝不碰旧配置。 */
export const STORAGE_NS = 'hvAA3-';

export type Lang = '0' | '1' | '2';

/** 老格式（仅迁移用）：组内 AND、组间 OR，单条形如 "hp,1,50" / "_isCd_411,5,0" */
export type ConditionGroups = Record<number, string[]>;
/** 条件表达式字符串，空串＝恒成立 */
export type Condition = string;

export interface OrderEntry {
  key: string;
  id: string;
}

export type AttackStatus = -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface MainOptions {
  attackStatus: AttackStatus;
  hp1: number;
  mp1: number;
  sp1: number;
  pauseButton: boolean;
  pauseHotkey: boolean;
  pauseHotkeyStr: string;
  pauseHotkeyCode: number;
  alert: boolean;
  notification: boolean;
  encounter: boolean;
  middleSkillCondition: Condition;
  highSkillCondition: Condition;
  turnOnSS: boolean;
  turnOnSSCondition: Condition;
  turnOffSS: boolean;
  turnOffSSCondition: Condition;
  defend: boolean;
  defendCondition: Condition;
  focus: boolean;
  focusCondition: Condition;
  delayAlert: boolean;
  delayAlertTime: number;
  delayReload: boolean;
  delayReloadTime: number;
  riddlePopup: boolean;
  staminaLose: number;
  staminaPause: boolean;
  staminaWarn: boolean;
  staminaFlee: boolean;
  idleArena: boolean;
  idleArenaTime: number;
  idleArenaLevels: string;
  idleArenaValue: string;
  idleArenaGrTime: number;
  repair: boolean;
  repairValue: number;
  etherTap: boolean;
  etherTapCondition: Condition;
  autoFlee: boolean;
  fleeCondition: Condition;
  restoreStamina: boolean;
  staminaLow: number;
  recordEach: boolean;
  /** 保底停机：血量 ≤ hpFloor 即暂停＋告警（默认开 15%） */
  hpFloorPause: boolean;
  hpFloor: number;
  delay: number;
  delay2: number;
  fightingStyle: string;
  debug: boolean;
}

export interface ItemOptions {
  order: OrderEntry[];
  enabled: Record<string, boolean>;
  conditions: Record<string, Condition>;
}

export interface ChannelOptions {
  enabled: boolean;
  first: Record<string, boolean>;
  useSecond: boolean;
  secondOrder: OrderEntry[];
}

export interface BuffOptions {
  enabled: boolean;
  order: string[];
  condition: Condition;
  enabledMap: Record<string, boolean>;
  conditions: Record<string, Condition>;
}

export interface DebuffOptions {
  enabled: boolean;
  order: string[];
  allIm: boolean;
  condition: Condition;
  enabledMap: Record<string, boolean>;
  conditions: Record<string, Condition>;
  turnAlert: boolean;
  turns: Record<string, number>;
}

export interface SkillOptions {
  enabled: boolean;
  order: string[];
  ofc: boolean;
  otosOFC: boolean;
  ofcCondition: Condition;
  frd: boolean;
  otosFRD: boolean;
  frdCondition: Condition;
  t3: boolean;
  otosT3: boolean;
  t3Condition: Condition;
  t2: boolean;
  otosT2: boolean;
  t2Condition: Condition;
  t1: boolean;
  otosT1: boolean;
  t1Condition: Condition;
  mercifulBlow: boolean;
}

export interface ScrollOptions {
  enabled: boolean;
  roundTypes: Record<'ar' | 'rb' | 'gr' | 'iw' | 'ba', boolean>;
  first: boolean;
  condition: Condition;
  enabledMap: Record<string, boolean>;
  conditions: Record<string, Condition>;
}

export type AlarmKind = 'Common' | 'Error' | 'Defeat' | 'Riddle' | 'Victory';

export interface PushTarget {
  enabled: boolean;
  kinds: Record<'Common' | 'Error' | 'Defeat' | 'Riddle' | 'Victory', boolean>;
}

export interface AlarmOptions {
  audioEnable: Record<'Common' | 'Error' | 'Defeat' | 'Riddle' | 'Victory', boolean>;
  audio: Record<string, string>;
  telegram: PushTarget & { botToken: string; chatId: string };
  webhook: PushTarget & { url: string; template: string };
}

/** Webhook 默认 body 模板（{var} 占位发送前替换，见 template.ts）。 */
export const DEFAULT_WEBHOOK_TEMPLATE = `{
  "app": "hvAutoAttack",
  "kind": "{kind}",
  "title": "{title}",
  "text": "{text}",
  "url": "{url}",
  "time": "{time}"
}`;

export interface RuleOptions {
  weights: Record<string, number>;
  reverse: boolean;
}

export interface HvOptions {
  version: string;
  lang: Lang;
  main: MainOptions;
  item: ItemOptions;
  channel: ChannelOptions;
  buff: BuffOptions;
  debuff: DebuffOptions;
  skill: SkillOptions;
  scroll: ScrollOptions;
  infusion: { enabled: boolean; condition: Condition };
  alarm: AlarmOptions;
  rule: RuleOptions;
  dropMonitor: boolean;
  dropQuality: string;
  recordUsage: boolean;
}

/** 战斗运行时状态（原 g() 里的 turn/hp/mp/...），不持久化 */
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
  end: boolean;
}

export interface ArenaCache {
  date: string;
  gr: number;
  token: Record<string, string | number | undefined>;
  array?: string[];
  isOk?: boolean;
}
