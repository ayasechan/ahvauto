<script lang="ts">
  import { options } from '../../lib/store';
  import { tr } from '../../lib/i18n';
  import { getBattles, clearStats } from '../../lib/stats';
  import type { BattleRow } from '../../lib/stats';

  const L = (k: string) => tr($options.lang, k);
  let rows = $state<BattleRow[]>([]);

  function refresh() {
    rows = getBattles();
  }
  function clear() {
    clearStats();
    refresh();
  }
  refresh();
</script>

<div>
  <div class="row">
    {L('d.filter')} <input bind:value={$options.dropQuality} placeholder="Epic" />
    <button type="button" onclick={refresh}>{L('ui.refresh')}</button>
    <button type="button" onclick={clear}>{L('ui.clear')}</button>
  </div>
  <table>
    <thead><tr><th>{L('d.h.battle')}</th><th>Turns</th><th>DMG</th><th>{L('d.h.exp')}</th><th>{L('d.h.credit')}</th><th>Kills</th><th>Monster</th><th>Boss</th><th>{L('d.h.items')}</th></tr></thead>
    <tbody>
      {#each rows as v}
        <tr><td>{v.key}</td><td>{v.turns}</td><td>{v.damage}</td><td>{v.exp}</td><td>{v.credit}</td><td>{v.kills}</td><td>{v.monsters ?? 0}</td><td>{v.bosses ?? 0}</td><td>{v.drops.join('; ')}</td></tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .row { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; margin: 0 0 12px; padding: 12px; }
  table { border-collapse: collapse; margin: 0 auto; }
  td, th { border: 1px solid #000; padding: 2px 6px; }
</style>
