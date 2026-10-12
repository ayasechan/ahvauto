<script lang="ts">
  import { options } from '../../config/store';
  import { tr } from '../../platform/i18n';
  import type { I18nKey } from '../../platform/i18n';

  const L = (k: I18nKey) => tr($options.lang, k);
  const W = ['Sle', 'Bl', 'Slo', 'Im', 'MN', 'Si', 'Dr', 'We', 'Co', 'CM', 'Stun', 'PA', 'BW'];
</script>

<div>
  <div class="row">
    <label><input type="checkbox" bind:checked={$options.rule.reverse} />{L('rule.reverse')}</label>
  </div>
  {#each W as k}
    <div class="row">
      {k}
      {L('rule.weight')}: <input class="num" type="number" bind:value={$options.rule.weights[k]} />
    </div>
  {/each}
</div>

<style>
</style>
