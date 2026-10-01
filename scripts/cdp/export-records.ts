import { createWriteStream, mkdirSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { createGzip } from 'node:zlib';
import { pickPage, connect, type Cdp } from './common.js';
import { IDB_NAME } from '../../src/lib/storage-keys.js';
import { toJsonlLine } from '../../src/lib/recorder.js';
// 导出 IDB 战斗记录为 JSONL+gzip（逐行一对象，可流式读）。
// records 行 {seq, data} → 解压得配对体 {seq,tReq,req,tRes,res,rttMs}；
// turns 行 {t, data} → 解压得 {t,round,turn,rule,action,otos,snap}（key 另附为行号）。
// logs 行原文 {t,level,category,message,props}（不 gzip，key 另附为行号）。
// 分页策略：页内倒序 key 游标按 limit 提前终止；每批 50 条经 CDP 分批回传、
// node 侧流式 gzip 落盘，避免页内 OOM + CDP 回传包爆炸 + 整包大文件。
// 只读：readonly 事务、无版本号 open、不点游戏按钮、不写 IDB。
const BATCH = 50;

type Store = 'records' | 'turns' | 'logs';

const HELP = `export-records.ts — 导出 IDB 战斗记录为 JSONL+gzip（只读）

用法：
  npx tsx scripts/cdp/export-records.ts [输出前缀] [--store S] [--limit N] [--since-seq S]

参数：
  [输出前缀]     默认 logs/battle-<ts>；实际写 <前缀>-records.jsonl.gz / <前缀>-turns.jsonl.gz / <前缀>-logs.jsonl.gz
  --store S      records（请求）| turns（决策）| logs（运行日志）| both（默认，含三表）
  --limit N      每表最多导出 N 条（默认全量，须为正整数；按 key 倒序取最新 N 条）
  --since-seq S  只导出 key >= S 的记录
  --help, -h     显示本说明

示例：
  npx tsx scripts/cdp/export-records.ts
  npx tsx scripts/cdp/export-records.ts logs/night3 --limit 2000
  npx tsx scripts/cdp/export-records.ts logs/night3 --store turns
`;

const raw = process.argv.slice(2);
let prefix = `logs/battle-${Date.now()}`;
let prefixSet = false;
let store: Store | 'both' = 'both';
let limit = Number.POSITIVE_INFINITY;
let sinceSeq: number | null = null;
for (let i = 0; i < raw.length; i++) {
  const a = raw[i];
  if (a === '--help' || a === '-h') {
    console.log(HELP);
    process.exit(0);
  } else if (a === '--store' || a.startsWith('--store=')) {
    const v = a.startsWith('--store=') ? a.slice('--store='.length) : raw[++i];
    if (v !== 'records' && v !== 'turns' && v !== 'logs' && v !== 'both') {
      console.error(`bad --store ${JSON.stringify(v)} (want records|turns|logs|both)`);
      process.exit(1);
    }
    store = v;
  } else if (a === '--limit' || a.startsWith('--limit=')) {
    const v = a.startsWith('--limit=') ? a.slice('--limit='.length) : raw[++i];
    limit = Number(v);
    if (!Number.isInteger(limit) || limit <= 0) {
      console.error(`bad --limit ${JSON.stringify(v)} (want positive integer)`);
      process.exit(1);
    }
  } else if (a === '--since-seq' || a.startsWith('--since-seq=')) {
    const v = a.startsWith('--since-seq=') ? a.slice('--since-seq='.length) : raw[++i];
    sinceSeq = Number(v);
    if (!Number.isFinite(sinceSeq)) {
      console.error(`bad --since-seq ${JSON.stringify(v)} (want number)`);
      process.exit(1);
    }
  } else if (a.startsWith('--')) {
    console.error(`unknown flag ${JSON.stringify(a)}\n\n${HELP}`);
    process.exit(1);
  } else if (!prefixSet) {
    prefix = a;
    prefixSet = true;
  } else {
    console.error(`unexpected positional ${JSON.stringify(a)}\n\n${HELP}`);
    process.exit(1);
  }
}

interface Batch {
  rows: Record<string, unknown>[];
  nextKey: number | null;
  done: boolean;
}

// 一批：倒序游标取一批 key（upperExcl 上界专属，用于翻页；sinceSeq 下界包容），
// records/turns 逐 key get + gunzip；logs 存原文直出。无版本号 open（versionless），readonly 事务。表不存在直接返回空。
const batchExpr = (
  st: Store,
  upperExcl: number | null,
  take: number,
  since: number | null,
): string => {
  if (st === 'logs') {
    return (
      `(async(upperExcl,batchSize,sinceSeq)=>{` +
      `const db=await new Promise((res,rej)=>{const q=indexedDB.open(${JSON.stringify(IDB_NAME)});q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});` +
      `try{` +
      `if(!db.objectStoreNames.contains("logs"))return{rows:[],nextKey:null,done:true};` +
      `let range=null;` +
      `if(upperExcl!==null&&sinceSeq!==null)range=IDBKeyRange.bound(sinceSeq,upperExcl,false,true);` +
      `else if(upperExcl!==null)range=IDBKeyRange.upperBound(upperExcl,true);` +
      `else if(sinceSeq!==null)range=IDBKeyRange.lowerBound(sinceSeq);` +
      `const keys=await new Promise((res,rej)=>{const o=[];const q=db.transaction("logs","readonly").objectStore("logs").openKeyCursor(range,"prev");` +
      `q.onsuccess=()=>{const c=q.result;if(!c){res(o);return;}o.push(c.key);if(o.length>=batchSize){res(o);return;}c.continue();};` +
      `q.onerror=()=>rej(q.error);});` +
      `const rows=[];` +
      `for(const k of keys){` +
      `const r=await new Promise((res,rej)=>{const q=db.transaction("logs","readonly").objectStore("logs").get(k);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});` +
      `if(!r){rows.push({key:k,corrupt:"missing"});continue;}` +
      `rows.push({key:k,...r});}` +
      `return{rows,nextKey:keys.length?keys[keys.length-1]:null,done:keys.length<batchSize};` +
      `}finally{db.close();}` +
      `})(${JSON.stringify(upperExcl)},${JSON.stringify(take)},${JSON.stringify(since)})`
    );
  }
  const decode =
    st === 'records'
      ? `rows.push({seq:r.seq??k,...JSON.parse(txt)});`
      : `rows.push({key:k,...JSON.parse(txt)});`;
  return (
    `(async(upperExcl,batchSize,sinceSeq)=>{` +
    `const db=await new Promise((res,rej)=>{const q=indexedDB.open(${JSON.stringify(IDB_NAME)});q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});` +
    `try{` +
    `if(!db.objectStoreNames.contains(${JSON.stringify(st)}))return{rows:[],nextKey:null,done:true};` +
    `let range=null;` +
    `if(upperExcl!==null&&sinceSeq!==null)range=IDBKeyRange.bound(sinceSeq,upperExcl,false,true);` +
    `else if(upperExcl!==null)range=IDBKeyRange.upperBound(upperExcl,true);` +
    `else if(sinceSeq!==null)range=IDBKeyRange.lowerBound(sinceSeq);` +
    `const keys=await new Promise((res,rej)=>{const o=[];const q=db.transaction(${JSON.stringify(st)},"readonly").objectStore(${JSON.stringify(st)}).openKeyCursor(range,"prev");` +
    `q.onsuccess=()=>{const c=q.result;if(!c){res(o);return;}o.push(c.key);if(o.length>=batchSize){res(o);return;}c.continue();};` +
    `q.onerror=()=>rej(q.error);});` +
    `const rows=[];` +
    `for(const k of keys){` +
    `const r=await new Promise((res,rej)=>{const q=db.transaction(${JSON.stringify(st)},"readonly").objectStore(${JSON.stringify(st)}).get(k);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});` +
    `if(!r){rows.push({key:k,corrupt:"missing"});continue;}` +
    `try{const txt=await new Response(new Blob([r.data]).stream().pipeThrough(new DecompressionStream("gzip"))).text();` +
    decode +
    `}catch(e){rows.push({key:k,corrupt:String(e)});}}` +
    `return{rows,nextKey:keys.length?keys[keys.length-1]:null,done:keys.length<batchSize};` +
    `}finally{db.close();}` +
    `})(${JSON.stringify(upperExcl)},${JSON.stringify(take)},${JSON.stringify(since)})`
  );
};

/** 一表到底：分批拉 → 紧凑 JSON 行 → 流式 gzip 落盘。返回行数与原文字节。 */
async function dumpStore(
  cdp: Cdp,
  st: Store,
  file: string,
  lim: number,
  since: number | null,
): Promise<{ rows: number; raw: number }> {
  mkdirSync(dirname(file), { recursive: true });
  const out = createWriteStream(file);
  const gz = createGzip();
  gz.pipe(out);
  const finished = new Promise<void>((res, rej) => {
    out.on('finish', () => res());
    out.on('error', rej);
    gz.on('error', rej);
  });
  let written = 0;
  let rawBytes = 0;
  let upperExcl: number | null = null;
  try {
    for (;;) {
      const take = Math.min(BATCH, lim - written);
      if (take <= 0) break;
      const b: Batch = await cdp.ev<Batch>(batchExpr(st, upperExcl, take, since), true);
      for (const row of b.rows) {
        const line = toJsonlLine(row);
        rawBytes += line.length;
        if (!gz.write(line)) await new Promise((r) => gz.once('drain', r));
      }
      written += b.rows.length;
      if (b.nextKey === null || b.done || b.rows.length === 0 || written >= lim) break;
      upperExcl = b.nextKey;
    }
  } finally {
    gz.end();
  }
  await finished;
  return { rows: written, raw: rawBytes };
}

const cdp = await connect(await pickPage());
try {
  const targets: Store[] = store === 'both' ? ['records', 'turns', 'logs'] : [store];
  for (const st of targets) {
    const file = `${prefix}-${st}.jsonl.gz`;
    const { rows, raw } = await dumpStore(cdp, st, file, limit, sinceSeq);
    const gzSize = statSync(file).size;
    console.log(
      `ok: ${file} (${rows} rows, raw ${(raw / 1024).toFixed(1)}KB → gz ${(gzSize / 1024).toFixed(1)}KB)`,
    );
  }
} finally {
  cdp.close();
}
