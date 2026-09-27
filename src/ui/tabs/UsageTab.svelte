<script lang="ts">
  import { options } from '../../lib/store';
  import { tr } from '../../lib/i18n';
  import { getTotals, getBattles, getCurBattle, clearStats, battlesToCsv } from '../../lib/stats';
  import type { BattleRow, CurBattle } from '../../lib/stats';

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

  function refresh() {
    stats = getTotals();
    battles = [...getBattles()].reverse();
    cur = getCurBattle();
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

  const top = (rec: Record<string, number>, n = 5) =>
    Object.entries(rec).sort((a, b) => b[1] - a[1]).slice(0, n);
</script>

<div>
  <div class="row">
    <label><input type="checkbox" bind:checked={$options.recordUsage} />{L('tab.Usage')}</label>
    <button type="button" onclick={refresh}>{L('ui.refresh')}</button>
    <button type="button" onclick={exportCsv}>{L('u.csv')}</button>
    <button type="button" onclick={clear}>{L('ui.clear')}</button>
  </div>
  <table>
    <tbody>
      <tr><td>Rounds</td><td>{stats.turns}</td></tr>
      <tr><td>Battles</td><td>{stats.battles}</td></tr>
      <tr><td>{L('u.damage')}</td><td>{stats.damage}（crit {stats.crits}）</td></tr>
      {#each top(stats.damageByType) as [k, v]}
        <tr><td class="sub">{k}</td><td>{v}</td></tr>
      {/each}
      <tr><td>{L('u.hurt')}</td><td>{stats.taken}（evade {stats.evades} / miss {stats.misses}）</td></tr>
      {#each top(stats.takenByType) as [k, v]}
        <tr><td class="sub">{k}</td><td>{v}</td></tr>
      {/each}
      <tr><td>{L('u.restore')}</td><td>HP {stats.healedHp} / MP {stats.restoredMp} / SP {stats.restoredSp}</td></tr>
      <tr><td>护盾吸收</td><td>{stats.absorbed}</td></tr>
      <tr><td>Focus</td><td>{stats.focus}</td></tr>
      <tr><td>熟练度</td><td>{top(stats.proficiency).map(([k, v]) => `${k} ${v}`).join(', ')}</td></tr>
      <tr><td>EXP / Credit</td><td>{stats.exp} / {stats.credit}</td></tr>
      <tr><td>Casts</td><td>{top(stats.casts).map(([k, v]) => `${k}×${v}`).join(', ')}</td></tr>
      <tr><td>Items</td><td>{top(stats.itemsUsed).map(([k, v]) => `${k}×${v}`).join(', ')}</td></tr>
    </tbody>
  </table>
  <div class="row">
    <b>单场战斗</b>（最近 50 场，点击看详情）
    {#if cur}
      <div class="live">进行中：{cur.turns} turns / {cur.damage} dmg / {cur.kills} kills</div>
    {/if}
    {#if selected}
      {@const b = selected}
      <div class="detail">
        <b>{b.key}</b>
        <button type="button" onclick={() => (selected = null)}>✕</button>
        <table>
          <tbody>
            <tr><td>开始</td><td>{new Date(b.startedAt).toLocaleString()}</td></tr>
            <tr><td>类型</td><td>{typeLabel(b.type)}</td></tr>
            <tr><td>结果</td><td>{resultLabel(b.result)}</td></tr>
            <tr><td>轮数</td><td>{b.rounds ?? 0}</td></tr>
            <tr><td>Turns</td><td>{b.turns}</td></tr>
            <tr><td>伤害</td><td>{b.damage}</td></tr>
            <tr><td>承伤</td><td>{b.taken}</td></tr>
            <tr><td>击杀</td><td>{b.kills}</td></tr>
            <tr><td>EXP</td><td>{b.exp}</td></tr>
            <tr><td>Credit</td><td>{b.credit}</td></tr>
            <tr><td>掉落</td><td>{b.drops.length > 0 ? b.drops.join('; ') : '—'}</td></tr>
          </tbody>
        </table>
      </div>
    {/if}
    <table>
      <thead><tr><th>时间</th><th>类型</th><th>结果</th><th>Turns</th><th>DMG</th><th>Taken</th><th>Kills</th><th>EXP</th></tr></thead>
      <tbody>
        {#each battles as b}
          <tr class="clickable" onclick={() => (selected = b)}>
            <td>{b.key}</td><td>{typeLabel(b.type)}</td><td>{resultLabel(b.result)}</td><td>{b.turns}</td><td>{b.damage}</td><td>{b.taken}</td><td>{b.kills}</td><td>{b.exp}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .row { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; margin: 0 0 12px; padding: 12px; }
  table { border-collapse: collapse; margin: 0 auto; }
  td, th { border: 1px solid #000; padding: 2px 6px; }
  td.sub { padding-left: 16px; color: #555; }
  .live { color: green; font-weight: bold; }
  tr.clickable { cursor: pointer; }
  tr.clickable:hover td { background: #cfe8ff; }
  .detail { border: 2px solid #5C0D11; margin: 4px 0; padding: 4px; background: #fff; }
</style>
