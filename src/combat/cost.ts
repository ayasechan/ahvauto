import { get } from 'svelte/store';
import { battle } from '../config/battle-state';
import { snapshotOptions } from '../config/store';
import { addCostToCur, addKillsToCur } from '../data/stats';
import type { Action } from './types';

/**
 * 数据收集 v3 接入（capture-agent，只读 DOM，失败静默，绝不挡战斗）：
 * - 施法成本 MP/OC：老版在 eventStart 读技能 DOM 的 onmouseover（legacy L2167-2173）。
 *   新架构等价点是 mainInner 里 decide 命中法术动作时读同一 DOM；
 *   成本与回合统计同走 stats 写串行链（调用顺序即落盘顺序），无竞态。
 * - 怪/Boss 构成：终局 endBattle 调用前以本局 monsterAll/bossAll 补记，随行落盘。
 */
/** 技能 DOM onmouseover → 本次施法 MP/OC（legacy 正则原样沿用，读不到记 0） */
function spellCost(skillId: string): { mp: number; oc: number } {
  try {
    const over = document.getElementById(skillId)?.getAttribute('onmouseover') ?? '';
    const m = over.match(/\('.*', '.*', '.*', (\d+), (\d+), \d+\)/);
    if (!m) return { mp: 0, oc: 0 };
    return { mp: Number(m[1]) || 0, oc: Number(m[2]) || 0 };
  } catch {
    return { mp: 0, oc: 0 };
  }
}
/**
 * 法术动作（法术书施放，游戏侧 mode=magic）→ MP/OC 记入当前局（落盘随行，总数读时求和）。
 */
export function recordSpellCost(action: Action): void {
  try {
    let id: string | null = null;
    if (action.kind === 'magic' || action.kind === 'debuff' || action.kind === 'buff') {
      id = action.id;
    } else if (action.kind === 'imperil') {
      id = '213';
    }
    if (!id) return;
    const opt = snapshotOptions();
    if (!opt.recordUsage) return;
    const { mp, oc } = spellCost(id);
    if (!mp && !oc) return;
    void addCostToCur(mp, oc);
  } catch {
    /* 读不到记 0，绝不挡战斗 */
  }
}
/** 终局怪/Boss 构成补记（老 self._monster/_boss）：endBattle 前记入当前局，随行落盘（同串行链保序） */
export function recordEndKills(): void {
  try {
    const opt = snapshotOptions();
    if (!opt.recordUsage) return;
    const b = get(battle);
    void addKillsToCur(b.monsterAll ?? 0, b.bossAll ?? 0);
  } catch {
    /* ignore */
  }
}
