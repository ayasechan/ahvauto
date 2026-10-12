// 词法切分（语法见同目录 GRAMMAR.md）。
import { ExprSyntaxError } from './errors';
import type { I18nKey, TrVars } from '../platform/i18n-dict';

export { ExprSyntaxError };
export type TokenKind =
  | 'num'
  | 'str'
  | 'true'
  | 'false'
  | 'ident'
  | 'and'
  | 'or'
  | 'not'
  | 'eq'
  | 'ne'
  | 'le'
  | 'ge'
  | 'lt'
  | 'gt'
  | 'plus'
  | 'minus'
  | 'star'
  | 'slash'
  | 'percent'
  | 'lparen'
  | 'rparen'
  | 'comma'
  | 'dot'
  | 'eof';

export interface Token {
  kind: TokenKind;
  pos: number;
  numVal?: number;
  strVal?: string;
  name?: string;
}

const KEYWORDS: Record<string, TokenKind> = {
  and: 'and',
  or: 'or',
  not: 'not',
  true: 'true',
  false: 'false',
};

const TWO_CHAR_OP: Record<string, TokenKind> = {
  '==': 'eq',
  '!=': 'ne',
  '<=': 'le',
  '>=': 'ge',
};

export function tokenize(input: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const err = (pos: number, key: I18nKey, vars: TrVars = {}): never => {
    throw new ExprSyntaxError(key, vars, pos);
  };
  while (i < input.length) {
    const c = input[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }
    if (c >= '0' && c <= '9') {
      const start = i;
      while (i < input.length && input[i] >= '0' && input[i] <= '9') i++;
      if (input[i] === '.') {
        i++;
        if (!(input[i] >= '0' && input[i] <= '9')) err(start, 'expr.fracDigits');
        while (i < input.length && input[i] >= '0' && input[i] <= '9') i++;
      }
      out.push({ kind: 'num', pos: start, numVal: Number(input.slice(start, i)) });
      continue;
    }
    if (c === '"') {
      const start = i;
      let s = '';
      i++;
      for (;;) {
        if (i >= input.length) err(start, 'expr.unclosedStr');
        const ch = input[i];
        if (ch === '"') {
          i++;
          break;
        }
        if (ch === '\\') {
          const n = input[i + 1];
          if (n === '"') s += '"';
          else if (n === '\\') s += '\\';
          else if (n === 'n') s += '\n';
          else if (n === 't') s += '\t';
          else if (n === 'r') s += '\r';
          else err(i, 'expr.badEscape', { esc: n ?? '' });
          i += 2;
          continue;
        }
        s += ch;
        i++;
      }
      out.push({ kind: 'str', pos: start, strVal: s });
      continue;
    }
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_') {
      const start = i;
      while (
        i < input.length &&
        ((input[i] >= 'a' && input[i] <= 'z') ||
          (input[i] >= 'A' && input[i] <= 'Z') ||
          (input[i] >= '0' && input[i] <= '9') ||
          input[i] === '_')
      ) {
        i++;
      }
      const word = input.slice(start, i);
      const kw = KEYWORDS[word];
      out.push(kw ? { kind: kw, pos: start } : { kind: 'ident', pos: start, name: word });
      continue;
    }
    const two = input.slice(i, i + 2);
    if (two === '==' || two === '!=' || two === '<=' || two === '>=') {
      const kind: TokenKind = TWO_CHAR_OP[two] ?? 'ge';
      out.push({ kind, pos: i });
      i += 2;
      continue;
    }
    switch (c) {
      case '<':
        out.push({ kind: 'lt', pos: i });
        i++;
        continue;
      case '>':
        out.push({ kind: 'gt', pos: i });
        i++;
        continue;
      case '+':
        out.push({ kind: 'plus', pos: i });
        i++;
        continue;
      case '-':
        out.push({ kind: 'minus', pos: i });
        i++;
        continue;
      case '*':
        out.push({ kind: 'star', pos: i });
        i++;
        continue;
      case '/':
        out.push({ kind: 'slash', pos: i });
        i++;
        continue;
      case '%':
        out.push({ kind: 'percent', pos: i });
        i++;
        continue;
      case '(':
        out.push({ kind: 'lparen', pos: i });
        i++;
        continue;
      case ')':
        out.push({ kind: 'rparen', pos: i });
        i++;
        continue;
      case ',':
        out.push({ kind: 'comma', pos: i });
        i++;
        continue;
      case '.':
        out.push({ kind: 'dot', pos: i });
        i++;
        continue;
      case '&':
        err(i, 'expr.noAnd');
      case '|':
        err(i, 'expr.noOr');
      case '!':
        err(i, 'expr.noNot');
      case '=':
        err(i, 'expr.singleEq');
      case "'":
        err(i, 'expr.singleQuote');
      default:
        err(i, 'expr.badChar', { ch: c });
    }
  }
  out.push({ kind: 'eof', pos: i });
  return out;
}
