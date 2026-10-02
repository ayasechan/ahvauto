import type { HvOptions } from '../types';
import {
  BUFF_LIB,
  SCROLL_LIB,
  INFUSION_LIB,
  DRAUGHT_LIB,
  DEBUFF_SKILL_IDS,
  DEBUFF_WEIGHT_IMGS,
} from '../tables';
import type { Snapshot, DecideResult, RuleName } from './types';
import { orderTargets, resolveTarget } from './snapshot';
import { evalContext, checkExpr } from './context';
import type { EvalContext } from '../expr/index';

export interface DecideAux {
  otos: Record<string, number>;
}

interface Ctx {
  snap: Snapshot;
  opt: HvOptions;
  ec: EvalContext;
  aux: DecideAux;
  fin: string | null;
}

interface Rule {
  /** 规则名（调试用，改名同步改 combat/types.RuleName） */
  name: RuleName;
  decide: (c: Ctx) => DecideResult | null;
}

const hasPane = (snap: Snapshot, sub: string, suffix = ''): boolean =>
  snap.buffs.some((b) => b.src.includes(sub + suffix));

function debuffSlotOk(
  count: number,
  lastLeft: number,
  needTurn: number | undefined,
  alertOn: boolean,
): boolean {
  if (count < 6) return true;
  if (needTurn !== undefined && lastLeft >= needTurn) return true;
  return !alertOn;
}

/** halt 中断文案（展示层按当前语言翻译，见 battle.ts onHalt）。 */
export const HALT_MSG = '无法正常施放DEBUFF技能，请尝试手动打怪';

/**
 * 决策规则表：按表顺序求值，首个命中即决策（顺序即优先级，原 main() 链）。
 * attack 为链尾，内部按原 attack() 顺序：focus → spirit → etherTap/魔法/武器/普攻。
 */
const RULES: Rule[] = [
  {
    name: 'gem',
    decide: ({ snap, opt }) => {
      const g = snap.gem;
      if (!g) return null;
      const m = opt.main;
      if (
        (g === 'Health Gem' && snap.hp <= m.hp1) ||
        (g === 'Mana Gem' && snap.mp <= m.mp1) ||
        (g === 'Spirit Gem' && snap.sp <= m.sp1) ||
        g === 'Mystic Gem'
      ) {
        return { action: { kind: 'gem' } };
      }
      return null;
    },
  },
  {
    name: 'item',
    decide: ({ snap, opt, ec }) => {
      for (const entry of opt.item.order) {
        if (!opt.item.enabled[entry.key]) continue;
        if (!checkExpr(opt.item.conditions[entry.key], ec)) continue;
        if (!snap.skills[entry.id]) continue;
        return { action: { kind: 'item', id: entry.id, key: entry.key } };
      }
      return null;
    },
  },
  {
    name: 'defend',
    decide: ({ opt, ec }) =>
      opt.main.defend && checkExpr(opt.main.defendCondition, ec)
        ? { action: { kind: 'defend' } }
        : null,
  },
  {
    name: 'scroll',
    decide: ({ snap, opt, ec }) => {
      if (!opt.scroll.enabled || !checkExpr(opt.scroll.condition, ec)) return null;
      if (!opt.scroll.roundTypes[snap.roundType as keyof typeof opt.scroll.roundTypes]) return null;
      const suffix = opt.scroll.first ? '_scroll' : '';
      for (const key of Object.keys(SCROLL_LIB)) {
        const s = SCROLL_LIB[key];
        if (!opt.scroll.enabledMap[key] || !checkExpr(opt.scroll.conditions[key], ec)) continue;
        if (!snap.skills[s.id]) continue;
        if (s.imgs.some((img) => hasPane(snap, img, suffix))) continue;
        return { action: { kind: 'scroll', id: s.id } };
      }
      return null;
    },
  },
  {
    name: 'channel',
    decide: ({ snap, opt }) => {
      if (!opt.channel.enabled || !snap.channeling) return null;
      for (const key of opt.buff.order) {
        const def = BUFF_LIB[key];
        if (!def || !opt.channel.first[key]) continue;
        if (!hasPane(snap, def.img) && snap.skills[def.id]) {
          return { action: { kind: 'buff', id: def.id } };
        }
      }
      if (opt.channel.useSecond) {
        for (const entry of opt.channel.secondOrder) {
          if (snap.skills[entry.id]) return { action: { kind: 'buff', id: entry.id } };
        }
      }
      const name2key: Record<string, string> = {
        Protection: 'Pr',
        'Spark of Life': 'SL',
        'Spirit Shield': 'SS',
        Hastened: 'Ha',
        'Arcane Focus': 'AF',
        Heartseeker: 'He',
        Regen: 'Re',
        'Shadow Veil': 'SV',
        Absorb: 'Ab',
      };
      let first: { key: string; left: number } | null = null;
      for (const b of snap.buffs) {
        if (Number.isNaN(b.turns) || b.scroll) continue;
        if (b.name === 'Cloak of the Fallen' && !hasPane(snap, 'sparklife') && snap.skills['422']) {
          return { action: { kind: 'buff', id: '422' } };
        }
        const key = name2key[b.name];
        if (key && (first === null || b.turns < first.left)) first = { key, left: b.turns };
      }
      if (first && BUFF_LIB[first.key] && snap.skills[BUFF_LIB[first.key].id]) {
        return { action: { kind: 'buff', id: BUFF_LIB[first.key].id } };
      }
      return null;
    },
  },
  {
    name: 'buff',
    decide: ({ snap, opt, ec }) => {
      if (!opt.buff.enabled || !checkExpr(opt.buff.condition, ec)) return null;
      for (const key of opt.buff.order) {
        const def = BUFF_LIB[key];
        if (!def || !opt.buff.enabledMap[key]) continue;
        if (!checkExpr(opt.buff.conditions[key], ec)) continue;
        if (!hasPane(snap, def.img) && snap.skills[def.id]) {
          return { action: { kind: 'buff', id: def.id } };
        }
      }
      for (const key of Object.keys(DRAUGHT_LIB)) {
        const def = DRAUGHT_LIB[key];
        if (!opt.buff.enabledMap[key] || !checkExpr(opt.buff.conditions[key], ec)) continue;
        if (hasPane(snap, def.img)) continue;
        if (snap.skills[def.id]) return { action: { kind: 'draught', id: def.id } };
      }
      return null;
    },
  },
  {
    name: 'infusion',
    decide: ({ snap, opt, ec }) => {
      if (snap.attackStatus <= 0 || !opt.infusion.enabled) return null;
      if (!checkExpr(opt.infusion.condition, ec)) return null;
      const def = INFUSION_LIB[snap.attackStatus];
      if (!def) return null;
      if (hasPane(snap, def.img)) return null;
      if (!snap.skills[def.id]) return null;
      return { action: { kind: 'infusion', id: def.id } };
    },
  },
  {
    name: 'imperil',
    decide: ({ snap, opt }) => {
      if (!opt.debuff.enabled || !opt.debuff.allIm) return null;
      const imperiled = snap.monsters.filter((m) => m.marks.includes('imperil')).length;
      if (imperiled >= snap.monsterAlive) return null;
      const order = snap.monsters.map((_, i) => i);
      const seq: number[] = [];
      for (let i = 0; i < order.length; i += 3) seq.push(order[i]);
      for (const i of order) if (!seq.includes(i)) seq.push(i);
      for (const i of seq) {
        const m = snap.monsters[i];
        if (m.marks.includes('imperil') || !m.alive) continue;
        if (!snap.skills['213']) continue;
        const next = snap.monsters.findIndex((x, j) => j > i && x.alive && x.clickable);
        const target = resolveTarget(snap.monsters, snap.monsters[next >= 0 ? next : i]?.id);
        if (!target) continue;
        if (!debuffSlotOk(m.markCount, m.lastTurns, opt.debuff.turns.Im, opt.debuff.turnAlert)) {
          return { action: { kind: 'halt', message: HALT_MSG } };
        }
        return { action: { kind: 'imperil', target } };
      }
      return null;
    },
  },
  {
    name: 'deskill',
    decide: ({ snap, opt, ec, fin }) => {
      if (!opt.debuff.enabled || !checkExpr(opt.debuff.condition, ec)) return null;
      const target = resolveTarget(snap.monsters, fin ?? undefined);
      if (!target) return null;
      const tm = snap.monsters.find((m) => m.id === target);
      if (!tm) return null;
      for (const key of opt.debuff.order) {
        const skillId = DEBUFF_SKILL_IDS[key];
        if (!skillId || !opt.debuff.enabledMap[key]) continue;
        if (!snap.skills[skillId] || !checkExpr(opt.debuff.conditions[key], ec)) continue;
        if (tm.marks.includes(DEBUFF_WEIGHT_IMGS[key])) continue;
        if (
          !debuffSlotOk(tm.markCount, tm.lastTurns, opt.debuff.turns[key], opt.debuff.turnAlert)
        ) {
          return { action: { kind: 'halt', message: HALT_MSG } };
        }
        return { action: { kind: 'debuff', id: skillId, target } };
      }
      return null;
    },
  },
  {
    name: 'attack',
    decide: ({ snap, opt, ec, aux, fin }) => {
      if (opt.main.focus && checkExpr(opt.main.focusCondition, ec)) {
        return { action: { kind: 'focus' } };
      }
      if (opt.main.turnOnSS && checkExpr(opt.main.turnOnSSCondition, ec) && !snap.spiritOn) {
        return { action: { kind: 'spirit', on: true } };
      }
      if (opt.main.turnOffSS && checkExpr(opt.main.turnOffSSCondition, ec) && snap.spiritOn) {
        return { action: { kind: 'spirit', on: false } };
      }
      const ft = fin ? snap.monsters.find((m) => m.id === fin) : undefined;
      const skipMagic =
        opt.main.etherTap &&
        !!ft &&
        ft.marks.includes('coalescemana') &&
        (!snap.etherTapX2 || snap.etherTapExpiring) &&
        checkExpr(opt.main.etherTapCondition, ec);
      // 原版语义：魔法点了也不返回，武器能放就覆盖（以后点的为准），最后必点目标。
      // 此处等价实现：武器优先，其次魔法，最后普攻。
      let magicId: string | null = null;
      if (!skipMagic && snap.attackStatus !== 0) {
        if (checkExpr(opt.main.highSkillCondition, ec) && snap.skills[`1${snap.attackStatus}3`]) {
          magicId = `1${snap.attackStatus}3`;
        } else if (
          checkExpr(opt.main.middleSkillCondition, ec) &&
          snap.skills[`1${snap.attackStatus}2`]
        ) {
          magicId = `1${snap.attackStatus}2`;
        } else if (snap.skills[`1${snap.attackStatus}1`]) {
          magicId = `1${snap.attackStatus}1`;
        }
      }
      if (opt.skill.enabled) {
        const order =
          opt.skill.order.length > 0 ? opt.skill.order : ['OFC', 'FRD', 'T3', 'T2', 'T1'];
        const style = snap.fightingStyle;
        const lib: Record<
          string,
          { flag: boolean; cond: string; id: string; oc: number; otos: boolean; key: string }
        > = {
          OFC: {
            flag: opt.skill.ofc,
            cond: opt.skill.ofcCondition,
            id: '1111',
            oc: 8,
            otos: opt.skill.otosOFC,
            key: 'OFC',
          },
          FRD: {
            flag: opt.skill.frd,
            cond: opt.skill.frdCondition,
            id: '1101',
            oc: 4,
            otos: opt.skill.otosFRD,
            key: 'FRD',
          },
          T3: {
            flag: opt.skill.t3,
            cond: opt.skill.t3Condition,
            id: `2${style}03`,
            oc: 2,
            otos: opt.skill.otosT3,
            key: 'T3',
          },
          T2: {
            flag: opt.skill.t2,
            cond: opt.skill.t2Condition,
            id: `2${style}02`,
            oc: 2,
            otos: opt.skill.otosT2,
            key: 'T2',
          },
          T1: {
            flag: opt.skill.t1,
            cond: opt.skill.t1Condition,
            id: `2${style}01`,
            oc: 2,
            otos: opt.skill.otosT1,
            key: 'T1',
          },
        };
        for (const key of order) {
          const entry = lib[key];
          if (!entry?.flag || snap.oc < entry.oc || !snap.spiritOn) continue;
          if (!checkExpr(entry.cond, ec) || !snap.skills[entry.id]) continue;
          if (entry.otos && (aux.otos[key] ?? 0) >= 1) continue;
          const target = resolveTarget(snap.monsters, fin ?? undefined);
          if (!target) continue;
          if (opt.skill.mercifulBlow && style === '2' && key === 'T3') {
            const weak = snap.monsters.find(
              (m) =>
                m.maxHp > 0 &&
                m.hpNow / m.maxHp < 0.25 &&
                m.marks.includes('wpn_bleed') &&
                m.clickable,
            );
            if (weak)
              return {
                action: { kind: 'weapon', id: entry.id, key, target: weak.id },
                consumeOnce: key,
              };
          }
          return {
            action: { kind: 'weapon', id: entry.id, key, target },
            consumeOnce: entry.otos ? key : undefined,
          };
        }
      }
      if (magicId) {
        const target = resolveTarget(snap.monsters, fin ?? undefined);
        if (target) return { action: { kind: 'magic', id: magicId, target } };
      }
      const target = resolveTarget(snap.monsters, fin ?? undefined);
      return target ? { action: { kind: 'attack', target } } : { action: { kind: 'none' } };
    },
  },
];

/**
 * 保底停机线（纯）：血量跌破阈值且开关打开 → 调用方暂停＋告警。
 * 与条件系统无关，任何情况都生效（回血链本身也可能哑火：药吃完、法术 CD/缺蓝）。
 */
export function shouldEmergencyPause(hp: number, enabled: boolean, floor: number): boolean {
  return enabled && Number.isFinite(hp) && Number.isFinite(floor) && hp <= floor;
}

/**
 * 主入口：按规则表顺序求值，首个命中即决策。纯函数，可单测。
 * fin 为集火目标 id（调用方按权重算好传入）。
 */
export function decide(snap: Snapshot, opt: HvOptions, otos: Record<string, number>): DecideResult {
  const ec = evalContext(snap);
  const fin = orderTargets(snap.monsters, opt.rule.weights ?? {}, opt.rule.reverse)[0];
  const ctx = { snap, opt, ec, aux: { otos }, fin: fin ?? null };
  for (const rule of RULES) {
    const r = rule.decide(ctx);
    if (r) return { ...r, rule: rule.name };
  }
  return { action: { kind: 'none' }, rule: 'none' };
}
