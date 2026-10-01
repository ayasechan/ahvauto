import { configureSync, getConsoleSink, getLogger, getLogfmtFormatter } from '@logtape/logtape';
import type { LogLevel, LogRecord, Sink } from '@logtape/logtape';
import { LOGS_KEY as STORE_KEY } from './storage-keys';

const STORE_CAP = 500;

const CATEGORY = ['hvauto'];
const RANK: Record<LogLevel, number> = {
  trace: 0,
  debug: 10,
  info: 20,
  warning: 30,
  error: 40,
  fatal: 50,
};

export interface StoredEntry {
  t: number;
  level: LogLevel;
  category: string[];
  message: string;
  props: Record<string, string>;
}

let storeDisabled = false;

/** 本地持久化 sink：localStorage 环形缓冲，页面 reload 后仍可查；配额满时丢一半后重试一次 */
const storageSink: Sink = (record: LogRecord) => {
  if (storeDisabled) return;
  try {
    appendStored({
      t: record.timestamp,
      level: record.level,
      category: [...record.category],
      message: record.message.map(String).join(''),
      props: Object.fromEntries(
        Object.entries(record.properties ?? {}).map(([k, v]) => [k, safeStringify(v)]),
      ),
    });
  } catch {
    storeDisabled = true;
  }
};

function safeStringify(v: unknown): string {
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}

/** 与 console 的 logfmt 输出保持同风格：k=v 空格分隔 */
export function toLogfmt(e: Pick<StoredEntry, 'message' | 'props'>): string {
  const pairs = Object.entries(e.props).map(([k, v]) => `${k}=${quote(v)}`);
  return [quote(e.message), ...pairs].join(' ');
}

function quote(s: string): string {
  return /[\s"=]/.test(s) ? JSON.stringify(s) : s;
}

function appendStored(entry: StoredEntry, halved = false): void {
  let arr: StoredEntry[] = [];
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) arr = JSON.parse(raw) as StoredEntry[];
  } catch {
    arr = [];
  }
  arr.push(entry);
  // 注意：热路径只追加不修剪，修剪统一在非战斗页面空闲时经 pruneStoredLogs() 一次完成。
  try {
    localStorage[STORE_KEY] = JSON.stringify(arr);
  } catch {
    if (!halved && arr.length > 1) {
      arr = arr.slice(Math.floor(arr.length / 2));
      try {
        localStorage[STORE_KEY] = JSON.stringify(arr);
        return;
      } catch {
        /* 配额彻底不够，放弃本次 */
      }
    }
    throw new Error('stored log full');
  }
}

/** 非战斗页面空闲时集中驱逐一次：只留最新 STORE_CAP 条。失败静默。 */
export function pruneStoredLogs(): void {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw) as StoredEntry[];
    if (arr.length > STORE_CAP) localStorage[STORE_KEY] = JSON.stringify(arr.slice(-STORE_CAP));
  } catch {
    /* 修剪失败不影响页面 */
  }
}

export function getStoredLogs(): StoredEntry[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as StoredEntry[]) : [];
  } catch {
    return [];
  }
}

export function clearStoredLogs(): void {
  localStorage.removeItem(STORE_KEY);
}

let configured = false;
let currentLevel: LogLevel = 'info';
const inner = getLogger(CATEGORY);

export function initLogger(level: LogLevel = 'info'): void {
  currentLevel = level;
  if (configured) return;
  configured = true;
  configureSync({
    sinks: {
      console: getConsoleSink({ formatter: getLogfmtFormatter() }),
      store: storageSink,
    },
    loggers: [{ category: CATEGORY, lowestLevel: 'trace', sinks: ['console', 'store'] }],
  });
}

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function emit(level: LogLevel, message: string, ...args: unknown[]): void {
  if (RANK[level] < RANK[currentLevel]) return;
  (inner[level] as (...a: unknown[]) => void)(message, ...args);
}

export const logger = {
  trace: (message: string, ...args: unknown[]): void => emit('trace', message, ...args),
  debug: (message: string, ...args: unknown[]): void => emit('debug', message, ...args),
  info: (message: string, ...args: unknown[]): void => emit('info', message, ...args),
  warning: (message: string, ...args: unknown[]): void => emit('warning', message, ...args),
  error: (message: string, ...args: unknown[]): void => emit('error', message, ...args),
  fatal: (message: string, ...args: unknown[]): void => emit('fatal', message, ...args),
};
