import { snapshotOptions } from '../config/store';
import type { Lang, NotifyKind } from '../config/types';
import { tr } from './i18n-dict';
import type { I18nKey, TrVars } from './i18n-dict';

export { tr, LANG_LOCALE } from './i18n-dict';
export type { I18nKey, TrVar, TrVars } from './i18n-dict';

/** 告警事件 → 词典 key（动态 kind 唯一合法入口，补 key 只改这里）。 */
export const alarmKindKey: Record<NotifyKind, I18nKey> = {
  Common: 'alarm.kind.common',
  Error: 'alarm.kind.error',
  Defeat: 'alarm.kind.defeat',
  Riddle: 'alarm.kind.riddle',
  Victory: 'alarm.kind.victory',
  Test: 'alarm.kind.test',
};

/** 以当前配置语言取词（组件内用 tr($options.lang, key) 以保持响应式） */
export function tt(key: I18nKey): string {
  return tr(snapshotOptions().lang, key);
}

interface ExprLike {
  key: I18nKey;
  vars: TrVars;
  pos: number;
}

function isExprLike(e: unknown): e is ExprLike {
  if (!(e instanceof Error)) return false;
  const v = e as unknown as Record<string, unknown>;
  return (
    typeof v.key === 'string' && typeof v.pos === 'number' && typeof (v.vars ?? {}) === 'object'
  );
}

/** 运行期表达式错误本地化：带 key/vars/pos 的错误按当前语言渲染（含列号，pos<0 时省略），其余回 message。 */
export function formatExprError(lang: Lang, e: unknown): string {
  if (isExprLike(e))
    return (
      (e.pos < 0 ? '' : tr(lang, 'expr.atCol', { pos: e.pos })) + tr(lang, e.key, e.vars ?? {})
    );
  return e instanceof Error ? e.message : String(e);
}
