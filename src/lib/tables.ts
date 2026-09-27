/** 技能 / 卷轴 / 魔药 / debuff 静态表（原分散在各函数内的 Lib 收敛到此） */

export interface SkillDef {
  id: string;
  img: string;
  name: string;
}

export const BUFF_LIB: Record<string, SkillDef> = {
  Pr: { id: '411', img: 'protection', name: 'Protection' },
  SL: { id: '422', img: 'sparklife', name: 'Spark of Life' },
  SS: { id: '423', img: 'spiritshield', name: 'Spirit Shield' },
  Ha: { id: '412', img: 'haste', name: 'Haste' },
  AF: { id: '432', img: 'arcanemeditation', name: 'Arcane Focus' },
  He: { id: '431', img: 'heartseeker', name: 'Heartseeker' },
  Re: { id: '312', img: 'regen', name: 'Regen' },
  SV: { id: '413', img: 'shadowveil', name: 'Shadow Veil' },
  Ab: { id: '421', img: 'absorb', name: 'Absorb' },
};

export const DRAUGHT_LIB: Record<string, SkillDef> = {
  HD: { id: '11191', img: 'healthpot', name: 'Health Draught' },
  MD: { id: '11291', img: 'manapot', name: 'Mana Draught' },
  SD: { id: '11391', img: 'spiritpot', name: 'Spirit Draught' },
  FV: { id: '19111', img: 'flowers', name: 'Flower Vase' },
  BG: { id: '19131', img: 'gum', name: 'Bubble-Gum' },
};

export interface ScrollDef extends SkillDef {
  mult: number;
  imgs: string[];
}

export const SCROLL_LIB: Record<string, ScrollDef> = {
  Go: { id: '13299', img: '', name: 'Scroll of the Gods', mult: 3, imgs: ['absorb', 'shadowveil', 'sparklife'] },
  Av: { id: '13199', img: '', name: 'Scroll of the Avatar', mult: 2, imgs: ['haste', 'protection'] },
  Pr: { id: '13111', img: '', name: 'Scroll of Protection', mult: 1, imgs: ['protection'] },
  Sw: { id: '13101', img: '', name: 'Scroll of Swiftness', mult: 1, imgs: ['haste'] },
  Li: { id: '13221', img: '', name: 'Scroll of Life', mult: 1, imgs: ['sparklife'] },
  Sh: { id: '13211', img: '', name: 'Scroll of Shadows', mult: 1, imgs: ['shadowveil'] },
  Ab: { id: '13201', img: '', name: 'Scroll of Absorption', mult: 1, imgs: ['absorb'] },
};

export const DEBUFF_LIB: Record<string, SkillDef> = {
  Sle: { id: 'Sleep', img: 'sleep', name: 'Sleep' },
  Bl: { id: 'Blind', img: 'blind', name: 'Blind' },
  Slo: { id: 'Slow', img: 'slow', name: 'Slow' },
  Im: { id: '213', img: 'imperil', name: 'Imperil' },
  MN: { id: 'MagNet', img: 'magnet', name: 'MagNet' },
  Si: { id: 'Silence', img: 'silence', name: 'Silence' },
  Dr: { id: 'Drain', img: 'drain', name: 'Drain' },
  We: { id: 'Weaken', img: 'weaken', name: 'Weaken' },
  Co: { id: 'Confuse', img: 'confuse', name: 'Confuse' },
};

/** 攻击模式 -> 魔药（id/img 与游戏一致：火12101/冰12201/雷12301/风12401/圣12501/暗12601） */
export const INFUSION_LIB: Record<number, SkillDef> = {
  1: { id: '12101', img: 'fireinfusion', name: 'Fire Infusion' },
  2: { id: '12201', img: 'coldinfusion', name: 'Cold Infusion' },
  3: { id: '12301', img: 'elecinfusion', name: 'Elec Infusion' },
  4: { id: '12401', img: 'windinfusion', name: 'Wind Infusion' },
  5: { id: '12501', img: 'holyinfusion', name: 'Holy Infusion' },
  6: { id: '12601', img: 'darkinfusion', name: 'Dark Infusion' },
};

/** Debuff 技能 id（施放用） */
export const DEBUFF_SKILL_IDS: Record<string, string> = {
  Sle: '222',
  Bl: '231',
  Slo: '221',
  Im: '213',
  MN: '233',
  Si: '232',
  Dr: '211',
  We: '212',
  Co: '223',
};

/** 集火权重修正：怪身上每出现一个 img 子串就 ±weight[key]（Rule 页可配） */
export const DEBUFF_WEIGHT_IMGS: Record<string, string> = {
  Sle: 'sleep',
  Bl: 'blind',
  Slo: 'slow',
  Im: 'imperil',
  MN: 'magnet',
  Si: 'silence',
  Dr: 'drainhp',
  We: 'weaken',
  Co: 'confuse',
  CM: 'coalescemana',
  Stun: 'wpn_stun',
  PA: 'wpn_ap',
  BW: 'wpn_bleed',
};

export const ITEM_IDS: Record<string, string> = {
  Cure: '311',
  FC: '313',
  HP: '11195',
  HE: '11199',
  MP: '11295',
  ME: '11299',
  SP: '11395',
  SE: '11399',
  LE: '11501',
  ED: '11401',
};
