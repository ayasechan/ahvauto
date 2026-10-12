/** 数据收集 v3 查询＋导出层：IDB 单场行读＋读时求和，供 UI（Usage 面板）与 CSV 导出用。 */
import { idbGet, idbGetAll, idbClear, BATTLES_STORE, CUR_STORE } from '../db';
import { logger } from '../../platform/logger';
import { emptyTotals, bump } from './types';
import type { BattleRow, CurBattle, Totals } from './types';
import { backfillCur, backfillRow } from './lifecycle';
import { formatDrops, displayDropKey, dropGroup, meetsDropQuality } from './parse';
import type { DropGroup } from './parse';

const CUR_KEY = 'cur';

/** 单场行求和→总数（已落盘局＋进行中局；battles 只计已落盘，startedAt 取最早）。
 * 注意：会对输入行做原地回填（backfillRow/backfillCur），调用方勿复用裸行。可单测。 */
export function deriveTotals(rows: BattleRow[], cur?: CurBattle | null): Totals {
  const t = emptyTotals();
  const live = cur ? backfillCur(cur) : null;
  if (rows.length === 0 && !live) return t;
  t.battles = rows.length;
  const starts = rows.map((r) => r.startedAt ?? 0).filter((n) => n > 0);
  if (live && live.startedAt > 0) starts.push(live.startedAt);
  t.startedAt = starts.length > 0 ? Math.min(...starts) : 0;
  const all: BattleRow[] = live ? [...rows, live as unknown as BattleRow] : [...rows];
  for (const raw of all) {
    const b = backfillRow(raw);
    t.turns += b.turns ?? 0;
    t.damage += b.damage ?? 0;
    t.crits += b.crits ?? 0;
    t.mpCost = (t.mpCost ?? 0) + (b.mpCost ?? 0);
    t.ocCost = (t.ocCost ?? 0) + (b.ocCost ?? 0);
    t.taken += b.taken ?? 0;
    t.takenPhys = (t.takenPhys ?? 0) + (b.takenPhys ?? 0);
    t.takenMag = (t.takenMag ?? 0) + (b.takenMag ?? 0);
    t.takenPhysCount = (t.takenPhysCount ?? 0) + (b.takenPhysCount ?? 0);
    t.takenMagCount = (t.takenMagCount ?? 0) + (b.takenMagCount ?? 0);
    t.takenCount = (t.takenCount ?? 0) + (b.takenCount ?? 0);
    t.absorbed += b.absorbed ?? 0;
    t.evades += b.evades ?? 0;
    t.misses += b.misses ?? 0;
    t.focus += b.focus ?? 0;
    t.healedHp += b.healedHp ?? 0;
    t.restoredMp += b.restoredMp ?? 0;
    t.restoredSp += b.restoredSp ?? 0;
    t.exp += b.exp ?? 0;
    t.credit += b.credit ?? 0;
    t.kills += b.kills ?? 0;
    t.monsters = (t.monsters ?? 0) + (b.monsters ?? 0);
    t.bosses = (t.bosses ?? 0) + (b.bosses ?? 0);
    for (const d of b.drops ?? []) bump(t.drops, d);
    for (const [k, v] of Object.entries(b.damageByType ?? {})) bump(t.damageByType, k, v);
    for (const [k, v] of Object.entries(b.takenByType ?? {})) bump(t.takenByType, k, v);
    for (const [k, v] of Object.entries(b.restoreBySource ?? {})) bump(t.restoreBySource, k, v);
    for (const [k, v] of Object.entries(b.casts ?? {})) bump(t.casts, k, v);
    for (const [k, v] of Object.entries(b.itemsUsed ?? {})) bump(t.itemsUsed, k, v);
    for (const [k, v] of Object.entries(b.buffs ?? {})) bump(t.buffs, k, v);
    for (const [k, v] of Object.entries(b.proficiency ?? {})) bump(t.proficiency, k, v);
    for (const [k, v] of Object.entries(b.modes ?? {})) bump(t.modes, k, v);
  }
  t.dropsCount = Object.values(t.drops).reduce((a, b) => a + b, 0);
  return t;
}

/** 总数（读时对已落盘单场＋进行中局求和；IDB 不可用时回落空表）。
 * 每次展示/导出都记一条耗时（info 级，不受 debug 门控）：IDB 全读＋内存求和。 */
export async function getTotals(): Promise<Totals> {
  const t0 = performance.now();
  try {
    const [rows, cur] = await Promise.all([getBattles(), getCurBattle()]);
    const t1 = performance.now();
    const t = deriveTotals(rows, cur);
    const t2 = performance.now();
    const r1 = Math.round((t1 - t0) * 10) / 10;
    const r2 = Math.round((t2 - t1) * 10) / 10;
    logger.info('stats totals', {
      rows: rows.length + (cur ? 1 : 0),
      turns: t.turns,
      readMs: r1,
      deriveMs: r2,
    });
    return t;
  } catch {
    return emptyTotals();
  }
}

/** 单场列表（IDB 主键升序即时间序；失败回落空）。 */
export async function getBattles(): Promise<BattleRow[]> {
  try {
    return (await idbGetAll<BattleRow>(BATTLES_STORE)).map(backfillRow);
  } catch {
    return [];
  }
}

/** 时间范围（展示层过滤语义，见 docs/UI.md；纯函数可单测）。 */
export type UsageRange = '1d' | '7d' | 'all';

export function normalizeUsageRange(v: unknown): UsageRange {
  return v === '1d' || v === '7d' || v === 'all' ? v : '7d';
}

/** 按时间范围过滤单场行（startedAt 缺失的行只在 all 下保留；不改原数组）。 */
export function filterBattlesByRange(
  rows: BattleRow[],
  range: string,
  now = Date.now(),
): BattleRow[] {
  const r = normalizeUsageRange(range);
  if (r === 'all') return [...rows];
  const span = r === '1d' ? 86_400_000 : 7 * 86_400_000;
  return rows.filter((b) => (b.startedAt ?? 0) > 0 && b.startedAt >= now - span);
}

/** 对数条宽（排除断层 Top1 后的第二组对比用；log10(v+1) 归一化，最大项占满 maxWidth）。 */
export function logBarWidths(
  entries: Array<[string, number]>,
  maxWidth: number,
): Array<{ key: string; value: number; width: number }> {
  const sorted = [...entries].sort((a, b) => b[1] - a[1]);
  const top = sorted.length > 0 ? Math.max(sorted[0][1], 0) : 0;
  const denom = top > 0 ? Math.log10(top + 1) : 0;
  return sorted.map(([key, value]) => ({
    key,
    value,
    width:
      denom <= 0 || value <= 0
        ? 0
        : Math.round((Math.log10(value + 1) / denom) * maxWidth * 10) / 10,
  }));
}

/** 紧凑数字（k/M：9084→9.1k，1362591→1.4M，千以下保持千分位；hover 全量由调用方 title 承担；locale 只影响千分位，默认 en-US 保单测稳定）。 */
export function fmtCompact(n: number | undefined | null, locale = 'en-US'): string {
  const v = n ?? 0;
  if (v < 1000) return v.toLocaleString(locale);
  const [d, u] = v < 1_000_000 ? [v / 1000, 'k'] : [v / 1_000_000, 'M'];
  const r = Math.round(d * 10) / 10;
  return `${Number.isInteger(r) ? r.toFixed(0) : r}${u}`;
}

/** 进行中局（无则 null；失败回落 null）。 */
export async function getCurBattle(): Promise<CurBattle | null> {
  try {
    const cur = await idbGet<CurBattle>(CUR_STORE, CUR_KEY);
    return cur ? backfillCur(cur) : null;
  } catch {
    return null;
  }
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 单场列表导出 CSV（时间正序，Excel 可直接打开，UTF-8 BOM；表头恒英文、时间列用浏览器默认 locale，机器接口口径，不进词典）。 */
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
      csvCell(formatDrops(b.drops ?? [])),
    ].join(','),
  );
  return '﻿' + [head.join(','), ...lines].join('\n');
}

/** 掉落汇总（聚合规则见 docs/ARCHITECTURE.md 掉落口径节；q 为展示层品质过滤） */
export function topDrops(
  totals: Pick<Totals, 'drops'>,
  n?: number,
  q = '',
): Array<[string, number]> {
  try {
    const grouped: Record<string, number> = {};
    for (const [k, v] of Object.entries(totals.drops ?? {})) {
      if (!meetsDropQuality(k, q)) continue;
      bump(grouped, displayDropKey(k), v);
    }
    const rows = Object.entries(grouped).sort((a, b) => b[1] - a[1]);
    return n === undefined ? rows : rows.slice(0, n);
  } catch {
    return [];
  }
}

/** 总表分组顺序（固定行序：装备→消耗品→素材→奖杯→遗物→手办→怪物道具→其它）。 */
export const DROP_GROUP_ORDER: DropGroup[] = [
  'equip',
  'consumable',
  'material',
  'trophy',
  'relic',
  'figure',
  'monsteritem',
  'other',
];

/** 掉落汇总分组（组内按展示键聚合、件数降序；恒返回 8 组，空组 entries 为空数组；q 为展示层品质过滤）。 */
export function groupedDrops(
  totals: Pick<Totals, 'drops'>,
  q = '',
): Array<{ group: DropGroup; entries: Array<[string, number]> }> {
  const empty = (): Array<{ group: DropGroup; entries: Array<[string, number]> }> =>
    DROP_GROUP_ORDER.map((group) => ({ group, entries: [] }));
  try {
    const per: Record<DropGroup, Record<string, number>> = {
      equip: {},
      consumable: {},
      material: {},
      trophy: {},
      relic: {},
      figure: {},
      monsteritem: {},
      other: {},
    };
    for (const [k, v] of Object.entries(totals.drops ?? {})) {
      if (!meetsDropQuality(k, q)) continue;
      const dk = displayDropKey(k);
      // 按原键分组：无品质词红装标记（Equipment of 原名）归装备组，传奇 Core 归素材。
      bump(per[dropGroup(k)], dk, v);
    }
    return DROP_GROUP_ORDER.map((group) => ({
      group,
      entries: Object.entries(per[group]).sort((a, b) => b[1] - a[1]),
    }));
  } catch {
    return empty();
  }
}

/** 掉落汇总导出 CSV（展示键聚合后 name,count 按件数降序，UTF-8 BOM；表头恒英文，机器接口口径，不进词典；q 为展示层品质过滤）。 */
export function dropsToCsv(totals: Pick<Totals, 'drops'>, q = ''): string {
  const grouped: Record<string, number> = {};
  for (const [k, v] of Object.entries(totals.drops ?? {})) {
    if (!meetsDropQuality(k, q)) continue;
    bump(grouped, displayDropKey(k), v);
  }
  const rows = Object.entries(grouped).sort((a, b) => b[1] - a[1]);
  const lines = rows.map(([k, v]) => [csvCell(k), v].join(','));
  return '﻿' + [['name', 'count'].join(','), ...lines].join('\n');
}

/** 清空：battles＋cur 两表全清（面板“清空”语义）。 */
export function clearStats(): Promise<void> {
  return (async () => {
    try {
      await idbClear(BATTLES_STORE);
    } catch {
      /* ignore */
    }
    try {
      await idbClear(CUR_STORE);
    } catch {
      /* ignore */
    }
  })();
}
