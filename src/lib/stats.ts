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
}

export interface BattleRow {
  key: string;
  startedAt: number;
  /** 战斗类型：ar 竞技场 / rb RB / gr Grindfest / iw Item World / ba 遭遇战 / ? 未知 */
  type: string;
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

const emptyTotals = (): Totals => ({ ...emptyTurn(), turns: 0, battles: 0, monsters: 0, bosses: 0 });

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
}

interface Rule {
  /** 规则名（仅调试/文档用） */
  name: string;
  re: RegExp;
  apply: (ctx: RuleCtx, m: RegExpMatchArray, text: string) => void;
}

/** 物理承伤判定（老口径 L3390：pierc|crush|slash；元素名先 replace("ing","") 归一化再判） */
const PHYS_RE = /pierc|crush|slash/i;

/** 承伤统一入口：总量＋按元素分＋物/魔拆分＋计数（takenByType 键保持原文，不归一化） */
function addTaken(stat: TurnStat, n: number, elem: string): void {
  stat.taken += n;
  stat.takenCount++;
  bump(stat.takenByType, elem, n);
  if (PHYS_RE.test(elem.replace('ing', ''))) stat.takenPhys += n;
  else stat.takenMag += n;
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

const avgDiv = (total: number, count: number): number => (count > 0 ? Math.round(total / count) : 0);

/** 承伤均值读时算（老 hurt._avg/_pavg/_mavg 口径：round(总量/次数)，无样本为 0） */
export function takenAvg(s: Pick<TurnStat, 'taken' | 'takenCount'>): number {
  return avgDiv(s.taken, s.takenCount ?? 0);
}

/** 物理承伤均值（读时算） */
export function takenPhysAvg(s: Pick<TurnStat, 'takenPhys' | 'takenCount'>): number {
  return avgDiv(s.takenPhys ?? 0, s.takenCount ?? 0);
}

/** 魔法承伤均值（读时算） */
export function takenMagAvg(s: Pick<TurnStat, 'takenMag' | 'takenCount'>): number {
  return avgDiv(s.takenMag ?? 0, s.takenCount ?? 0);
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
    re: /You evade the attack|misses the attack against you/,
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
    apply: ({ drops }, m) => {
      if (!/credits?/i.test(m[1])) drops.push(m[1]);
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

/** 纯函数：解析一轮（一次响应）的 textlog 行 → 统计＋掉落名。 */
export function parseTurn(lines: string[]): { stat: TurnStat; drops: string[] } {
  const ctx: RuleCtx = { stat: emptyTurn(), drops: [], lastAction: null };
  for (const raw of lines) {
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
  return ctx;
}

function mergeTotals(t: Totals, s: TurnStat): void {
  t.turns++;
  t.damage += s.damage;
  t.crits += s.crits;
  t.mpCost = (t.mpCost ?? 0) + s.mpCost;
  t.ocCost = (t.ocCost ?? 0) + s.ocCost;
  t.taken += s.taken;
  t.takenPhys = (t.takenPhys ?? 0) + s.takenPhys;
  t.takenMag = (t.takenMag ?? 0) + s.takenMag;
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
  // Totals-only 台账（monsters/bosses）不在 TurnStat 里，合并时只保底不累加
  t.monsters ??= 0;
  t.bosses ??= 0;
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
});

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

function flushBattle(cur: CurBattle, result: string): void {
  const totals = (kvGet('stats2', true) as Totals | null) ?? emptyTotals();
  totals.battles++;
  kvSet('stats2', totals);
  const list = (kvGet('battles2', true) as BattleRow[] | null) ?? [];
  list.push({
    key: battleKey(cur.startedAt),
    startedAt: cur.startedAt,
    type: cur.type,
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
  });
  kvSet('battles2', list.slice(-50));
  kvDel('curBattle2');
}

/** 一局开始（引擎在 newRound 看到 Round 1 时调用）：顶掉未落盘的上一局 */
export function beginBattle(type: string, code: string): void {
  const opt = snapshotOptions();
  if (!opt.recordUsage && !opt.dropMonitor) return;
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
  if (!opt.recordUsage && !opt.dropMonitor) return;
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
 * 记录一轮战斗响应。rows 为该响应的 textlog 原始行（含 HTML）。
 * 只累加 totals + 当前局；分段（开局/终局）由引擎经 beginBattle/beginRound/endBattle 驱动。
 * 仅在 recordUsage/dropMonitor 任一开启时工作。
 */
export function recordBattleTurn(rows: string[]): void {
  const opt = snapshotOptions();
  if (!opt.recordUsage && !opt.dropMonitor) return;
  const texts = rows.map((r) => stripHtml(r).trim()).filter(Boolean);
  const { stat: st, drops } = parseTurn(texts);
  const totals = (kvGet('stats2', true) as Totals | null) ?? emptyTotals();
  mergeTotals(totals, st);
  kvSet('stats2', totals);

  const cur = (kvGet('curBattle2', true) as CurBattle | null) ?? newCur('?', '?');
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
  kvSet('curBattle2', cur);
}

export function getTotals(): Totals {
  return (kvGet('stats2', true) as Totals | null) ?? emptyTotals();
}

export function getBattles(): BattleRow[] {
  return (kvGet('battles2', true) as BattleRow[] | null) ?? [];
}

export function getCurBattle(): CurBattle | null {
  return kvGet('curBattle2', true) as CurBattle | null;
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 单场列表导出 CSV（时间正序，Excel 可直接打开，UTF-8 BOM）。 */
export function battlesToCsv(rows: BattleRow[]): string {
  const head = ['time', 'type', 'result', 'rounds', 'turns', 'damage', 'taken', 'kills', 'monster', 'boss', 'exp', 'credit', 'drops'];
  const lines = rows.map((b) =>
    [
      csvCell(new Date(b.startedAt).toLocaleString()),
      b.type ?? '?',
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
