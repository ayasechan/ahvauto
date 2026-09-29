// CDP 共享客户端。安全原则：默认只读；任何点击/写入由各脚本显式执行并自行负责。
// 环境变量：CDP_URL（默认 http://127.0.0.1:12422），CDP_PAGE_WS（直接指定 ws，跳过自动发现）.
import { DISABLED_KEY } from '../../src/lib/storage-keys.js';

export const CDP_BASE: string = process.env.CDP_URL ?? 'http://127.0.0.1:12422';

interface CdpTarget {
  type: string;
  url: string;
  webSocketDebuggerUrl: string;
}

type Pending = { res: (v: CdpMessage) => void; rej: (e: Error) => void };
interface CdpResult {
  result?: { value?: unknown };
  exceptionDetails?: { text: string };
}
interface CdpMessage {
  id?: number;
  method?: string;
  params?: { type: string; message?: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result?: any;
  error?: unknown;
  exceptionDetails?: { text: string };
}

export interface Cdp {
  send: (method: string, params?: Record<string, unknown>) => Promise<CdpMessage>;
  ev: <T = unknown>(expression: string, awaitPromise?: boolean) => Promise<T>;
  onDialog: (h: (p: { type: string; message: string }) => void) => void;
  shot: (file: string) => Promise<string>;
  close: () => void;
}

export async function pickPage(match = 'hentaiverse.org'): Promise<string> {
  if (process.env.CDP_PAGE_WS) return process.env.CDP_PAGE_WS;
  const res = await fetch(`${CDP_BASE}/json/list`);
  const targets = (await res.json()) as CdpTarget[];
  const page = targets.find((t) => t.type === 'page' && (t.url || '').includes(match));
  if (!page) throw new Error(`no page matching "${match}" under ${CDP_BASE}`);
  return page.webSocketDebuggerUrl;
}

export async function connect(url: string): Promise<Cdp> {
  const ws = new WebSocket(url);
  let id = 0;
  const pending = new Map<number, Pending>();
  const dialogHandlers: ((p: { type: string; message: string }) => void)[] = [];
  ws.onmessage = (e: MessageEvent) => {
    const m = JSON.parse(String(e.data)) as CdpMessage;
    if (m.method === 'Page.javascriptDialogOpening') {
      for (const h of dialogHandlers) h({ type: m.params.type, message: m.params.message ?? '' });
      return;
    }
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id)!;
      pending.delete(m.id);
      if (m.error) rej(new Error(JSON.stringify(m.error)));
      else res(m.result as CdpMessage);
    }
  };
  const send = (method: string, params: Record<string, unknown> = {}): Promise<CdpMessage> =>
    new Promise((res, rej) => {
      const i = ++id;
      pending.set(i, { res, rej });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  await new Promise<void>((res, rej) => {
    ws.onopen = () => res();
    ws.onerror = () => rej(new Error('websocket error'));
  });
  const ev = async <T = unknown>(expression: string, awaitPromise = false): Promise<T> => {
    const r = (await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise,
    })) as unknown as CdpResult & { result?: { type?: string; subtype?: string; value?: unknown } };
    const thrown = !!r.exceptionDetails && (!r.result || r.result.subtype === 'error');
    if (thrown) throw new Error(`page exception: ${r.exceptionDetails!.text}`);
    return r.result?.value as T;
  };
  return {
    send,
    ev,
    onDialog: (h) => dialogHandlers.push(h),
    shot: async (file: string) => {
      const { writeFileSync } = await import('node:fs');
      const { data } = (await send('Page.captureScreenshot', { format: 'png' })) as { data: string };
      writeFileSync(file, Buffer.from(data, 'base64'));
      return file;
    },
    close: () => ws.close(),
  };
}

/** 自动 dismiss 页面弹窗（prompt/confirm/alert），只记录不拦截逻辑。返回已处理列表。 */
export async function autoDismissDialogs(cdp: Cdp): Promise<string[]> {
  const seen: string[] = [];
  await cdp.send('Page.enable');
  cdp.onDialog((p) => {
    seen.push(`${p.type}: ${p.message.slice(0, 120)}`);
    cdp.send('Page.handleJavaScriptDialog', { accept: false }).catch(() => {});
  });
  return seen;
}

/** 断言角色暂停（ahvauto-disabled 置位），否则抛错中止。 */
export async function assertPaused(cdp: Cdp): Promise<true> {
  const v = await cdp.ev<string | null>(`localStorage.getItem(${JSON.stringify(DISABLED_KEY)})`);
  if (v !== '1' && v !== 'true') throw new Error(`角色未暂停（${DISABLED_KEY}=${v}），中止操作`);
  return true;
}
