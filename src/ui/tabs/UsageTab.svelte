<script lang="ts">
  import { options, kvGet } from '../../lib/store';
  import { tr } from '../../lib/i18n';
  import { getTotals, getBattles, getCurBattle, clearStats, battlesToCsv, isPhysicalElem } from '../../lib/stats';
  import type { BattleRow, CurBattle } from '../../lib/stats';
  import * as battleMod from '../../lib/battle';

  const L = (k: string) => tr($options.lang, k);

  function typeLabel(t: string | undefined): string {
    const key = ['ar', 'rb', 'gr', 'iw', 'ba'].includes(t ?? '') ? `bt.${t}` : 'bt.unknown';
    return tr($options.lang, key);
  }

  function resultLabel(r: string | undefined): string {
    const key = r === 'victory' ? 'bt.victory' : r === 'defeat' ? 'bt.defeat' : r === 'interrupted' ? 'bt.interrupted' : null;
    return key ? tr($options.lang, key) : (r ?? '?');
  }
  let stats = $state(getTotals());
  let battles = $state<BattleRow[]>([]);
  let cur = $state<CurBattle | null>(null);
  let selected = $state<BattleRow | null>(null);
  let staminaLog = $state<Array<[string, number]>>([]);
  let encounter = $state<{ time: number; lastTime: number } | null>(null);

  // Stamina/遭遇战台账：优先 capture-agent 约定的 helper（getStaminaLog/getEncounter），
  // 不存在或异常时回落 kv 直读，全程防御、绝不 crash
  const bmod = battleMod as unknown as Record<string, unknown>;
  function callHelper(name: string): unknown {
    try {
      const fn = bmod[name];
      if (typeof fn === 'function') return (fn as () => unknown)();
    } catch {
      /* helper 异常时回落 kv 直读 */
    }
    return undefined;
  }
  function readStamina(): Array<[string, number]> {
    const via = callHelper('getStaminaLog');
    if (via && typeof via === 'object') {
      try {
        return Object.entries(via as Record<string, number>).slice(-5);
      } catch {
        /* fallthrough */
      }
    }
    try {
      const raw = kvGet('staminaLostLog', true) as Record<string, number> | null;
      if (raw && typeof raw === 'object') return Object.entries(raw).slice(-5);
    } catch {
      /* kv 缺失/损坏时返回空 */
    }
    return [];
  }
  function readEncounter(): { time: number; lastTime: number } | null {
    const via = callHelper('getEncounter');
    if (via && typeof via === 'object') {
      const v = via as Record<string, unknown>;
      if (typeof v['time'] === 'number')
        return { time: v['time'] as number, lastTime: typeof v['lastTime'] === 'number' ? (v['lastTime'] as number) : 0 };
    }
    try {
      const raw = kvGet('encounter', true) as { time: number; lastTime: number } | null;
      if (raw && typeof raw.time === 'number') return { time: raw.time, lastTime: raw.lastTime ?? 0 };
    } catch {
      /* kv 缺失/损坏时返回空 */
    }
    return null;
  }

  function refresh() {
    stats = getTotals();
    battles = [...getBattles()].reverse();
    cur = getCurBattle();
    staminaLog = readStamina();
    encounter = readEncounter();
    const sel = selected;
    if (sel) selected = getBattles().find((b) => b.key === sel.key && b.startedAt === sel.startedAt) ?? null;
  }
  function clear() {
    clearStats();
    refresh();
  }
  function exportCsv() {
    const blob = new Blob([battlesToCsv(getBattles())], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hvaa-battles-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  refresh();

  // 大数字千分位（1713850677 → 1,713,850,677）
  const fmt = (n: number | undefined | null): string => (n ?? 0).toLocaleString('en-US');
  const top = (rec: Record<string, number>, n = 5) =>
    Object.entries(rec).sort((a, b) => b[1] - a[1]).slice(0, n);
  // 承伤元素按组别分开展示（piercing/crushing/slashing→物理，其余→魔法）
  const topTakenBy = (phys: boolean, n = 5) =>
    Object.entries(stats.takenByType ?? {})
      .filter(([k]) => isPhysicalElem(k) === phys)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n);
</script>

<div>
  <div class="row">
    <button type="button" onclick={refresh}>{L('ui.refresh')}</button>
    <button type="button" onclick={exportCsv}>{L('u.csv')}</button>
    <button type="button" onclick={clear}>{L('ui.clear')}</button>
  </div>
  <table>
    <tbody>
      <tr><td>Rounds</td><td>{fmt(stats.turns)}</td></tr>
      <tr><td>Battles</td><td>{fmt(stats.battles)}</td></tr>
      <tr><td>{L('u.damage')}</td><td>{fmt(stats.damage)}（crit {fmt(stats.crits)}）</td></tr>
      {#each top(stats.damageByType) as [k, v]}
        <tr><td class="sub">{k}</td><td>{fmt(v)}</td></tr>
      {/each}
      <tr><td>{L('u.hurt')}</td><td>{fmt(stats.taken)}（evade {fmt(stats.evades)} / miss {fmt(stats.misses)}）</td></tr>
      <tr><td class="sub">物理承伤</td><td>{fmt(stats.takenPhys)}</td></tr>
      {#each topTakenBy(true) as [k, v]}
        <tr><td class="sub sub2">{k}</td><td>{fmt(v)}</td></tr>
      {/each}
      <tr><td class="sub">魔法承伤</td><td>{fmt(stats.takenMag)}</td></tr>
      {#each topTakenBy(false) as [k, v]}
        <tr><td class="sub sub2">{k}</td><td>{fmt(v)}</td></tr>
      {/each}
      <tr><td>{L('u.restore')}</td><td>HP {fmt(stats.healedHp)} / MP {fmt(stats.restoredMp)} / SP {fmt(stats.restoredSp)}</td></tr>
      <tr><td>护盾吸收</td><td>{fmt(stats.absorbed)}</td></tr>
      <tr><td>Focus</td><td>{fmt(stats.focus)}</td></tr>
      <tr><td>熟练度</td><td>{top(stats.proficiency).map(([k, v]) => `${k} ${fmt(v)}`).join(', ')}</td></tr>
      <tr><td>EXP / Credit</td><td>{fmt(stats.exp)} / {fmt(stats.credit)}</td></tr>
      <tr><td>Casts</td><td>{top(stats.casts).map(([k, v]) => `${k}×${fmt(v)}`).join(', ')}</td></tr>
      <tr><td>Items</td><td>{top(stats.itemsUsed).map(([k, v]) => `${k}×${fmt(v)}`).join(', ')}</td></tr>
      <tr><td>MP / OC 消耗</td><td>{fmt(stats.mpCost)} / {fmt(stats.ocCost)}</td></tr>
      <tr><td>回复来源 top5</td><td>{top(stats.restoreBySource ?? {}).map(([k, v]) => `${k} ${fmt(v)}`).join(', ') || '—'}</td></tr>
      <tr><td>Monsters / Bosses</td><td>{fmt(stats.monsters)} / {fmt(stats.bosses)}</td></tr>
      <tr><td>动作模式</td><td>{top(stats.modes ?? {}).map(([k, v]) => `${k}×${fmt(v)}`).join(', ') || '—'}</td></tr>
      <tr><td>累计开始</td><td>{stats.startedAt ? new Date(stats.startedAt).toLocaleString() : '—'}</td></tr>
    </tbody>
  </table>
  <div class="row">
    <b>单场战斗</b>（最近 50 场，点击看详情）
    {#if cur}
      <div class="live">进行中：{fmt(cur.turns)} turns / {fmt(cur.damage)} dmg / {fmt(cur.kills)} kills</div>
    {/if}
    {#if selected}
      {@const b = selected}
      <div class="detail">
        <b>{b.key}</b>
        <button type="button" onclick={() => (selected = null)}>✕</button>
        <table>
          <tbody>
            <tr><td>开始</td><td>{new Date(b.startedAt).toLocaleString()}</td></tr>
            <tr><td>结束</td><td>{b.endedAt ? new Date(b.endedAt).toLocaleString() : '—'}</td></tr>
            <tr><td>类型</td><td>{typeLabel(b.type)}</td></tr>
            <tr><td>代号</td><td>{b.code || '—'}</td></tr>
            <tr><td>结果</td><td>{resultLabel(b.result)}</td></tr>
            <tr><td>轮数</td><td>{fmt(b.rounds)}</td></tr>
            <tr><td>Turns</td><td>{fmt(b.turns)}</td></tr>
            <tr><td>伤害</td><td>{fmt(b.damage)}</td></tr>
            <tr><td>承伤</td><td>{fmt(b.taken)}</td></tr>
            <tr><td>击杀</td><td>{fmt(b.kills)}</td></tr>
            <tr><td>Monster</td><td>{fmt(b.monsters)}</td></tr>
            <tr><td>Boss</td><td>{fmt(b.bosses)}</td></tr>
            <tr><td>EXP</td><td>{fmt(b.exp)}</td></tr>
            <tr><td>Credit</td><td>{fmt(b.credit)}</td></tr>
            <tr><td>掉落</td><td>{b.drops.length > 0 ? b.drops.join('; ') : '—'}</td></tr>
            <tr><td>动作模式</td><td>{b.modes ? Object.entries(b.modes).map(([k, v]) => `${k}×${v}`).join(', ') || '—' : '—'}</td></tr>
            {#if b.detail}
              {@const d = b.detail}
              <tr><td>伤害分布</td><td>{Object.entries(d.damageByType).sort((a, b2) => b2[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} ${fmt(v)}`).join(', ') || '—'}</td></tr>
              <tr><td>承伤分布</td><td>{Object.entries(d.takenByType).sort((a, b2) => b2[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} ${fmt(v)}`).join(', ') || '—'}</td></tr>
              <tr><td>施法/物品</td><td>{Object.entries({ ...d.casts, ...d.itemsUsed }).sort((a, b2) => b2[1] - a[1]).slice(0, 5).map(([k, v]) => `${k}×${fmt(v)}`).join(', ') || '—'}</td></tr>
            {/if}
          </tbody>
        </table>
      </div>
    {/if}
    <table>
      <thead><tr><th>时间</th><th>类型</th><th>代号</th><th>结果</th><th>Turns</th><th>DMG</th><th>Taken</th><th>Kills</th><th>Monster</th><th>Boss</th><th>EXP</th></tr></thead>
      <tbody>
        {#each battles as b}
          <tr class="clickable" onclick={() => (selected = b)}>
            <td>{b.key}</td><td>{typeLabel(b.type)}</td><td>{b.code || '—'}</td><td>{resultLabel(b.result)}</td><td>{fmt(b.turns)}</td><td>{fmt(b.damage)}</td><td>{fmt(b.taken)}</td><td>{fmt(b.kills)}</td><td>{fmt(b.monsters)}</td><td>{fmt(b.bosses)}</td><td>{fmt(b.exp)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <div class="row">
    <b>Stamina / 遭遇战台账</b>
    <table>
      <tbody>
        <tr><td>Stamina lost（最近 5 条）</td><td>{staminaLog.length > 0 ? staminaLog.map(([k, v]) => `${k} -${v}`).join('; ') : '—'}</td></tr>
        <tr><td>Encounters</td><td>{encounter ? `${encounter.time} 次 / 上次 ${encounter.lastTime ? new Date(encounter.lastTime).toLocaleString() : '—'}` : '—'}</td></tr>
      </tbody>
    </table>
  </div>
</div>

<style>
  .row { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; margin: 0 0 12px; padding: 12px; }
  table { border-collapse: collapse; margin: 0 auto; }
  td, th { border: 1px solid #000; padding: 2px 6px; }
  td.sub { padding-left: 16px; color: #555; }
  td.sub2 { padding-left: 32px; }
  .live { color: green; font-weight: bold; }
  tr.clickable { cursor: pointer; }
  tr.clickable:hover td { background: #cfe8ff; }
  .detail { border: 2px solid #5C0D11; margin: 4px 0; padding: 4px; background: #fff; }
</style>
