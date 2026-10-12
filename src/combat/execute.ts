import { click } from '../platform/dom';
import { tr } from '../platform/i18n';
import type { Lang } from '../config/types';
import type { Action } from './types';

/** 动作 → 可读标签（面板/悬浮窗展示用），纯函数。names 为 id→展示名（缺失回退 id，展示名恒英文专名不进i18n）。 */
export function describeAction(lang: Lang, a: Action, names: Record<string, string> = {}): string {
  const nm = (id: string): string => names[id] ?? id;
  switch (a.kind) {
    case 'none':
      return tr(lang, 'action.wait');
    case 'gem':
      return tr(lang, 'action.gem');
    case 'item':
      return tr(lang, 'action.itemWithKey', { key: a.key });
    case 'defend':
      return tr(lang, 'action.defend');
    case 'focus':
      return tr(lang, 'action.focus');
    case 'spirit':
      return tr(lang, a.on ? 'action.spiritOn' : 'action.spiritOff');
    case 'scroll':
      return tr(lang, 'action.scrollWithName', { name: nm(a.id) });
    case 'buff':
      return tr(lang, 'action.buffWithName', { name: nm(a.id) });
    case 'draught':
      return tr(lang, 'action.draughtWithName', { name: nm(a.id) });
    case 'infusion':
      return tr(lang, 'action.infusionWithName', { name: nm(a.id) });
    case 'imperil':
      return tr(lang, 'action.imperilTo', { target: a.target });
    case 'debuff':
      return tr(lang, 'action.debuffTo', { name: nm(a.id), target: a.target });
    case 'magic':
      return tr(lang, 'action.magicTo', { name: nm(a.id), target: a.target });
    case 'weapon':
      return `${a.key} → ${a.target}`;
    case 'attack':
      return tr(lang, 'action.attackTo', { target: a.target });
    case 'halt':
      return tr(lang, 'action.halt');
  }
}

/** 法术书按钮直点（数字 id，getElementById；querySelector 对纯数字 id 不可靠） */
function spellbook(id: string): boolean {
  const node = document.getElementById(id);
  if (!node) return false;
  (node as HTMLElement).click();
  return true;
}

/** 物品栏点击（.bti3 格存在性） */
function shelf(id: string): boolean {
  return click(`.bti3>div[onmouseover*="${id}"]`);
}

/**
 * 执行决策动作（决策动作写 DOM 的唯一入口：只发点击；面板/事件锚点/换轮直写除外，触点表见 docs/ARCHITECTURE.md；点击机制见 docs/COMBAT.md）。
 * trace 回调收点击标签（调用方接 debugAct）；halt 时调 onHalt。
 */
export function executeAction(
  action: Action,
  trace: (label: string) => void = () => {},
  onHalt: (message: string) => void = () => {},
): boolean {
  const go = (sel: string): boolean => {
    trace(sel);
    return click(sel);
  };
  switch (action.kind) {
    case 'none':
      return false;
    case 'gem':
      return go('#ikey_p');
    case 'item':
      // Cure 311 / FC 313 是法术书按钮
      trace(action.id);
      return Number(action.id) > 10000 ? shelf(action.id) : spellbook(action.id);
    case 'scroll':
    case 'draught':
    case 'infusion':
      return go(`.bti3>div[onmouseover*="${action.id}"]`);
    case 'buff':
      trace(action.id);
      return spellbook(action.id);
    case 'defend':
      return go('#ckey_defend');
    case 'focus':
      return go('#ckey_focus');
    case 'spirit':
      return go('#ckey_spirit');
    case 'imperil':
      if (!go('213')) trace('miss:213');
      return go(`#mkey_${action.target}`);
    case 'debuff':
    case 'magic':
    case 'weapon':
      if (!go(action.id)) trace(`miss:${action.id}`);
      return go(`#mkey_${action.target}`);
    case 'attack':
      return go(`#mkey_${action.target}`);
    case 'halt':
      onHalt(action.message);
      return true;
  }
}
