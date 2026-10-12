import {
  ROUND_TYPE_KEY,
  STATS_KEY,
  BATTLES_KEY,
  CUR_BATTLE_KEY,
  LEGACY_BATTLE_CODE_KEY,
  LEGACY_LOGS_KEY,
} from '../platform/storage-keys';
import { kvDel } from './kv';

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
