<script lang="ts">
  import { options } from '../../config/store';
  import { tr, alarmKindKey } from '../../platform/i18n';
  import type { I18nKey } from '../../platform/i18n';
  import { sendTelegram, sendWebhook } from '../../notify/notify';

  const L = (k: I18nKey) => tr($options.lang, k);
  const KINDS = ['Common', 'Error', 'Defeat', 'Riddle', 'Victory'] as const;

  let audioMsg: Record<string, string> = {};
  function test(kind: string) {
    const url = ($options.alarm.audio[kind] ?? '').trim();
    if (!url) {
      audioMsg[kind] = L('alarm.url');
      return;
    }
    audioMsg[kind] = '...';
    const a = new Audio(url);
    void a
      .play()
      .then(() => {
        audioMsg[kind] = 'OK';
      })
      .catch((e) => {
        audioMsg[kind] = e instanceof Error ? e.message : String(e);
      });
  }

  let tgMsg = '';
  let whMsg = '';

  async function testTelegram() {
    tgMsg = '...';
    try {
      await sendTelegram('Common', `ahvauto ${L('alarm.testPush')}\n${location.href}`, true);
      tgMsg = 'OK';
    } catch (e) {
      tgMsg = e instanceof Error ? e.message : String(e);
    }
  }

  async function testWebhook() {
    whMsg = '...';
    try {
      await sendWebhook('Common', 'ahvauto', `ahvauto ${L('alarm.testPush')}`, true);
      whMsg = 'OK';
    } catch (e) {
      whMsg = e instanceof Error ? e.message : String(e);
    }
  }
</script>

<div>
  <p>{L('alarm.note')}</p>
  {#each KINDS as k}
    <div class="row">
      <label
        ><input type="checkbox" bind:checked={$options.alarm.audioEnable[k]} /><b
          >{L(alarmKindKey[k])}</b
        ></label
      >
      <input
        class="url"
        bind:value={$options.alarm.audio[k]}
        placeholder={L('alarm.url')}
        aria-label={L('alarm.url')}
      />
      <button
        type="button"
        onclick={() => test(k)}
        disabled={!($options.alarm.audio[k] ?? '').trim()}>{L('alarm.test')}</button
      >
      {#if audioMsg[k]}<span class="msg" role="status">{audioMsg[k]}</span>{/if}
    </div>
  {/each}

  <div class="row">
    <label
      ><input type="checkbox" bind:checked={$options.alarm.telegram.enabled} /><b>{L('alarm.tg')}</b
      ></label
    >
    <div class="hint">{L('alarm.tgHint')}</div>
    <div class="field">
      {L('alarm.token')}
      <input
        class="url"
        type="password"
        bind:value={$options.alarm.telegram.botToken}
        placeholder="123456:ABC..."
      />
    </div>
    <div class="field">
      {L('alarm.chat')}
      <input
        class="chat"
        type="text"
        bind:value={$options.alarm.telegram.chatId}
        placeholder="-1001234567890"
        autocomplete="off"
        spellcheck="false"
      />
    </div>
    <div class="field">
      {L('alarm.events')}:
      {#each KINDS as k}
        <label
          ><input type="checkbox" bind:checked={$options.alarm.telegram.kinds[k]} />{L(
            alarmKindKey[k],
          )}</label
        >
      {/each}
    </div>
    <button type="button" onclick={testTelegram}>{L('alarm.testPush')}</button>
    {#if tgMsg}<span class="msg" role="status">{tgMsg}</span>{/if}
  </div>

  <div class="row">
    <label
      ><input type="checkbox" bind:checked={$options.alarm.webhook.enabled} /><b
        >{L('alarm.hook')}</b
      ></label
    >
    <div class="field">
      <input class="url" bind:value={$options.alarm.webhook.url} placeholder={L('alarm.hookUrl')} />
    </div>
    <div class="field">
      <b>{L('alarm.tpl')}</b>
      <div class="hint">{L('alarm.tplHint')}</div>
      <textarea class="tpl" rows="8" bind:value={$options.alarm.webhook.template}></textarea>
    </div>
    <div class="field">
      {L('alarm.events')}:
      {#each KINDS as k}
        <label
          ><input type="checkbox" bind:checked={$options.alarm.webhook.kinds[k]} />{L(
            alarmKindKey[k],
          )}</label
        >
      {/each}
    </div>
    <button type="button" onclick={testWebhook}>{L('alarm.testPush')}</button>
    {#if whMsg}<span class="msg" role="status">{whMsg}</span>{/if}
  </div>
</div>

<style>
  .url {
    width: 70%;
  }
  .chat {
    width: 280px;
    max-width: 70%;
    font-family: var(--hv-mono);
  }
  .field {
    margin-top: 8px;
  }
  .hint {
    color: var(--hv-t2);
    font-size: 12px;
    margin-top: 4px;
  }
  .msg {
    margin-left: 8px;
    color: var(--hv-t2);
  }
  .tpl {
    width: 100%;
    font-family: var(--hv-mono);
    font-size: 12px;
    margin-top: 4px;
  }
</style>
