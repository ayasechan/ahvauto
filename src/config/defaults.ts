import type { HvOptions } from './types';
import { DEFAULT_WEBHOOK_TEMPLATE } from './types';
import { ITEM_IDS, BUFF_LIB, DRAUGHT_LIB, DEBUFF_LIB, SCROLL_LIB } from './tables';

export const VERSION = '3.0.0';

const blank = (keys: string[]): Record<string, string> =>
  Object.fromEntries(keys.map((k) => [k, '']));

const falseMap = (keys: string[]): Record<string, boolean> =>
  Object.fromEntries(keys.map((k) => [k, false]));

const zeroMap = (keys: string[]): Record<string, number> =>
  Object.fromEntries(keys.map((k) => [k, 0]));

const RULE_WEIGHT_KEYS = [
  'Sle',
  'Bl',
  'Slo',
  'Im',
  'MN',
  'Si',
  'Dr',
  'We',
  'Co',
  'CM',
  'Stun',
  'PA',
  'BW',
];

const ALARM_KINDS = ['Common', 'Error', 'Defeat', 'Riddle', 'Victory'];

export const ITEM_KEYS = Object.keys(ITEM_IDS);
export const BUFF_COND_KEYS = [...Object.keys(DRAUGHT_LIB), ...Object.keys(BUFF_LIB)];
export const DEBUFF_COND_KEYS = Object.keys(DEBUFF_LIB);
export const SCROLL_COND_KEYS = Object.keys(SCROLL_LIB);

export function defaultOptions(): HvOptions {
  return {
    version: VERSION,
    lang: '0',
    main: {
      attackStatus: -1,
      hp1: 50,
      mp1: 70,
      sp1: 75,
      pauseButton: false,
      pauseHotkey: false,
      pauseHotkeyStr: '',
      pauseHotkeyCode: 0,
      alert: false,
      notification: false,
      encounter: false,
      middleSkillCondition: '',
      highSkillCondition: '',
      turnOnSS: false,
      turnOnSSCondition: '',
      turnOffSS: false,
      turnOffSSCondition: '',
      defend: false,
      defendCondition: '',
      focus: false,
      focusCondition: '',
      delayAlert: false,
      delayAlertTime: 0,
      delayReload: false,
      delayReloadTime: 0,
      riddlePopup: false,
      staminaLose: 5,
      staminaPause: false,
      staminaWarn: false,
      staminaFlee: false,
      idleArena: false,
      idleArenaTime: 0,
      idleArenaLevels: '',
      idleArenaValue: '',
      idleArenaGrTime: 1,
      repair: false,
      repairValue: 0,
      repairCharms: true,
      etherTap: false,
      etherTapCondition: '',
      autoFlee: false,
      fleeCondition: '',
      restoreStamina: false,
      staminaLow: 30,
      hpFloorPause: true,
      hpFloor: 15,
      spellDelay: 200,
      noSpellDelay: 30,
      fightingStyle: '1',
      debug: false,
      logLevel: 'info',
    },
    item: { order: [], enabled: falseMap(ITEM_KEYS), conditions: blank(ITEM_KEYS) },
    channel: {
      enabled: false,
      first: falseMap(Object.keys(BUFF_LIB)),
      useSecond: false,
      secondOrder: [],
    },
    buff: {
      enabled: false,
      order: [],
      condition: '',
      enabledMap: falseMap(BUFF_COND_KEYS),
      conditions: blank(BUFF_COND_KEYS),
    },
    debuff: {
      enabled: false,
      order: [],
      allIm: false,
      condition: '',
      enabledMap: falseMap(DEBUFF_COND_KEYS),
      conditions: blank(DEBUFF_COND_KEYS),
      turnAlert: false,
      turns: zeroMap(DEBUFF_COND_KEYS),
    },
    skill: {
      enabled: false,
      order: [],
      ofc: false,
      otosOFC: false,
      ofcCondition: '',
      frd: false,
      otosFRD: false,
      frdCondition: '',
      t3: false,
      otosT3: false,
      t3Condition: '',
      t2: false,
      otosT2: false,
      t2Condition: '',
      t1: false,
      otosT1: false,
      t1Condition: '',
      mercifulBlow: false,
    },
    scroll: {
      enabled: false,
      roundTypes: { ar: false, rb: false, gr: false, iw: false, ba: false },
      first: false,
      condition: '',
      enabledMap: falseMap(SCROLL_COND_KEYS),
      conditions: blank(SCROLL_COND_KEYS),
    },
    infusion: { enabled: false, condition: '' },
    alarm: {
      audioEnable: { Common: false, Error: false, Defeat: false, Riddle: false, Victory: false },
      audio: blank(ALARM_KINDS),
      telegram: {
        enabled: false,
        botToken: '',
        chatId: '',
        kinds: { Common: true, Error: true, Defeat: true, Riddle: true, Victory: true },
      },
      webhook: {
        enabled: false,
        url: '',
        template: DEFAULT_WEBHOOK_TEMPLATE,
        kinds: { Common: true, Error: true, Defeat: true, Riddle: true, Victory: true },
      },
    },
    rule: { weights: zeroMap(RULE_WEIGHT_KEYS), reverse: false },
    dropQuality: '',
    usageTimeRange: '7d',
    recordUsage: false,
  };
}
