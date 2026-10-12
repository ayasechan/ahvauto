import { get } from 'svelte/store';
import { battle } from '../config/battle-state';
import { snapshotOptions, publishSpellDelays, readSpellDelays, kvDel } from '../config/store';
import { qs, qsa, el } from '../platform/dom';
import { logger } from '../platform/logger';
import { setAlarm } from '../notify/notify';
import { handleRec } from '../data/bridge';
import { requestRetry, httpGet } from '../platform/http';
import { endBattle } from '../data/stats';
import { patchBattle, goto, debugSurface } from './driver';
import type { DebugSurface } from './driver';
import { newRound } from './round';
import { main } from './loop';
import { recordEndKills } from './cost';
import {
  ROUND_TYPE_KEY,
  ROUND_NOW_KEY,
  ROUND_ALL_KEY,
  MONSTER_STATUS_KEY,
  MONSTER_BASE_KEY,
} from '../platform/storage-keys';

/** 页世界作用域：油猴下用 unsafeWindow 直接挂钩（真闭包，无需序列化），直接运行则走 window。 */
function pageScope(): Record<string, unknown> {
  try {
    const uw = (globalThis as unknown as { unsafeWindow?: Record<string, unknown> }).unsafeWindow;
    if (uw) return uw;
  } catch {
    /* 取不到则回落 window */
  }
  return window as unknown as Record<string, unknown>;
}
/**
 * 循环驱动器：保留对游戏 api_call/api_response 的劫持（经 pageScope 直接赋值），
 * 但后续换轮请求改为 await httpGet。
 */
export function installReloader(): void {
  const opt = snapshotOptions();
  const eventStart = el('a');
  eventStart.id = 'eventStart';
  eventStart.onclick = () => {
    if (opt.main.delayAlert) {
      (eventStart as unknown as { _t1?: number })._t1 = window.setTimeout(
        () => void setAlarm('Common'),
        opt.main.delayAlertTime * 1000,
      );
    }
    if (opt.main.delayReload) {
      (eventStart as unknown as { _t2?: number })._t2 = window.setTimeout(
        goto,
        opt.main.delayReloadTime * 1000,
      );
    }
  };
  document.body.appendChild(eventStart);

  const eventEnd = el('a');
  eventEnd.id = 'eventEnd';
  eventEnd.onclick = () => {
    void (async () => {
      const mark = (s: string): void => {
        try {
          if (snapshotOptions().main.debug) debugSurface().step = s;
        } catch {
          /* ignore */
        }
      };
      try {
        mark('ee-start');
        const s = eventStart as unknown as { _t1?: number; _t2?: number };
        if (s._t1) clearTimeout(s._t1);
        if (s._t2) clearTimeout(s._t2);
        const now = Date.now();
        patchBattle({
          runSpeed: Number((1000 / Math.max(1, now - get(battle).timeNow)).toFixed(2)),
          timeNow: now,
        });
        const monsterDead = qsa('img[src*="nbardead"]').length;
        const b = get(battle);
        patchBattle({ monsterAlive: b.monsterAll - monsterDead });
        const o = snapshotOptions();
        if (qs('#btcp')) {
          const nb = get(battle);
          if (nb.monsterAlive > 0) {
            await setAlarm('Defeat');
            recordEndKills();
            void endBattle('defeat');
            kvDel(ROUND_TYPE_KEY);
            kvDel(ROUND_NOW_KEY);
            kvDel(ROUND_ALL_KEY);
            kvDel(MONSTER_STATUS_KEY);
            kvDel(MONSTER_BASE_KEY);
          } else if (nb.roundNow !== nb.roundAll) {
            qs('#pane_completion')?.removeChild(qs('#btcp')!);
            let data: Document;
            try {
              data = await requestRetry(() => httpGet<Document>(location.href));
            } catch (e) {
              logger.error('next round fetch failed, reload: {err}', { err: String(e) });
              goto();
              return;
            }
            if (qs('#riddlecounter', data)) {
              if (o.main.riddlePopup && !window.opener) {
                window.open(
                  location.href,
                  'riddleWindow',
                  'resizable,scrollbars,width=1241,height=707',
                );
                return;
              }
              goto();
              return;
            }
            const right = qs('#battle_right', data);
            const left = qs('#battle_left', data);
            if (right && left) {
              qs('#battle_main')?.replaceChild(document.adoptNode(right), qs('#battle_right')!);
              qs('#battle_main')?.replaceChild(document.adoptNode(left), qs('#battle_left')!);
            }
            // 必须用页世界（外层 pageScope）的 Battle：这里的 window 是隔离世界，
            // 用它读 Battle 恒为 undefined（旧代码 `if (w.Battle)` 因此静默跳过重建，
            // 游戏 Battle 对象停留在旧 DOM 上，后续点击全被吞＝换轮 stall 病根）。
            const BattleCtor = w['Battle'] as (new () => unknown) | undefined;
            if (!BattleCtor) {
              logger.error('Battle ctor missing after round swap, reload');
              goto();
              return;
            }
            w['battle'] = new BattleCtor();
            (w['battle'] as { clear_infopane?: () => void }).clear_infopane?.();
            await newRound();
            await main();
          } else {
            await setAlarm('Victory');
            recordEndKills();
            void endBattle('victory');
            kvDel(ROUND_TYPE_KEY);
            kvDel(ROUND_NOW_KEY);
            kvDel(ROUND_ALL_KEY);
            kvDel(MONSTER_STATUS_KEY);
            kvDel(MONSTER_BASE_KEY);
            setTimeout(goto, 3000);
          }
        } else {
          mark('ee-main');
          await main();
        }
      } catch (e) {
        try {
          debugSurface().lastError = `eventEnd: ${String(e)}`;
        } catch {
          /* ignore */
        }
        logger.error('eventEnd failed: {err}', { err: String(e) });
        document.title = `ERR-EE: ${String(e).slice(0, 80)}`;
      }
    })();
  };
  document.body.appendChild(eventEnd);

  publishSpellDelays(opt.main.spellDelay, opt.main.noSpellDelay);
  // 页世界钩子经 unsafeWindow/window 直接赋值，真闭包：常量直接引用，无序列化陷阱。
  const w = pageScope();
  w['api_call'] = function (
    b: XMLHttpRequest,
    a: { mode: string; skill: number },
    d: () => void,
  ): void {
    const { spellDelay, noSpellDelay } = readSpellDelays();
    (window as unknown as Record<string, unknown>)['info'] = a;
    // 发包序号：req/res 同号，录制侧按 seq 配对。存页面全局，reload 清零。
    let seq = 0;
    try {
      const w2 = window as unknown as { __ahvautoSeq?: number };
      seq = (w2.__ahvautoSeq ?? 0) + 1;
      w2.__ahvautoSeq = seq;
    } catch {
      /* ignore */
    }
    try {
      const h = (window as unknown as { __ahvauto?: DebugSurface }).__ahvauto;
      if (h) {
        h.apiCalls += 1;
        h.lastReq = JSON.stringify(a).slice(0, 120);
        h.lastSend = Date.now();
      }
    } catch {
      /* 观测不影响战斗 */
    }
    try {
      handleRec('req', a, seq);
    } catch {
      /* 录制上报失败不影响战斗 */
    }
    try {
      (b as unknown as Record<string, unknown>).__ahvautoSeq = seq;
    } catch {
      /* ignore */
    }
    // lastSend 先写、发送在后：发送抛错必须回滚计数，否则看门狗误判已发包。
    const unmarkSend = (): void => {
      try {
        const h = (window as unknown as { __ahvauto?: DebugSurface }).__ahvauto;
        if (h) {
          h.apiCalls -= 1;
          h.lastSend = 0;
        }
      } catch {
        /* ignore */
      }
    };
    try {
      b.open('POST', (w['MAIN_URL'] as string) + 'json');
      b.setRequestHeader('Content-Type', 'application/json');
      b.withCredentials = true;
      b.onreadystatechange = d;
      b.onload = () => {
        try {
          const h = (window as unknown as { __ahvauto?: DebugSurface }).__ahvauto;
          if (h) h.fired += 1;
        } catch {
          /* ignore */
        }
        document.getElementById('eventEnd')?.click();
      };
      document.getElementById('eventStart')?.click();
      const base = a.mode === 'magic' && a.skill >= 200 ? spellDelay : noSpellDelay;
      if (base <= 0) b.send(JSON.stringify(a));
      else
        setTimeout(
          () => {
            try {
              b.send(JSON.stringify(a));
            } catch (e) {
              unmarkSend();
              logger.error('api_call delayed send failed: {err}', { err: String(e) });
            }
          },
          (base * (Math.random() * 100 + 50)) / 100,
        );
    } catch (e) {
      unmarkSend();
      logger.error('api_call send failed: {err}', { err: String(e) });
    }
  };
  w['api_response'] = function (b: {
    readyState: number;
    status: number;
    responseText: string;
  }): unknown {
    const seq = (b as unknown as Record<string, unknown>).__ahvautoSeq as number | undefined;
    if (b.readyState === 4) {
      if (b.status === 200) {
        const a = JSON.parse(b.responseText) as {
          login?: unknown;
          error?: unknown;
          reload?: unknown;
        };
        try {
          handleRec('res', { status: b.status, body: a }, seq ?? 0);
        } catch {
          /* 录制上报失败不影响战斗 */
        }
        if (a.login !== undefined) {
          (window.top as Window).location.href = w['login_url'] as string;
        } else {
          if (a.error || a.reload) location.href = location.search;
          return a;
        }
      } else {
        try {
          handleRec('res', { status: b.status, body: null }, seq ?? 0);
        } catch {
          /* ignore */
        }
        location.href = location.search;
      }
    }
    return false;
  };
}
