import { writable, get } from 'svelte/store';
import type { HvOptions } from './options-types';
import { OPT_KEY, LEGACY_OPT_KEY } from '../platform/storage-keys';
import { defaultOptions, VERSION } from './defaults';
import { migrateOptions } from '../expr/migrate';
import { isLegacyOption, importLegacyOption } from './legacy-import';
import { logger } from '../platform/logger';

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
    // 顶层字符串守卫：bind: 禁 undefined/null，坏档回默认（dropQuality/usageTimeRange 供面板输入框绑定）
    if (typeof merged.dropQuality !== 'string') merged.dropQuality = d.dropQuality;
    if (
      typeof merged.usageTimeRange !== 'string' ||
      !['1d', '7d', 'all'].includes(merged.usageTimeRange)
    )
      merged.usageTimeRange = d.usageTimeRange;
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

export function snapshotOptions(): HvOptions {
  return get(options);
}
