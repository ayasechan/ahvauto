/** 全仓存储 key 单一来源（无依赖，可被 src/scripts/单测引用）。
 * 旧 key 只读不碰；仅手动导入所需的 LEGACY_OPT_KEY 在此定义。 */

/** localStorage 命名空间 */
export const STORAGE_NS = 'ahvauto-';

/** localStorage：配置 / 暂停位 / 旧版配置（只读） / 日志 / 备份 */
export const OPT_KEY = `${STORAGE_NS}option`;
export const DISABLED_KEY = `${STORAGE_NS}disabled`;
export const LEGACY_OPT_KEY = 'hvAA-option';
export const LOGS_KEY = `${STORAGE_NS}logs`;
export const BACKUP_KEY = `${STORAGE_NS}backup`;

/** sessionStorage：发包延迟（注入脚本与 userscript 两侧同读） */
export const SPELL_DELAY_KEY = `${STORAGE_NS}spell-delay`;
export const NO_SPELL_DELAY_KEY = `${STORAGE_NS}nospell-delay`;

/** IDB 录制库（仅 recorder.ts 带版本号 open） */
export const IDB_NAME = `${STORAGE_NS}debug`;
