import { kvGet, kvSet, kvDel, snapshotOptions } from './store';
import { logger } from './logger';

/**
 * 数据收集 v2（按实战数据重写，见 logs/battle-records-1.json）。
 * 数据源：每次战斗响应的 textlog 行（经 recorder 桥接），不再爬 DOM.
 * 分段由战斗引擎驱动：一局＝从 Initializing 到终局（多轮），类型来自引擎。
 * - parseTurn() 纯函数：行文本 → 单轮统计，可单测；
 * - recordBattleTurn()：累加 totals + 当前战斗，遇 Victory/Defeat 落盘；
 * - 存储 key 全用 stats2* 新命名空间（老 stats 数据不可靠，不做迁移）。
 */

export interface TurnStat {
  damage: number;
  damageByType: Record<string, number>;
  crits: number;
  taken: number;
  takenByType: Record<string, number>;
  /** 护盾吸收掉的量（未实际扣血，仅统计） */
  absorbed: number;
  evades: number;
  misses: number;
  focus: number;
  healedHp: number;
  restoredMp: number;
  restoredSp: number;
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
  drops: string[];
}

const emptyTurn = (): TurnStat => ({
  damage: 0,
  damageByType: {},
  crits: 0,
  taken: 0,
  takenByType: {},
  absorbed: 0,
  evades: 0,
  misses: 0,
  focus: 0,
  healedHp: 0,
  restoredMp: 0,
  restoredSp: 0,
  proficiency: {},
  exp: 0,
  credit: 0,
  kills: 0,
  casts: {},
  itemsUsed: {},
  buffs: {},
});

const emptyTotals = (): Totals => ({ ...emptyTurn(), turns: 0, battles: 0 });

const bump = (rec: Record<string, number>, key: string, n = 1): void => {
  rec[key] = (rec[key] ?? 0) + n;
};

export function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, '');
}

interface RuleCtx {
  stat: TurnStat;
  drops: string[];
}

interface Rule {
  /** 规则名（仅调试/文档用） */
  name: string;
  re: RegExp;
  apply: (ctx: RuleCtx, m: RegExpMatchArray) => void;
}

/**
 * 行分类规则表：按表顺序 first-match-wins，顺序即优先级。
 * 容易踩的先后关系：
 * - hit/hitSelf 在 miss 之前（含 resists 的行先按伤害计）；
 * - focus 在 gainSelf 之前（否则 Focusing 被吞进 buffs）；
 * - evade/miss 在 cast 之前；
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
    name: 'taken',
    re: /(?:causing|take) (\d+) points of (\w+) damage/,
    apply: ({ stat }, m) => {
      const n = Number(m[1]);
      stat.taken += n;
      bump(stat.takenByType, m[2], n);
    },
  },
  {
    name: 'absorb',
    re: /(\S(?:.*\S)?) absorbs (\d+) points of damage .* into (\d+) points of (\w+) damage/,
    apply: ({ stat }, m) => {
      const n = Number(m[3]);
      stat.taken += n;
      bump(stat.takenByType, m[4], n);
      stat.absorbed += Number(m[2]);
    },
  },
  {
    name: 'healed',
    re: /You are healed for (\d+) Health/,
    apply: ({ stat }, m) => {
      stat.healedHp += Number(m[1]);
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
    apply: ({ stat }, m) => {
      bump(stat.casts, m[1]);
    },
  },
  {
    name: 'useItem',
    re: /^You use (.+)\.$/,
    apply: ({ stat }, m) => {
      bump(stat.itemsUsed, m[1]);
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
    name: 'hpHeal',
    re: /restores (\d+) points of health/,
    apply: ({ stat }, m) => {
      stat.healedHp += Number(m[1]);
    },
  },
  {
    name: 'mpRestore',
    re: /restores (\d+) points of magic|Recovered (\d+) points of magic/,
    apply: ({ stat }, m) => {
      stat.restoredMp += Number(m[1] ?? m[2]);
    },
  },
  {
    name: 'spRestore',
    re: /restores (\d+) points of spirit|Recovered (\d+) points of spirit/,
    apply: ({ stat }, m) => {
      stat.restoredSp += Number(m[1] ?? m[2]);
    },
  },
];

/** 纯函数：解析一轮（一次响应）的 textlog 行 → 统计＋掉落名。 */
export function parseTurn(lines: string[]): { stat: TurnStat; drops: string[] } {
  const ctx: RuleCtx = { stat: emptyTurn(), drops: [] };
  for (const raw of lines) {
    const t = stripHtml(raw).trim();
    if (!t) continue;
    for (const rule of RULES) {
      const m = t.match(rule.re);
      if (m) {
        rule.apply(ctx, m);
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
  t.taken += s.taken;
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
  for (const [k, v] of Object.entries(s.damageByType)) bump(t.damageByType, k, v);
  for (const [k, v] of Object.entries(s.takenByType)) bump(t.takenByType, k, v);
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
  const head = ['time', 'type', 'result', 'rounds', 'turns', 'damage', 'taken', 'kills', 'exp', 'credit', 'drops'];
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
