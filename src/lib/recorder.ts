import { snapshotOptions } from './store';
import { recordBattleTurn } from './stats';
import { IDB_NAME as DB_NAME } from './storage-keys';

/** 配对后的一行：一次请求＋它的响应。只存 {seq, data}（data 为 gzip 包，
 * 解压得 {seq, tReq, req, tRes?, res?, rttMs?}）；原文不另存，避免双份。 */
export interface BattleRecord {
  seq: number;
  data: ArrayBuffer;
}

export interface DecodedRecord {
  seq: number;
  tReq: number;
  req: unknown;
  tRes?: number;
  res?: unknown;
  rttMs?: number;
}

const STORE = 'records';
const TURNS = 'turns';
const LOGS = 'logs';
/** 数据收集 v3 单场行（全量 BattleRow）＋进行中局（单行 CurBattle）。 */
export const BATTLES_STORE = 'battles';
export const CUR_STORE = 'cur';
const CAP = 2000;
const TURNS_CAP = 50000;
export const LOGS_CAP = 1000;
// v7：与 v6 同 schema（battles/cur 建表补救：线上曾出现 v6 版本号已提交但建表未执行，
// 读写真抛 NotFoundError；升版一次触发 onupgradeneeded 补建。禁止只升号不建表的新版本）。
const DB_VERSION = 7;

let dbp: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (ev) => {
        const old = (ev as IDBVersionChangeEvent).oldVersion;
        // v3 以下：req/res 分行或 bug 形态，直接重建（历史已导出到 logs/）
        if (old < 3) {
          if (req.result.objectStoreNames.contains(STORE)) {
            req.result.deleteObjectStore(STORE);
          }
          req.result.createObjectStore(STORE, { keyPath: 'seq' });
        }
        if (!req.result.objectStoreNames.contains(TURNS)) {
          req.result.createObjectStore(TURNS, { autoIncrement: true });
        }
        if (!req.result.objectStoreNames.contains(LOGS)) {
          req.result.createObjectStore(LOGS, { autoIncrement: true });
        }
        if (!req.result.objectStoreNames.contains(BATTLES_STORE)) {
          req.result.createObjectStore(BATTLES_STORE, { autoIncrement: true });
        }
        if (!req.result.objectStoreNames.contains(CUR_STORE)) {
          req.result.createObjectStore(CUR_STORE, { keyPath: 'k' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

/** IDB 库入口：节点单测环境无 indexedDB，调用方按需捕获失败（统计/录制失败静默，不挡战斗）。 */
export function getDb(): Promise<IDBDatabase> {
  return openDb();
}

/** 通用行写入（put 语义，有 keyPath 则按 keyPath，无则需调用方传 key）。 */
export function idbPut(store: string, row: unknown, key?: IDBValidKey): Promise<void> {
  return getDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        const os = tx.objectStore(store);
        if (key === undefined) os.put(row as never);
        else os.put(row as never, key);
      }),
  );
}

/** 通用主键读（缺失返回 undefined）。 */
export function idbGet<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
  return getDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const req = db.transaction(store, 'readonly').objectStore(store).get(key);
        req.onsuccess = () => resolve(req.result as T | undefined);
        req.onerror = () => reject(req.error);
      }),
  );
}

/** 通用全表读（主键升序；单场行小，直接全读后内存求和，见 stats/deriveTotals）。 */
export function idbGetAll<T>(store: string): Promise<T[]> {
  return getDb().then(
    (db) =>
      new Promise<T[]>((resolve, reject) => {
        const req = db.transaction(store, 'readonly').objectStore(store).getAll();
        req.onsuccess = () => resolve((req.result ?? []) as T[]);
        req.onerror = () => reject(req.error);
      }),
  );
}

/** 通用主键删。 */
export function idbDelete(store: string, key: IDBValidKey): Promise<void> {
  return getDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.objectStore(store).delete(key);
      }),
  );
}

/** 通用清表。 */
export function idbClear(store: string): Promise<void> {
  return getDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.objectStore(store).clear();
      }),
  );
}

/** 通用按量修剪（只留最新 cap 条，供空闲修剪复用）。失败静默。 */
export async function pruneStore(store: string, cap: number): Promise<void> {
  try {
    const db = await openDb();
    await evictOld(db, store, cap);
  } catch {
    /* 修剪失败不影响页面 */
  }
}

export async function gzipStr(s: string): Promise<ArrayBuffer> {
  const stream = new Blob([s]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

export async function gunzip(ab: ArrayBuffer): Promise<string> {
  const stream = new Blob([ab]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

/** JSONL 行编码（面板下载与 CDP 导出共用，保证两边同一格式）：紧凑 JSON + 换行。
 * 两边都是逐行生产、流式消费（面板进 Blob parts，CDP 进 gzip 写流），不拼整串。 */
export function toJsonlLine(row: unknown): string {
  return `${JSON.stringify(row)}\n`;
}

/** 同一 seq 的读写串行化：req 的 put 提交后，res 的 get 才执行。seq 单调递增， settled 即删，不会堆积。 */
const seqChains = new Map<number, Promise<void>>();

function withSeqLock<T>(seq: number, fn: () => Promise<T>): Promise<T> {
  const prev = seqChains.get(seq) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  const settled: Promise<void> = next.then(
    () => undefined,
    () => undefined,
  );
  seqChains.set(seq, settled);
  void settled.then(() => {
    if (seqChains.get(seq) === settled) seqChains.delete(seq);
  });
  return next;
}

/** 记录请求到达（先写半行）；响应到达时补全。仅 debug 开启时。失败静默跳过。
 * 注意：热路径不做驱逐，驱逐统一在非战斗页面空闲时经 pruneDebugRecords() 一次完成。 */
export async function recordBattleEvent(
  kind: 'req' | 'res',
  payload: unknown,
  seq: number,
): Promise<void> {
  try {
    if (!snapshotOptions().main.debug) return;
    await withSeqLock(seq, async () => {
      const db = await openDb();
      if (kind === 'req') {
        const data = await gzipStr(JSON.stringify({ seq, tReq: Date.now(), req: payload }));
        await putRow(db, STORE, { seq, data });
      } else {
        const now = Date.now();
        // 配对从旧半行的 data 解（行里无原文冗余）；缺失/损坏则按无 req 回退。
        const prev = await getRow(db, seq);
        const prior = prev ? await decodeRecordRow(prev) : null;
        const tReq = prior?.tReq ?? now;
        const data = await gzipStr(
          JSON.stringify({
            seq,
            tReq,
            req: prior?.req,
            tRes: now,
            res: payload,
            rttMs: now - tReq,
          }),
        );
        await putRow(db, STORE, { seq, data });
      }
    });
  } catch {
    /* 录制失败不影响战斗 */
  }
}

function putRow(db: IDBDatabase, store: string, row: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(store).put(row);
  });
}

function getRow(db: IDBDatabase, seq: number): Promise<BattleRecord | undefined> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(seq);
    req.onsuccess = () => resolve(req.result as BattleRecord | undefined);
    req.onerror = () => reject(req.error);
  });
}

/** 纯函数：从已排序 key 列表算出要删的老 key（保留最新的 cap 条）。 */
export function keysToDelete(sortedKeys: number[], cap: number): number[] {
  if (sortedKeys.length <= cap) return [];
  return sortedKeys.slice(0, sortedKeys.length - cap);
}

async function evictOld(db: IDBDatabase, store: string, cap: number): Promise<void> {
  const total = await new Promise<number>((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  if (total <= cap) return;
  const excess = total - cap;
  // key 按 keyPath/autoIncrement 单调递增排列，只走前 excess 个即最老的。
  const drop = await new Promise<number[]>((resolve, reject) => {
    const out: number[] = [];
    const tx = db.transaction(store, 'readonly');
    const cursor = tx.objectStore(store).openKeyCursor();
    cursor.onsuccess = () => {
      const cur = cursor.result;
      if (cur && out.length < excess) {
        out.push(cur.primaryKey as number);
        cur.continue();
      } else resolve(out);
    };
    cursor.onerror = () => reject(cursor.error);
  });
  if (drop.length === 0) return;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    const objectStore = tx.objectStore(store);
    for (const k of drop) objectStore.delete(k);
  });
}

export async function countRecords(): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface TurnDebug {
  t: number;
  round: string;
  turn: number;
  rule: string;
  action: unknown;
  otos: Record<string, number>;
  snap: unknown;
}

/** 记录一回合决策现场（快照＋命中规则＋动作，供事后回放）。仅 debug 开启时。
 * 注意：热路径不做驱逐，驱逐统一在非战斗页面空闲时经 pruneDebugRecords() 一次完成。 */
export async function recordTurn(info: Omit<TurnDebug, 't'>): Promise<void> {
  try {
    if (!snapshotOptions().main.debug) return;
    const db = await openDb();
    const data = await gzipStr(JSON.stringify({ t: Date.now(), ...info }));
    await putRow(db, TURNS, { t: Date.now(), data });
  } catch {
    /* 录制失败不影响战斗 */
  }
}

/** 运行日志行（IDB logs 表，存原文不 gzip；key 为自增主键，升序即时间序）。
 * 与 logger.StoredEntry 同构，定义在此避免 logger→recorder 运行时循环以外的类型循环
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
    const db = await openDb();
    await putRow(db, LOGS, { ...entry });
  } catch {
    /* 日志失败不影响战斗 */
  }
}

export async function countLogs(): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(LOGS, 'readonly').objectStore(LOGS).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** 非战斗页面空闲时集中驱逐一次：records/turns/logs 各留最新上限。失败静默。 */
export async function pruneDebugRecords(): Promise<void> {
  try {
    const db = await openDb();
    await evictOld(db, STORE, CAP);
    await evictOld(db, TURNS, TURNS_CAP);
    await evictOld(db, LOGS, LOGS_CAP);
  } catch {
    /* 修剪失败不影响页面 */
  }
}

/** 仅修剪 logs 表（logger 侧单独调用）。失败静默。 */
export async function pruneLogs(): Promise<void> {
  try {
    const db = await openDb();
    await evictOld(db, LOGS, LOGS_CAP);
  } catch {
    /* 修剪失败不影响页面 */
  }
}

/** 纯函数：解码 records 表单行。坏记录返回 null（调用方跳过）。 */
export async function decodeRecordRow(row: BattleRecord): Promise<DecodedRecord | null> {
  try {
    const parsed = JSON.parse(await gunzip(row.data)) as Omit<DecodedRecord, 'seq'>;
    return { seq: row.seq, ...parsed };
  } catch {
    return null;
  }
}

/** 纯函数：解码 turns 表单行。坏记录返回 null（调用方跳过）。 */
export async function decodeTurnRow(row: { data: ArrayBuffer }): Promise<TurnDebug | null> {
  try {
    return JSON.parse(await gunzip(row.data)) as TurnDebug;
  } catch {
    return null;
  }
}

export interface ExportOptions {
  /** 最多返回条数（输出条数，坏记录不计）。缺省全量。 */
  limit?: number;
  /** 主键下界（含）：records 表即 seq，turns 表即自增 id。缺省从头。 */
  sinceSeq?: number;
}

const EXPORT_BATCH = 50;

/**
 * 同步游标走完一个有界批次并返回原始行。
 * 注意：onsuccess 里不能 await gunzip（事务会在让出事件循环后自动提交，
 * 后续 cursor.continue() 报 TransactionInactiveError），所以只取裸行，
 * 解码放在事务结束后做。内存 O(批次) 而非 O(全表)。
 */
function readRawBatch(
  db: IDBDatabase,
  store: string,
  lower: number | undefined,
  exclusive: boolean,
  batchSize: number,
): Promise<{ key: number; value: unknown }[]> {
  return new Promise((resolve, reject) => {
    const range = lower === undefined ? null : IDBKeyRange.lowerBound(lower, exclusive);
    const req = db.transaction(store, 'readonly').objectStore(store).openCursor(range);
    const out: { key: number; value: unknown }[] = [];
    req.onsuccess = () => {
      const cur = req.result;
      if (cur && out.length < batchSize) {
        out.push({ key: cur.primaryKey as number, value: cur.value });
        cur.continue();
      } else {
        resolve(out);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function exportRecords(opts: ExportOptions = {}): Promise<DecodedRecord[]> {
  const db = await openDb();
  const out: DecodedRecord[] = [];
  let lower = opts.sinceSeq;
  let exclusive = false;
  for (;;) {
    const batch = await readRawBatch(db, STORE, lower, exclusive, EXPORT_BATCH);
    if (batch.length === 0) break;
    for (const { value } of batch) {
      const rec = await decodeRecordRow(value as BattleRecord);
      if (rec !== null) {
        out.push(rec);
        if (opts.limit !== undefined && out.length >= opts.limit) return out;
      }
    }
    lower = batch[batch.length - 1].key;
    exclusive = true;
    if (batch.length < EXPORT_BATCH) break;
  }
  return out;
}

export async function exportTurns(opts: ExportOptions = {}): Promise<TurnDebug[]> {
  const db = await openDb();
  const out: TurnDebug[] = [];
  let lower = opts.sinceSeq;
  let exclusive = false;
  for (;;) {
    const batch = await readRawBatch(db, TURNS, lower, exclusive, EXPORT_BATCH);
    if (batch.length === 0) break;
    for (const { value } of batch) {
      const turn = await decodeTurnRow(value as { data: ArrayBuffer });
      if (turn !== null) {
        out.push(turn);
        if (opts.limit !== undefined && out.length >= opts.limit) return out;
      }
    }
    lower = batch[batch.length - 1].key;
    exclusive = true;
    if (batch.length < EXPORT_BATCH) break;
  }
  return out;
}

export async function exportLogs(opts: ExportOptions = {}): Promise<LogEntry[]> {
  const db = await openDb();
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

/** 清空调试记录：records 与 turns 两表全清（面板“清空”语义，logs 另由 clearLogs 清）。 */
export async function clearRecords(): Promise<void> {
  const db = await openDb();
  for (const store of [STORE, TURNS]) {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(store).clear();
    });
  }
}

/** 清空运行日志：logs 表全清（面板“清空”语义）。 */
export async function clearLogs(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(LOGS, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(LOGS).clear();
  });
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
