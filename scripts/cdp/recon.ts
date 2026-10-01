// 只读探针：页面状态 + 关键开关 + textlog 尾巴。用法：npx tsx scripts/cdp/recon.ts
import { pickPage, connect } from './common.js';

interface Report {
  url?: string;
  title?: string;
  hasNavbar?: boolean;
  hasRiddle?: boolean;
  hasTextlog?: boolean;
  mode?: string;
  localKeys?: string[];
  stamina?: string | null;
  ahvautoPanel?: boolean;
  ahvautoPause?: boolean;
  optFlags?: Record<string, unknown>;
  optParse?: string;
  textlogTail?: string[];
}

const cdp = await connect(await pickPage());
try {
  const report: Report = {
    url: await cdp.ev<string>('location.href'),
    title: await cdp.ev<string>('document.title'),
    hasNavbar: await cdp.ev<boolean>('!!document.querySelector("#navbar")'),
    hasRiddle: await cdp.ev<boolean>('!!document.querySelector("#riddlecounter")'),
    hasTextlog: await cdp.ev<boolean>('!!document.querySelector("#textlog")'),
    localKeys: await cdp.ev<string[]>(
      'Object.keys(localStorage).filter(k => k.startsWith("hvAA"))',
    ),
    stamina: await cdp.ev<string | null>(
      'document.querySelector("#stamina_readout")?.textContent?.trim()?.slice(0,120) ?? null',
    ),
    ahvautoPanel: await cdp.ev<boolean>('!!document.querySelector("#ahvauto-panel")'),
    ahvautoPause: await cdp.ev<boolean>('!!document.querySelector("#ahvauto-pause")'),
  };
  report.mode = report.hasRiddle
    ? 'riddle'
    : !report.hasNavbar
      ? 'battle?'
      : report.hasTextlog
        ? 'field?'
        : 'other';
  const optRaw = await cdp.ev<string | null>('localStorage.getItem("hvAA-option") ?? null');
  if (optRaw) {
    try {
      const opt = JSON.parse(optRaw) as { main?: Record<string, unknown> };
      const main = opt.main ?? (opt as unknown as Record<string, unknown>);
      report.optFlags = {
        attackStatus: main.attackStatus,
        idleArena: main.idleArena,
        encounter: main.encounter,
        restoreStamina: main.restoreStamina,
        autoFlee: main.autoFlee,
      };
    } catch {
      report.optParse = 'failed';
    }
  }
  report.textlogTail = await cdp.ev<string[]>(
    '[...document.querySelectorAll("#textlog>tbody>tr>td")].slice(-5).map(td => (td.textContent||"").slice(0,160))',
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  cdp.close();
}
