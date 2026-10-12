// 词法切分（语法见同目录 GRAMMAR.md）。
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

export class ExprSyntaxError extends Error {
  pos: number;
  constructor(message: string, pos: number) {
    super(`列 ${pos}: ${message}`);
    this.name = 'ExprSyntaxError';
    this.pos = pos;
  }
}

const KEYWORDS: Record<string, TokenKind> = {
  and: 'and',
  or: 'or',
  not: 'not',
  true: 'true',
  false: 'false',
};

export function tokenize(input: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const err = (pos: number, msg: string): never => {
    throw new ExprSyntaxError(msg, pos);
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
        if (!(input[i] >= '0' && input[i] <= '9')) err(start, '数字的小数点后需要数字');
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
        if (i >= input.length) err(start, '字符串未闭合，缺失双引号');
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
          else err(i, `不支持的转义 \\${n ?? ''}`);
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
      const kind: TokenKind =
        two === '==' ? 'eq' : two === '!=' ? 'ne' : two === '<=' ? 'le' : 'ge';
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
        err(i, '不支持 `&&`，请用 `and`');
      case '|':
        err(i, '不支持 `||`，请用 `or`');
      case '!':
        err(i, '不支持 `!`，请用 `not`');
      case '=':
        err(i, '不支持单个 `=`，比较相等请用 `==`（已是严格相等）');
      case "'":
        err(i, '字符串请用双引号，如 "ar"');
      default:
        err(i, `不支持的字符 \`${c}\``);
    }
  }
  out.push({ kind: 'eof', pos: i });
  return out;
}
