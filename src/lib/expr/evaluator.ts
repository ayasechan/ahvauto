import type { AST } from './parser';
import { KEYWORDS, formatSuggestion } from './suggest';
import type { Candidate } from './suggest';

export type Value = number | string | boolean;

export interface EvalContext {
  vars: Record<string, unknown>;
  funcs: Record<string, (...args: Value[]) => Value>;
}

export class ExprEvalError extends Error {
  pos: number;
  constructor(message: string, pos: number) {
    super(`列 ${pos}: ${message}`);
    this.name = 'ExprEvalError';
    this.pos = pos;
  }
}

/** 未知变量名（带完整路径），调用方据此附加"你是不是想说"建议。 */
export class UnknownNameError extends ExprEvalError {
  fullName: string;
  constructor(fullName: string, pos: number) {
    super(`未知变量 \`${fullName}\``, pos);
    this.name = 'UnknownNameError';
    this.fullName = fullName;
  }
}

function isValue(v: unknown): v is Value {
  const t = typeof v;
  return t === 'number' || t === 'string' || t === 'boolean';
}

function num(v: Value, pos: number, what: string): number {
  if (typeof v !== 'number' || Number.isNaN(v)) {
    throw new ExprEvalError(`${what}要求数字，实际是 ${show(v)}`, pos);
  }
  return v;
}

function bool(v: Value, pos: number, what: string): boolean {
  if (typeof v !== 'boolean') throw new ExprEvalError(`${what}要求布尔值，实际是 ${show(v)}`, pos);
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
  if (!isValue(cur))
    throw new ExprEvalError(`变量 \`${path.join('.')}\` 不是数字/字符串/布尔值`, pos);
  return cur;
}

/** 收集变量全路径（点路径拼好），供 typo 建议用；上限 200 条。 */
function collectVarPaths(vars: Record<string, unknown>, prefix: string, out: Candidate[]): void {
  if (out.length >= 200) return;
  for (const k of Object.keys(vars)) {
    const v = vars[k];
    const p = prefix ? `${prefix}.${k}` : k;
    if (isValue(v)) {
      out.push({ name: p, kind: '变量' });
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
          throw new ExprEvalError(formatSuggestion(e.fullName, pool, '变量'), node.pos);
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
          kind: '函数' as const,
        }));
        throw new ExprEvalError(formatSuggestion(node.name, pool, '函数'), node.pos);
      }
      const args = node.args.map((a) => evaluateAst(a, ctx));
      return fn(...args);
    }
    case 'not':
      return !bool(evaluateAst(node.expr, ctx), node.pos, 'not');
    case 'or': {
      const l = evaluateAst(node.left, ctx);
      if (bool(l, node.pos, 'or 左边')) return true;
      return bool(evaluateAst(node.right, ctx), node.pos, 'or 右边');
    }
    case 'and': {
      const l = evaluateAst(node.left, ctx);
      if (!bool(l, node.pos, 'and 左边')) return false;
      return bool(evaluateAst(node.right, ctx), node.pos, 'and 右边');
    }
    case 'neg':
      return -num(evaluateAst(node.expr, ctx), node.pos, '负号');
    case 'arith': {
      const l = num(evaluateAst(node.left, ctx), node.pos, '算术');
      const r = num(evaluateAst(node.right, ctx), node.pos, '算术');
      switch (node.op) {
        case 'plus':
          return l + r;
        case 'minus':
          return l - r;
        case 'star':
          return l * r;
        case 'slash':
          if (r === 0) throw new ExprEvalError('除数不能为零', node.pos);
          return l / r;
        case 'percent':
          if (r === 0) throw new ExprEvalError('取余除数不能为零', node.pos);
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
          return num(l, node.pos, '比较') <= num(r, node.pos, '比较');
        case 'ge':
          return num(l, node.pos, '比较') >= num(r, node.pos, '比较');
        case 'lt':
          return num(l, node.pos, '比较') < num(r, node.pos, '比较');
        case 'gt':
          return num(l, node.pos, '比较') > num(r, node.pos, '比较');
      }
      break;
    }
  }
  throw new ExprEvalError('未知节点', (node as { pos: number }).pos);
}
