import { configureSync, getConsoleSink, getLogger, getLogfmtFormatter } from '@logtape/logtape';
import type { LogLevel, LogRecord, Sink } from '@logtape/logtape';
import type { LogEntry } from './recorder';
import { appendLog, exportLogs, pruneLogs, clearLogs } from './recorder';

const MEM_CAP = 100;

const CATEGORY = ['hvauto'];
const RANK: Record<LogLevel, number> = {
  trace: 0,
  debug: 10,
  info: 20,
  warning: 30,
  error: 40,
  fatal: 50,
};

/** 运行日志行（与 recorder.LogEntry 同构）。 */
export type StoredEntry = LogEntry;

/** IDB 未就绪/不可用时的当会话兜底（内存环，只读最新 MEM_CAP 条）。 */
let mem: StoredEntry[] = [];

function pushMem(entry: StoredEntry): void {
  mem.push(entry);
  if (mem.length > MEM_CAP) mem = mem.slice(-MEM_CAP);
}

/** IDB sink：fire-and-forget，失败静默（面板回落读内存环）。 */
const storageSink: Sink = (record: LogRecord) => {
  const entry: StoredEntry = {
    t: record.timestamp,
    level: record.level,
    category: [...record.category],
    message: record.message.map(String).join(''),
    props: Object.fromEntries(
      Object.entries(record.properties ?? {}).map(([k, v]) => [k, safeStringify(v)]),
    ),
  };
  pushMem(entry);
  try {
    void appendLog(entry);
  } catch {
    /* 日志失败不影响战斗 */
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

/** 面板读取：IDB 全量（升序）为空/失败时回落内存环。 */
export async function getStoredLogs(): Promise<StoredEntry[]> {
  try {
    const rows = await exportLogs();
    if (rows.length > 0) return rows;
  } catch {
    /* 回落内存 */
  }
  return [...mem];
}

/** 非战斗页面空闲时集中驱逐一次：只留最新 LOGS_CAP 条。失败静默。 */
export async function pruneStoredLogs(): Promise<void> {
  mem = mem.slice(-MEM_CAP);
  try {
    await pruneLogs();
  } catch {
    /* 修剪失败不影响页面 */
  }
}

export async function clearStoredLogs(): Promise<void> {
  mem = [];
  try {
    await clearLogs();
  } catch {
    /* 清空失败不影响页面 */
  }
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
