// 运维：backup | verify | refresh | screenshot <file> | inject <js> [css]
// inject 前必须先 verify 通过（角色暂停），由调用方保证顺序。
import { readFileSync, writeFileSync } from 'node:fs';
import { pickPage, connect, assertPaused } from './common.js';
import { STORAGE_NS, DISABLED_KEY } from '../../src/lib/storage-keys.js';

const [cmd, arg] = process.argv.slice(2);
const cdp = await connect(await pickPage());
try {
  if (cmd === 'backup') {
    const out = arg ?? `logs/localstorage-backup-${Date.now()}.json`;
    const dump = await cdp.ev<string>(
      `JSON.stringify(Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith("hvAA")||k.startsWith(${JSON.stringify(STORAGE_NS)})).map(k=>[k,localStorage.getItem(k)])))`,
    );
    writeFileSync(out, dump);
    console.log(`backup ok: ${out} (${dump.length} bytes)`);
  } else if (cmd === 'verify') {
    await assertPaused(cdp);
    const state = await cdp.ev<string>(
      `JSON.stringify({disabled:localStorage.getItem(${JSON.stringify(DISABLED_KEY)}),panel:!!document.querySelector("#hvAABox"),title:document.title})`,
    );
    console.log(`paused ok: ${state}`);
  } else if (cmd === 'refresh') {
    await cdp.send('Page.reload');
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        if ((await cdp.ev<string>('document.readyState')) === 'complete') break;
      } catch {
        /* 重载中 target 短暂不可用 */
      }
    }
    await new Promise((r) => setTimeout(r, 1500));
    console.log('reload done');
  } else if (cmd === 'screenshot') {
    if (!arg) throw new Error('usage: ops.ts screenshot <file>');
    console.log('shot ok:', await cdp.shot(arg));
  } else if (cmd === 'inject') {
    if (!arg) throw new Error('usage: ops.ts inject <js> [css]');
    await assertPaused(cdp);
    const cssFile = process.argv[4];
    if (cssFile) {
      const css = readFileSync(cssFile, 'utf8');
      await cdp.ev<boolean>(
        `(()=>{let s=document.getElementById("hvaa-inject-css");if(!s){s=document.createElement("style");s.id="hvaa-inject-css";document.head.appendChild(s);}s.textContent=${JSON.stringify(css)};return true;})()`,
      );
    }
    const js = readFileSync(arg, 'utf8');
    await cdp.ev(js, true);
    console.log('inject ok, panel:', await cdp.ev<boolean>('!!document.querySelector("#hvAABox")'));
  } else {
    throw new Error(`unknown cmd: ${cmd} (backup|verify|refresh|screenshot|inject)`);
  }
} finally {
  cdp.close();
}
