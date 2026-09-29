<script lang="ts">
  import { options } from '../../lib/store';
  import { tr } from '../../lib/i18n';
  import ConditionEditor from '../ConditionEditor.svelte';
  import { DEBUFF_LIB } from '../../lib/tables';

  const L = (k: string) => tr($options.lang, k);
  const KEYS = Object.keys(DEBUFF_LIB);

  function toggleOrder(k: string, ev: Event) {
    const on = (ev.target as HTMLInputElement).checked;
    $options.debuff.order = on ? [...$options.debuff.order, k] : $options.debuff.order.filter((x) => x !== k);
  }
  function move(i: number, d: -1 | 1) {
    const arr = [...$options.debuff.order];
    const j = i + d;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    $options.debuff.order = arr;
  }
  function remove(i: number) {
    $options.debuff.order = $options.debuff.order.filter((_, j) => j !== i);
  }
</script>

<div>
  <div class="row"><b>{L('db.need')}</b><ConditionEditor bind:expr={$options.debuff.condition} /></div>
  <div class="row">
    <b>{L('it.order')}</b><span class="hint">{L('od.seq')}</span><br />
    {#if $options.debuff.order.length === 0}
      <span class="hint">{L('od.empty')}</span>
    {:else}
      <ol class="seq">
        {#each $options.debuff.order as k, i}
          <li>
            <span class="n">{i + 1}</span>{DEBUFF_LIB[k]?.name ?? k}
            <button type="button" onclick={() => move(i, -1)} aria-label="up">↑</button>
            <button type="button" onclick={() => move(i, 1)} aria-label="down">↓</button>
            <button type="button" onclick={() => remove(i)} aria-label="remove">✕</button>
          </li>
        {/each}
      </ol>
    {/if}
    <div style="margin-top: 8px">
      {#each KEYS as k}
        <label><input type="checkbox" checked={$options.debuff.order.includes(k)} onchange={(e) => toggleOrder(k, e)} />{DEBUFF_LIB[k]?.name ?? k}</label>
      {/each}
    </div>
  </div>
  <div class="row">
    <label><input type="checkbox" bind:checked={$options.debuff.allIm} />{L('db.allIm')}</label>
  </div>
  {#each KEYS as k}
    <div class="row">
      <label><input type="checkbox" bind:checked={$options.debuff.enabledMap[k]} /><b>{DEBUFF_LIB[k]?.name ?? k}</b></label>
      <ConditionEditor bind:expr={$options.debuff.conditions[k]} />
    </div>
  {/each}
  <div class="row">
    {L('db.turns')}:
    <label><input type="checkbox" bind:checked={$options.debuff.turnAlert} />{L('db.turnAlert')}</label><br />
    {#each KEYS as k}
      {DEBUFF_LIB[k]?.name ?? k}: <input class="num" type="number" bind:value={$options.debuff.turns[k]} />
    {/each}
  </div>
</div>

<style>
  .row { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; margin: 0 0 12px; padding: 12px; }
</style>
