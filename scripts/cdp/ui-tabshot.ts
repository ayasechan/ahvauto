import { pickPage, connect } from './common.js';

const tab = process.argv[2] ?? '其他技能';
const out = process.argv[3] ?? 'logs/ui-tab.png';
const cdp = await connect(await pickPage());
try {
  const opened = await cdp.ev<boolean>('!!document.querySelector("#hvAABox")');
  if (!opened) {
    await cdp.ev('document.querySelector(".hvAAButton")?.click()');
    await new Promise((r) => setTimeout(r, 800));
  }
  await cdp.ev(
    `(() => { [...document.querySelectorAll("#hvAABox .hvAATabmenu>button")]
      .find(s => (s.textContent ?? "").trim() === ${JSON.stringify(tab)})?.click(); })()`,
  );
  await new Promise((r) => setTimeout(r, 800));
  const sig = await cdp.ev<string>(
    'document.querySelector("#hvAABox .hvAATab")?.textContent?.slice(0, 60) ?? "NONE"',
  );
  const seq = await cdp.ev<string[]>(
    '[...document.querySelectorAll("#hvAABox .hvAATab ol.seq li")].map(e => (e.textContent ?? "").trim())',
  );
  console.log(JSON.stringify({ tab, sig, seq }));
  const box = await cdp.ev<{ x: number; y: number; width: number; height: number }>(
    `(() => { const el = document.querySelector("#hvAABox");
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`,
  );
  const { writeFileSync } = await import('node:fs');
  const { data } = await cdp.send<{ data: string }>('Page.captureScreenshot', {
    format: 'png',
    clip: { ...box, scale: 1 },
    captureBeyondViewport: true,
  });
  writeFileSync(out, Buffer.from(data, 'base64'));
  console.log(`shot -> ${out}`);
} finally {
  cdp.close();
}
