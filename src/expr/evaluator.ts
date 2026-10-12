import type { AST } from './parser';
import { KEYWORDS, formatSuggestion } from './suggest';
import type { Candidate } from './suggest';
import { ExprEvalError, UnknownNameError } from './errors';
import type { I18nKey } from '../platform/i18n-dict';

export { ExprEvalError, UnknownNameError };

export type Value = number | string | boolean;

export interface EvalContext {
  vars: Record<string, unknown>;
  funcs: Record<string, (...args: Value[]) => Value>;
}

function isValue(v: unknown): v is Value {
  const t = typeof v;
  return t === 'number' || t === 'string' || t === 'boolean';
}

/** what 取词条 expr.what.*（嵌套翻译），调用方传 key 名。 */
function num(v: Value, pos: number, what: I18nKey): number {
  if (typeof v !== 'number' || Number.isNaN(v)) {
    throw new ExprEvalError('expr.expectNum', { what: { k: what }, actual: show(v) }, pos);
  }
  return v;
}

function bool(v: Value, pos: number, what: I18nKey): boolean {
  if (typeof v !== 'boolean')
    throw new ExprEvalError('expr.expectBool', { what: { k: what }, actual: show(v) }, pos);
  return v;
}

function show(v: Value): string {
  return typeof v === 'string' ? `"${v}"` : String(v);
}

function resolvePath(vars: Record<string, unknown>, path: string[], pos: number): Value {
  let cur: unknown = vars;
  for (const seg of path) {
    if (
      typeof cur !== 'object' ||
      cur === null ||
      !Object.prototype.hasOwnProperty.call(cur, seg)
    ) {
      throw new UnknownNameError(path.join('.'), pos);
    }
    cur = (cur as Record<string, unknown>)[seg];
  }
  if (!isValue(cur)) throw new ExprEvalError('expr.badVarType', { name: path.join('.') }, pos);
  return cur;
}

/** 收集变量全路径（点路径拼好），供 typo 建议用；上限 200 条。 */
function collectVarPaths(vars: Record<string, unknown>, prefix: string, out: Candidate[]): void {
  if (out.length >= 200) return;
  for (const k of Object.keys(vars)) {
    const v = vars[k];
    const p = prefix ? `${prefix}.${k}` : k;
    if (isValue(v)) {
      out.push({ name: p, kind: 'var' });
    } else if (
      typeof v === 'object' &&
      v !== null &&
      (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null)
    ) {
      collectVarPaths(v as Record<string, unknown>, p, out);
    }
  }
}

export function evaluateAst(node: AST, ctx: EvalContext): Value {
  switch (node.type) {
    case 'num':
    case 'str':
    case 'bool':
      return node.value;
    case 'var': {
      try {
        return resolvePath(ctx.vars, node.path, node.pos);
      } catch (e) {
        if (e instanceof UnknownNameError) {
          const pool: Candidate[] = [];
          collectVarPaths(ctx.vars, '', pool);
          pool.push(...KEYWORDS);
          const s = formatSuggestion(e.fullName, pool, 'var');
          throw new ExprEvalError(s.key, s.vars, node.pos);
        }
        throw e;
      }
    }
    case 'call': {
      const fn = Object.prototype.hasOwnProperty.call(ctx.funcs, node.name)
        ? ctx.funcs[node.name]
        : undefined;
      if (typeof fn !== 'function') {
        const pool: Candidate[] = Object.keys(ctx.funcs).map((name) => ({
          name,
          kind: 'fn' as const,
        }));
        const s = formatSuggestion(node.name, pool, 'fn');
        throw new ExprEvalError(s.key, s.vars, node.pos);
      }
      const args = node.args.map((a) => evaluateAst(a, ctx));
      return fn(...args);
    }
    case 'not':
      return !bool(evaluateAst(node.expr, ctx), node.pos, 'expr.what.notKw');
    case 'or': {
      const l = evaluateAst(node.left, ctx);
      if (bool(l, node.pos, 'expr.what.orLeft')) return true;
      return bool(evaluateAst(node.right, ctx), node.pos, 'expr.what.orRight');
    }
    case 'and': {
      const l = evaluateAst(node.left, ctx);
      if (!bool(l, node.pos, 'expr.what.andLeft')) return false;
      return bool(evaluateAst(node.right, ctx), node.pos, 'expr.what.andRight');
    }
    case 'neg':
      return -num(evaluateAst(node.expr, ctx), node.pos, 'expr.what.neg');
    case 'arith': {
      const l = num(evaluateAst(node.left, ctx), node.pos, 'expr.what.arith');
      const r = num(evaluateAst(node.right, ctx), node.pos, 'expr.what.arith');
      switch (node.op) {
        case 'plus':
          return l + r;
        case 'minus':
          return l - r;
        case 'star':
          return l * r;
        case 'slash':
          if (r === 0) throw new ExprEvalError('expr.divZero', {}, node.pos);
          return l / r;
        case 'percent':
          if (r === 0) throw new ExprEvalError('expr.modZero', {}, node.pos);
          return l % r;
      }
      break;
    }
    case 'cmp': {
      const l = evaluateAst(node.left, ctx);
      const r = evaluateAst(node.right, ctx);
      switch (node.op) {
        case 'eq':
          return typeof l === typeof r && l === r;
        case 'ne':
          return !(typeof l === typeof r && l === r);
        case 'le':
          return num(l, node.pos, 'expr.what.cmp') <= num(r, node.pos, 'expr.what.cmp');
        case 'ge':
          return num(l, node.pos, 'expr.what.cmp') >= num(r, node.pos, 'expr.what.cmp');
        case 'lt':
          return num(l, node.pos, 'expr.what.cmp') < num(r, node.pos, 'expr.what.cmp');
        case 'gt':
          return num(l, node.pos, 'expr.what.cmp') > num(r, node.pos, 'expr.what.cmp');
      }
      break;
    }
  }
  throw new ExprEvalError('expr.unknownNode', {}, (node as { pos: number }).pos);
}
