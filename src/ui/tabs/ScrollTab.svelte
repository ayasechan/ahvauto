<script lang="ts">
  import { options } from '../../lib/store';
  import { tr } from '../../lib/i18n';
  import ConditionEditor from '../ConditionEditor.svelte';
  import { SCROLL_LIB } from '../../lib/tables';

  const L = (k: string) => tr($options.lang, k);
  const KEYS = Object.keys(SCROLL_LIB);
</script>

<div>
  <div class="row">
    {L('sc.rounds')}:
    {#each (['ar', 'rb', 'gr', 'iw', 'ba'] as const) as r}
      <label><input type="checkbox" bind:checked={$options.scroll.roundTypes[r]} />{r}</label>
    {/each}
    <label><input type="checkbox" bind:checked={$options.scroll.first} />{L('sc.first')}</label>
  </div>
  <div class="row"><b>{L('sc.need')}</b><ConditionEditor bind:expr={$options.scroll.condition} /></div>
  {#each KEYS as k}
    <div class="row">
      <label><input type="checkbox" bind:checked={$options.scroll.enabledMap[k]} /><b>{SCROLL_LIB[k].name}</b></label>
      <ConditionEditor bind:expr={$options.scroll.conditions[k]} />
    </div>
  {/each}
</div>

<style>
  .row { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; margin: 0 0 12px; padding: 12px; }
</style>
