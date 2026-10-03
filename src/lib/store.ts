import { writable, get } from 'svelte/store';
import type { BattleState, HvOptions } from './types';
import {
  STORAGE_NS,
  OPT_KEY,
  DISABLED_KEY,
  LEGACY_OPT_KEY,
  BACKUP_KEY,
  SPELL_DELAY_KEY,
  NO_SPELL_DELAY_KEY,
  ROUND_TYPE_KEY,
  STATS_KEY,
  BATTLES_KEY,
  CUR_BATTLE_KEY,
  LEGACY_BATTLE_CODE_KEY,
  LEGACY_LOGS_KEY,
} from './storage-keys';
import { defaultOptions, VERSION } from './defaults';
import { migrateOptions } from './expr/migrate';
import { isLegacyOption, importLegacyOption } from './legacy-import';
import { logger } from './logger';

/** 注意：游戏页把 localStorage.setItem 包了一层，静默丢弃 hvAA* 开头的 key。
 *  本文件一律用 localStorage[k] = v 直接赋值（绕过该拦截），勿改回 setItem。 */

/** 外来配置归一化（导入/备份恢复/落盘自愈共用）：与默认值按节合并＋迁移。
 * 失败返回 null（调用方告警，不抛）。版本号统一为当前 VERSION，避免旧版导入次日被 loadOptions 重置。 */
export function sanitizeOptions(raw: unknown): HvOptions | null {
  try {
    const parsed = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown>;
    if (typeof parsed !== 'object' || parsed === null) return null;
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
      version: VERSION,
    } as HvOptions;
    // 字段改名迁移：delay/delay2 → spellDelay/noSpellDelay（旧值优先保留）
    const pm = merged.main as unknown as Record<string, unknown>;
    if (typeof pm.spellDelay !== 'number' && typeof pm.delay === 'number') pm.spellDelay = pm.delay;
    if (typeof pm.noSpellDelay !== 'number' && typeof pm.delay2 === 'number')
      pm.noSpellDelay = pm.delay2;
    delete pm.delay;
    delete pm.delay2;
    // 顶层字符串守卫：bind: 禁 undefined/null，坏档回默认（dropQuality 供面板输入框绑定）
    if (typeof merged.dropQuality !== 'string') merged.dropQuality = d.dropQuality;
    migrateOptions(merged as unknown as Record<string, unknown>);
    return merged;
  } catch {
    return null;
  }
}

/** 读取逻辑：
 * 1. ahvauto-option 存在且版本对 → 归一化后用；
 * 2. 否则 → 默认值（旧数据不迁移，见 importLegacyConfig）。 */
function loadOptions(): HvOptions {
  try {
    const raw = localStorage.getItem(OPT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as HvOptions;
      if (parsed.version !== VERSION) {
        return { ...defaultOptions(), lang: parsed.lang ?? '0' };
      }
      return sanitizeOptions(parsed) ?? defaultOptions();
    }
  } catch {
    /* 损坏则重置 */
  }
  return defaultOptions();
}

/** 手动导入旧配置（hvAA-option v2.x）：覆盖当前配置并持久化。旧配置只读不写。 */
export function importLegacyConfig(): boolean {
  try {
    const legacy = localStorage.getItem(LEGACY_OPT_KEY);
    if (legacy && legacy.startsWith('{')) {
      const parsed = JSON.parse(legacy) as unknown;
      if (isLegacyOption(parsed)) {
        const imported = importLegacyOption(parsed);
        migrateOptions(imported as unknown as Record<string, unknown>);
        options.set(imported);
        return true;
      }
    }
  } catch (e) {
    logger.warning('import legacy options failed: {err}', { err: String(e) });
  }
  return false;
}

export const options = writable<HvOptions>(loadOptions());
options.subscribe((v) => {
  try {
    localStorage[OPT_KEY] = JSON.stringify(v);
  } catch (e) {
    logger.warning('persist options failed: {err}', { err: String(e) });
  }
});

export const battle = writable<BattleState>({
  turn: 0,
  hp: 100,
  mp: 100,
  sp: 100,
  oc: 0,
  monsterAll: 0,
  monsterAlive: 0,
  bossAll: 0,
  bossAlive: 0,
  monsterStatus: [],
  monsterBase: [],
  otos: { OFC: 0, FRD: 0, T3: 0, T2: 0, T1: 0 },
  roundType: '',
  roundNow: 0,
  roundAll: 0,
  attackStatus: -1,
  runSpeed: 1,
  timeNow: Date.now(),
});

export const panelOpen = writable(false);
export const activeTab = writable('Main');

export function isDisabled(): boolean {
  return localStorage.getItem(DISABLED_KEY) !== null;
}

export function setDisabled(v: boolean): void {
  if (v) localStorage[DISABLED_KEY] = '1';
  else localStorage.removeItem(DISABLED_KEY);
}

/** 通用 KV（drop/stats/arena/encounter 等），统一前缀 ahvauto-，与旧脚本隔离 */
export function kvGet<T>(key: string, parseJson = false): T | string | null {
  const raw = localStorage.getItem(STORAGE_NS + key);
  if (raw === null) return null;
  if (parseJson) {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
  return raw;
}

export function kvSet(key: string, value: unknown): void {
  localStorage[STORAGE_NS + key] = typeof value === 'string' ? value : JSON.stringify(value);
}

export function kvDel(key: string): void {
  localStorage.removeItem(STORAGE_NS + key);
}

/** 配置备份字典（ahvauto-backup）：AboutTab 经此读写，不直碰 localStorage。 */
export type BackupMap = Record<string, string>;

export function loadBackups(): BackupMap {
  try {
    const parsed = JSON.parse(localStorage.getItem(BACKUP_KEY) ?? '{}') as unknown;
    if (parsed && typeof parsed === 'object') {
      const out: BackupMap = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === 'string') out[k] = v;
      }
      return out;
    }
  } catch {
    /* 损坏则清空 */
  }
  return {};
}

export function saveBackups(b: BackupMap): void {
  localStorage[BACKUP_KEY] = JSON.stringify(b);
}

/** 发包延迟桥（sessionStorage）：battle.ts 经此读写。 */
export function publishSpellDelays(spellDelay: number, noSpellDelay: number): void {
  try {
    sessionStorage[SPELL_DELAY_KEY] = String(spellDelay);
    sessionStorage[NO_SPELL_DELAY_KEY] = String(noSpellDelay);
  } catch {
    /* session 不可用时忽略（页世界钩子侧回落默认值） */
  }
}

export function readSpellDelays(): { spellDelay: number; noSpellDelay: number } {
  const num = (v: string | null, fb: number): number => {
    const n = Number(v ?? fb);
    return Number.isFinite(n) ? n : fb;
  };
  try {
    return {
      spellDelay: num(sessionStorage.getItem(SPELL_DELAY_KEY), 200),
      noSpellDelay: num(sessionStorage.getItem(NO_SPELL_DELAY_KEY), 30),
    };
  } catch {
    return { spellDelay: 200, noSpellDelay: 30 };
  }
}

/** 非战斗页上下文清理：roundType＋旧 battleCode＋旧 localStorage 日志（已迁 IDB）。 */
export function clearFieldCtx(): void {
  kvDel(ROUND_TYPE_KEY);
  kvDel(STATS_KEY);
  kvDel(BATTLES_KEY);
  kvDel(CUR_BATTLE_KEY);
  kvDel(LEGACY_BATTLE_CODE_KEY);
  try {
    localStorage.removeItem(LEGACY_LOGS_KEY);
  } catch {
    /* ignore */
  }
}

export function snapshotOptions(): HvOptions {
  return get(options);
}
