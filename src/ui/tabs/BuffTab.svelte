<script lang="ts">
  import { options } from '../../lib/store';
  import { tr } from '../../lib/i18n';
  import type { I18nKey } from '../../lib/i18n';
  import ConditionEditor from '../ConditionEditor.svelte';
  import { BUFF_LIB, DRAUGHT_LIB } from '../../lib/tables';

  const L = (k: I18nKey) => tr($options.lang, k);
  const KEYS = Object.keys(BUFF_LIB);
  const DKEYS = Object.keys(DRAUGHT_LIB);

  function toggleOrder(k: string, ev: Event) {
    const on = (ev.target as HTMLInputElement).checked;
    $options.buff.order = on
      ? [...$options.buff.order, k]
      : $options.buff.order.filter((x) => x !== k);
  }
  function move(i: number, d: -1 | 1) {
    const arr = [...$options.buff.order];
    const j = i + d;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    $options.buff.order = arr;
  }
  function remove(i: number) {
    $options.buff.order = $options.buff.order.filter((_, j) => j !== i);
  }
</script>

<div>
  <div class="row">
    <b>{L('buff.need')}</b><ConditionEditor bind:expr={$options.buff.condition} />
  </div>
  <div class="row">
    <b>{L('item.order')}</b><span class="hint">{L('order.seq')}</span><br />
    {#if $options.buff.order.length === 0}
      <span class="hint">{L('order.empty')}</span>
    {:else}
      <ol class="seq">
        {#each $options.buff.order as k, i}
          <li>
            <span class="n">{i + 1}</span>{BUFF_LIB[k]?.name ?? k}
            <button type="button" onclick={() => move(i, -1)} aria-label="up">↑</button>
            <button type="button" onclick={() => move(i, 1)} aria-label="down">↓</button>
            <button type="button" onclick={() => remove(i)} aria-label="remove">✕</button>
          </li>
        {/each}
      </ol>
    {/if}
    <div style="margin-top: 8px">
      {#each KEYS as k}
        <label
          ><input
            type="checkbox"
            checked={$options.buff.order.includes(k)}
            onchange={(e) => toggleOrder(k, e)}
          />{BUFF_LIB[k].name}</label
        >
      {/each}
    </div>
  </div>
  {#each [...DKEYS, ...KEYS] as k}
    <div class="row">
      <label
        ><input type="checkbox" bind:checked={$options.buff.enabledMap[k]} /><b
          >{DRAUGHT_LIB[k]?.name ?? BUFF_LIB[k]?.name ?? k}</b
        ></label
      >
      <ConditionEditor bind:expr={$options.buff.conditions[k]} />
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
