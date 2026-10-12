import { STORAGE_NS } from '../platform/storage-keys';

/** 注意：游戏页把 localStorage.setItem 包了一层，静默丢弃 hvAA* 开头的 key。
 *  本文件一律用 localStorage[k] = v 直接赋值（绕过该拦截），勿改回 setItem。 */

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
