<script lang="ts">
  import {
    options,
    importLegacyConfig,
    loadBackups,
    saveBackups,
    sanitizeOptions,
  } from '../../lib/store';
  import { tr } from '../../lib/i18n';
  import type { I18nKey } from '../../lib/i18n';
  import { defaultOptions } from '../../lib/defaults';
  import { getStoredLogs, clearStoredLogs, toLogfmt } from '../../lib/logger';
  import type { StoredEntry } from '../../lib/logger';
  import {
    countRecords,
    countLogs,
    exportRecords,
    exportLogs,
    clearRecords,
    exportTurns,
    toJsonlLine,
  } from '../../lib/recorder';

  const L = (k: I18nKey) => tr($options.lang, k);

  let backups = $state<Record<string, string>>({});
  let cfgFile = $state<HTMLInputElement>();

  /** 文件名时间戳：本地时间精确到分（YYYYMMDD-HHmm） */
  function stamp(): string {
    const d = new Date();
    const p = (n: number): string => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  }

  function refreshBackups() {
    backups = loadBackups();
  }
  function persistBackups() {
    saveBackups(backups);
  }
  function backup() {
    const code = prompt(L('about.promptBackupName'));
    if (!code) return;
    backups[code] = JSON.stringify($options);
    persistBackups();
  }
  function applyImported(raw: unknown): boolean {
    const merged = sanitizeOptions(raw);
    if (!merged) return false;
    $options = merged;
    return true;
  }
  function restore(code: string) {
    try {
      if (!applyImported(backups[code])) alert(L('about.alertBackupBad'));
    } catch {
      alert(L('about.alertBackupBad'));
    }
  }
  function download(name: string, blob: Blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  function exportCfg() {
    try {
      download(
        `ahvauto-config-${stamp()}.json`,
        new Blob([JSON.stringify($options)], { type: 'application/json' }),
      );
    } catch {
      alert(L('about.alertExportFail'));
    }
  }
  function importCfg() {
    cfgFile?.click();
  }
  async function onCfgFile(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    try {
      if (!applyImported(await f.text())) alert(L('about.alertParseFail'));
    } catch {
      alert(L('about.alertParseFail'));
    }
  }
  function reset() {
    if (confirm(L('about.confirmResetAll'))) $options = defaultOptions();
  }
  function importLegacy() {
    if (confirm(L('about.importLegacyConfirm'))) {
      if (!importLegacyConfig()) alert(L('about.noLegacy'));
    }
  }
  refreshBackups();

  let kvLogs = $state<StoredEntry[]>([]);
  async function refreshLogs() {
    try {
      kvLogs = (await getStoredLogs()).slice(-100).reverse();
    } catch {
      kvLogs = [];
    }
  }
  async function clearLogs() {
    try {
      await clearStoredLogs();
    } catch {
      /* 清空失败不影响页面 */
    }
    kvLogs = [];
  }
  void refreshLogs();

  let recCount = $state(-1);
  let logCount = $state(-1);
  async function refreshRecCount() {
    try {
      recCount = await countRecords();
    } catch {
      recCount = -1;
    }
    try {
      logCount = await countLogs();
    } catch {
      logCount = -1;
    }
  }
  async function downloadJsonlGz(name: string, rows: unknown[]) {
    // 行分块喂 Blob parts（不拼整串）→ CompressionStream 流式压 → 一次下载
    const lines = new Blob(rows.map(toJsonlLine), { type: 'application/jsonl' });
    const gz = await new Response(
      lines.stream().pipeThrough(new CompressionStream('gzip')),
    ).arrayBuffer();
    download(name, new Blob([gz], { type: 'application/gzip' }));
  }
  async function exportRec() {
    try {
      downloadJsonlGz(`ahvauto-battle-${stamp()}.jsonl.gz`, await exportRecords());
    } catch {
      alert(L('about.alertExportFail'));
    }
  }
  async function clearRec() {
    try {
      await clearRecords();
      recCount = 0;
    } catch {
      alert(L('about.alertClearFail'));
    }
  }
  async function exportTurnsFile() {
    try {
      downloadJsonlGz(`ahvauto-turns-${stamp()}.jsonl.gz`, await exportTurns());
    } catch {
      alert(L('about.alertExportFail'));
    }
  }
  async function exportLogsFile() {
    try {
      downloadJsonlGz(`ahvauto-logs-${stamp()}.jsonl.gz`, await exportLogs());
    } catch {
      alert(L('about.alertExportFail'));
    }
  }
  void refreshRecCount();
</script>

<div>
  <div class="row">
    <button type="button" onclick={reset}>{L('about.reset')}</button>
    <button type="button" onclick={backup}>{L('about.backup')}</button>
    <button type="button" onclick={exportCfg}>{L('about.export')}</button>
    <button type="button" onclick={importCfg}>{L('about.import')}</button>
    <button type="button" onclick={importLegacy}>{L('about.importLegacy')}</button>
    <input
      type="file"
      accept="application/json,.json"
      hidden
      bind:this={cfgFile}
      onchange={onCfgFile}
    />
  </div>
  <div class="row">
    <label><input type="checkbox" bind:checked={$options.main.debug} />{L('about.debug')}</label>
  </div>
  <div class="row">
    <b>{L('about.backups')}</b>
    <ul>
      {#each Object.keys(backups) as code}
        <li>
          {code}
          <button type="button" onclick={() => restore(code)}>{L('about.restore')}</button>
          <button
            type="button"
            onclick={() => {
              delete backups[code];
              persistBackups();
            }}>{L('ui.delete')}</button
          >
        </li>
      {/each}
    </ul>
  </div>
  <div class="row">
    <b>{L('about.logs')}</b> (IDB, {logCount < 0 ? '?' : logCount})
    <button type="button" onclick={refreshLogs}>{L('ui.refresh')}</button>
    <button type="button" onclick={exportLogsFile}>{L('about.export')}</button>
    <button type="button" onclick={clearLogs}>{L('ui.clear')}</button>
    <div class="logview">
      {#each kvLogs as e}
        <div class="logline {e.level}">
          <span class="ts">{new Date(e.t).toLocaleTimeString()}</span> level={e.level}
          {toLogfmt(e)}
        </div>
      {/each}
    </div>
  </div>
  <div class="row">
    <b>{L('about.rec')}</b> (IDB + gzip, {recCount < 0 ? '?' : recCount}
    {L('about.recCount')})
    <button type="button" onclick={refreshRecCount}>{L('ui.refresh')}</button>
    <button type="button" onclick={exportRec}>{L('about.recExport')}</button>
    <button type="button" onclick={exportTurnsFile}>{L('about.turnsExport')}</button>
    <button type="button" onclick={clearRec}>{L('ui.clear')}</button>
    {#if !$options.main.debug}<div class="hint">{L('about.hintNeedDebug')}</div>{/if}
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
  .url {
    width: 50%;
  }
  .logview {
    max-height: 200px;
    overflow: auto;
    background: #111;
    color: #ddd;
    font-size: 12px;
    padding: 4px;
  }
  .logline {
    white-space: pre-wrap;
    word-break: break-all;
  }
  .logline .ts {
    color: #888;
  }
  .logline.warning {
    color: #ffcc00;
  }
  .logline.error,
  .logline.fatal {
    color: #ff6666;
  }
  .logline.debug {
    color: #999;
  }
</style>
