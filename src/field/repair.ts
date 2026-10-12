import { snapshotOptions } from '../config/store';
import { httpGet, httpPost, requestRetry } from '../platform/http';
import { logger } from '../platform/logger';

export interface RepairItem {
  id: string;
  /** 行尾 NN% 耐久 */
  durability: number;
}

/** 解析修装备页，字段语义见 docs/ARCHITECTURE.md 战斗外小节 */
export function parseRepairForm(html: string): {
  postoken: string | null;
  items: RepairItem[];
} {
  const postoken = html.match(/name="postoken" value="([^"]+)"/)?.[1] ?? null;
  const items: RepairItem[] = [];
  for (const m of html.matchAll(
    /name="eqids\[\]"[^>]*value="(\d+)"[\s\S]*?<\/label>\s*<\/td>\s*<td>\s*(\d+)\s*%/g,
  )) {
    items.push({ id: m[1], durability: Number(m[2]) });
  }
  return { postoken, items };
}

const REPAIR_URL = '?s=Bazaar&ss=am&screen=repair';

/** 自动修装备（field 入口调用，战斗前跑一次），流程语义见 docs/ARCHITECTURE.md 战斗外小节 */
export async function repairEquipment(): Promise<void> {
  const opt = snapshotOptions();
  if (!opt.main.repair) return;
  let html: string;
  try {
    html = await requestRetry(() => httpGet<string>(REPAIR_URL, 'html'));
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return;
    logger.warning('repair: list fetch failed: {err}', { err: String(e) });
    return;
  }
  const form = parseRepairForm(html);
  if (!form.postoken) {
    logger.warning('repair: no postoken on repair page');
    return;
  }
  const targets = form.items.filter((i) => i.durability <= opt.main.repairValue);
  if (targets.length === 0) {
    logger.debug('repair: nothing below {th}% ({n} listed)', {
      th: opt.main.repairValue,
      n: form.items.length,
    });
    return;
  }
  const params = targets.map((t) => `eqids%5B%5D=${encodeURIComponent(t.id)}`).join('&');
  const body =
    `${params}&postoken=${encodeURIComponent(form.postoken)}` +
    (opt.main.repairCharms ? '&replace_charms=on' : '');
  let after: string;
  try {
    after = await requestRetry(() => httpPost<string>(REPAIR_URL, body, 'html'));
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return;
    logger.warning('repair: submit failed: {err}', { err: String(e) });
    return;
  }
  const remaining = targets.filter((t) => parseRepairForm(after).items.some((i) => i.id === t.id));
  if (remaining.length === 0) {
    logger.info('repair: fixed {n} item(s) at <= {th}%', {
      n: targets.length,
      th: opt.main.repairValue,
    });
  } else {
    logger.warning('repair: {ids} still listed after submit', {
      ids: remaining.map((t) => t.id).join(','),
    });
  }
}
