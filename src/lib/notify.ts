import type { GmResponseEvent, GmXmlhttpRequestOption } from 'vite-plugin-monkey/dist/client';
import { snapshotOptions } from './store';
import type { AlarmKind } from './types';
import { logger } from './logger';
import { renderTemplate } from './template';
import type { WebhookVars } from './template';

/** 油猴提供的跨域 XHR（@grant GM_xmlhttpRequest，由构建自动收集＋显式声明）。 */
declare const GM_xmlhttpRequest: (
  details: GmXmlhttpRequestOption<'text', undefined>,
) => unknown;

type NotifyKind = AlarmKind | 'Test';

export async function sendDesktop(n = 3): Promise<void> {
  try {
    await fetch(`http://127.0.0.1:43682/action/desktop/goto?n=${n}`);
  } catch (e) {
    logger.debug('desktop gateway unavailable: {err}', { err: String(e) });
  }
}

interface PostResult {
  status: number;
  text: string;
}

/** 油猴 XHR（无视 CORS/混合内容，直达站外）。回调式 API 包成 Promise。 */
function gmPostText(url: string, body: string): Promise<PostResult> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn: () => void): void => {
      if (!done) {
        done = true;
        fn();
      }
    };
    GM_xmlhttpRequest({
      method: 'POST',
      url,
      headers: { 'Content-Type': 'application/json' },
      data: body,
      timeout: 15_000,
      onload: (res: GmResponseEvent<'text', undefined>) =>
        finish(() => resolve({ status: res.status, text: res.responseText })),
      onerror: () => finish(() => reject(new Error('网络错误'))),
      ontimeout: () => finish(() => reject(new Error('请求超时'))),
      onabort: () => finish(() => reject(new Error('请求中止'))),
    });
  });
}

/** 非油猴环境（预览页）降级 fetch；油猴内请求失败不降级（避免重复发送）。 */
async function postText(url: string, body: string): Promise<PostResult> {
  try {
    return await gmPostText(url, body);
  } catch (e) {
    if (e instanceof TypeError || e instanceof ReferenceError) {
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), 15_000);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: ctrl.signal,
        });
        return { status: res.status, text: await res.text() };
      } finally {
        window.clearTimeout(timer);
      }
    }
    throw e;
  }
}

/** chatId 始终按字符串处理（不经 Number，避免长 ID 精度丢失）。
 * 数字旧存档转字符串，字符串去首尾空格，@用户名原样保留。 */
export function normalizeTelegramChatId(v: unknown): string {
  if (typeof v === 'number') return Number.isFinite(v) ? String(Math.trunc(v)) : '';
  if (typeof v === 'string') return v.trim();
  return '';
}

/** Telegram Bot 直连（油猴 XHR）。未启用/未勾选该事件直接跳过。 */
export async function sendTelegram(kind: AlarmKind, text: string, force = false): Promise<void> {
  const tg = snapshotOptions().alarm.telegram;
  if (!force && (!tg?.enabled || !tg.kinds?.[kind])) return;
  const botToken = typeof tg?.botToken === 'string' ? tg.botToken.trim() : '';
  const chatId = normalizeTelegramChatId(tg?.chatId);
  if (!botToken || !chatId) throw new Error('telegram 未配置 botToken/chatId');
  const res = await postText(`https://api.telegram.org/bot${botToken}/sendMessage`, JSON.stringify({
    chat_id: chatId,
    text,
  }));
  if (res.status < 200 || res.status >= 300) throw new Error(`telegram HTTP ${res.status}`);
  try {
    const data = JSON.parse(res.text) as { ok?: boolean; description?: string };
    if (!data.ok) throw new Error(data.description ?? 'telegram 发送失败');
  } catch (e) {
    if (e instanceof SyntaxError) throw new Error('telegram 返回解析失败');
    throw e;
  }
}

/** 组装模板变量（与 UI 提示的 5 个变量一致）。 */
export function webhookVars(kind: AlarmKind, title: string, text: string): WebhookVars {
  return { kind, title, text, url: location.href, time: new Date().toISOString() };
}

/** 自定义 Webhook（油猴 XHR）：body 模板经 {var} 替换后原样 POST。 */
export async function sendWebhook(kind: AlarmKind, title: string, text: string, force = false): Promise<void> {
  const wh = snapshotOptions().alarm.webhook;
  if (!force && (!wh?.enabled || !wh.kinds?.[kind])) return;
  if (!wh?.url) throw new Error('webhook 未配置 URL');
  if (!wh.template?.trim()) throw new Error('webhook 模板为空');
  const body = renderTemplate(wh.template, webhookVars(kind, title, text));
  const res = await postText(wh.url, body);
  if (res.status < 200 || res.status >= 300) throw new Error(`webhook HTTP ${res.status}`);
}

/** 告警推送（Telegram＋Webhook）：失败只记 debug 日志，不打断战斗。 */
export async function pushAlarm(kind: AlarmKind): Promise<void> {
  const opt = snapshotOptions();
  const label = NOTIFY_TEXT[kind][Number(opt.lang)] ?? NOTIFY_TEXT[kind][0];
  const title = `ahvauto ${label}`;
  const text = `${title}\n${location.href}\n${new Date().toLocaleString()}`;
  await Promise.all([
    sendTelegram(kind, text).catch((e) => {
      logger.debug('telegram push failed: {err}', { err: String(e) });
    }),
    sendWebhook(kind, title, text).catch((e) => {
      logger.debug('webhook push failed: {err}', { err: String(e) });
    }),
  ]);
}

const DEFAULT_AUDIO: Record<NotifyKind, string> = {
  Common: '',
  Error: '',
  Defeat: '',
  Riddle: '',
  Victory: '',
  Test: '',
};

function ensureAudio(kind: NotifyKind, src: string): HTMLAudioElement {
  let audio = document.getElementById(`hvAAAlert-${kind}`) as HTMLAudioElement | null;
  if (!audio) {
    audio = document.createElement('audio');
    audio.id = `hvAAAlert-${kind}`;
    document.body.appendChild(audio);
  }
  const url = src || DEFAULT_AUDIO[kind];
  if (url && audio.src !== url) audio.src = url;
  return audio;
}

const NOTIFY_TEXT: Record<NotifyKind, [string, string, string]> = {
  Common: ['通用警报', '通用警報', 'Common alarm'],
  Error: ['错误', '錯誤', 'Error'],
  Defeat: ['战败', '戰敗', 'Defeat'],
  Riddle: ['答题', '答題', 'Riddle'],
  Victory: ['胜利', '勝利', 'Victory'],
  Test: ['测试', '測試', 'Test'],
};

export async function setAlarm(kind: NotifyKind = 'Common'): Promise<void> {
  const opt = snapshotOptions();
  if (opt.main.notification && 'Notification' in window) {
    try {
      if (Notification.permission === 'default') await Notification.requestPermission();
      if (Notification.permission === 'granted') {
        const text = NOTIFY_TEXT[kind][Number(opt.lang)] ?? NOTIFY_TEXT[kind][0];
        const n = new Notification('ahvauto', { body: text });
        setTimeout(() => n.close(), 10_000);
      }
    } catch (e) {
      logger.debug('notification failed: {err}', { err: String(e) });
    }
  }
  if (opt.main.alert && opt.alarm.audioEnable[kind as keyof typeof opt.alarm.audioEnable]) {
    try {
      const audio = ensureAudio(kind, opt.alarm.audio[kind] ?? '');
      if (audio.src) {
        audio.loop = kind === 'Riddle';
        await audio.play();
        if (kind === 'Riddle') {
          const stop = (): void => {
            audio.pause();
            window.removeEventListener('mousemove', stop);
          };
          window.addEventListener('mousemove', stop, { once: true });
        }
      }
    } catch (e) {
      logger.debug('audio alarm blocked: {err}', { err: String(e) });
    }
  }
  if (kind !== 'Test') void pushAlarm(kind);
}

export function stopRiddleAlarm(): void {
  (document.getElementById('hvAAAlert-Riddle') as HTMLAudioElement | null)?.pause();
}
