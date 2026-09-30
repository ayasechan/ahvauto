import { pickPage, connect } from './common.js';

const cdp = await connect(await pickPage());
try {
  const url = await cdp.ev<string>('location.href');
  const title = await cdp.ev<string>('document.title');
  const btnHtml = await cdp.ev<string>(
    'document.querySelector(".hvAAButton")?.outerHTML?.slice(0, 200) ?? "NO-BUTTON"',
  );
  const boxExists = await cdp.ev<boolean>('!!document.querySelector("#hvAABox")');
  const boxCss = await cdp.ev<Record<string, string>>(
    `(() => { const b = document.querySelector("#hvAABox"); if (!b) return {};
      const cs = getComputedStyle(b);
      return { width: cs.width, bg: cs.backgroundColor, radius: cs.borderRadius,
        primary: cs.getPropertyValue("--hv-primary").trim(),
        panel: cs.getPropertyValue("--hv-panel").trim() }; })()`,
  );
  const crumbs = await cdp.ev<string>(
    'document.querySelector("#hvAABox .hvAACrumb")?.textContent ?? "NO-CRUMB"',
  );
  const groups = await cdp.ev<string[]>(
    '[...document.querySelectorAll("#hvAABox .hvAAGroup")].map(e => e.textContent)',
  );
  const v2hint = await cdp.ev<boolean>('!!document.querySelector("#hvAABox .hvAATabmenu>span")');
  console.log(
    JSON.stringify({ url, title, btnHtml, boxExists, boxCss, crumbs, groups, v2hint }, null, 1),
  );
  await cdp.shot('logs/ui-check.png');
  console.log('shot -> logs/ui-check.png');
} finally {
  cdp.close();
}
