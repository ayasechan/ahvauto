<script lang="ts">
  import { options } from '../../lib/store';
  import { tr } from '../../lib/i18n';

  const L = (k: string) => tr($options.lang, k);
  const W = ['Sle', 'Bl', 'Slo', 'Im', 'MN', 'Si', 'Dr', 'We', 'Co', 'CM', 'Stun', 'PA', 'BW'];
</script>

<div>
  <div class="row">
    <label><input type="checkbox" bind:checked={$options.rule.reverse} />{L('ru.reverse')}</label>
  </div>
  {#each W as k}
    <div class="row">
      {k} {L('ru.weight')}: <input class="num" type="number" bind:value={$options.rule.weights[k]} />
    </div>
  {/each}
</div>

<style>
  .row { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; margin: 0 0 12px; padding: 12px; }
  .num { width: 60px; }
</style>
