import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pickPage, connect } from './common.js';
import { IDB_NAME } from '../../src/lib/storage-keys.js';
// 导出 IDB 战斗记录（解压）。新形状为配对行 {seq,tReq,req,tRes,res,rttMs}，兼容旧分行。
// 分页策略：页内倒序 key 游标（openKeyCursor(range,'prev')，since-seq 用
// IDBKeyRange.lowerBound 下界）按 limit 提前终止；每批 200 条经 CDP 分批回传、
// append 落盘，避免大数据量下页内 getAll OOM + CDP 回传包爆炸 + 数 GB 整包文件。
// 只读：readonly 事务、无版本号 open、不点游戏按钮、不写 IDB。
const BATCH = 200;
const DEFAULT_LIMIT = 1000;

const HELP = `export-records.ts — 分页导出 IDB 战斗记录（只读）

用法：
  npx tsx scripts/cdp/export-records.ts [输出] [--limit N] [--since-seq S]

参数：
  [输出]         输出 JSON 文件（默认 logs/battle-records-<ts>.json）
  --limit N      最多导出 N 条（默认 ${DEFAULT_LIMIT}，须为正整数；按 key 倒序取最新 N 条）
  --since-seq S  只导出 seq >= S 的记录
  --help, -h     显示本说明

示例：
  npx tsx scripts/cdp/export-records.ts
  npx tsx scripts/cdp/export-records.ts logs/rec.json --limit 200
  npx tsx scripts/cdp/export-records.ts logs/rec.json --limit 5000 --since-seq 100
`;

const raw = process.argv.slice(2);
let out = `logs/battle-records-${Date.now()}.json`;
let outSet = false;
let limit = DEFAULT_LIMIT;
let sinceSeq: number | null = null;
for (let i = 0; i < raw.length; i++) {
  const a = raw[i];
  if (a === '--help' || a === '-h') {
    console.log(HELP);
    process.exit(0);
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
  } else if (!outSet) {
    out = a;
    outSet = true;
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
// 逐 key get + gunzip。无版本号 open（versionless），readonly 事务。
const batchExpr = (upperExcl: number | null, take: number, since: number | null): string =>
  `(async(upperExcl,batchSize,sinceSeq)=>{` +
  `const db=await new Promise((res,rej)=>{const q=indexedDB.open(${JSON.stringify(IDB_NAME)});q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});` +
  `try{` +
  `let range=null;` +
  `if(upperExcl!==null&&sinceSeq!==null)range=IDBKeyRange.bound(sinceSeq,upperExcl,false,true);` +
  `else if(upperExcl!==null)range=IDBKeyRange.upperBound(upperExcl,true);` +
  `else if(sinceSeq!==null)range=IDBKeyRange.lowerBound(sinceSeq);` +
  `const keys=await new Promise((res,rej)=>{const o=[];const q=db.transaction("records","readonly").objectStore("records").openKeyCursor(range,"prev");` +
  `q.onsuccess=()=>{const c=q.result;if(!c){res(o);return;}o.push(c.key);if(o.length>=batchSize){res(o);return;}c.continue();};` +
  `q.onerror=()=>rej(q.error);});` +
  `const rows=[];` +
  `for(const k of keys){` +
  `const r=await new Promise((res,rej)=>{const q=db.transaction("records","readonly").objectStore("records").get(k);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});` +
  `if(!r){rows.push({seq:k,corrupt:"missing"});continue;}` +
  `try{const txt=await new Response(new Blob([r.data]).stream().pipeThrough(new DecompressionStream("gzip"))).text();` +
  `rows.push({seq:r.seq??k,...JSON.parse(txt)});}` +
  `catch(e){rows.push({seq:r.seq??k,corrupt:String(e)});}}` +
  `return{rows,nextKey:keys.length?keys[keys.length-1]:null,done:keys.length<batchSize};` +
  `}finally{db.close();}` +
  `})(${JSON.stringify(upperExcl)},${JSON.stringify(take)},${JSON.stringify(since)})`;

const cdp = await connect(await pickPage());
try {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, '[\n');
  let written = 0;
  let first = true;
  let upperExcl: number | null = null;
  for (;;) {
    const take = Math.min(BATCH, limit - written);
    if (take <= 0) break;
    const b: Batch = await cdp.ev<Batch>(batchExpr(upperExcl, take, sinceSeq), true);
    for (const row of b.rows) {
      appendFileSync(out, `${first ? ' ' : ',\n '}${JSON.stringify(row, null, 1).replace(/\n/g, '\n ')}`);
      first = false;
    }
    written += b.rows.length;
    if (limit > BATCH) console.log(`... ${written}/${limit} records (nextKey=${b.nextKey})`);
    if (b.nextKey === null || b.done || b.rows.length === 0 || written >= limit) break;
    upperExcl = b.nextKey;
  }
  if (written === 0) writeFileSync(out, '[]\n');
  else appendFileSync(out, '\n]\n');
  console.log(`ok: ${out} (${written} records)`);
} finally {
  cdp.close();
}
