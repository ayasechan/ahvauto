/**
 * 原 post(href, func, parm, type) 的 await 版。
 * 语义保留：自动把返回 document 里的 #messagebox 同步回当前页；失败抛异常由调用方重试。
 */

export type DocType = 'document' | 'text' | 'json' | 'html';

async function parseBody(res: Response, type: DocType): Promise<Document | string | unknown> {
  if (type === 'text' || type === 'html') return res.text();
  if (type === 'json') return res.json();
  const html = await res.text();
  return new DOMParser().parseFromString(html, 'text/html');
}

function syncMessageBox(doc: unknown): void {
  if (!(doc instanceof Document)) return;
  const incoming = doc.querySelector('#messagebox');
  if (!incoming) return;
  const cur = document.querySelector('#messagebox');
  const csp = document.querySelector('#csp');
  if (!csp) return;
  if (cur) csp.replaceChild(document.adoptNode(incoming), cur);
  else csp.appendChild(document.adoptNode(incoming));
}

export async function request<T = Document>(
  href: string,
  opts: { method?: 'GET' | 'POST'; params?: string | URLSearchParams; type?: DocType } = {},
): Promise<T> {
  const { method, params, type = 'document' } = opts;
  const res = await fetch(href, {
    method: method ?? (params ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: params ?? undefined,
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${href}`);
  const data = await parseBody(res, type);
  syncMessageBox(data);
  return data as T;
}

export const httpGet = <T = Document>(href: string, type?: DocType): Promise<T> =>
  request<T>(href, { type });

export const httpPost = <T = Document>(
  href: string,
  params: string | URLSearchParams,
  type?: DocType,
): Promise<T> => request<T>(href, { method: 'POST', params, type });

/** 带重试的包装：替代原 xhr.onerror 自递归 */
export async function requestRetry<T = Document>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 800,
): Promise<T> {
  let last: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i < retries) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw last;
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** 延迟抖动：原发包延迟取 50%-150% */
export function jitter(baseMs: number): number {
  if (baseMs <= 0) return 0;
  return (baseMs * (Math.random() * 100 + 50)) / 100;
}

export function todayKey(d = new Date()): string {
  return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}
