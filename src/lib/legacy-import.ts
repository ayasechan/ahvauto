import type { HvOptions } from './types';
import type { AttackStatus } from './types';
import { defaultOptions, VERSION, ITEM_KEYS, BUFF_COND_KEYS, DEBUFF_COND_KEYS, SCROLL_COND_KEYS } from './defaults';
import { BATTLE_VAR_NAMES, groupsToExpr } from './expr/migrate';
import type { ConditionGroups } from './types';

type Raw = Record<string, unknown>;

const VARS: Record<string, true> = Object.fromEntries(BATTLE_VAR_NAMES.map((k) => [k, true]));

const bool = (v: unknown): boolean => v === true;
const num = (v: unknown, fb: number): number => {
  const n = typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fb;
};
const str = (v: unknown, fb = ''): string => (typeof v === 'string' ? v : fb);
const boolMap = (v: unknown): Record<string, boolean> => {
  const out: Record<string, boolean> = {};
  if (typeof v === 'object' && v !== null) {
    for (const k of Object.keys(v as Raw)) out[k] = (v as Raw)[k] === true;
  }
  return out;
};
const numMap = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (typeof v === 'object' && v !== null) {
    for (const k of Object.keys(v as Raw)) {
      const n = Number((v as Raw)[k]);
      if (Number.isFinite(n)) out[k] = n;
    }
  }
  return out;
};
const csv = (v: unknown): string[] =>
  typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];

function cond(v: unknown, old: Raw): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v !== null) {
    try {
      return groupsToExpr(v as ConditionGroups, VARS, (name) => {
        const ov = old[name];
        return typeof ov === 'number' || typeof ov === 'string' || typeof ov === 'boolean' ? ov : undefined;
      });
    } catch {
      return '';
    }
  }
  return '';
}


/** 旧脚本（v2.x，hvAA-option）是否可识别 */
export function isLegacyOption(v: unknown): v is Raw {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Raw;
  return typeof o.version === 'string' && (o.version as string).startsWith('2.') && 'attackStatus' in o;
}

/** 旧配置 → 新 HvOptions（含权重、条件翻译）。只读旧对象，不写回。 */
export function importLegacyOption(old: Raw): HvOptions {
  const d = defaultOptions();
  const attackStatus = num(old.attackStatus, -1);
  const attack: AttackStatus =
    attackStatus === 0 || attackStatus === 1 || attackStatus === 2 || attackStatus === 3 ||
      attackStatus === 4 || attackStatus === 5 || attackStatus === 6
      ? attackStatus
      : -1;
  const langRaw = str(old.lang, '0');

  const itemNames = csv(old.itemOrderName);
  const itemIds = csv(old.itemOrderValue);

  return {
    version: VERSION,
    lang: langRaw === '1' || langRaw === '2' ? langRaw : '0',
    main: {
      ...d.main,
      attackStatus: attack,
      hp1: num(old.hp1, 50),
      mp1: num(old.mp1, 70),
      sp1: num(old.sp1, 75),
      pauseButton: bool(old.pauseButton),
      pauseHotkey: bool(old.pauseHotkey),
      pauseHotkeyStr: str(old.pauseHotkeyStr),
      pauseHotkeyCode: num(old.pauseHotkeyCode, 0),
      alert: bool(old.alert),
      notification: bool(old.notification),
      encounter: bool(old.encounter),
      middleSkillCondition: cond(old.middleSkillCondition, old),
      highSkillCondition: cond(old.highSkillCondition, old),
      turnOnSS: bool(old.turnOnSS),
      turnOnSSCondition: cond(old.turnOnSSCondition, old),
      turnOffSS: bool(old.turnOffSS),
      turnOffSSCondition: cond(old.turnOffSSCondition, old),
      defend: bool(old.defend),
      defendCondition: cond(old.defendCondition, old),
      focus: bool(old.focus),
      focusCondition: cond(old.focusCondition, old),
      delayAlert: bool(old.delayAlert),
      delayAlertTime: num(old.delayAlertTime, 0),
      delayReload: bool(old.delayReload),
      delayReloadTime: num(old.delayReloadTime, 0),
      riddlePopup: bool(old.riddlePopup),
      staminaLose: num(old.staminaLose, 5),
      staminaPause: bool(old.staminaPause),
      staminaWarn: bool(old.staminaWarn),
      staminaFlee: bool(old.staminaFlee),
      idleArena: bool(old.idleArena),
      idleArenaTime: num(old.idleArenaTime, 0),
      idleArenaLevels: str(old.idleArenaLevels),
      idleArenaValue: str(old.idleArenaValue),
      idleArenaGrTime: num(old.idleArenaGrTime, 1),
      repair: bool(old.repair),
      repairValue: num(old.repairValue, 0),
      etherTap: bool(old.etherTap),
      etherTapCondition: cond(old.etherTapCondition, old),
      autoFlee: bool(old.autoFlee),
      fleeCondition: cond(old.fleeCondition, old),
      restoreStamina: bool(old.restoreStamina),
      staminaLow: num(old.staminaLow, 30),
      recordEach: bool(old.recordEach),
      delay: num(old.delay, 200),
      delay2: num(old.delay2, 30),
      fightingStyle: str(old.fightingStyle, '1'),
      debug: false,
    },
    item: {
      order: itemNames.map((key, i) => ({ key, id: itemIds[i] ?? '' })).filter((o) => o.id !== ''),
      enabled: boolMap(old.item),
      conditions: Object.fromEntries(ITEM_KEYS.map((k) => [k, cond((old as Raw)[`item${k}Condition`], old)])),
    },
    channel: {
      enabled: bool(old.channelSkillSwitch),
      first: boolMap(old.channelSkill),
      useSecond: bool(old.channelSkill2),
      secondOrder: csv(old.channelSkill2OrderValue).map((id) => ({ key: id, id })),
    },
    buff: {
      enabled: bool(old.buffSkillSwitch),
      order: csv(old.buffSkillOrderValue),
      condition: cond(old.buffSkillCondition, old),
      enabledMap: boolMap(old.buffSkill),
      conditions: Object.fromEntries(BUFF_COND_KEYS.map((k) => [k, cond((old as Raw)[`buffSkill${k}Condition`], old)])),
    },
    debuff: {
      enabled: bool(old.debuffSkillSwitch),
      order: csv(old.debuffSkillOrderValue),
      allIm: bool(old.debuffSkillAllIm),
      condition: cond(old.debuffSkillCondition, old),
      enabledMap: boolMap(old.debuffSkill),
      conditions: Object.fromEntries(DEBUFF_COND_KEYS.map((k) => [k, cond((old as Raw)[`debuffSkill${k}Condition`], old)])),
      turnAlert: bool(old.debuffSkillTurnAlert),
      turns: numMap(old.debuffSkillTurn),
    },
    skill: {
      enabled: bool(old.skillSwitch),
      order: csv(old.skillOrderValue),
      ofc: bool((old.skill as Raw | undefined)?.OFC),
      otosOFC: bool(old.skillOTOS_OFC),
      ofcCondition: cond(old.skillOFCCondition, old),
      frd: bool((old.skill as Raw | undefined)?.FRD),
      otosFRD: bool(old.skillOTOS_FRD),
      frdCondition: cond(old.skillFRDCondition, old),
      t3: bool((old.skill as Raw | undefined)?.T3),
      otosT3: bool(old.skillOTOS_T3),
      t3Condition: cond(old.skillT3Condition, old),
      t2: bool((old.skill as Raw | undefined)?.T2),
      otosT2: bool(old.skillOTOS_T2),
      t2Condition: cond(old.skillT2Condition, old),
      t1: bool((old.skill as Raw | undefined)?.T1),
      otosT1: bool(old.skillOTOS_T1),
      t1Condition: cond(old.skillT1Condition, old),
      mercifulBlow: bool(old.mercifulBlow),
    },
    scroll: {
      enabled: bool(old.scrollSwitch),
      roundTypes: {
        ar: bool((old.scrollRoundType as Raw | undefined)?.ar),
        rb: bool((old.scrollRoundType as Raw | undefined)?.rb),
        gr: bool((old.scrollRoundType as Raw | undefined)?.gr),
        iw: bool((old.scrollRoundType as Raw | undefined)?.iw),
        ba: bool((old.scrollRoundType as Raw | undefined)?.ba),
      },
      first: bool(old.scrollFirst),
      condition: cond(old.scrollCondition, old),
      enabledMap: boolMap(old.scroll),
      conditions: Object.fromEntries(SCROLL_COND_KEYS.map((k) => [k, cond((old as Raw)[`scroll${k}Condition`], old)])),
    },
    infusion: {
      enabled: bool(old.infusionSwitch),
      condition: cond(old.infusionCondition, old),
    },
    alarm: {
      audioEnable: {
        Common: bool((old.audioEnable as Raw | undefined)?.Common),
        Error: bool((old.audioEnable as Raw | undefined)?.Error),
        Defeat: bool((old.audioEnable as Raw | undefined)?.Defeat),
        Riddle: bool((old.audioEnable as Raw | undefined)?.Riddle),
        Victory: bool((old.audioEnable as Raw | undefined)?.Victory),
      },
      audio: Object.fromEntries(
        Object.entries(typeof old.audio === 'object' && old.audio !== null ? (old.audio as Raw) : {}).map(([k, v]) => [
          k,
          typeof v === 'string' ? v : '',
        ]),
      ),
      telegram: d.alarm.telegram,
      webhook: d.alarm.webhook,
    },
    rule: {
      weights: numMap(old.weight),
      reverse: bool(old.ruleReverse),
    },
    dropQuality: str(old.dropQuality),
    recordUsage: bool(old.recordUsage) || bool(old.dropMonitor),
  };
}

export { ITEM_KEYS, BUFF_COND_KEYS, DEBUFF_COND_KEYS, SCROLL_COND_KEYS };
