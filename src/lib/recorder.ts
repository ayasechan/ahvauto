import { snapshotOptions } from './store';
import { recordBattleTurn } from './stats';

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

const DB_NAME = 'hvaa-debug';
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

/** 记录请求到达（先写半行）；响应到达时补全。仅 debug 开启时。失败静默跳过。 */
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
      await putRow(db, STORE, { seq, tReq, req: prev?.req, tRes: now, res: payload, rttMs: now - tReq, data });
    }
    await evictOld(db, STORE, CAP);
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

async function evictOld(db: IDBDatabase, store: string, cap: number): Promise<void> {
  const keys = await new Promise<number[]>((resolve, reject) => {
    const out: number[] = [];
    const tx = db.transaction(store, 'readonly');
    const cursor = tx.objectStore(store).openKeyCursor();
    cursor.onsuccess = () => {
      if (cursor.result) {
        out.push(cursor.result.primaryKey as number);
        cursor.result.continue();
      } else resolve(out);
    };
    cursor.onerror = () => reject(cursor.error);
  });
  if (keys.length <= cap) return;
  const drop = keys.slice(0, keys.length - cap);
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

/** 记录一回合决策现场（快照＋命中规则＋动作，供事后回放）。仅 debug 开启时。 */
export async function recordTurn(info: Omit<TurnDebug, 't'>): Promise<void> {
  try {
    if (!snapshotOptions().main.debug) return;
    const db = await openDb();
    const data = await gzipStr(JSON.stringify({ t: Date.now(), ...info }));
    await putRow(db, TURNS, { t: Date.now(), data });
    await evictOld(db, TURNS, TURNS_CAP);
  } catch {
    /* 录制失败不影响战斗 */
  }
}

export async function exportRecords(): Promise<DecodedRecord[]> {
  const db = await openDb();
  const rows = await new Promise<BattleRecord[]>((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as BattleRecord[]);
    req.onerror = () => reject(req.error);
  });
  const out: DecodedRecord[] = [];
  for (const r of rows) {
    try {
      const parsed = JSON.parse(await gunzip(r.data)) as Omit<DecodedRecord, 'seq'>;
      out.push({ seq: r.seq, ...parsed });
    } catch {
      /* 坏记录跳过 */
    }
  }
  return out;
}

export async function exportTurns(): Promise<TurnDebug[]> {
  const db = await openDb();
  const rows = await new Promise<{ data: ArrayBuffer }[]>((resolve, reject) => {
    const req = db.transaction(TURNS, 'readonly').objectStore(TURNS).getAll();
    req.onsuccess = () => resolve(req.result as { data: ArrayBuffer }[]);
    req.onerror = () => reject(req.error);
  });
  const out: TurnDebug[] = [];
  for (const r of rows) {
    try {
      out.push(JSON.parse(await gunzip(r.data)) as TurnDebug);
    } catch {
      /* 坏记录跳过 */
    }
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

/**
 * 页上下文→隔离世界的桥：注入脚本用 window.postMessage({source:'hvaa-rec',...})
 * 上报 api_call/api_response（同 seq），隔离世界侧按 seq 配对写入 IDB。
 */
export function installRecordBridge(): void {
  window.addEventListener('message', (e: MessageEvent) => {
    // 注意：油猴隔离世界里，页上下文 post 来的消息 e.source !== window，
    // 不能用 source 做过滤，仅认 hvaa-rec 标记（调试通道，无安全影响）。
    const d = e.data as { source?: string; kind?: string; seq?: number; payload?: unknown } | null;
    if (!d || d.source !== 'hvaa-rec') return;
    const seq = typeof d.seq === 'number' ? d.seq : 0;
    if (d.kind === 'req' || d.kind === 'res') void recordBattleEvent(d.kind, d.payload, seq);
    // 数据收集走响应体（与 debug 录制开关无关，由 recordUsage/dropMonitor 门控）
    if (d.kind === 'res' && d.payload && typeof d.payload === 'object') {
      try {
        const body = (d.payload as { body?: unknown }).body as { textlog?: unknown[] } | undefined;
        const raw = Array.isArray(body?.textlog) ? body.textlog : [];
        const rows = raw.map((r) => (typeof r === 'string' ? r : (r as { t?: string }).t ?? ''));
        if (rows.length > 0) recordBattleTurn(rows);
      } catch {
        /* 统计失败不影响战斗 */
      }
    }
  });
}
