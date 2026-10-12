import { snapshotOptions } from '../config/store';
import { getDb, putRow, EXPORT_BATCH, readRawBatch } from './db';

const STORE = 'records';
const TURNS = 'turns';
const CAP = 2000;
const TURNS_CAP = 50000;

export { STORE as RECORDS_STORE, TURNS as TURNS_STORE, CAP as RECORDS_CAP, TURNS_CAP };

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

function getRow(db: IDBDatabase, seq: number): Promise<BattleRecord | undefined> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(seq);
    req.onsuccess = () => resolve(req.result as BattleRecord | undefined);
    req.onerror = () => reject(req.error);
  });
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
      const db = await getDb();
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

export async function countRecords(): Promise<number> {
  const db = await getDb();
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
    const db = await getDb();
    const data = await gzipStr(JSON.stringify({ t: Date.now(), ...info }));
    await putRow(db, TURNS, { t: Date.now(), data });
  } catch {
    /* 录制失败不影响战斗 */
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

export async function exportRecords(opts: ExportOptions = {}): Promise<DecodedRecord[]> {
  const db = await getDb();
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
  const db = await getDb();
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

/** 清空调试记录：records 与 turns 两表全清（面板“清空”语义，logs 另由 clearLogs 清）。 */
export async function clearRecords(): Promise<void> {
  const db = await getDb();
  for (const store of [STORE, TURNS]) {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(store).clear();
    });
  }
}
