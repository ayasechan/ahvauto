import { writeFileSync } from 'node:fs';
import { pickPage, connect } from './common.js';

const target = process.argv[2] ?? '#ahvauto-panel';
const out = process.argv[3] ?? 'logs/ui-panel.png';
const cdp = await connect(await pickPage());
try {
  const box = await cdp.ev<{ x: number; y: number; width: number; height: number } | null>(
    `(() => { const el = document.querySelector(${JSON.stringify(target)});
      if (!el) return null;
      el.scrollIntoView({ block: "nearest" });
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`,
  );
  if (!box) throw new Error(`not found: ${target}`);
  const { data } = await cdp.send<{ data: string }>('Page.captureScreenshot', {
    format: 'png',
    clip: { ...box, scale: 1 },
    captureBeyondViewport: true,
  });
  writeFileSync(out, Buffer.from(data, 'base64'));
  console.log(`shot ${target} -> ${out}`, JSON.stringify(box));
} finally {
  cdp.close();
}
