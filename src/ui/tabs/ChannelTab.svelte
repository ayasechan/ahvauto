<script lang="ts">
  import { options } from '../../lib/store';
  import { tr } from '../../lib/i18n';
  import { BUFF_LIB } from '../../lib/tables';

  const L = (k: string) => tr($options.lang, k);
  const KEYS = Object.keys(BUFF_LIB);
  let newKey = $state('Cu');

  function addSecond() {
    const id = newKey === 'Cu' ? '311' : newKey === 'FC' ? '313' : (BUFF_LIB[newKey]?.id ?? newKey);
    if ($options.channel.secondOrder.some((o) => o.id === id)) return;
    $options.channel.secondOrder = [...$options.channel.secondOrder, { key: newKey, id }];
  }
  function move(i: number, d: -1 | 1) {
    const arr = [...$options.channel.secondOrder];
    const j = i + d;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    $options.channel.secondOrder = arr;
  }
</script>

<div>
  <p><b>{L('ch.title')}</b></p>
  <div class="row">
    <b>{L('ch.first')}</b><br />
    {#each KEYS as k}
      <label><input type="checkbox" bind:checked={$options.channel.first[k]} />{BUFF_LIB[k].name}</label>
    {/each}
  </div>
  <div class="row">
    <label><input type="checkbox" bind:checked={$options.channel.useSecond} /><b>{L('ch.then')}</b></label>
    <select bind:value={newKey}>
      <option value="Cu">Cure</option>
      <option value="FC">Full-Cure</option>
      {#each KEYS as k}
        <option value={k}>{BUFF_LIB[k].name}</option>
      {/each}
    </select>
    <button type="button" onclick={addSecond}>{L('ui.add')}</button>
    <ol>
      {#each $options.channel.secondOrder as o, i}
        <li>{o.key} ({o.id})
          <button type="button" onclick={() => move(i, -1)}>↑</button>
          <button type="button" onclick={() => move(i, 1)}>↓</button>
          <button type="button" onclick={() => ($options.channel.secondOrder = $options.channel.secondOrder.filter((_, j) => j !== i))}>{L('ui.delete')}</button>
        </li>
      {/each}
    </ol>
  </div>
</div>

<style>
  .row { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; margin: 0 0 12px; padding: 12px; }
</style>
