// 全量 bundle 注入：自动 dismiss 掉 prompt/confirm（只记录），抓页面异常。
// 用法：npx tsx scripts/cdp/inject-full.ts [bundle路径，默认 dist/ahvauto.user.js]
import { readFileSync } from 'node:fs';
import { pickPage, connect, assertPaused, autoDismissDialogs } from './common.js';

const bundle = process.argv[2] ?? 'dist/ahvauto.user.js';
const cdp = await connect(await pickPage());
try {
  await assertPaused(cdp);
  const seen = await autoDismissDialogs(cdp);
  const js = readFileSync(bundle, 'utf8');
  const code = js.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/, '');
  console.log('bundle code bytes:', code.length);
  await cdp.ev(code, true);
  await new Promise((r) => setTimeout(r, 2000));
  console.log('float button:', await cdp.ev<boolean>('!!document.querySelector(".hvAAButton")'));
  console.log('pause box:', await cdp.ev<boolean>('!!document.querySelector("#hvAABox2")'));
  console.log('dialogs dismissed:', JSON.stringify(seen));
} finally {
  cdp.close();
}
