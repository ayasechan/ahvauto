<script lang="ts">
  import { options } from '../../lib/store';
  import { tr } from '../../lib/i18n';
  import ConditionEditor from '../ConditionEditor.svelte';

  const L = (k: string) => tr($options.lang, k);
  const ORDER = ['OFC', 'FRD', 'T3', 'T2', 'T1'] as const;
  function toggle(k: string, ev: Event) {
    const on = (ev.target as HTMLInputElement).checked;
    $options.skill.order = on
      ? [...$options.skill.order, k]
      : $options.skill.order.filter((x) => x !== k);
  }
  function move(i: number, d: -1 | 1) {
    const arr = [...$options.skill.order];
    const j = i + d;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    $options.skill.order = arr;
  }
  function remove(i: number) {
    $options.skill.order = $options.skill.order.filter((_, j) => j !== i);
  }
</script>

<div>
  <p>{L('sk.note')}</p>
  <div class="row">
    <b>{L('it.order')}</b><span class="hint">{L('od.seq')}</span><br />
    {#if $options.skill.order.length === 0}
      <span class="hint">{L('od.emptySkill')}</span>
      <ol class="seq ghost">
        {#each ORDER as k, i}
          <li><span class="n">{i + 1}</span>{k}</li>
        {/each}
      </ol>
    {:else}
      <ol class="seq">
        {#each $options.skill.order as k, i}
          <li>
            <span class="n">{i + 1}</span>{k}
            <button type="button" onclick={() => move(i, -1)} aria-label="up">↑</button>
            <button type="button" onclick={() => move(i, 1)} aria-label="down">↓</button>
            <button type="button" onclick={() => remove(i)} aria-label="remove">✕</button>
          </li>
        {/each}
      </ol>
    {/if}
    <div style="margin-top: 8px">
      {#each ORDER as k}
        <label
          ><input
            type="checkbox"
            checked={$options.skill.order.includes(k)}
            onchange={(e) => toggle(k, e)}
          />{k}</label
        >
      {/each}
    </div>
  </div>
  <div class="row">
    <label><input type="checkbox" bind:checked={$options.skill.ofc} /><b>{L('sk.ofc')}</b></label>
    <label><input type="checkbox" bind:checked={$options.skill.otosOFC} />{L('sk.once')}</label>
    <ConditionEditor bind:expr={$options.skill.ofcCondition} />
  </div>
  <div class="row">
    <label><input type="checkbox" bind:checked={$options.skill.frd} /><b>{L('sk.frd')}</b></label>
    <label><input type="checkbox" bind:checked={$options.skill.otosFRD} />{L('sk.once')}</label>
    <ConditionEditor bind:expr={$options.skill.frdCondition} />
  </div>
  <div class="row">
    <label><input type="checkbox" bind:checked={$options.skill.t3} /><b>T3</b></label>
    <label><input type="checkbox" bind:checked={$options.skill.otosT3} />{L('sk.once')}</label>
    <ConditionEditor bind:expr={$options.skill.t3Condition} />
  </div>
  <div class="row">
    <label><input type="checkbox" bind:checked={$options.skill.t2} /><b>T2</b></label>
    <label><input type="checkbox" bind:checked={$options.skill.otosT2} />{L('sk.once')}</label>
    <ConditionEditor bind:expr={$options.skill.t2Condition} />
  </div>
  <div class="row">
    <label><input type="checkbox" bind:checked={$options.skill.t1} /><b>T1</b></label>
    <label><input type="checkbox" bind:checked={$options.skill.otosT1} />{L('sk.once')}</label>
    <ConditionEditor bind:expr={$options.skill.t1Condition} />
  </div>
  <div class="row">
    <label
      ><input type="checkbox" bind:checked={$options.skill.mercifulBlow} />{L('sk.merciful')}</label
    >
  </div>
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
