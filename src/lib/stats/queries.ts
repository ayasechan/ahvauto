/** 数据收集 v2 查询＋导出层：读 kv 供 UI（Usage/Drop 面板）与 CSV 导出用。 */
import { kvGet, kvDel } from '../store';
import { STATS_KEY, BATTLES_KEY, CUR_BATTLE_KEY } from '../storage-keys';
import { emptyTotals } from './types';
import type { BattleRow, CurBattle, Totals } from './types';
import { backfillCur, backfillRow, backfillTotals } from './lifecycle';

export function getTotals(): Totals {
  return backfillTotals((kvGet(STATS_KEY, true) as Totals | null) ?? emptyTotals());
}

export function getBattles(): BattleRow[] {
  return ((kvGet(BATTLES_KEY, true) as BattleRow[] | null) ?? []).map(backfillRow);
}

export function getCurBattle(): CurBattle | null {
  const cur = kvGet(CUR_BATTLE_KEY, true) as CurBattle | null;
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
  kvDel(STATS_KEY);
  kvDel(BATTLES_KEY);
  kvDel(CUR_BATTLE_KEY);
}
