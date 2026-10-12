<script lang="ts">
  import { options } from '../../config/store';
  import { tr } from '../../platform/i18n';
  import type { I18nKey } from '../../platform/i18n';
  import ConditionEditor from '../shared/ConditionEditor.svelte';
  import { ITEM_IDS } from '../../config/tables';

  const L = (k: I18nKey) => tr($options.lang, k);

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

  let labelOf = (k: string): string => NAMES.find(([key]) => key === k)?.[1] ?? k;

  function toggle(k: string, ev: Event) {
    const on = (ev.target as HTMLInputElement).checked;
    if (on) {
      if ($options.item.order.some((o) => o.key === k)) return;
      $options.item.order = [...$options.item.order, { key: k, id: ITEM_IDS[k] }];
      $options.item.enabled[k] = true;
    } else {
      $options.item.order = $options.item.order.filter((o) => o.key !== k);
    }
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
    <b>{L('item.order')}</b><span class="hint">{L('order.seq')}</span><br />
    {#if $options.item.order.length === 0}
      <span class="hint">{L('order.emptySkill')}</span>
      <ol class="seq ghost">
        {#each NAMES as [k, label], i}
          <li><span class="n">{i + 1}</span>{label}</li>
        {/each}
      </ol>
    {:else}
      <ol class="seq">
        {#each $options.item.order as o, i}
          <li>
            <span class="n">{i + 1}</span>{labelOf(o.key)}
            <button
              type="button"
              onclick={() => move(i, -1)}
              disabled={i === 0}
              aria-label="up {labelOf(o.key)}">↑</button
            >
            <button
              type="button"
              onclick={() => move(i, 1)}
              disabled={i === $options.item.order.length - 1}
              aria-label="down {labelOf(o.key)}">↓</button
            >
            <button type="button" onclick={() => remove(i)} aria-label="remove {labelOf(o.key)}"
              >✕</button
            >
          </li>
        {/each}
      </ol>
    {/if}
    <div style="margin-top: 8px">
      {#each NAMES as [k, label]}
        <label
          ><input
            type="checkbox"
            checked={$options.item.order.some((o) => o.key === k)}
            onchange={(e) => toggle(k, e)}
          />{label}</label
        >
      {/each}
    </div>
  </div>
  {#each NAMES as [k, label]}
    <div class="row">
      <label><input type="checkbox" bind:checked={$options.item.enabled[k]} /><b>{label}</b></label>
      <ConditionEditor bind:expr={$options.item.conditions[k]} />
    </div>
  {/each}
</div>

<style>
</style>
