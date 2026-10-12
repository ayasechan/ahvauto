// 条件表达式语法：权威 EBNF 见同目录 GRAMMAR.md，改语法先改文档。
import { tokenize, ExprSyntaxError } from './tokenizer';
import type { Token, TokenKind } from './tokenizer';
import type { I18nKey } from '../platform/i18n-dict';

export type AST =
  | { type: 'or'; left: AST; right: AST; pos: number }
  | { type: 'and'; left: AST; right: AST; pos: number }
  | { type: 'not'; expr: AST; pos: number }
  | { type: 'cmp'; op: 'eq' | 'ne' | 'le' | 'ge' | 'lt' | 'gt'; left: AST; right: AST; pos: number }
  | {
      type: 'arith';
      op: 'plus' | 'minus' | 'star' | 'slash' | 'percent';
      left: AST;
      right: AST;
      pos: number;
    }
  | { type: 'neg'; expr: AST; pos: number }
  | { type: 'num'; value: number; pos: number }
  | { type: 'str'; value: string; pos: number }
  | { type: 'bool'; value: boolean; pos: number }
  | { type: 'var'; path: string[]; pos: number }
  | { type: 'call'; name: string; args: AST[]; pos: number };

export const MAX_DEPTH = 64;

class Parser {
  private tokens: Token[];
  private i = 0;

  constructor(input: string) {
    this.tokens = tokenize(input);
  }

  parse(): AST {
    if (this.peek().kind === 'eof') throw new ExprSyntaxError('expr.empty', {}, 0);
    const node = this.orExpr(0);
    const t = this.peek();
    if (t.kind !== 'eof')
      throw new ExprSyntaxError('expr.trailing', { actual: describe(t) }, t.pos);
    return node;
  }

  private peek(): Token {
    return this.tokens[this.i];
  }

  private next(): Token {
    return this.tokens[this.i++];
  }

  private expect(kind: TokenKind, what: string | { k: I18nKey }): Token {
    const t = this.next();
    if (t.kind !== kind)
      throw new ExprSyntaxError('expr.expect', { what, actual: describe(t) }, t.pos);
    return t;
  }

  private depthGuard(depth: number, pos: number): void {
    if (depth > MAX_DEPTH) throw new ExprSyntaxError('expr.tooDeep', { max: MAX_DEPTH }, pos);
  }

  private orExpr(depth: number): AST {
    this.depthGuard(depth, this.peek().pos);
    let left = this.andExpr(depth + 1);
    while (this.peek().kind === 'or') {
      const op = this.next();
      left = { type: 'or', left, right: this.andExpr(depth + 1), pos: op.pos };
    }
    return left;
  }

  private andExpr(depth: number): AST {
    this.depthGuard(depth, this.peek().pos);
    let left = this.notExpr(depth + 1);
    while (this.peek().kind === 'and') {
      const op = this.next();
      left = { type: 'and', left, right: this.notExpr(depth + 1), pos: op.pos };
    }
    return left;
  }

  private notExpr(depth: number): AST {
    this.depthGuard(depth, this.peek().pos);
    if (this.peek().kind === 'not') {
      const op = this.next();
      return { type: 'not', expr: this.notExpr(depth + 1), pos: op.pos };
    }
    return this.comparison(depth + 1);
  }

  private comparison(depth: number): AST {
    this.depthGuard(depth, this.peek().pos);
    const left = this.additive(depth + 1);
    const t = this.peek();
    if (
      t.kind === 'eq' ||
      t.kind === 'ne' ||
      t.kind === 'le' ||
      t.kind === 'ge' ||
      t.kind === 'lt' ||
      t.kind === 'gt'
    ) {
      this.next();
      const right = this.additive(depth + 1);
      const t2 = this.peek();
      if (
        t2.kind === 'eq' ||
        t2.kind === 'ne' ||
        t2.kind === 'le' ||
        t2.kind === 'ge' ||
        t2.kind === 'lt' ||
        t2.kind === 'gt'
      ) {
        throw new ExprSyntaxError('expr.noChain', {}, t2.pos);
      }
      return { type: 'cmp', op: t.kind, left, right, pos: t.pos };
    }
    return left;
  }

  private additive(depth: number): AST {
    this.depthGuard(depth, this.peek().pos);
    let left = this.multiplicative(depth + 1);
    for (;;) {
      const t = this.peek();
      if (t.kind !== 'plus' && t.kind !== 'minus') return left;
      this.next();
      left = { type: 'arith', op: t.kind, left, right: this.multiplicative(depth + 1), pos: t.pos };
    }
  }

  private multiplicative(depth: number): AST {
    this.depthGuard(depth, this.peek().pos);
    let left = this.unary(depth + 1);
    for (;;) {
      const t = this.peek();
      if (t.kind !== 'star' && t.kind !== 'slash' && t.kind !== 'percent') return left;
      this.next();
      left = { type: 'arith', op: t.kind, left, right: this.unary(depth + 1), pos: t.pos };
    }
  }

  private unary(depth: number): AST {
    this.depthGuard(depth, this.peek().pos);
    if (this.peek().kind === 'minus') {
      const op = this.next();
      return { type: 'neg', expr: this.unary(depth + 1), pos: op.pos };
    }
    return this.primary(depth + 1);
  }

  private primary(depth: number): AST {
    this.depthGuard(depth, this.peek().pos);
    const t = this.next();
    switch (t.kind) {
      case 'num':
        return { type: 'num', value: t.numVal ?? 0, pos: t.pos };
      case 'str':
        return { type: 'str', value: t.strVal ?? '', pos: t.pos };
      case 'true':
        return { type: 'bool', value: true, pos: t.pos };
      case 'false':
        return { type: 'bool', value: false, pos: t.pos };
      case 'lparen': {
        const e = this.orExpr(depth + 1);
        this.expect('rparen', '`)`');
        return e;
      }
      case 'ident': {
        const name = t.name ?? '';
        if (this.peek().kind === 'lparen') {
          this.next();
          const args: AST[] = [];
          if (this.peek().kind !== 'rparen') {
            args.push(this.orExpr(depth + 1));
            while (this.peek().kind === 'comma') {
              this.next();
              args.push(this.orExpr(depth + 1));
            }
          }
          this.expect('rparen', '`)`');
          return { type: 'call', name, args, pos: t.pos };
        }
        const path = [name];
        while (this.peek().kind === 'dot') {
          this.next();
          const seg = this.expect('ident', { k: 'expr.what.varName' });
          path.push(seg.name ?? '');
        }
        return { type: 'var', path, pos: t.pos };
      }
      default:
        throw new ExprSyntaxError('expr.unexpected', { actual: describe(t) }, t.pos);
    }
  }
}

function describe(t: Token): string | { k: I18nKey } {
  switch (t.kind) {
    case 'eof':
      return { k: 'expr.tok.eof' };
    case 'num':
      return String(t.numVal);
    case 'str':
      return `"${t.strVal}"`;
    case 'ident':
      return t.name ?? '';
    default:
      return t.kind;
  }
}

export function parse(input: string): AST {
  return new Parser(input).parse();
}
