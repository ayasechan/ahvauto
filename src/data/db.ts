import { IDB_NAME as DB_NAME } from '../platform/storage-keys';

/** 数据收集 v3 单场行（全量 BattleRow）＋进行中局（单行 CurBattle）。 */
export const BATTLES_STORE = 'battles';
export const CUR_STORE = 'cur';
// v7：与 v6 同 schema（battles/cur 建表补救：线上曾出现 v6 版本号已提交但建表未执行，
// 读写真抛 NotFoundError；升版一次触发 onupgradeneeded 补建。禁止只升号不建表的新版本）。
const DB_VERSION = 7;

/** 全仓唯一允许带版本号 open() 的地方（见 AGENTS.md IDB 铁律）。 */
let dbp: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (ev) => {
        const old = (ev as IDBVersionChangeEvent).oldVersion;
        // v3 以下：req/res 分行或 bug 形态，直接重建（历史已导出到 logs/）
        if (old < 3) {
          if (req.result.objectStoreNames.contains('records')) {
            req.result.deleteObjectStore('records');
          }
          req.result.createObjectStore('records', { keyPath: 'seq' });
        }
        if (!req.result.objectStoreNames.contains('turns')) {
          req.result.createObjectStore('turns', { autoIncrement: true });
        }
        if (!req.result.objectStoreNames.contains('logs')) {
          req.result.createObjectStore('logs', { autoIncrement: true });
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

/** 通用行写入（已持有 db 连接时用，免重复 open）。 */
export function putRow(
  db: IDBDatabase,
  store: string,
  row: Record<string, unknown>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(store).put(row);
  });
}

/** 纯函数：从已排序 key 列表算出要删的老 key（保留最新的 cap 条）。 */
export function keysToDelete(sortedKeys: number[], cap: number): number[] {
  if (sortedKeys.length <= cap) return [];
  return sortedKeys.slice(0, sortedKeys.length - cap);
}

export async function evictOld(db: IDBDatabase, store: string, cap: number): Promise<void> {
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

export const EXPORT_BATCH = 50;

/**
 * 同步游标走完一个有界批次并返回原始行。
 * 注意：onsuccess 里不能 await gunzip（事务会在让出事件循环后自动提交，
 * 后续 cursor.continue() 报 TransactionInactiveError），所以只取裸行，
 * 解码放在事务结束后做。内存 O(批次) 而非 O(全表)。
 */
export function readRawBatch(
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
