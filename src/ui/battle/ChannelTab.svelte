<script lang="ts">
  import { options } from '../../config/store';
  import { tr } from '../../platform/i18n';
  import type { I18nKey } from '../../platform/i18n';
  import { BUFF_LIB } from '../../config/tables';

  const L = (k: I18nKey) => tr($options.lang, k);
  const KEYS = Object.keys(BUFF_LIB);
  const CHANNEL_SECOND_ID: Record<string, string> = { Cu: '311', FC: '313' };
  let newKey = $state('Cu');

  function addSecond() {
    const id = CHANNEL_SECOND_ID[newKey] ?? BUFF_LIB[newKey]?.id ?? newKey;
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
  <p><b>{L('channel.title')}</b></p>
  <div class="row">
    <b>{L('channel.first')}</b><br />
    {#each KEYS as k}
      <label
        ><input type="checkbox" bind:checked={$options.channel.first[k]} />{BUFF_LIB[k].name}</label
      >
    {/each}
  </div>
  <div class="row">
    <label
      ><input type="checkbox" bind:checked={$options.channel.useSecond} /><b>{L('channel.then')}</b
      ></label
    >
    <select bind:value={newKey} disabled={!$options.channel.useSecond}>
      <option value="Cu">Cure</option>
      <option value="FC">Full-Cure</option>
      {#each KEYS as k}
        <option value={k}>{BUFF_LIB[k].name}</option>
      {/each}
    </select>
    <button type="button" onclick={addSecond} disabled={!$options.channel.useSecond}
      >{L('ui.add')}</button
    >
    <ol class="seq">
      {#each $options.channel.secondOrder as o, i}
        <li>
          {o.key} ({o.id})
          <button
            type="button"
            onclick={() => move(i, -1)}
            disabled={i === 0}
            aria-label="up {o.key}">↑</button
          >
          <button
            type="button"
            onclick={() => move(i, 1)}
            disabled={i === $options.channel.secondOrder.length - 1}
            aria-label="down {o.key}">↓</button
          >
          <button
            type="button"
            onclick={() =>
              ($options.channel.secondOrder = $options.channel.secondOrder.filter(
                (_, j) => j !== i,
              ))}>{L('ui.delete')}</button
          >
        </li>
      {/each}
      {#if $options.channel.secondOrder.length === 0}<li class="hint">
          {L('order.emptySkill')}
        </li>{/if}
    </ol>
  </div>
</div>

<style>
</style>
