import { kvGet, kvSet, kvDel, snapshotOptions } from '../config/store';
import { ENCOUNTER_KEY } from '../platform/storage-keys';
import { qs, el } from '../platform/dom';
import { httpPost, requestRetry, todayKey } from '../platform/http';
import { tr } from '../platform/i18n';
import { after } from '../app/fsm';

interface EncounterCache {
  dateNow: string;
  time: number;
  lastTime?: number;
}

/** 体力读数（#stamina_readout），读不到返回 null */
export function staminaNow(): number | null {
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
    link.title = `${new Date(cache.lastTime ?? now).toLocaleString()}\nEncounter Time: ${cache.time}`; // 游戏页 tooltip：浏览器默认 locale，不跟 options.lang
    link.href = 'https://e-hentai.org/news.php';
    link.onclick = () => {
      if (cache.time >= 24 && confirm(tr(opt.lang, 'battle.confirmReset'))) kvDel(ENCOUNTER_KEY);
    };
  }
  const mins = Math.floor((now - (cache.lastTime ?? now)) / 1000 / 60);
  link.innerHTML = tr(opt.lang, 'battle.minutesAgo', { mins });
  after('encounter', (1 * 60 * 1000 * (Math.random() * 20 + 90)) / 100, encounterCheck);
}
