import { click } from '../dom';
import type { Action } from './types';

/** 动作 → 可读标签（面板展示用），纯函数。names 为 id→展示名（缺失回退 id）。 */
export function describeAction(a: Action, names: Record<string, string> = {}): string {
  const nm = (id: string): string => names[id] ?? id;
  switch (a.kind) {
    case 'none':
      return '等待';
    case 'gem':
      return '宝石';
    case 'item':
      return `物品 ${a.key}`;
    case 'defend':
      return 'Defend';
    case 'focus':
      return 'Focus';
    case 'spirit':
      return a.on ? '开 Spirit' : '关 Spirit';
    case 'scroll':
      return `卷轴 ${nm(a.id)}`;
    case 'buff':
      return `Buff ${nm(a.id)}`;
    case 'draught':
      return `药剂 ${nm(a.id)}`;
    case 'infusion':
      return `魔药 ${nm(a.id)}`;
    case 'imperil':
      return `Imperil → ${a.target}`;
    case 'debuff':
      return `Debuff ${nm(a.id)} → ${a.target}`;
    case 'magic':
      return `魔法 ${nm(a.id)} → ${a.target}`;
    case 'weapon':
      return `${a.key} → ${a.target}`;
    case 'attack':
      return `普攻 → ${a.target}`;
    case 'halt':
      return '暂停(异常)';
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
 * 执行决策动作（唯一写 DOM 的地方，除面板外；点击机制见 docs/COMBAT.md）。
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
