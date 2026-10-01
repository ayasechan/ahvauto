import { snapshotOptions } from './store';
import { recordBattleTurn } from './stats';
import { IDB_NAME as DB_NAME } from './storage-keys';

/** 配对后的一行：一次请求＋它的响应。v2 起 keyPath 为 seq。 */
export interface BattleRecord {
  seq: number;
  tReq: number;
  req: unknown;
  tRes?: number;
  res?: unknown;
  rttMs?: number;
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
const CAP = 1000;
const TURNS_CAP = 500;
// v4：turns 表存每回合决策现场。注意：外部工具不得用带版本号 open（会空提交版本，
// 跳过 onupgradeneeded，导致 schema 升级永久失效）。
const DB_VERSION = 4;

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
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

export async function gzipStr(s: string): Promise<ArrayBuffer> {
  const stream = new Blob([s]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

export async function gunzip(ab: ArrayBuffer): Promise<string> {
  const stream = new Blob([ab]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
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
        await putRow(db, STORE, { seq, tReq: Date.now(), req: payload, data });
      } else {
        const now = Date.now();
        const prev = await getRow(db, seq);
        const tReq = prev?.tReq ?? now;
        const data = await gzipStr(
          JSON.stringify({ seq, tReq, req: prev?.req, tRes: now, res: payload, rttMs: now - tReq }),
        );
        await putRow(db, STORE, {
          seq,
          tReq,
          req: prev?.req,
          tRes: now,
          res: payload,
          rttMs: now - tReq,
          data,
        });
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

/** 非战斗页面空闲时集中驱逐一次：records 留最新 CAP 条，turns 留最新 TURNS_CAP 条。失败静默。 */
export async function pruneDebugRecords(): Promise<void> {
  try {
    const db = await openDb();
    await evictOld(db, STORE, CAP);
    await evictOld(db, TURNS, TURNS_CAP);
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

export async function clearRecords(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).clear();
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
      if (rows.length > 0) recordBattleTurn(rows);
    } catch {
      /* 统计失败不影响战斗 */
    }
  }
}
