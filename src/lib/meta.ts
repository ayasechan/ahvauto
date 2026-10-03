import { kvGet, kvSet, kvDel, snapshotOptions } from './store';
import { ARENA_KEY, ENCOUNTER_KEY } from './storage-keys';
import { qs, el } from './dom';
import { httpGet, httpPost, requestRetry, todayKey } from './http';
import { setAlarm } from './notify';
import { tt } from './i18n';
import { alertId } from './dom-ids';
import { logger } from './logger';
import { after } from './fsm';
import type { ArenaCache } from './types';

/**
 * 答题告警（只报警，不答题）。
 * 现行小马题是多选勾选＋无对错反馈，旧的单选辅助（答题条/A-B-C 快捷键/
 * 自动提交）已全部移除；保留桌面通知＋循环音频，任意按键停音频。
 */
export function riddleAlert(): void {
  void setAlarm('Riddle');
  document.addEventListener(
    'keydown',
    () => {
      (document.getElementById(alertId('Riddle')) as HTMLAudioElement | null)?.pause();
    },
    { once: true },
  );
}

interface EncounterCache {
  dateNow: string;
  time: number;
  lastTime?: number;
}

/** 体力读数（#stamina_readout），读不到返回 null */
function staminaNow(): number | null {
  const m = qs('#stamina_readout .fc4.far>div')?.textContent?.match(/\d+/);
  return m ? Number(m[0]) : null;
}

/**
 * 自动遭遇战（忠实移植）：
 * 距上次 ≥30 分钟且今日次数 <24 → 回体力（如需）→ 跳 news.php 触发遭遇；
 * 否则渲染 .lastEncounter 倒计时并约 1 分钟后复查（自调度，不阻塞）。
 */
export function encounterCheck(): void {
  const opt = snapshotOptions();
  const now = Date.now();
  const cache =
    (kvGet(ENCOUNTER_KEY, true) as EncounterCache | null)?.dateNow === todayKey()
      ? ((kvGet(ENCOUNTER_KEY, true) as EncounterCache | null) ?? { dateNow: todayKey(), time: 0 })
      : { dateNow: todayKey(), time: 0 };
  if (!cache.lastTime || (now - cache.lastTime >= 30 * 60 * 1000 && cache.time < 24)) {
    const stamina = staminaNow();
    if (opt.main.restoreStamina && stamina !== null && stamina <= opt.main.staminaLow) {
      void requestRetry(() => httpPost(location.href, 'recover=stamina')).then(() => {
        location.href = location.search;
      });
      return;
    }
    cache.lastTime = now;
    kvSet(ENCOUNTER_KEY, cache);
    location.href = 'https://e-hentai.org/news.php';
    return;
  }
  let link = qs<HTMLAnchorElement>('.lastEncounter');
  if (!link) {
    link = document.body.appendChild(el('a'));
    link.className = 'lastEncounter';
    link.title = `${new Date(cache.lastTime ?? now).toLocaleString()}\nEncounter Time: ${cache.time}`;
    link.href = 'https://e-hentai.org/news.php';
    link.onclick = () => {
      if (cache.time >= 24 && confirm(tt('battle.confirmReset'))) kvDel(ENCOUNTER_KEY);
    };
  }
  const mins = Math.floor((now - (cache.lastTime ?? now)) / 1000 / 60);
  link.innerHTML = tt('battle.minutesAgo').replace('{mins}', String(mins));
  after('encounter', (1 * 60 * 1000 * (Math.random() * 20 + 90)) / 100, encounterCheck);
}

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
