<script lang="ts">
  import { options } from '../../config/store';
  import { tr } from '../../platform/i18n';
  import type { I18nKey } from '../../platform/i18n';
  import ConditionEditor from '../shared/ConditionEditor.svelte';
  import { SCROLL_LIB } from '../../config/tables';

  const L = (k: I18nKey) => tr($options.lang, k);
  const KEYS = Object.keys(SCROLL_LIB);
  /** 战斗类型 → 词典 key（与 UsageTab 同口径，加类型同步补这里）。 */
  const TYPE_KEY = {
    ar: 'battle.ar',
    rb: 'battle.rb',
    gr: 'battle.gr',
    iw: 'battle.iw',
    ba: 'battle.ba',
  } as const satisfies Record<string, I18nKey>;

  function typeLabel(t: string): string {
    const key = (TYPE_KEY as Record<string, I18nKey | undefined>)[t] ?? 'battle.unknown';
    return tr($options.lang, key);
  }
</script>

<div>
  <div class="row">
    {L('scroll.rounds')}:
    {#each ['ar', 'rb', 'gr', 'iw', 'ba'] as const as r}
      <label
        ><input type="checkbox" bind:checked={$options.scroll.roundTypes[r]} />{typeLabel(r)}</label
      >
    {/each}
    <label><input type="checkbox" bind:checked={$options.scroll.first} />{L('scroll.first')}</label>
  </div>
  <div class="row">
    <b>{L('scroll.need')}</b><ConditionEditor bind:expr={$options.scroll.condition} />
  </div>
  {#each KEYS as k}
    <div class="row">
      <label
        ><input type="checkbox" bind:checked={$options.scroll.enabledMap[k]} /><b
          >{SCROLL_LIB[k].name}</b
        ></label
      >
      <ConditionEditor bind:expr={$options.scroll.conditions[k]} />
    </div>
  {/each}
</div>

<style>
</style>
