<script lang="ts">
  import { options } from '../../lib/store';
  import { tr } from '../../lib/i18n';
  import ConditionEditor from '../ConditionEditor.svelte';
  import { ITEM_IDS } from '../../lib/tables';

  const L = (k: string) => tr($options.lang, k);

  const NAMES: [string, string][] = [
    ['Cure', 'Cure'],
    ['FC', 'Full-Cure'],
    ['HP', 'Health Potion'],
    ['HE', 'Health Elixir'],
    ['MP', 'Mana Potion'],
    ['ME', 'Mana Elixir'],
    ['SP', 'Spirit Potion'],
    ['SE', 'Spirit Elixir'],
    ['LE', 'Last Elixir'],
    ['ED', 'Energy Drink'],
  ];

  let newKey = $state('Cure');

  function addOrder() {
    if ($options.item.order.some((o) => o.key === newKey)) return;
    $options.item.order = [...$options.item.order, { key: newKey, id: ITEM_IDS[newKey] }];
    $options.item.enabled[newKey] = true;
  }
  function move(i: number, d: -1 | 1) {
    const arr = [...$options.item.order];
    const j = i + d;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    $options.item.order = arr;
  }
  function remove(i: number) {
    $options.item.order = $options.item.order.filter((_, j) => j !== i);
  }
</script>

<div>
  <div class="row">
    <b>{L('it.order')}</b>
    <select bind:value={newKey}>
      {#each NAMES as [k, label]}
        <option value={k}>{label}</option>
      {/each}
    </select>
    <button type="button" onclick={addOrder}>{L('ui.add')}</button>
    <ol>
      {#each $options.item.order as o, i}
        <li>
          {o.key} (id {o.id})
          <button type="button" onclick={() => move(i, -1)}>↑</button>
          <button type="button" onclick={() => move(i, 1)}>↓</button>
          <button type="button" onclick={() => remove(i)}>{L('ui.delete')}</button>
        </li>
      {/each}
    </ol>
  </div>
  {#each NAMES as [k, label]}
    <div class="row">
      <label><input type="checkbox" bind:checked={$options.item.enabled[k]} /><b>{label}</b></label>
      <ConditionEditor bind:expr={$options.item.conditions[k]} />
    </div>
  {/each}
</div>

<style>
  .row {
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    margin: 0 0 12px;
    padding: 12px;
  }
</style>
