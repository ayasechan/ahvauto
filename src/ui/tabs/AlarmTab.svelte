<script lang="ts">
  import { options } from '../../lib/store';
  import { tr } from '../../lib/i18n';
  import { sendTelegram, sendWebhook } from '../../lib/notify';

  const L = (k: string) => tr($options.lang, k);
  const KINDS = ['Common', 'Error', 'Defeat', 'Riddle', 'Victory'] as const;

  function test(kind: string) {
    const url = $options.alarm.audio[kind];
    if (!url) return;
    const a = new Audio(url);
    void a.play().catch(() => {});
  }

  let tgMsg = '';
  let whMsg = '';

  async function testTelegram() {
    tgMsg = '...';
    try {
      await sendTelegram('Common', `ahvauto ${L('al.testPush')}\n${location.href}`, true);
      tgMsg = 'OK';
    } catch (e) {
      tgMsg = e instanceof Error ? e.message : String(e);
    }
  }

  async function testWebhook() {
    whMsg = '...';
    try {
      await sendWebhook('Common', 'ahvauto', `ahvauto ${L('al.testPush')}`, true);
      whMsg = 'OK';
    } catch (e) {
      whMsg = e instanceof Error ? e.message : String(e);
    }
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

  <div class="row">
    <label><input type="checkbox" bind:checked={$options.alarm.telegram.enabled} /><b>{L('al.tg')}</b></label>
    <div class="hint">{L('al.tgHint')}</div>
    <div class="field">{L('al.token')} <input class="url" type="password" bind:value={$options.alarm.telegram.botToken} placeholder="123456:ABC..." /></div>
    <div class="field">{L('al.chat')} <input class="chat" type="text" bind:value={$options.alarm.telegram.chatId} placeholder="-1001234567890" autocomplete="off" spellcheck="false" /></div>
    <div class="field">{L('al.events')}:
      {#each KINDS as k}
        <label><input type="checkbox" bind:checked={$options.alarm.telegram.kinds[k]} />{k}</label>
      {/each}
    </div>
    <button type="button" onclick={testTelegram}>{L('al.testPush')}</button>
    {#if tgMsg}<span class="msg">{tgMsg}</span>{/if}
  </div>

  <div class="row">
    <label><input type="checkbox" bind:checked={$options.alarm.webhook.enabled} /><b>{L('al.hook')}</b></label>
    <div class="field"><input class="url" bind:value={$options.alarm.webhook.url} placeholder={L('al.hookUrl')} /></div>
    <div class="field"><b>{L('al.tpl')}</b><div class="hint">{L('al.tplHint')}</div>
      <textarea class="tpl" rows="8" bind:value={$options.alarm.webhook.template}></textarea>
    </div>
    <div class="field">{L('al.events')}:
      {#each KINDS as k}
        <label><input type="checkbox" bind:checked={$options.alarm.webhook.kinds[k]} />{k}</label>
      {/each}
    </div>
    <button type="button" onclick={testWebhook}>{L('al.testPush')}</button>
    {#if whMsg}<span class="msg">{whMsg}</span>{/if}
  </div>
</div>

<style>
  .row { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; margin: 0 0 12px; padding: 12px; }
  .url { width: 70%; }
  .chat { width: 280px; max-width: 70%; font-family: monospace; }
  .field { margin-top: 8px; }
  .hint { color: #64748b; font-size: 12px; margin-top: 4px; }
  .msg { margin-left: 8px; color: #475569; }
  .tpl { width: 100%; font-family: monospace; font-size: 12px; margin-top: 4px; }
</style>
