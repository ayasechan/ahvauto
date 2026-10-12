import { get } from 'svelte/store';
import { battle } from '../config/battle-state';
import { qs, el } from '../platform/dom';
import { tt } from '../platform/i18n';
import type { I18nKey } from '../platform/i18n';
import type { RuleName } from './types';
import { LOG_CLASS, PAUSE_BOX_ID } from '../platform/dom-ids';
import { debugSurface } from './driver';

/** 规则名 → 词典 key（decide 加规则必须同步补这里，否则编译报错）。 */
const RULE_LABEL: Record<RuleName | 'none', I18nKey> = {
  gem: 'action.gem',
  item: 'action.item',
  defend: 'action.defend',
  scroll: 'action.scroll',
  channel: 'action.channel',
  buff: 'action.buff',
  infusion: 'action.infusion',
  imperil: 'action.imperil',
  deskill: 'action.deskill',
  attack: 'action.attack',
  none: 'action.none',
};
/** 历史/录像里的规则名字符串 → 本地化标签（未知旧串回 action.none，绝不抛）。 */
function actionLabel(rule: string): string {
  return tt((RULE_LABEL as Record<string, I18nKey | undefined>)[rule] ?? 'action.none');
}
export function battleInfo(): void {
  const b = get(battle);
  let log = qs(`.${LOG_CLASS}`);
  if (!log) {
    const box = qs(`#${PAUSE_BOX_ID}`);
    if (!box) return;
    log = box.appendChild(el('div'));
    log.className = LOG_CLASS;
  }
  const names = (
    [
      'main.elem.phys',
      'main.elem.fire',
      'main.elem.cold',
      'main.elem.elec',
      'main.elem.wind',
      'main.elem.divine',
      'main.elem.forbidden',
    ] as const satisfies readonly I18nKey[]
  ).map((k) => tt(k));
  const hist = (debugSurface().history ?? []).slice(-10).reverse();
  log.innerHTML =
    `Turns: ${b.turn}<br>Speed: ${b.runSpeed} t/s` +
    `<br>Round: ${b.roundNow}/${b.roundAll}` +
    `<br>${tt('battle.mode')}: ${names[b.attackStatus] ?? ''}` +
    `<br>${tt('battle.foes')}: ${b.monsterAlive}/${b.monsterAll}` +
    (hist.length > 0
      ? '<br>——<br>' +
        hist.map((h) => `Turn ${h.turn} [${actionLabel(h.rule)}] ${h.action}`).join('<br>')
      : '');
  document.title = `${b.turn}||${b.runSpeed}||${b.roundNow}/${b.roundAll}||${b.monsterAlive}/${b.monsterAll}`;
}
