import { getDb, putRow, evictOld, EXPORT_BATCH, readRawBatch } from './db';
import type { ExportOptions } from './debug';

const LOGS = 'logs';
export { LOGS as LOGS_STORE };
export const LOGS_CAP = 1000;

/** 运行日志行（IDB logs 表，存原文不 gzip；key 为自增主键，升序即时间序）。
 * 与 logger.StoredEntry 同构，定义在此避免 logger→logs 运行时循环以外的类型循环
 *（logger 用 import type 回引）。 */
export interface LogEntry {
  t: number;
  level: string;
  category: string[];
  message: string;
  props: Record<string, string>;
}

/** 纯函数：logs 行守卫。坏记录返回 false（调用方跳过）。 */
export function isLogEntry(v: unknown): v is LogEntry {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.t === 'number' &&
    typeof r.level === 'string' &&
    Array.isArray(r.category) &&
    typeof r.message === 'string' &&
    typeof r.props === 'object' &&
    r.props !== null
  );
}

/** 写一条运行日志（fire-and-forget，失败静默） */
export async function appendLog(entry: LogEntry): Promise<void> {
  try {
    const db = await getDb();
    await putRow(db, LOGS, { ...entry });
  } catch {
    /* 日志失败不影响战斗 */
  }
}

export async function countLogs(): Promise<number> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(LOGS, 'readonly').objectStore(LOGS).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** 仅修剪 logs 表（logger 侧单独调用）。失败静默。 */
export async function pruneLogs(): Promise<void> {
  try {
    const db = await getDb();
    await evictOld(db, LOGS, LOGS_CAP);
  } catch {
    /* 修剪失败不影响页面 */
  }
}

export async function exportLogs(opts: ExportOptions = {}): Promise<LogEntry[]> {
  const db = await getDb();
  const out: LogEntry[] = [];
  let lower = opts.sinceSeq;
  let exclusive = false;
  for (;;) {
    const batch = await readRawBatch(db, LOGS, lower, exclusive, EXPORT_BATCH);
    if (batch.length === 0) break;
    for (const { value } of batch) {
      if (isLogEntry(value)) {
        out.push(value);
        if (opts.limit !== undefined && out.length >= opts.limit) return out;
      }
    }
    lower = batch[batch.length - 1].key;
    exclusive = true;
    if (batch.length < EXPORT_BATCH) break;
  }
  return out;
}

/** 清空运行日志：logs 表全清（面板“清空”语义）。 */
export async function clearLogs(): Promise<void> {
  const db = await getDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(LOGS, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(LOGS).clear();
  });
}
