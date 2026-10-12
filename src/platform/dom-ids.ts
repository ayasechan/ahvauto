/** 全仓 DOM id/class 单一来源（运行时 UI，非存储 key）。
 * 硬切：旧 hvAA* 命名全部替换为 ahvauto-*，无兼容垫片。
 * 存储旧键 hvAA-option 仍在 storage-keys.ts 只读，不在此文件。 */
export const HOST_ID = 'ahvauto-host';
export const FAB_CLASS = 'ahvauto-fab';
export const PANEL_ID = 'ahvauto-panel';
export const PAUSE_BOX_ID = 'ahvauto-pause';
export const LOG_CLASS = 'ahvauto-log';
export const INJECT_CSS_ID = 'ahvauto-inject-css';
export const alertId = (kind: string): string => `ahvauto-alert-${kind}`;
