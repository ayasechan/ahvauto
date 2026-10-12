<script lang="ts">
  import { options } from '../../config/store';
  import { tr } from '../../platform/i18n';
  import type { I18nKey } from '../../platform/i18n';
  import ConditionEditor from '../shared/ConditionEditor.svelte';

  const L = (k: I18nKey) => tr($options.lang, k);
</script>

<div>
  <div class="row">
    <label
      ><input type="checkbox" bind:checked={$options.infusion.enabled} /><b>{L('infusion.label')}</b
      ></label
    >
    <ConditionEditor bind:expr={$options.infusion.condition} />
  </div>
</div>

<style>
</style>
