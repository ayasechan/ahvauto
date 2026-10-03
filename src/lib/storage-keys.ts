/** 全仓存储 key 单一来源（无依赖，可被 src/scripts/单测引用）。
 * 旧 key 只读不碰；仅手动导入所需的 LEGACY_OPT_KEY 在此定义。 */

/** localStorage 命名空间 */
export const STORAGE_NS = 'ahvauto-';

/** localStorage：配置 / 暂停位 / 旧版配置（只读） / 备份（日志已迁 IDB logs 表） */
export const OPT_KEY = `${STORAGE_NS}option`;
export const DISABLED_KEY = `${STORAGE_NS}disabled`;
export const LEGACY_OPT_KEY = 'hvAA-option';
export const BACKUP_KEY = `${STORAGE_NS}backup`;

/** 通用 KV（短键，读写经 store.ts kv*，全仓禁止裸串）。 */
export const ROUND_TYPE_KEY = 'roundType';
export const ROUND_NOW_KEY = 'roundNow';
export const ROUND_ALL_KEY = 'roundAll';
export const MONSTER_STATUS_KEY = 'monsterStatus';
export const MONSTER_BASE_KEY = 'monsterBase';
/** @deprecated v3 起数据进 IDB（battles/cur 表），localStorage 旧键仅启动清理，无现行写入。 */
export const STATS_KEY = 'stats2';
/** @deprecated 同上 */
export const BATTLES_KEY = 'battles2';
/** @deprecated 同上 */
export const CUR_BATTLE_KEY = 'curBattle2';
export const ARENA_KEY = 'arena';
export const ENCOUNTER_KEY = 'encounter';
export const STAMINA_LOG_KEY = 'staminaLostLog';

/** @deprecated 旧键：仅启动清理（kvDel），无现行写入。 */
export const LEGACY_BATTLE_CODE_KEY = 'battleCode';
/** @deprecated 旧 localStorage 日志（已迁 IDB logs 表）：仅启动清理。 */
export const LEGACY_LOGS_KEY = `${STORAGE_NS}logs`;

/** sessionStorage：发包延迟 */
export const SPELL_DELAY_KEY = `${STORAGE_NS}spell-delay`;
export const NO_SPELL_DELAY_KEY = `${STORAGE_NS}nospell-delay`;

/** IDB 录制库 */
export const IDB_NAME = `${STORAGE_NS}debug`;
