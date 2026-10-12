import { kvGet, kvSet, snapshotOptions } from '../config/store';
import { ARENA_KEY } from '../platform/storage-keys';
import { todayKey, httpGet, httpPost, requestRetry } from '../platform/http';
import { logger } from '../platform/logger';
import { tt } from '../platform/i18n';
import { after } from '../app/fsm';
import { staminaNow } from './encounter';
import type { ArenaCache } from '../config/types';

/** 解析战斗列表页，字段语义见 docs/ARENA.md 开头 */
export function parseBattleForm(html: string): {
  postoken: string | null;
  ids: Record<string, string>;
} {
  const postoken = html.match(/name="postoken" value="([^"]+)"/)?.[1] ?? null;
  const ids: Record<string, string> = {};
  for (const m of html.matchAll(/init_battle\((\d+)(?:,([^)]+))?\)/g)) {
    ids[m[1]] = (m[2] ?? '').trim();
  }
  return { postoken, ids };
}

async function fetchBattleForm(
  href: string,
): Promise<{ postoken: string; ids: Record<string, string> } | null> {
  const html = await requestRetry(() => httpGet<string>(`?s=Battle&ss=${href}`, 'html'));
  const parsed = parseBattleForm(html);
  return parsed.postoken ? { postoken: parsed.postoken, ids: parsed.ids } : null;
}

/** 开战结果三态，语义见 docs/ARENA.md 代码对应节 */
export type StartResult = 'started' | 'unavailable' | 'retry';

/** 开战：用新鲜 postoken 提交表单，检查响应是否真的进了战斗 */
async function startBattle(href: string, initid: string): Promise<StartResult> {
  const form = await requestRetry(() => fetchBattleForm(href));
  if (!form) {
    logger.warning('arena: no postoken on {href}', { href });
    return 'retry';
  }
  if (!(initid in form.ids)) {
    logger.warning(
      'arena {initid} no longer listed on {href}, skipping (likely completed manually)',
      {
        href,
        initid,
      },
    );
    return 'unavailable';
  }
  const body = `initid=${encodeURIComponent(initid)}&postoken=${encodeURIComponent(form.postoken)}`;
  const html = await requestRetry(async () => {
    const res = await fetch(`?s=Battle&ss=${href}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body,
      credentials: 'include',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  });
  const started = html.includes('battle_main') || html.includes('id="textlog"');
  if (!started) {
    const msg = html.match(/class="error"[^>]*>([^<]{1,160})/)?.[1]?.trim();
    logger.warning('arena start rejected ({href} {initid}): {msg}', {
      href,
      initid,
      msg: msg ?? 'no battle in response',
    });
    return 'retry';
  }
  return 'started';
}

/** 同一队列项连续重试上限，超限跳过（见 docs/ARENA.md） */
const ARENA_MAX_RETRY = 3;

/** 闲置竞技场：队列路由与开战三态语义见 docs/ARENA.md 代码对应节 */
export async function idleArena(): Promise<void> {
  const opt = snapshotOptions();
  if (!opt.main.idleArena) return;
  let cache = (kvGet(ARENA_KEY, true) as ArenaCache | null) ?? null;
  if (!cache || cache.date !== todayKey()) {
    cache = {
      date: todayKey(),
      gr: opt.main.idleArenaGrTime,
      token: {},
      array: undefined,
      isOk: false,
    };
    try {
      const [gr, ar, rb] = await Promise.all([
        fetchBattleForm('gr'),
        fetchBattleForm('ar'),
        fetchBattleForm('rb'),
      ]);
      if (gr) {
        Object.assign(cache.token, gr.ids);
        const grindId = Object.keys(gr.ids).find((k) => gr.ids[k] === '');
        if (grindId) cache.token.gr = grindId;
      }
      if (ar) Object.assign(cache.token, ar.ids);
      if (rb) Object.assign(cache.token, rb.ids);
    } catch (e) {
      logger.warning('arena token fetch failed: {err}', { err: String(e) });
      return;
    }
    kvSet(ARENA_KEY, cache);
  }
  if (cache.isOk) return;
  const stamina = staminaNow();
  if (
    opt.main.restoreStamina &&
    stamina !== null &&
    stamina <= opt.main.staminaLow &&
    stamina < 85
  ) {
    try {
      await requestRetry(() => httpPost(location.href, 'recover=stamina'));
    } catch (e) {
      logger.warning('arena stamina recover failed: {err}', { err: String(e) });
    }
    location.href = location.search;
    return;
  }
  const array = cache.array ?? (opt.main.idleArenaValue || '').split(',').filter(Boolean);
  let href = 'ar';
  let id = '';
  while (array.length > 0) {
    const n = Number(array[0]);
    if (Number.isNaN(n)) {
      href = 'gr';
      id = 'gr';
    } else if (n >= 105) {
      href = 'rb';
      id = String(n);
    } else {
      // 竞技场单页：全部 id 走 ar
      href = 'ar';
      id = String(n);
    }
    if (!(id in (cache.token as Record<string, unknown>))) array.shift();
    else break;
  }
  document.title = tt('main.idleArena');
  if (array.length === 0) {
    cache.isOk = true;
    cache.array = array;
    kvSet(ARENA_KEY, cache);
    return;
  }
  let initid = id;
  if (id === 'gr') {
    if (cache.gr <= 0) {
      array.shift();
      cache.array = array;
      if (array.length === 0) cache.isOk = true;
      kvSet(ARENA_KEY, cache);
      await idleArena();
      return;
    }
    initid = String((cache.token as Record<string, string | number | undefined>).gr ?? 1);
  }
  let result: StartResult = 'retry';
  try {
    result = await startBattle(href, initid);
  } catch (e) {
    logger.warning('arena start failed: {err}', { err: String(e) });
    result = 'retry';
  }
  // 队列项已不可用（用户提前手动完成等）：消费该项并立即试下一项，不 60s 重试。
  if (result === 'unavailable') {
    if (cache.fails) delete cache.fails[id];
    if (id === 'gr') {
      cache.gr = 0;
      array.shift();
    } else {
      array.shift();
    }
    if (array.length === 0) cache.isOk = true;
    cache.array = array;
    kvSet(ARENA_KEY, cache);
    if (!cache.isOk) await idleArena();
    return;
  }
  if (result !== 'started') {
    const fails = cache.fails ?? {};
    const n = (fails[id] ?? 0) + 1;
    fails[id] = n;
    cache.fails = fails;
    // 连续失败超限：大概率是永久拒绝（提前完成/等级/费用），跳过该项而不是无限重试。
    if (n >= ARENA_MAX_RETRY) {
      logger.warning('arena {id} failed {n} times, skipping', { id, n });
      delete fails[id];
      if (id === 'gr') {
        cache.gr = 0;
        array.shift();
      } else {
        array.shift();
      }
      if (array.length === 0) cache.isOk = true;
      cache.array = array;
      kvSet(ARENA_KEY, cache);
      if (!cache.isOk) await idleArena();
      return;
    }
    cache.array = array;
    kvSet(ARENA_KEY, cache);
    after('idle-arena-retry', 60 * 1000, () => void idleArena());
    return;
  }
  if (cache.fails) delete cache.fails[id];
  if (id === 'gr') cache.gr--;
  else array.shift();
  if (array.length === 0) cache.isOk = true;
  cache.array = array;
  kvSet(ARENA_KEY, cache);
  location.href = location.search;
}
