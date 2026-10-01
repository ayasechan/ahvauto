import { kvGet, kvSet, kvDel, snapshotOptions } from './store';
import { logger } from './logger';

/**
 * 数据收集 v2（按实战数据重写，见 logs/battle-records-1.json）。
 * 数据源：每次战斗响应的 textlog 行（经 recorder 桥接），不再爬 DOM.
 * 分段由战斗引擎驱动：一局＝从 Initializing 到终局（多轮），类型来自引擎。
 * - parseTurn() 纯函数：行文本 → 单轮统计，可单测；
 *   施法成本（MP/OC，DOM onmouseover 数据源未接）与终局怪/Boss 构成不在行文本里，
 *   分别由 addCost()/addKills() 供 capture-agent 补记，parseTurn 无来源时记 0；
 * - recordBattleTurn()：累加 totals + 当前战斗，遇 Victory/Defeat 落盘；
 * - 存储 key 全用 stats2* 新命名空间（老 stats 数据不可靠，不做迁移）。
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

const emptyTurn = (): TurnStat => ({
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

const emptyTotals = (): Totals => ({
  ...emptyTurn(),
  turns: 0,
  battles: 0,
  monsters: 0,
  bosses: 0,
  modes: {},
  startedAt: 0,
});

const bump = (rec: Record<string, number>, key: string, n = 1): void => {
  rec[key] = (rec[key] ?? 0) + n;
};

export function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, '');
}

interface RuleCtx {
  stat: TurnStat;
  drops: string[];
  /** 本轮最近一次施法/用药名（You cast/use 行），供无显式来源的回复行归因 */
  lastAction: string | null;
  /** 本行掉落 span 颜色种类（equip/crystal/credit/''未知），供 dropItem 折叠 */
  colorKind: string;
  /** 掉落品质过滤（原 dropQuality：数字档位或文本子串），供 dropItem */
  dropQuality: string;
}

interface Rule {
  /** 规则名（仅调试/文档用） */
  name: string;
  re: RegExp;
  apply: (ctx: RuleCtx, m: RegExpMatchArray, text: string) => void;
}

/** 物理承伤判定（piercing/crushing/slashing；元素名先去 "ing" 尾再判，与老口径一致） */
const PHYS_RE = /pierc|crush|slash/i;

/** 元素是否属物理组（UI 分组展示与 addTaken 同口径，单一起源） */
export function isPhysicalElem(elem: string): boolean {
  return PHYS_RE.test((elem ?? '').replace('ing', ''));
}

/** 承伤统一入口：总量＋按元素分＋物/魔拆分＋计数（takenByType 键保持原文，不归一化） */
function addTaken(stat: TurnStat, n: number, elem: string): void {
  stat.taken += n;
  stat.takenCount++;
  bump(stat.takenByType, elem, n);
  if (isPhysicalElem(elem)) {
    stat.takenPhys += n;
    stat.takenPhysCount = (stat.takenPhysCount ?? 0) + 1;
  } else {
    stat.takenMag += n;
    stat.takenMagCount = (stat.takenMagCount ?? 0) + 1;
  }
}

/**
 * 回复归因（老口径 L3430-3451，parseTurn 手头无 parm.mode/magic/item，以文本启发式替代）：
 * 含 defend→'defend'；含 drain→'drain'；'<来源> restores …' 取来源名；
 * 无显式来源（Recovered…/You are healed…）沿用本轮最近 cast/use，否则 'unknown'。
 */
function restoreSource(text: string, ctx: RuleCtx): string {
  if (/defend/i.test(text)) return 'defend';
  if (/drain/i.test(text)) return 'drain';
  const m = text.match(/^(.*) restores (\d+) points of (\w+)/);
  if (m) return m[1];
  if (ctx.lastAction) return ctx.lastAction;
  return 'unknown';
}

const avgDiv = (total: number, count: number): number =>
  count > 0 ? Math.round(total / count) : 0;

/** 承伤均值读时算（老 hurt._avg/_pavg/_mavg 口径：round(总量/次数)，无样本为 0） */
export function takenAvg(s: Pick<TurnStat, 'taken' | 'takenCount'>): number {
  return avgDiv(s.taken, s.takenCount ?? 0);
}

/** 物理承伤均值（老 hurt._pavg 口径：round(_ptotal/_pcount)，无样本为 0） */
export function takenPhysAvg(s: Pick<TurnStat, 'takenPhys' | 'takenPhysCount'>): number {
  return avgDiv(s.takenPhys ?? 0, s.takenPhysCount ?? 0);
}

/** 魔法承伤均值（老 hurt._mavg 口径：round(_mtotal/_mcount)，无样本为 0） */
export function takenMagAvg(s: Pick<TurnStat, 'takenMag' | 'takenMagCount'>): number {
  return avgDiv(s.takenMag ?? 0, s.takenMagCount ?? 0);
}

/**
 * 施法成本补记（老 hurt.mp/oc；成本来自 DOM onmouseover，textlog 里没有）。
 * capture-agent 在发起施法时调用；parseTurn 绝不编造该数字（无来源记 0）。
 */
export function addCost(stat: TurnStat, mp: number, oc: number): void {
  stat.mpCost = (stat.mpCost ?? 0) + mp;
  stat.ocCost = (stat.ocCost ?? 0) + oc;
}

/**
 * 终局怪/Boss 构成补记（老 self._monster/_boss，recordUsage2 在终局按 monsterAlive==0 累加）。
 * recordBattleTurn 无法从 textlog 得知构成，capture-agent 在终局以 monsterAll/bossAll 调用；
 * 只改内存对象，调用方负责落盘（kvSet stats2/curBattle2；cur 侧随 endBattle 行落盘）。
 */
export function addKills(cur: CurBattle, totals: Totals, monsters: number, bosses: number): void {
  cur.monsters = (cur.monsters ?? 0) + monsters;
  cur.bosses = (cur.bosses ?? 0) + bosses;
  totals.monsters = (totals.monsters ?? 0) + monsters;
  totals.bosses = (totals.bosses ?? 0) + bosses;
}

/**
 * 行分类规则表：按表顺序 first-match-wins，顺序即优先级。
 * 容易踩的先后关系：
 * - hit/hitSelf/vitalTheft 在 miss 之前（含 resists 的行先按伤害计；Vital Theft 行无 points-of，需独立规则）；
 * - taken/absorb 经 addTaken 统一做物/魔拆分＋计数；
 *   takenBare 补无 points-of 的承伤行（…and take 4829 Fire damage.，老版护盾分支取前行元素为证），
 *   置于 absorb 之后，避免含 attack into 的护盾行被误吞；
 * - focus 在 gainSelf 之前（否则 Focusing 被吞进 buffs）；
 * - evade/miss 在 cast 之前；
 * - cast/useItem 记录 lastAction，供无来源回复行（Recovered…/You are healed…）归因；
 * - drainHp/drainPts 在 hpHeal 之前（You drain… 归因 drain，不进 misses）；
 * - restore 系只做来源归因累加，不影响 healedHp/restoredMp/restoredSp 总量口径；
 * - dropItem 只收非 Credit 实物（Credit 另有 credit 规则）。
 */
const RULES: Rule[] = [
  {
    name: 'hit',
    re: /was (hit|crit) for (\d+) (\w+) damage/,
    apply: ({ stat }, m) => {
      const n = Number(m[2]);
      stat.damage += n;
      bump(stat.damageByType, m[3], n);
      if (m[1] === 'crit') stat.crits++;
    },
  },
  {
    name: 'hitSelf',
    re: /hits .+ for (\d+) points of (\w+) damage/,
    apply: ({ stat }, m) => {
      const n = Number(m[1]);
      stat.damage += n;
      bump(stat.damageByType, m[2], n);
    },
  },
  {
    name: 'vitalTheft',
    re: /Vital Theft hits .*? for (\d+) damage/,
    apply: ({ stat }, m) => {
      const n = Number(m[1]);
      stat.damage += n;
      bump(stat.damageByType, 'Vital Theft', n);
    },
  },
  {
    name: 'taken',
    re: /(?:causing|take) (\d+) points of (\w+) damage/,
    apply: ({ stat }, m) => {
      addTaken(stat, Number(m[1]), m[2]);
    },
  },
  {
    name: 'absorb',
    re: /(\S(?:.*\S)?) absorbs (\d+) points of damage .* into (\d+) points of (\w+) damage/,
    apply: ({ stat }, m) => {
      addTaken(stat, Number(m[3]), m[4]);
      stat.absorbed += Number(m[2]);
    },
  },
  {
    name: 'takenBare',
    re: /take (\d+) (\w+) damage/,
    apply: ({ stat }, m) => {
      addTaken(stat, Number(m[1]), m[2]);
    },
  },
  {
    name: 'healed',
    re: /You are healed for (\d+) Health/,
    apply: (ctx, m, text) => {
      const n = Number(m[1]);
      ctx.stat.healedHp += n;
      bump(ctx.stat.restoreBySource, restoreSource(text, ctx), n);
    },
  },
  {
    name: 'evade',
    re: /You (evade|parry|block) the attack|misses the attack against you/,
    apply: ({ stat }) => {
      stat.evades++;
    },
  },
  {
    name: 'miss',
    re: /missing you completely|but misses the attack|resists the effects of your spell|Your spell (is absorbed|fails to connect)|Your attack misses|(evades|parries) your (attack|spell)/,
    apply: ({ stat }) => {
      stat.misses++;
    },
  },
  {
    name: 'cast',
    re: /^You cast (.+)\.$/,
    apply: (ctx, m) => {
      bump(ctx.stat.casts, m[1]);
      ctx.lastAction = m[1];
    },
  },
  {
    name: 'useItem',
    re: /^You use (.+)\.$/,
    apply: (ctx, m) => {
      bump(ctx.stat.itemsUsed, m[1]);
      ctx.lastAction = m[1];
    },
  },
  {
    name: 'focus',
    re: /^You gain the effect Focusing\.$/,
    apply: ({ stat }) => {
      stat.focus++;
    },
  },
  {
    name: 'gainSelf',
    re: /^You gain the effect (.+)\.$/,
    apply: ({ stat }, m) => {
      bump(stat.buffs, m[1]);
    },
  },
  {
    name: 'proficiency',
    re: /You gain ([\d.]+) points of (.*?) proficiency/,
    apply: ({ stat }, m) => {
      const v = Math.round(Number(m[1]) * 1000) / 1000;
      if (Number.isFinite(v)) bump(stat.proficiency, m[2], v);
    },
  },
  {
    name: 'defeated',
    re: /has been defeated\.$/,
    apply: ({ stat }) => {
      stat.kills++;
    },
  },
  {
    name: 'exp',
    re: /You gain (\d+) EXP!/,
    apply: ({ stat }, m) => {
      stat.exp += Number(m[1]);
    },
  },
  {
    name: 'credit',
    re: /\[(\d+) Credits?\]/,
    apply: ({ stat }, m) => {
      stat.credit += Number(m[1]);
    },
  },
  {
    name: 'dropItem',
    re: /dropped \[(.+)\]/,
    apply: ({ drops, colorKind, dropQuality }, m) => {
      const folded = normalizeDrop(m[1], colorKind, dropQuality);
      if (folded) drops.push(...folded);
    },
  },
  {
    name: 'drainHp',
    re: /You drain (\d+) HP from/,
    apply: (ctx, m) => {
      const n = Number(m[1]);
      ctx.stat.healedHp += n;
      bump(ctx.stat.restoreBySource, 'drain', n);
    },
  },
  {
    name: 'drainPts',
    re: /You drain (\d+) points of (health|magic|spirit)/,
    apply: (ctx, m) => {
      const n = Number(m[1]);
      if (m[2] === 'magic') ctx.stat.restoredMp += n;
      else if (m[2] === 'spirit') ctx.stat.restoredSp += n;
      else ctx.stat.healedHp += n;
      bump(ctx.stat.restoreBySource, 'drain', n);
    },
  },
  {
    name: 'hpHeal',
    re: /restores (\d+) points of health/,
    apply: (ctx, m, text) => {
      const n = Number(m[1]);
      ctx.stat.healedHp += n;
      bump(ctx.stat.restoreBySource, restoreSource(text, ctx), n);
    },
  },
  {
    name: 'mpRestore',
    re: /restores (\d+) points of magic|Recovered (\d+) points of magic/,
    apply: (ctx, m, text) => {
      const n = Number(m[1] ?? m[2]);
      ctx.stat.restoredMp += n;
      bump(ctx.stat.restoreBySource, restoreSource(text, ctx), n);
    },
  },
  {
    name: 'spRestore',
    re: /restores (\d+) points of spirit|Recovered (\d+) points of spirit/,
    apply: (ctx, m, text) => {
      const n = Number(m[1] ?? m[2]);
      ctx.stat.restoredSp += n;
      bump(ctx.stat.restoreBySource, restoreSource(text, ctx), n);
    },
  },
];

/**
 * 掉落名归一化（老 dropMonitor 口径）：
 * - 红装（colorKind=equip）：按 dropQuality 过滤并折叠为 `Equipment of <首词>`；
 *   dropQuality 为数字 0-7 时作起始档位，为文本时作子串匹配，为空时不过滤；
 *   未命中档位返回 null（过滤掉，不计入）。
 * - 紫水晶（colorKind=crystal）：`Nx Crystal of Y` 展开为 N 个单名。
 * - 未知颜色：不断言品质，原样返回（纯文本行行为不变）。
 * - Credit 行返回 null（另有 credit 规则记账，不进 drops）。
 */
export const DROP_QUALITY = [
  'Crude',
  'Fair',
  'Average',
  'Superior',
  'Exquisite',
  'Magnificent',
  'Legendary',
  'Peerless',
];

export function normalizeDrop(name: string, colorKind: string, dropQuality = ''): string[] | null {
  if (/credits?/i.test(name)) return null;
  if (colorKind === 'crystal') {
    const nx = name.match(/^(\d+)x (Crystal of \w+)$/);
    if (nx) return Array(Number(nx[1])).fill(nx[2]);
    const single = name.match(/^(Crystal of \w+)$/);
    return [single ? single[1] : name];
  }
  if (colorKind === 'equip') {
    const q = (dropQuality ?? '').trim();
    const asNum = Number(q);
    let start = 0;
    if (q !== '' && Number.isInteger(asNum) && asNum >= 0 && asNum < DROP_QUALITY.length) {
      start = asNum;
    } else if (q !== '') {
      if (!name.toLowerCase().includes(q.toLowerCase())) return null;
    }
    for (let j = start; j < DROP_QUALITY.length; j++) {
      if (name.includes(DROP_QUALITY[j])) {
        const first = name.match(/^\w+/)?.[0] ?? name;
        return [`Equipment of ${first}`];
      }
    }
    return q === '' ? [name] : null;
  }
  return [name];
}

/** 掉落 span 颜色 → 种类（老版按计算样式 rgb 比对：红装/紫水晶/金币） */
export function dropColorKind(raw: string): string {
  const m = raw.match(/#([0-9a-fA-F]{6})|rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (!m) return '';
  let hex: string;
  if (m[1]) hex = m[1].toLowerCase();
  else hex = [m[2], m[3], m[4]].map((v) => Number(v).toString(16).padStart(2, '0')).join('');
  if (hex === 'ff0000') return 'equip';
  if (hex === 'ba05b4') return 'crystal';
  if (hex === 'a89000') return 'credit';
  return '';
}

/** 纯函数：解析一轮（一次响应）的 textlog 行 → 统计＋掉落名（raw 保留 HTML 以取掉落颜色）。 */
export function parseTurn(lines: string[], dropQuality = ''): { stat: TurnStat; drops: string[] } {
  const ctx: RuleCtx = {
    stat: emptyTurn(),
    drops: [],
    lastAction: null,
    colorKind: '',
    dropQuality,
  };
  for (const raw of lines) {
    ctx.colorKind = dropColorKind(raw);
    const t = stripHtml(raw).trim();
    if (!t) continue;
    for (const rule of RULES) {
      const m = t.match(rule.re);
      if (m) {
        rule.apply(ctx, m, t);
        break;
      }
    }
  }
  return { stat: ctx.stat, drops: ctx.drops };
}

function mergeTotals(t: Totals, s: TurnStat): void {
  t.turns++;
  if (!t.startedAt) t.startedAt = Date.now();
  t.damage += s.damage;
  t.crits += s.crits;
  t.mpCost = (t.mpCost ?? 0) + s.mpCost;
  t.ocCost = (t.ocCost ?? 0) + s.ocCost;
  t.taken += s.taken;
  t.takenPhys = (t.takenPhys ?? 0) + s.takenPhys;
  t.takenMag = (t.takenMag ?? 0) + s.takenMag;
  t.takenPhysCount = (t.takenPhysCount ?? 0) + (s.takenPhysCount ?? 0);
  t.takenMagCount = (t.takenMagCount ?? 0) + (s.takenMagCount ?? 0);
  t.takenCount = (t.takenCount ?? 0) + s.takenCount;
  t.absorbed += s.absorbed;
  t.evades += s.evades;
  t.misses += s.misses;
  t.focus += s.focus;
  t.healedHp += s.healedHp;
  t.restoredMp += s.restoredMp;
  t.restoredSp += s.restoredSp;
  t.exp += s.exp;
  t.credit += s.credit;
  t.kills += s.kills;
  // Totals-only 台账（monsters/bosses/modes/startedAt）不在 TurnStat 里，合并时只保底不累加
  t.monsters ??= 0;
  t.bosses ??= 0;
  t.modes ??= {};
  t.restoreBySource ??= {};
  for (const [k, v] of Object.entries(s.damageByType)) bump(t.damageByType, k, v);
  for (const [k, v] of Object.entries(s.takenByType)) bump(t.takenByType, k, v);
  for (const [k, v] of Object.entries(s.restoreBySource)) bump(t.restoreBySource, k, v);
  for (const [k, v] of Object.entries(s.casts)) bump(t.casts, k, v);
  for (const [k, v] of Object.entries(s.itemsUsed)) bump(t.itemsUsed, k, v);
  for (const [k, v] of Object.entries(s.buffs)) bump(t.buffs, k, v);
  for (const [k, v] of Object.entries(s.proficiency)) bump(t.proficiency, k, v);
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

const newCur = (type = '?', code = ''): CurBattle => ({
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

/** 旧存档回填（缺字段补默认，保证 UI bind 永不拿 undefined；原地修改） */
function backfillTotals(t: Totals): Totals {
  const d = emptyTotals();
  const r = t as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(d)) {
    if (r[k] === undefined) r[k] = v;
  }
  t.modes ??= {};
  t.takenPhysCount ??= 0;
  t.takenMagCount ??= 0;
  return t;
}

function backfillCur(c: CurBattle): CurBattle {
  const d = newCur(c.type, c.code);
  const r = c as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(d)) {
    if (r[k] === undefined) r[k] = v;
  }
  return c;
}

function backfillRow(b: BattleRow): BattleRow {
  b.code ??= '';
  b.endedAt ??= b.startedAt ?? 0;
  b.modes ??= {};
  if (b.detail === undefined) b.detail = null;
  return b;
}

/**
 * 记录生命周期状态机（idle → open → idle）。
 * - 状态唯一真相：curBattle2 是否存在（存在＝open）；
 * - 转移：begin（idle/open→open，开新局时顶掉旧局记 interrupted）、
 *   turn（仅 open 累加；idle 收到 turn 则自动以 '?' 开局，保证 totals 可对账）、
 *   end（open→idle 落盘）；
 * - 每次转移记 logtape，UI/调试可查当前态（recState）。
 * parseTurn 保持纯函数，不进状态机。
 */
export type RecState = 'idle' | 'open';

export function recState(): RecState {
  return kvGet('curBattle2') === null ? 'idle' : 'open';
}

function transition(action: string, detail = ''): void {
  logger.debug('rec {action} {detail}', { action, detail });
}

function battleKey(at: number): string {
  const d = new Date(at);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 单场列表保留条数：战斗热路径只追加，修剪统一在非战斗页面空闲时经 pruneBattles() 一次完成。 */
export const BATTLES_CAP = 50;

function flushBattle(cur: CurBattle, result: string): void {
  const totals = backfillTotals((kvGet('stats2', true) as Totals | null) ?? emptyTotals());
  totals.battles++;
  kvSet('stats2', totals);
  backfillCur(cur);
  let detail: BattleDetail | null = null;
  try {
    if (snapshotOptions().main.recordEach) {
      detail = {
        damageByType: { ...cur.damageByType },
        takenByType: { ...cur.takenByType },
        casts: { ...cur.casts },
        itemsUsed: { ...cur.itemsUsed },
        restoreBySource: { ...cur.restoreBySource },
        proficiency: { ...cur.proficiency },
      };
    }
  } catch {
    detail = null;
  }
  const list = (kvGet('battles2', true) as BattleRow[] | null) ?? [];
  list.push({
    key: battleKey(cur.startedAt),
    startedAt: cur.startedAt,
    endedAt: Date.now(),
    type: cur.type,
    code: cur.code ?? '',
    result,
    rounds: cur.rounds,
    turns: cur.turns,
    damage: cur.damage,
    taken: cur.taken,
    exp: cur.exp,
    credit: cur.credit,
    kills: cur.kills,
    monsters: cur.monsters ?? 0,
    bosses: cur.bosses ?? 0,
    drops: cur.drops,
    modes: { ...cur.modes },
    detail,
  });
  kvSet('battles2', list);
  kvDel('curBattle2');
}

/** 非战斗页面空闲时集中驱逐一次：battles2 只留最新 BATTLES_CAP 场。失败静默。 */
export function pruneBattles(): void {
  try {
    const list = (kvGet('battles2', true) as BattleRow[] | null) ?? [];
    if (list.length > BATTLES_CAP) kvSet('battles2', list.slice(-BATTLES_CAP));
  } catch {
    /* 修剪失败不影响页面 */
  }
}

/** 一局开始（引擎在 newRound 看到 Round 1 时调用）：顶掉未落盘的上一局 */
export function beginBattle(type: string, code: string): void {
  const opt = snapshotOptions();
  if (!opt.recordUsage) return;
  const prev = kvGet('curBattle2', true) as CurBattle | null;
  if (prev && prev.turns > 0) {
    transition('begin:flush-interrupted', `type=${prev.type} turns=${prev.turns}`);
    flushBattle(prev, 'interrupted');
  }
  transition('begin', `type=${type} code=${code}`);
  kvSet('curBattle2', { ...newCur(type, code), rounds: 1 });
}

/** 新一轮开始（同局内轮数累加；无局时先开未知局，保证 totals 可对账） */
export function beginRound(): void {
  const opt = snapshotOptions();
  if (!opt.recordUsage) return;
  const cur = (kvGet('curBattle2', true) as CurBattle | null) ?? newCur('?', '?');
  if (cur.rounds === 0 && cur.turns === 0) transition('begin:auto', 'round-without-battle');
  cur.rounds++;
  kvSet('curBattle2', cur);
}

/** 一局结束（引擎在 Victory/Defeat 分支调用）；无局时忽略 */
export function endBattle(result: 'victory' | 'defeat'): void {
  const cur = kvGet('curBattle2', true) as CurBattle | null;
  if (!cur) return;
  transition('end', `result=${result} type=${cur.type} rounds=${cur.rounds} turns=${cur.turns}`);
  flushBattle(cur, result);
}

/**
 * 动作模式计数（老 stats.self[mode]）：在动作派发时调用（与 recordSpellCost 同模式），
 * 同步累加 totals.modes + cur.modes。失败静默，绝不挡战斗。
 */
export function recordMode(kind: string): void {
  try {
    if (!kind) return;
    const opt = snapshotOptions();
    if (!opt.recordUsage) return;
    const totals = backfillTotals((kvGet('stats2', true) as Totals | null) ?? emptyTotals());
    bump(totals.modes, kind);
    kvSet('stats2', totals);
    const cur = kvGet('curBattle2', true) as CurBattle | null;
    if (cur) {
      backfillCur(cur);
      bump(cur.modes, kind);
      kvSet('curBattle2', cur);
    }
  } catch {
    /* ignore */
  }
}

/**
 * 记录一轮战斗响应。rows 为该响应的 textlog 原始行（含 HTML，颜色供掉落折叠用）。
 * 只累加 totals + 当前局；分段（开局/终局）由引擎经 beginBattle/beginRound/endBattle 驱动。
 * 仅在 recordUsage 开启时工作。
 */
export function recordBattleTurn(rows: string[]): void {
  const opt = snapshotOptions();
  if (!opt.recordUsage) return;
  const raw = rows.filter((r) => stripHtml(r).trim());
  if (raw.length === 0) return;
  const { stat: st, drops } = parseTurn(
    raw,
    (opt as unknown as { dropQuality?: string }).dropQuality ?? '',
  );
  const totals = backfillTotals((kvGet('stats2', true) as Totals | null) ?? emptyTotals());
  mergeTotals(totals, st);
  kvSet('stats2', totals);

  const cur = backfillCur((kvGet('curBattle2', true) as CurBattle | null) ?? newCur('?', '?'));
  if (cur.rounds === 0 && cur.turns === 0) transition('turn:auto-open', 'turn-without-battle');
  cur.turns++;
  cur.damage += st.damage;
  cur.taken += st.taken;
  cur.exp += st.exp;
  cur.credit += st.credit;
  cur.kills += st.kills;
  cur.monsters ??= 0;
  cur.bosses ??= 0;
  cur.drops.push(...drops);
  for (const [k, v] of Object.entries(st.damageByType)) bump(cur.damageByType, k, v);
  for (const [k, v] of Object.entries(st.takenByType)) bump(cur.takenByType, k, v);
  for (const [k, v] of Object.entries(st.casts)) bump(cur.casts, k, v);
  for (const [k, v] of Object.entries(st.itemsUsed)) bump(cur.itemsUsed, k, v);
  for (const [k, v] of Object.entries(st.restoreBySource)) bump(cur.restoreBySource, k, v);
  for (const [k, v] of Object.entries(st.proficiency)) bump(cur.proficiency, k, v);
  kvSet('curBattle2', cur);
}

export function getTotals(): Totals {
  return backfillTotals((kvGet('stats2', true) as Totals | null) ?? emptyTotals());
}

export function getBattles(): BattleRow[] {
  return ((kvGet('battles2', true) as BattleRow[] | null) ?? []).map(backfillRow);
}

export function getCurBattle(): CurBattle | null {
  const cur = kvGet('curBattle2', true) as CurBattle | null;
  return cur ? backfillCur(cur) : null;
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 单场列表导出 CSV（时间正序，Excel 可直接打开，UTF-8 BOM）。 */
export function battlesToCsv(rows: BattleRow[]): string {
  const head = [
    'time',
    'type',
    'code',
    'result',
    'rounds',
    'turns',
    'damage',
    'taken',
    'kills',
    'monster',
    'boss',
    'exp',
    'credit',
    'drops',
  ];
  const lines = rows.map((b) =>
    [
      csvCell(new Date(b.startedAt).toLocaleString()),
      b.type ?? '?',
      csvCell(b.code ?? ''),
      b.result ?? '?',
      b.rounds ?? 0,
      b.turns,
      b.damage,
      b.taken,
      b.kills,
      b.monsters ?? 0,
      b.bosses ?? 0,
      b.exp,
      b.credit,
      csvCell(b.drops.join('; ')),
    ].join(','),
  );
  return '﻿' + [head.join(','), ...lines].join('\n');
}

export function clearStats(): void {
  kvDel('stats2');
  kvDel('battles2');
  kvDel('curBattle2');
}
