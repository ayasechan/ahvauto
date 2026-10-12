import { BACKUP_KEY } from '../platform/storage-keys';

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
