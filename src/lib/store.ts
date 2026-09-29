import { writable, get } from 'svelte/store';
import type { BattleState, HvOptions } from './types';
import { STORAGE_NS } from './types';
import { defaultOptions, VERSION } from './defaults';
import { migrateOptions } from './expr/migrate';
import { isLegacyOption, importLegacyOption } from './legacy-import';
import { logger } from './logger';

const OPT_KEY = `${STORAGE_NS}option`;
const DISABLED_KEY = `${STORAGE_NS}disabled`;
const LEGACY_OPT_KEY = 'hvAA-option';

/** 注意：游戏页把 localStorage.setItem 包了一层，静默丢弃 hvAA* 开头的 key。
 *  本文件一律用 localStorage[k] = v 直接赋值（绕过该拦截），勿改回 setItem。 */

/** 读取逻辑：
 * 1. hvAA3-option 存在且版本对 → 直接用；
 * 2. 否则 → 默认值（旧 hvAA-option 不再自动导入，见 importLegacyConfig）。 */
function loadOptions(): HvOptions {
  try {
    const raw = localStorage.getItem(OPT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as HvOptions;
      if (parsed.version !== VERSION) {
        return { ...defaultOptions(), lang: parsed.lang ?? '0' };
      }
      const merged = { ...defaultOptions(), ...parsed };
      migrateOptions(merged as unknown as Record<string, unknown>);
      return merged;
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
  end: false,
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

/** 通用 KV（drop/stats/arena/encounter 等），统一前缀 hvAA3-，与旧脚本隔离 */
const KV_PREFIX = STORAGE_NS;
export function kvGet<T>(key: string, parseJson = false): T | string | null {
  const raw = localStorage.getItem(KV_PREFIX + key);
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
  localStorage[KV_PREFIX + key] = typeof value === 'string' ? value : JSON.stringify(value);
}

export function kvDel(key: string): void {
  localStorage.removeItem(KV_PREFIX + key);
}

export function snapshotOptions(): HvOptions {
  return get(options);
}
