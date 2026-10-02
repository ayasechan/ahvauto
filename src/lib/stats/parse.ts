/**
 * 数据收集 v2 纯解析层：行文本 → 单轮统计，可单测。
 * 本文件禁止 import store/kv/logger（保持可单测的纯函数，见 docs/ARCHITECTURE.md 分层约束）。
 * 施法成本（MP/OC）与终局怪/Boss 构成不在行文本里，
 * 分别由 addCost()/addKills() 供 capture-agent 补记，parseTurn 无来源时记 0。
 */
import { bump, emptyTurn } from './types';
import type { CurBattle, TurnStat } from './types';

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
 * 终局怪/Boss 构成补记（老 self._monster/_boss）。
 * recordBattleTurn 无法从 textlog 得知构成，capture-agent 在终局以 monsterAll/bossAll 调用；
 * 只改内存对象，调用方负责落盘（cur 侧随 endBattle 行落盘）。
 */
export function addKills(cur: CurBattle, monsters: number, bosses: number): void {
  cur.monsters = (cur.monsters ?? 0) + monsters;
  cur.bosses = (cur.bosses ?? 0) + bosses;
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

/** 单场掉落折叠：相同名累加件数（首见顺序，同老 dropMonitor 按名计数口径）。 */
export function foldDrops(drops: string[]): Array<[string, number]> {
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const d of drops ?? []) {
    if (counts.has(d)) counts.set(d, (counts.get(d) ?? 0) + 1);
    else {
      counts.set(d, 1);
      order.push(d);
    }
  }
  return order.map((k) => [k, counts.get(k) ?? 0]);
}

/** 单场掉落展示串：单件直书，多件 `名×n`，项间 `; ` 连接（空数组返回空串）。 */
export function formatDrops(drops: string[]): string {
  return foldDrops(drops)
    .map(([k, v]) => (v > 1 ? `${k}×${v}` : k))
    .join('; ');
}
