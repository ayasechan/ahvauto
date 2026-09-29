<script lang="ts">
  import { options, importLegacyConfig } from '../../lib/store';
  import { tr } from '../../lib/i18n';
  import { BACKUP_KEY } from '../../lib/storage-keys';
  import { defaultOptions } from '../../lib/defaults';
  import { migrateOptions } from '../../lib/expr/migrate';
  import type { HvOptions } from '../../lib/types';
  import { getStoredLogs, clearStoredLogs, toLogfmt } from '../../lib/logger';
  import type { StoredEntry } from '../../lib/logger';
  import { countRecords, exportRecords, clearRecords, exportTurns } from '../../lib/recorder';

  const L = (k: string) => tr($options.lang, k);

  let backups = $state<Record<string, string>>({});
  let cfgFile = $state<HTMLInputElement>();

  /** 文件名时间戳：本地时间精确到分（YYYYMMDD-HHmm） */
  function stamp(): string {
    const d = new Date();
    const p = (n: number): string => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  }

  function loadBackups() {
    try {
      backups = JSON.parse(localStorage.getItem(BACKUP_KEY) ?? '{}');
    } catch {
      backups = {};
    }
  }
  function saveBackups() {
    localStorage[BACKUP_KEY] = JSON.stringify(backups);
  }
  function backup() {
    const code = prompt('备份名称:');
    if (!code) return;
    backups[code] = JSON.stringify($options);
    saveBackups();
  }
  function applyImported(raw: unknown): boolean {
    try {
      const parsed = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown>;
      if (typeof parsed !== 'object' || parsed === null) return false;
      const d = defaultOptions();
      const merged = {
        ...d,
        ...parsed,
        main: { ...d.main, ...((parsed.main ?? {}) as object) },
        item: { ...d.item, ...((parsed.item ?? {}) as object) },
        channel: { ...d.channel, ...((parsed.channel ?? {}) as object) },
        buff: { ...d.buff, ...((parsed.buff ?? {}) as object) },
        debuff: { ...d.debuff, ...((parsed.debuff ?? {}) as object) },
        skill: { ...d.skill, ...((parsed.skill ?? {}) as object) },
        scroll: { ...d.scroll, ...((parsed.scroll ?? {}) as object) },
        infusion: { ...d.infusion, ...((parsed.infusion ?? {}) as object) },
        alarm: { ...d.alarm, ...((parsed.alarm ?? {}) as object) },
        rule: { ...d.rule, ...((parsed.rule ?? {}) as object) },
      } as HvOptions;
      migrateOptions(merged as unknown as Record<string, unknown>);
      $options = merged;
      return true;
    } catch {
      return false;
    }
  }
  function restore(code: string) {
    try {
      if (!applyImported(backups[code])) alert('备份损坏');
    } catch {
      alert('备份损坏');
    }
  }
  function exportCfg() {
    try {
      const blob = new Blob([JSON.stringify($options)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `ahvauto-config-${stamp()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch {
      alert('导出失败');
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
      if (!applyImported(await f.text())) alert('配置解析失败');
    } catch {
      alert('配置解析失败');
    }
  }
  function reset() {
    if (confirm('重置所有设置?')) $options = defaultOptions();
  }
  function importLegacy() {
    if (confirm(L('a.importLegacyConfirm'))) {
      if (!importLegacyConfig()) alert(L('a.noLegacy'));
    }
  }
  loadBackups();

  let kvLogs = $state<StoredEntry[]>([]);
  function refreshLogs() {
    kvLogs = getStoredLogs().slice(-100).reverse();
  }
  function clearLogs() {
    clearStoredLogs();
    kvLogs = [];
  }
  refreshLogs();

  let recCount = $state(-1);
  async function refreshRecCount() {
    try {
      recCount = await countRecords();
    } catch {
      recCount = -1;
    }
  }
  async function exportRec() {
    try {
      const rows = await exportRecords();
      const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `ahvauto-battle-${stamp()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch {
      alert('导出失败');
    }
  }
  async function clearRec() {
    try {
      await clearRecords();
      recCount = 0;
    } catch {
      alert('清空失败');
    }
  }
  async function exportTurnsFile() {
    try {
      const rows = await exportTurns();
      const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `ahvauto-turns-${stamp()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch {
      alert('导出失败');
    }
  }
  void refreshRecCount();
</script>

<div>
  <div class="row">
    <button type="button" onclick={reset}>{L('a.reset')}</button>
    <button type="button" onclick={backup}>{L('a.backup')}</button>
    <button type="button" onclick={exportCfg}>{L('a.export')}</button>
    <button type="button" onclick={importCfg}>{L('a.import')}</button>
    <button type="button" onclick={importLegacy}>{L('a.importLegacy')}</button>
    <input type="file" accept="application/json,.json" hidden bind:this={cfgFile} onchange={onCfgFile} />
  </div>
  <div class="row">
    {L('a.lang')}:
    <select bind:value={$options.lang}>
      <option value="0">简体中文</option>
      <option value="1">繁體中文</option>
      <option value="2">English</option>
    </select>
    <label><input type="checkbox" bind:checked={$options.main.debug} />{L('a.debug')}</label>
  </div>
  <div class="row">
    <b>{L('a.backups')}</b>
    <ul>
      {#each Object.keys(backups) as code}
        <li>{code}
          <button type="button" onclick={() => restore(code)}>{L('a.restore')}</button>
          <button type="button" onclick={() => { delete backups[code]; saveBackups(); }}>{L('ui.delete')}</button>
        </li>
      {/each}
    </ul>
  </div>
  <div class="row">
    <b>{L('a.logs')}</b> (logfmt)
    <button type="button" onclick={refreshLogs}>{L('ui.refresh')}</button>
    <button type="button" onclick={clearLogs}>{L('ui.clear')}</button>
    <div class="logview">
      {#each kvLogs as e}
        <div class="logline {e.level}"><span class="ts">{new Date(e.t).toLocaleTimeString()}</span> level={e.level} {toLogfmt(e)}</div>
      {/each}
    </div>
  </div>
  <div class="row">
    <b>{L('a.rec')}</b> (IDB + gzip, {recCount < 0 ? '?' : recCount} {L('a.recCount')})
    <button type="button" onclick={refreshRecCount}>{L('ui.refresh')}</button>
    <button type="button" onclick={exportRec}>{L('a.recExport')}</button>
    <button type="button" onclick={exportTurnsFile}>回合</button>
    <button type="button" onclick={clearRec}>{L('ui.clear')}</button>
    {#if !$options.main.debug}<div class="hint">需先开启调试日志才会录制</div>{/if}
  </div>
</div>

<style>
  .row { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; margin: 0 0 12px; padding: 12px; }
  .url { width: 50%; }
  .logview { max-height: 200px; overflow: auto; background: #111; color: #ddd; font-size: 12px; padding: 4px; }
  .logline { white-space: pre-wrap; word-break: break-all; }
  .logline .ts { color: #888; }
  .logline.warning { color: #ffcc00; }
  .logline.error, .logline.fatal { color: #ff6666; }
  .logline.debug { color: #999; }
</style>
