import { getDb, evictOld } from './db';
import { RECORDS_STORE, RECORDS_CAP, TURNS_STORE, TURNS_CAP, recordBattleEvent } from './debug';
import { LOGS_STORE, LOGS_CAP } from './logs';
import { recordBattleTurn } from './stats';

/** 非战斗页面空闲时集中驱逐一次：records/turns/logs 各留最新上限。失败静默。 */
export async function pruneDebugRecords(): Promise<void> {
  try {
    const db = await getDb();
    await evictOld(db, RECORDS_STORE, RECORDS_CAP);
    await evictOld(db, TURNS_STORE, TURNS_CAP);
    await evictOld(db, LOGS_STORE, LOGS_CAP);
  } catch {
    /* 修剪失败不影响页面 */
  }
}

/** 录制分发（纯本世界直调）：req/res 配对写 IDB，res 另喂统计（与 debug 开关无关，由 recordUsage 门控）。 */
export function handleRec(kind: string, payload: unknown, seq = 0): void {
  if (kind === 'req' || kind === 'res') void recordBattleEvent(kind, payload, seq);
  // 数据收集走响应体
  if (kind === 'res' && payload && typeof payload === 'object') {
    try {
      const body = (payload as { body?: unknown }).body as { textlog?: unknown[] } | undefined;
      const raw = Array.isArray(body?.textlog) ? body.textlog : [];
      const rows = raw.map((r) => (typeof r === 'string' ? r : ((r as { t?: string }).t ?? '')));
      if (rows.length > 0) void recordBattleTurn(rows);
    } catch {
      /* 统计失败不影响战斗 */
    }
  }
}
