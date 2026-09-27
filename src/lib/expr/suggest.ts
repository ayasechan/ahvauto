// 未知名字时的"你是不是想说"建议。纯函数，无外部依赖。
export type NameKind = '变量' | '函数' | '关键字';

export interface Candidate {
  name: string;
  kind: NameKind;
}

export const KEYWORDS: Candidate[] = ['and', 'or', 'not', 'true', 'false'].map((name) => ({
  name,
  kind: '关键字' as NameKind,
}));

/** 区分大小写的编辑距离（短字符串够用，不做剪枝）。 */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/**
 * 建议规则（已记入 GRAMMAR.md）：
 * 1. 有忽略大小写的完全匹配 → 优先报"区分大小写"类建议；
 * 2. 否则取编辑距离最小者，需同时满足 距离≤3 且 2*距离 ≤ 两名长度之和。
 */
export function suggestName(input: string, pool: Candidate[]): Candidate | null {
  const lower = input.toLowerCase();
  const ci = pool.find((c) => c.name !== input && c.name.toLowerCase() === lower);
  if (ci) return ci;
  let best: Candidate | null = null;
  let bestD = Infinity;
  for (const c of pool) {
    const d = levenshtein(input, c.name);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  if (!best) return null;
  if (bestD <= 3 && bestD * 2 <= input.length + best.name.length) return best;
  return null;
}

export function formatSuggestion(input: string, pool: Candidate[], what: '变量' | '函数'): string {
  const s = suggestName(input, pool);
  if (!s) return `未知${what} \`${input}\``;
  const head = s.kind === '关键字' ? '是不是想写关键字' : `是不是想说${s.kind}`;
  return `未知${what} \`${input}\`，${head} \`${s.name}\`？`;
}
