import { parse } from './parser';
import type { AST } from './parser';
import { evaluateAst } from './evaluator';
import type { EvalContext } from './evaluator';

export { ExprSyntaxError } from './tokenizer';
export { ExprEvalError, UnknownNameError } from './evaluator';
export type { AST, EvalContext };
export type { Value } from './evaluator';

const CACHE_CAP = 500;
const cache = new Map<string, AST>();

/** 编译表达式（结果缓存）。语法错误 fail-fast，调用方在配置加载期捕获。 */
export function compileExpression(src: string): AST {
  const hit = cache.get(src);
  if (hit) return hit;
  const ast = parse(src);
  if (cache.size >= CACHE_CAP) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(src, ast);
  return ast;
}

/**
 * 求值。抛错情况（调用方 try/catch 后 fail-closed）：
 * 未知变量/函数、类型不合、除零、顶层结果非布尔。
 */
export function evaluateExpression(src: string, ctx: EvalContext): boolean {
  const ast = compileExpression(src);
  const v = evaluateAst(ast, ctx);
  if (typeof v !== 'boolean') {
    throw new Error(`表达式结果不是布尔值：${String(v)}`);
  }
  return v;
}
