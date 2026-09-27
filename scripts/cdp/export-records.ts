import { writeFileSync } from 'node:fs';
import { pickPage, connect } from './common.js';
// 导出 IDB 战斗记录（解压）。新形状为配对行 {seq,tReq,req,tRes,res,rttMs}，兼容旧分行。
const out = process.argv[2] ?? `logs/battle-records-${Date.now()}.json`;
const cdp = await connect(await pickPage());
try {
  const rows = await cdp.ev<unknown[]>(
    `(async()=>{
      const db = await new Promise((res,rej)=>{const q=indexedDB.open("hvaa-debug");q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});
      const recs = await new Promise((res,rej)=>{const q=db.transaction("records","readonly").objectStore("records").getAll();q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});
      const out = [];
      for (const r of recs) {
        try {
          const txt = await new Response(new Blob([r.data]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
          out.push({seq: r.seq, ...JSON.parse(txt)});
        } catch(e) { out.push({seq: r.seq, corrupt: String(e)}); }
      }
      return out;
    })()`,
    true,
  );
  writeFileSync(out, JSON.stringify(rows, null, 1));
  console.log(`ok: ${out} (${rows.length} records)`);
} finally {
  cdp.close();
}
