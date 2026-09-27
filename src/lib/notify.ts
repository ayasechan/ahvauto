import { snapshotOptions } from './store';
import { logger } from './logger';

const AUTH_KEY = 'todo-authkey-replace-me';

export async function sendDesktop(n = 3): Promise<void> {
  try {
    await fetch(`http://127.0.0.1:43682/action/desktop/goto?n=${n}`);
  } catch (e) {
    logger.debug('desktop gateway unavailable: {err}', { err: String(e) });
  }
}

export async function sendTelegram(title: string, detail: string): Promise<void> {
  try {
    await fetch('https://ero.kamome.eu.org/api/ero/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, source: detail, authkey: AUTH_KEY }),
    });
  } catch (e) {
    logger.debug('telegram push failed: {err}', { err: String(e) });
  }
}

export async function notice(title: string, detail: string): Promise<void> {
  await Promise.all([sendDesktop(3), sendTelegram(title, detail)]);
}

type AlarmKind = 'Common' | 'Error' | 'Defeat' | 'Riddle' | 'Victory' | 'Test';

const DEFAULT_AUDIO: Record<AlarmKind, string> = {
  Common: '',
  Error: '',
  Defeat: '',
  Riddle: '',
  Victory: '',
  Test: '',
};

function ensureAudio(kind: AlarmKind, src: string): HTMLAudioElement {
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

const NOTIFY_TEXT: Record<AlarmKind, [string, string, string]> = {
  Common: ['通用警报', '通用警報', 'Common alarm'],
  Error: ['错误', '錯誤', 'Error'],
  Defeat: ['战败', '戰敗', 'Defeat'],
  Riddle: ['答题', '答題', 'Riddle'],
  Victory: ['胜利', '勝利', 'Victory'],
  Test: ['测试', '測試', 'Test'],
};

export async function setAlarm(kind: AlarmKind = 'Common'): Promise<void> {
  const opt = snapshotOptions();
  if (opt.main.notification && 'Notification' in window) {
    try {
      if (Notification.permission === 'default') await Notification.requestPermission();
      if (Notification.permission === 'granted') {
        const text = NOTIFY_TEXT[kind][Number(opt.lang)] ?? NOTIFY_TEXT[kind][0];
        const n = new Notification('hvAutoAttack', { body: text });
        setTimeout(() => n.close(), 10_000);
      }
    } catch (e) {
      logger.debug('notification failed: {err}', { err: String(e) });
    }
  }
  if (opt.main.alert && opt.alarm.audioEnable[kind as keyof typeof opt.alarm.audioEnable]) {
    try {
      const audio = ensureAudio(kind, opt.alarm.audio[kind] ?? '');
      if (!audio.src) return;
      audio.loop = kind === 'Riddle';
      await audio.play();
      if (kind === 'Riddle') {
        const stop = (): void => {
          audio.pause();
          window.removeEventListener('mousemove', stop);
        };
        window.addEventListener('mousemove', stop, { once: true });
      }
    } catch (e) {
      logger.debug('audio alarm blocked: {err}', { err: String(e) });
    }
  }
}

export function stopRiddleAlarm(): void {
  (document.getElementById('hvAAAlert-Riddle') as HTMLAudioElement | null)?.pause();
}
