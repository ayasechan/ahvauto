<script lang="ts">
  import { options } from '../../lib/store';
  import { tr } from '../../lib/i18n';
  import ConditionEditor from '../ConditionEditor.svelte';

  const L = (k: string) => tr($options.lang, k);
</script>

<div>
  <div class="row">
    <label
      ><input type="checkbox" bind:checked={$options.infusion.enabled} /><b>{L('in.label')}</b
      ></label
    >
    <ConditionEditor bind:expr={$options.infusion.condition} />
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
