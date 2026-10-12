/** 配置模块 facade：保持 `config/store` 旧导入路径零改动，新代码请直引子模块。 */
export { kvGet, kvSet, kvDel } from './kv';
export { isDisabled, setDisabled } from './paused';
export { loadBackups, saveBackups } from './backups';
export type { BackupMap } from './backups';
export { publishSpellDelays, readSpellDelays } from './delays';
export { clearFieldCtx } from './field-ctx';
export { battle } from './battle-state';
export { panelOpen, activeTab } from './ui-state';
export { sanitizeOptions, importLegacyConfig, options, snapshotOptions } from './options';
