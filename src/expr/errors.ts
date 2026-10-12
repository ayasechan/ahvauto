import { tr } from '../platform/i18n-dict';
import type { I18nKey, TrVars } from '../platform/i18n-dict';

/**
 * 本地化表达式错误：key/vars/pos 进词典渲染，message 恒为中文渲染（日志与旧断言兼容）。
 * 展示层一律走 formatExprError(lang, e)，禁止直接读 message 上屏。
 */
export class ExprError extends Error {
  readonly key: I18nKey;
  readonly vars: TrVars;
  readonly pos: number;
  constructor(key: I18nKey, vars: TrVars, pos: number) {
    super(`列 ${pos}: ${tr('0', key, vars)}`);
    this.name = 'ExprError';
    this.key = key;
    this.vars = vars;
    this.pos = pos;
  }
}

export class ExprSyntaxError extends ExprError {
  constructor(key: I18nKey, vars: TrVars, pos: number) {
    super(key, vars, pos);
    this.name = 'ExprSyntaxError';
  }
}

export class ExprEvalError extends ExprError {
  constructor(key: I18nKey, vars: TrVars, pos: number) {
    super(key, vars, pos);
    this.name = 'ExprEvalError';
  }
}

/** 未知变量名（带完整路径），调用方据此附加"你是不是想说"建议。 */
export class UnknownNameError extends ExprEvalError {
  fullName: string;
  constructor(fullName: string, pos: number) {
    super('expr.unknownName', { name: fullName }, pos);
    this.name = 'UnknownNameError';
    this.fullName = fullName;
  }
}
