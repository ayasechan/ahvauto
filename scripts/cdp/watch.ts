import { pickPage, connect } from './common.js';
import { IDB_NAME } from '../../src/lib/storage-keys.js';

// 观察战斗：title/__hvaa/log 行数/血条/IDB，每 4 秒一行，共 ~60 秒。只读。
const cdp = await connect(await pickPage());
try {
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const s = await cdp.ev<string>(
      `JSON.stringify({
        title: document.title,
        hvaa: window.__hvaa ?? null,
        logN: document.querySelectorAll("#textlog>tbody>tr>td").length,
        hpW: document.querySelector("#dvbh>div>img")?.offsetWidth ?? -1,
        tail: [...document.querySelectorAll("#textlog>tbody>tr>td")].slice(-1).map(td=>(td.textContent||"").slice(0,90))[0] ?? ""
      })`,
    );
    const idb = await cdp.ev<number>(
      `(async()=>{try{const db=await new Promise((res,rej)=>{const q=indexedDB.open(${JSON.stringify(IDB_NAME)});q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});return await new Promise((res,rej)=>{const q=db.transaction("records","readonly").objectStore("records").count();q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});}catch(e){return -1;}})()`,
      true,
    );
    console.log(`t=${i * 4}s idb=${idb}`, s);
  }
} finally {
  cdp.close();
}
