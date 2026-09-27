// 只读：导出当前战斗 textlog 全文快照。用法：npx tsx scripts/cdp/battle-log.ts [输出文件]
import { writeFileSync } from 'node:fs';
import { pickPage, connect } from './common.js';

const out = process.argv[2] ?? `logs/battle-${new Date().toISOString().replace(/[:.]/g, '')}.json`;
const cdp = await connect(await pickPage());
try {
  const snap = await cdp.ev<string>(
    `JSON.stringify({
      url: location.href,
      title: document.title,
      time: new Date().toISOString(),
      log: [...document.querySelectorAll("#textlog>tbody>tr>td")].map(td => td.textContent ?? "")
    })`,
  );
  writeFileSync(out, snap);
  console.log(`ok: ${out}`);
} finally {
  cdp.close();
}
