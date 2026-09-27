<script lang="ts">
  import { options } from '../../lib/store';
  import { tr } from '../../lib/i18n';

  const L = (k: string) => tr($options.lang, k);
  const KINDS = ['Common', 'Error', 'Defeat', 'Riddle', 'Victory'] as const;

  function test(kind: string) {
    const url = $options.alarm.audio[kind];
    if (!url) return;
    const a = new Audio(url);
    void a.play().catch(() => {});
  }
</script>

<div>
  <p>{L('al.note')}</p>
  {#each KINDS as k}
    <div class="row">
      <label><input type="checkbox" bind:checked={$options.alarm.audioEnable[k]} /><b>{k}</b></label>
      <input class="url" bind:value={$options.alarm.audio[k]} placeholder={L('al.url')} />
      <button type="button" onclick={() => test(k)}>{L('al.test')}</button>
    </div>
  {/each}
</div>

<style>
  .row { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; margin: 0 0 12px; padding: 12px; }
  .url { width: 70%; }
</style>
