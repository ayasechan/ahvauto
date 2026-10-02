import { mount } from 'svelte';
import App from './ui/App.svelte';
import { HOST_ID, FAB_CLASS, PAUSE_BOX_ID } from './lib/dom-ids';
import {
  panelOpen,
  options,
  snapshotOptions,
  battle,
  clearFieldCtx,
  isDisabled,
} from './lib/store';
import { initLogger, setLogLevel, logger } from './lib/logger';
import { qs, el } from './lib/dom';
import { tr } from './lib/i18n';
import { riddleAlert, idleArena, encounterCheck, repairEquipment } from './lib/meta';
import { main, newRound, installReloader, pauseChange } from './lib/battle';
import { scheduleIdlePrune } from './lib/maintenance';
import { sleep } from './lib/http';
import { transition, onEnter, after } from './lib/fsm';

mount(App, {
  target: (() => {
    const host = document.createElement('div');
    host.id = HOST_ID;
    document.body.append(host);
    return host;
  })(),
});

function mountButton(): void {
  if (qs(`.${FAB_CLASS}`)) return;
  const style = document.head.appendChild(el('style'));
  style.textContent =
    `.${FAB_CLASS}{position:fixed;top:4px;right:4px;z-index:99999;cursor:pointer;` +
    'width:36px;height:36px;border-radius:8px;background:#5C0D11;color:#fff;' +
    'font:bold 12px/36px sans-serif;text-align:center;box-shadow:0 0 4px #000;}';
  const btn = document.body.appendChild(el('div'));
  btn.className = FAB_CLASS;
  btn.title = 'ahvauto';
  btn.textContent = 'ahvauto·dev';
  btn.onclick = () => panelOpen.update((v) => !v);
}

function mountPauseButton(): void {
  const box = qs('#battle_main');
  if (!box) return;
  const box2 = box.appendChild(el('div'));
  box2.id = PAUSE_BOX_ID;
  if (!snapshotOptions().main.pauseButton) return;
  const button = box2.appendChild(el('button'));
  button.className = 'pauseChange';
  button.textContent = tr(snapshotOptions().lang, isDisabled() ? 'app.resume' : 'app.pause');
  button.onclick = () => pauseChange();
}

function bindPauseHotkey(): void {
  const opt = snapshotOptions().main;
  if (!opt.pauseHotkey || !opt.pauseHotkeyCode) return;
  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (e.keyCode === snapshotOptions().main.pauseHotkeyCode) pauseChange();
  });
}

async function init(): Promise<void> {
  try {
    await initInner();
  } catch (e) {
    logger.error('init failed: {err}', { err: String(e) });
    document.title = `ERR-INIT: ${String(e).slice(0, 80)}`;
  }
}

async function initInner(): Promise<void> {
  initLogger(snapshotOptions().main.debug ? 'debug' : 'info');
  options.subscribe((o) => setLogLevel(o.main.debug ? 'debug' : 'info'));
  logger.info('ahvauto started on {url}', { url: location.href });
  if (location.href === 'https://e-hentai.org/news.php') {
    let href = document.referrer || 'https://hentaiverse.org';
    const a = qs<HTMLAnchorElement>('#eventpane>div>a');
    if (a) {
      const parts = href.split('/');
      href = `${parts[0]}//${parts[2]}/${a.href.split('/')[3]}`;
    }
    await sleep(3000);
    location.href = href;
    return;
  }

  mountButton();

  if (!qs('#navbar,#riddlecounter,#textlog')) {
    after('limbo-reload', 5 * 60 * 1000, () => {
      location.href = location.search;
    });
    return;
  }

  const opt = snapshotOptions();
  if (opt.main.attackStatus === -1) {
    const lang = prompt(tr(opt.lang, 'app.langPrompt'), opt.lang);
    if (lang && ['0', '1', '2'].includes(lang)) {
      options.update((o) => ({ ...o, lang: lang as '0' | '1' | '2' }));
    }
    alert(tr(snapshotOptions().lang, 'app.settings'));
    panelOpen.set(true);
    return;
  }

  if (qs('[class^="c5"],[class^="c4"]')) {
    if (confirm(tr(opt.lang, 'app.fontWarn'))) {
      location.href =
        'https://github.com/dodying/UserJs/blob/master/HentaiVerse/hvAutoAttack/README' +
        (opt.lang === '2' ? '_en.md#about-font' : '.md#关于字体的说明');
      return;
    }
  }

  if (qs('#riddlecounter')) {
    transition('riddle', 'riddlecounter present');
    return;
  }

  if (!qs('#navbar')) {
    transition('battle', 'no navbar');
    return;
  }

  transition('field', 'navbar present');
}

onEnter('battle', () => {
  const opt = snapshotOptions();
  mountPauseButton();
  bindPauseHotkey();
  installReloader();
  battle.update((b) => ({
    ...b,
    attackStatus: opt.main.attackStatus,
    timeNow: Date.now(),
    runSpeed: 1,
  }));
  void (async () => {
    await newRound();
    await main();
  })();
});

onEnter('field', () => {
  const opt = snapshotOptions();
  clearFieldCtx();
  // 非战斗页面空闲时集中修剪一次（IDB records/turns/logs/battles，经 pruneStats 统一）。
  scheduleIdlePrune();
  if (opt.main.encounter) encounterCheck();
  const staminaText = qs('#stamina_readout .fc4.far>div')?.textContent ?? '';
  const stamina = Number(staminaText.match(/\d+/)?.[0] ?? 100);
  if (!opt.main.restoreStamina && stamina <= opt.main.staminaLow) return;
  // 战斗前修一次装备（失败内部消化，绝不挡 idleArena；页面跳走导致的中止静默忽略）
  void (async () => {
    try {
      await repairEquipment();
    } catch {
      /* 兜底：repairEquipment 内部已处理所有已知失败 */
    }
    if (opt.main.idleArena) {
      const delay = ((opt.main.idleArenaTime * (Math.random() * 20 + 90)) / 100) * 1000;
      after('idle-arena', delay, () => void idleArena());
    }
  })();
});

onEnter('riddle', () => {
  const opt = snapshotOptions();
  if (opt.main.riddlePopup && !window.opener) {
    window.open(location.href, 'riddleWindow', 'resizable,scrollbars,width=1241,height=707');
  } else {
    riddleAlert();
  }
});

void init();
