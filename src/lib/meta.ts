import { kvGet, kvSet, kvDel, snapshotOptions } from './store';
import { qs, el } from './dom';
import { httpGet, httpPost, requestRetry, todayKey } from './http';
import { setAlarm } from './notify';
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
      (document.getElementById('hvAAAlert-Riddle') as HTMLAudioElement | null)?.pause();
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
  const cache = (kvGet('encounter', true) as EncounterCache | null)?.dateNow === todayKey()
    ? ((kvGet('encounter', true) as EncounterCache | null) ?? { dateNow: todayKey(), time: 0 })
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
    kvSet('encounter', cache);
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
      if (cache.time >= 24 && confirm('是否重置')) kvDel('encounter');
    };
  }
  const mins = Math.floor((now - (cache.lastTime ?? now)) / 1000 / 60);
  link.innerHTML = `${mins}分钟前`;
  after('encounter', ((1 * 60 * 1000 * (Math.random() * 20 + 90)) / 100), encounterCheck);
}

/**
 * 解析战斗列表页：postoken（表单真凭据）＋ 可开战 id 表。
 * 注意 init_battle 第二参数是 entry cost（入场费），不是 token；
 * 函数定义处的 init_battle(id, entrycost) 因首参非数字被自然排除。
 */
export function parseBattleForm(html: string): { postoken: string | null; ids: Record<string, string> } {
  const postoken = html.match(/name="postoken" value="([^"]+)"/)?.[1] ?? null;
  const ids: Record<string, string> = {};
  for (const m of html.matchAll(/init_battle\((\d+)(?:,([^)]+))?\)/g)) {
    ids[m[1]] = (m[2] ?? '').trim();
  }
  return { postoken, ids };
}

async function fetchBattleForm(href: string): Promise<{ postoken: string; ids: Record<string, string> } | null> {
  const html = await requestRetry(() => httpGet<string>(`?s=Battle&ss=${href}`, 'html'));
  const parsed = parseBattleForm(html);
  return parsed.postoken ? { postoken: parsed.postoken, ids: parsed.ids } : null;
}

/** 开战：用新鲜 postoken 提交表单，检查响应是否真的进了战斗 */
async function startBattle(href: string, initid: string): Promise<boolean> {
  const form = await requestRetry(() => fetchBattleForm(href));
  if (!form) {
    logger.warning('arena: no postoken on {href}', { href });
    return false;
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
  }
  return started;
}

/**
 * 闲置竞技场（忠实移植＋修原版两处 bug＋补 rb 页）：
 * - 原版等 token.length<3 但只发 2 个请求 → 死锁；此处等 gr/ar/rb 三页。
 * - 原版把 entry cost 当 token 发 inittoken → 无效；此处用表单 postoken。
 * - 原版注释掉 rb 请求导致 RB 永远跳过；此处正常抓取（用户队列末尾的 RB200 可跑）。
 * 队列为纯数字 id：NaN→gr，≥105→rb，否则 ar（竞技场已是单页，无分页）；token 缺失的跳过。
 * 只有确认开战成功才消费队列项，失败保留 60 秒后重试（不 reload，避免空转）。
 */
export async function idleArena(): Promise<void> {
  const opt = snapshotOptions();
  if (!opt.main.idleArena) return;
  let cache = (kvGet('arena', true) as ArenaCache | null) ?? null;
  if (!cache || cache.date !== todayKey()) {
    cache = { date: todayKey(), gr: opt.main.idleArenaGrTime, token: {}, array: undefined, isOk: false };
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
    kvSet('arena', cache);
  }
  if (cache.isOk) return;
  const stamina = staminaNow();
  if (
    opt.main.restoreStamina && stamina !== null &&
    stamina <= opt.main.staminaLow && stamina < 85
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
      // 竞技场单页：全部 id 走 ar。勿用 ar&page=2（游戏已取消分页，
      // 实测其 GET 与 ar 完全相同，POST 则会被服务端拒绝导致 60s 空转）。
      href = 'ar';
      id = String(n);
    }
    if (!(id in (cache.token as Record<string, unknown>))) array.shift();
    else break;
  }
  document.title = '闲置竞技场';
  if (array.length === 0) {
    cache.isOk = true;
    cache.array = array;
    kvSet('arena', cache);
    return;
  }
  let initid = id;
  if (id === 'gr') {
    if (cache.gr <= 0) {
      array.shift();
      cache.array = array;
      if (array.length === 0) cache.isOk = true;
      kvSet('arena', cache);
      await idleArena();
      return;
    }
    initid = String((cache.token as Record<string, string | number | undefined>).gr ?? 1);
  }
  let started = false;
  try {
    started = await startBattle(href, initid);
  } catch (e) {
    logger.warning('arena start failed: {err}', { err: String(e) });
  }
  if (!started) {
    cache.array = array;
    kvSet('arena', cache);
    after('idle-arena-retry', 60 * 1000, () => void idleArena());
    return;
  }
  if (id === 'gr') cache.gr--;
  else array.shift();
  if (array.length === 0) cache.isOk = true;
  cache.array = array;
  kvSet('arena', cache);
  location.href = location.search;
}
