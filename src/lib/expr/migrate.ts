import type { ConditionGroups } from '../types';
import { DEFAULT_WEBHOOK_TEMPLATE } from '../types';
import { ITEM_IDS, BUFF_LIB, DRAUGHT_LIB, DEBUFF_LIB, SCROLL_LIB } from '../tables';

/** 战斗变量名表（与 conditions.ts battleCtx 的 key 一致，漂移由单测守护）。 */
export const BATTLE_VAR_NAMES = [
  'hp', 'mp', 'sp', 'oc',
  'monsterAll', 'monsterAlive', 'bossAll', 'bossAlive',
  'roundNow', 'roundAll', 'roundLeft', 'roundType', 'attackStatus', 'turn',
];

const BATTLE_VARS: Record<string, true> = Object.fromEntries(BATTLE_VAR_NAMES.map((k) => [k, true]));

/** 老操作符编号 → 新表达式符号 */
const OP_SYMBOL: Record<string, string> = {
  '1': '>',
  '2': '<',
  '3': '>=',
  '4': '<=',
  '5': '==',
  '6': '!=',
};

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_.]*$/;

export type Lookup = (name: string) => number | string | boolean | undefined;

/** 老 token 翻译成表达式片段。变量走 ident（求值期读实时值），字面量直接内联。 */
function tokenToExpr(token: string, vars: Record<string, true>, lookup: Lookup): string {
  if (token.startsWith('_')) {
    const [, fn, arg = ''] = token.split('_');
    if (fn === 'isCd') {
      const id = Number(arg);
      if (!Number.isFinite(id)) throw new Error(`非法的 isCd 参数 \`${arg}\``);
      return `isCd(${id})`;
    }
    if (fn === 'buffTurn') {
      if (!arg) throw new Error('buffTurn 缺少参数');
      return `buffTurn(${JSON.stringify(arg)})`;
    }
    throw new Error(`未知函数 \`${fn}\``);
  }
  if (/^'.*'$|^".*"$/.test(token)) return JSON.stringify(token.slice(1, -1));
  if (token !== '' && !Number.isNaN(Number(token))) {
    const n = Number(token);
    if (!Number.isFinite(n)) throw new Error(`非法数字 \`${token}\``);
    return String(n);
  }
  if (!IDENT_RE.test(token)) throw new Error(`非法变量名 \`${token}\``);
  if (token.split('.')[0] in vars) return token;
  const ov = lookup(token.split('.')[0]);
  if (typeof ov === 'number' && Number.isFinite(ov)) return String(ov);
  if (typeof ov === 'string') return JSON.stringify(ov);
  if (typeof ov === 'boolean') return String(ov);
  throw new Error(`未知变量 \`${token}\``);
}

/**
 * 老格式 {组号: ["a,op,b"]} 翻译成表达式：组内 and、组间 or。
 * 脏数据（三元组残缺、未知操作符、翻译失败）翻成 `false`，与原版静默不通过一致。
 */
export function groupsToExpr(parms: ConditionGroups, vars: Record<string, true>, lookup: Lookup): string {
  const groups = Object.keys(parms)
    .map(Number)
    .sort((a, b) => a - b)
    .map((g) => parms[g])
    .filter((list): list is string[] => Array.isArray(list));
  const parts = groups.map((list) => {
    const exprs = list.map((item) => {
      const seg = item.split(',');
      if (seg.length !== 3) return 'false';
      const sym = OP_SYMBOL[seg[1]];
      if (!sym) return 'false';
      try {
        return `${tokenToExpr(seg[0], vars, lookup)} ${sym} ${tokenToExpr(seg[2], vars, lookup)}`;
      } catch {
        return 'false';
      }
    });
    return exprs.length === 0 ? 'false' : `(${exprs.join(' and ')})`;
  });
  return parts.join(' or ');
}

/** 单个条件值迁移：字符串保留，老对象翻译，其余置空（空＝恒成立）。 */
export function migrateCond(v: unknown, vars: Record<string, true>, lookup: Lookup): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v !== null) {
    try {
      return groupsToExpr(v as ConditionGroups, vars, lookup);
    } catch {
      return '';
    }
  }
  return '';
}

const MAIN_CONDS = [
  'middleSkillCondition', 'highSkillCondition',
  'turnOnSSCondition', 'turnOffSSCondition',
  'defendCondition', 'focusCondition',
  'etherTapCondition', 'fleeCondition',
];
const SKILL_CONDS = ['ofcCondition', 'frdCondition', 't3Condition', 't2Condition', 't1Condition'];

function migrateRecord(rec: unknown, vars: Record<string, true>, lookup: Lookup): void {
  if (typeof rec !== 'object' || rec === null) return;
  for (const k of Object.keys(rec as Record<string, unknown>)) {
    (rec as Record<string, unknown>)[k] = migrateCond((rec as Record<string, unknown>)[k], vars, lookup);
  }
}

/** 补齐已知条件键（缺的置空串），保证 UI 的 bind 永远拿到 string。 */
function backfill(rec: unknown, keys: string[]): void {
  if (typeof rec !== 'object' || rec === null) return;
  const r = rec as Record<string, unknown>;
  for (const k of keys) {
    if (typeof r[k] !== 'string') r[k] = '';
  }
}

const ALARM_KINDS = ['Common', 'Error', 'Defeat', 'Riddle', 'Victory'];

/** 补齐 Alarm 推送配置（旧存档缺 telegram/webhook 时补默认，保证 bind 永不拿 undefined）。 */
function backfillAlarm(raw: Record<string, unknown>): void {
  const alarm = raw.alarm as Record<string, unknown> | undefined;
  if (typeof alarm !== 'object' || alarm === null) return;
  for (const target of ['telegram', 'webhook'] as const) {
    let t = alarm[target] as Record<string, unknown> | undefined;
    if (typeof t !== 'object' || t === null) {
      t = {};
      alarm[target] = t;
    }
    if (typeof t.enabled !== 'boolean') t.enabled = false;
    if (target === 'telegram') {
      if (typeof t.botToken !== 'string') t.botToken = '';
      if (typeof t.chatId !== 'string') t.chatId = '';
    } else {
      if (typeof t.url !== 'string') t.url = '';
      if (typeof t.template !== 'string') t.template = DEFAULT_WEBHOOK_TEMPLATE;
    }
    let kinds = t.kinds as Record<string, unknown> | undefined;
    if (typeof kinds !== 'object' || kinds === null) {
      kinds = {};
      t.kinds = kinds;
    }
    for (const k of ALARM_KINDS) {
      if (typeof kinds[k] !== 'boolean') kinds[k] = true;
    }
  }
}

/** 启动时对整份 options 做一次性迁移（原地修改）。 */
export function migrateOptions(raw: Record<string, unknown>): void {
  const lookup: Lookup = (name) => {
    const main = (raw.main ?? {}) as Record<string, unknown>;
    const v = main[name];
    return typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean' ? v : undefined;
  };
  const main = raw.main as Record<string, unknown> | undefined;
  if (main) {
    for (const f of MAIN_CONDS) {
      if (f in main) main[f] = migrateCond(main[f], BATTLE_VARS, lookup);
    }
  }
  const item = raw.item as Record<string, unknown> | undefined;
  if (item) {
    migrateRecord(item.conditions, BATTLE_VARS, lookup);
    backfill(item.conditions, Object.keys(ITEM_IDS));
  }
  const buff = raw.buff as Record<string, unknown> | undefined;
  if (buff) {
    if ('condition' in buff) buff.condition = migrateCond(buff.condition, BATTLE_VARS, lookup);
    migrateRecord(buff.conditions, BATTLE_VARS, lookup);
    backfill(buff.conditions, [...Object.keys(DRAUGHT_LIB), ...Object.keys(BUFF_LIB)]);
  }
  const debuff = raw.debuff as Record<string, unknown> | undefined;
  if (debuff) {
    if ('condition' in debuff) debuff.condition = migrateCond(debuff.condition, BATTLE_VARS, lookup);
    migrateRecord(debuff.conditions, BATTLE_VARS, lookup);
    backfill(debuff.conditions, Object.keys(DEBUFF_LIB));
  }
  const skill = raw.skill as Record<string, unknown> | undefined;
  if (skill) {
    for (const f of SKILL_CONDS) {
      if (f in skill) skill[f] = migrateCond(skill[f], BATTLE_VARS, lookup);
    }
  }
  const scroll = raw.scroll as Record<string, unknown> | undefined;
  if (scroll) {
    if ('condition' in scroll) scroll.condition = migrateCond(scroll.condition, BATTLE_VARS, lookup);
    migrateRecord(scroll.conditions, BATTLE_VARS, lookup);
    backfill(scroll.conditions, Object.keys(SCROLL_LIB));
  }
  const infusion = raw.infusion as Record<string, unknown> | undefined;
  if (infusion && 'condition' in infusion) {
    infusion.condition = migrateCond(infusion.condition, BATTLE_VARS, lookup);
  }
  // 旧 dropMonitor 开关并入 recordUsage（任一开即全开，保持行为）
  if (raw.dropMonitor === true) raw.recordUsage = true;
  delete raw.dropMonitor;
  backfillAlarm(raw);
}
