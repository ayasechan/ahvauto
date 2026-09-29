import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decide, shouldEmergencyPause } from './decide';
import { describeAction } from './execute';import { orderTargets, resolveTarget } from './snapshot';
import { evalContext, checkExpr } from './context';
import { freshOtos } from './types';
import type { Snapshot, SnapMonster } from './types';
import { defaultOptions } from '../defaults';
import type { HvOptions } from '../types';

function snap(over: Partial<Snapshot> = {}): Snapshot {
  return {
    hp: 100, mp: 100, sp: 100, oc: 100, turn: 1,
    roundNow: 1, roundAll: 1, roundType: 'ar', attackStatus: 6,
    monsters: [], monsterAlive: 0, bossAll: 0, bossAlive: 0,
    buffs: [], skills: {}, skillNames: {}, gem: null, spiritOn: true, channeling: false,
    etherTapX2: false, etherTapExpiring: false, fightingStyle: '5',
    ...over,
  };
}

function mon(id: string, hpNow = 1000, extra: Partial<SnapMonster> = {}): SnapMonster {
  return {
    id, name: '', alive: hpNow !== Infinity, hpNow, maxHp: 1000,
    marks: [], markCount: 0, lastTurns: 0, clickable: true, ...extra,
  };
}

function opt(): HvOptions {
  return defaultOptions();
}

const go = (s: Snapshot, o: HvOptions) => decide(s, o, freshOtos());

describe('decide 优先级与规则', () => {
  it('宝石：血量达标吃，否则放行', () => {
    const o = opt();
    assert.deepEqual(go(snap({ gem: 'Health Gem', hp: 30 }), o).action, { kind: 'gem' });
    assert.deepEqual(go(snap({ gem: 'Health Gem', hp: 90, monsters: [mon('1')], monsterAlive: 1 }), o).action, {
      kind: 'attack',
      target: '1',
    });
  });
  it('Mystic Gem 无条件吃', () => {
    assert.equal(go(snap({ gem: 'Mystic Gem' }), opt()).action.kind, 'gem');
  });
  it('物品按顺序取首个可用', () => {
    const o = opt();
    o.item.order = [{ key: 'HP', id: '11195' }, { key: 'MP', id: '11295' }];
    o.item.enabled = { HP: false, MP: true };
    o.item.conditions = {};
    const r = go(snap({ skills: { '11295': true } }), o);
    assert.deepEqual(r.action, { kind: 'item', id: '11295', key: 'MP' });
  });
  it('defend 条件', () => {
    const o = opt();
    o.main.defend = true;
    o.main.defendCondition = 'hp < 50';
    assert.equal(go(snap({ hp: 30 }), o).action.kind, 'defend');
    assert.notEqual(go(snap({ hp: 90 }), o).action.kind, 'defend');
  });
  it('gem 优先于 defend', () => {
    const o = opt();
    o.main.defend = true;
    assert.equal(go(snap({ gem: 'Mystic Gem' }), o).action.kind, 'gem');
  });
  it('卷轴：轮次 gating＋已有跳过', () => {
    const o = opt();
    o.scroll.enabled = true;
    o.scroll.roundTypes.ar = true;
    o.scroll.enabledMap = { Pr: true };
    o.scroll.conditions = {};
    const s = snap({ skills: { '13111': true } });
    assert.deepEqual(go(s, o).action, { kind: 'scroll', id: '13111' });
    o.scroll.roundTypes.ar = false;
    assert.notEqual(go(s, o).action.kind, 'scroll');
  });
  it('channeling 时补缺失 buff', () => {
    const o = opt();
    o.channel.enabled = true;
    o.channel.first = { Pr: true };
    o.buff.order = ['Pr'];
    const r = go(snap({ channeling: true, skills: { '411': true } }), o);
    assert.deepEqual(r.action, { kind: 'buff', id: '411' });
  });
  it('非 channeling 不进 channel 规则', () => {
    const o = opt();
    o.channel.enabled = true;
    o.channel.first = { Pr: true };
    o.buff.order = ['Pr'];
    const r = go(snap({ channeling: false, skills: { '411': true } }), o);
    assert.notEqual(JSON.stringify(r.action).includes('411'), true);
  });
  it('buff 按顺序补缺失＋条件', () => {
    const o = opt();
    o.buff.enabled = true;
    o.buff.order = ['Pr', 'Ha'];
    o.buff.enabledMap = { Pr: true, Ha: true };
    o.buff.conditions = { Ha: 'mp > 90' };
    const r = go(snap({ skills: { '411': true, '412': true }, mp: 50 }), o);
    assert.deepEqual(r.action, { kind: 'buff', id: '411' });
  });
  it('魔药：物理模式跳过，已有跳过', () => {
    const o = opt();
    o.infusion.enabled = true;
    assert.notEqual(go(snap({ attackStatus: 0 }), o).action.kind, 'infusion');
    const r = go(snap({ attackStatus: 6, skills: { '12601': true } }), o);
    assert.deepEqual(r.action, { kind: 'infusion', id: '12601' });
  });
  it('allImperil 找缺口', () => {
    const o = opt();
    o.debuff.enabled = true;
    o.debuff.allIm = true;
    const s = snap({
      monsters: [mon('1', 500, { marks: ['imperil'] }), mon('2', 500)],
      monsterAlive: 2,
      skills: { '213': true },
    });
    assert.deepEqual(go(s, o).action, { kind: 'imperil', target: '2' });
  });
  it('满员 imperil 则跳过', () => {
    const o = opt();
    o.debuff.enabled = true;
    o.debuff.allIm = true;
    const s = snap({
      monsters: [mon('1', 500, { marks: ['imperil'] })],
      monsterAlive: 1,
      skills: { '213': true },
    });
    assert.notEqual(go(s, o).action.kind, 'imperil');
  });
  it('debuff 按顺序补缺失，目标为集火', () => {
    const o = opt();
    o.debuff.enabled = true;
    o.debuff.order = ['Im', 'Sle'];
    o.debuff.enabledMap = { Im: true, Sle: true };
    o.debuff.conditions = {};
    const s = snap({
      monsters: [mon('1', 900), mon('2', 100)],
      monsterAlive: 2,
      skills: { '213': true, '222': true },
    });
    assert.deepEqual(go(s, o).action, { kind: 'debuff', id: '213', target: '2' });
  });
  it('debuff 格满且告警开 → halt', () => {
    const o = opt();
    o.debuff.enabled = true;
    o.debuff.order = ['Im'];
    o.debuff.enabledMap = { Im: true };
    o.debuff.conditions = {};
    o.debuff.turnAlert = true;
    const s = snap({
      monsters: [mon('1', 500, { markCount: 6, lastTurns: 1 })],
      monsterAlive: 1,
      skills: { '213': true },
    });
    o.debuff.turns = {};
    assert.equal(go(s, o).action.kind, 'halt');
  });
  it('魔法高/中/低阶', () => {
    const o = opt();
    o.main.highSkillCondition = 'turn >= 3';
    o.main.middleSkillCondition = 'turn >= 2';
    const s = snap({ turn: 5, skills: { '163': true }, monsters: [mon('1')] });
    s.monsterAlive = 1;
    const r = go(s, o);
    assert.deepEqual(r.action, { kind: 'magic', id: '163', target: '1' });
  });
  it('物理模式跳过魔法，直达普攻', () => {
    const r = go(snap({ attackStatus: 0, monsters: [mon('1')], monsterAlive: 1, skills: {} }), opt());
    assert.deepEqual(r.action, { kind: 'attack', target: '1' });
  });
  it('武器：OC 不足/Spirit 关/OTOS 用过都跳过', () => {
    const o = opt();
    o.skill.enabled = true;
    o.skill.order = ['OFC'];
    o.skill.ofc = true;
    const base = snap({ monsters: [mon('1')], monsterAlive: 1, skills: { '1111': true } });
    assert.equal(go({ ...base, oc: 0 }, o).action.kind, 'attack');
    assert.equal(go({ ...base, oc: 50, spiritOn: false }, o).action.kind, 'attack');
    o.skill.otosOFC = true;
    const used = freshOtos();
    used.OFC = 1;
    assert.equal(decide({ ...base, oc: 50 }, o, used).action.kind, 'attack');
    assert.deepEqual(decide({ ...base, oc: 50 }, o, freshOtos()).action, {
      kind: 'weapon', id: '1111', key: 'OFC', target: '1',
    });
  });
  it('武器可放时覆盖魔法（与原版实效一致）', () => {
    const o = opt();
    o.main.highSkillCondition = 'turn >= 3';
    o.skill.enabled = true;
    o.skill.order = ['OFC', 'FRD', 'T3', 'T2', 'T1'];
    o.skill.ofc = true;
    const s = snap({
      turn: 5, oc: 50, monsters: [mon('1')], monsterAlive: 1,
      skills: { '163': true, '1111': true },
    });
    assert.deepEqual(go(s, o).action, { kind: 'weapon', id: '1111', key: 'OFC', target: '1' });
  });
  it('channel 二段按 id 补', () => {
    const o = opt();
    o.channel.enabled = true;
    o.channel.useSecond = true;
    o.channel.secondOrder = [{ key: 'Cu', id: '311' }];
    o.buff.order = [];
    const r = go(snap({ channeling: true, skills: { '311': true } }), o);
    assert.deepEqual(r.action, { kind: 'buff', id: '311' });
  });
  it('Merciful Blow 转火流血低血怪', () => {
    const o = opt();
    o.skill.enabled = true;
    o.skill.order = ['T3'];
    o.skill.t3 = true;
    o.skill.mercifulBlow = true;
    const s = snap({
      fightingStyle: '2',
      monsters: [mon('1', 900), mon('2', 200, { marks: ['wpn_bleed'] })],
      monsterAlive: 2,
      skills: { '2203': true },
    });
    const r = go(s, o);
    assert.equal(r.action.kind, 'weapon');
    if (r.action.kind === 'weapon') assert.equal(r.action.target, '2');
  });
  it('无怪可点 → none', () => {
    assert.deepEqual(go(snap(), opt()).action, { kind: 'none' });
  });
  it('EtherTap 跳过魔法', () => {
    const o = opt();
    o.main.etherTap = true;
    o.main.highSkillCondition = '';
    const s = snap({
      monsters: [mon('1', 500, { marks: ['coalescemana'] })],
      monsterAlive: 1,
      skills: { '163': true },
    });
    const r = go(s, o);
    assert.notEqual(JSON.stringify(r.action).includes('"163"'), true);
  });
});

describe('orderTargets/resolveTarget', () => {
  it('死怪垫底，血少优先', () => {
    const ids = orderTargets(
      [
        { id: '1', name: 'Slime', hpNow: 900, marks: [] },
        { id: '2', name: 'Mimic', hpNow: Infinity, marks: [] },
        { id: '3', name: 'Bat', hpNow: 100, marks: [] },
      ],
      {},
      false,
    );
    assert.deepEqual(ids, ['3', '1', '2']);
  });
  it('reverse 反转但死怪仍垫底', () => {
    const ids = orderTargets(
      [
        { id: '1', name: 'Slime', hpNow: 900, marks: [] },
        { id: '2', name: 'Mimic', hpNow: Infinity, marks: [] },
        { id: '3', name: 'Bat', hpNow: 100, marks: [] },
      ],
      {},
      true,
    );
    assert.deepEqual(ids, ['1', '3', '2']);
  });
  it('debuff 权重修正', () => {
    const ids = orderTargets(
      [
        { id: '1', name: 'Slime', hpNow: 500, marks: [] },
        { id: '2', name: 'Bat', hpNow: 500, marks: ['imperil'] },
      ],
      { Im: 100 },
      false,
    );
    assert.deepEqual(ids, ['1', '2']);
  });
  it('Yggdrasil 活着永远置顶（正序/反序都一样）', () => {
    const ms = [
      { id: '1', name: 'Slime', hpNow: 100, marks: [] },
      { id: '2', name: 'Yggdrasil', hpNow: 9000, marks: [] },
      { id: '3', name: 'Bat', hpNow: 200, marks: [] },
    ];
    assert.deepEqual(orderTargets(ms, {}, false), ['2', '1', '3']);
    assert.deepEqual(orderTargets(ms, {}, true), ['2', '3', '1']);
  });
  it('Yggdrasil 大小写/空格不敏感，死了不置顶', () => {
    const ms = [
      { id: '1', name: 'Slime', hpNow: 100, marks: [] },
      { id: '2', name: '  YGGDRASIL ', hpNow: Infinity, marks: [] },
    ];
    assert.deepEqual(orderTargets(ms, {}, false), ['1', '2']);
  });
  it('decide 集火 Yggdrasil', () => {
    const s = snap({
      monsters: [mon('1', 100, { name: 'Slime' }), mon('2', 9000, { name: 'Yggdrasil' })],
      monsterAlive: 2,
    });
    assert.deepEqual(go(s, opt()).action, { kind: 'attack', target: '2' });
  });
  it('resolveTarget 顺延可点活怪', () => {
    const ms = [mon('1', 100), mon('2', Infinity, { clickable: false }), mon('3', 100)];
    assert.equal(resolveTarget(ms, '2'), '1');
    assert.equal(resolveTarget(ms, '3'), '3');
    assert.equal(resolveTarget([mon('1', Infinity, { clickable: false })], '1'), null);
  });
});

describe('shouldEmergencyPause 保底线', () => {  it('跌破开停机，关闭/NaN 不触发', () => {
    assert.equal(shouldEmergencyPause(10, true, 15), true);
    assert.equal(shouldEmergencyPause(15, true, 15), true);
    assert.equal(shouldEmergencyPause(16, true, 15), false);
    assert.equal(shouldEmergencyPause(5, false, 15), false);
    assert.equal(shouldEmergencyPause(NaN, true, 15), false);
  });
});

describe('context 条件求值', () => {
  it('isCd/buffTurn 读快照', () => {
    const s = snap({
      skills: { '411': true },
      buffs: [{ src: 'x/haste.png', bid: '', name: 'Haste', turns: 3, scroll: false }],
    });
    const ctx = evalContext(s);
    assert.equal(checkExpr('isCd(411) == 0', ctx), true);
    assert.equal(checkExpr('isCd(999) == 1', ctx), true);
    assert.equal(checkExpr('buffTurn("haste") >= 2', ctx), true);
    assert.equal(checkExpr('buffTurn("nope") == 0', ctx), true);
  });
  it('空条件恒成立，坏表达式 fail-closed', () => {
    const ctx = evalContext(snap());
    assert.equal(checkExpr('', ctx), true);
    assert.equal(checkExpr(undefined, ctx), true);
    assert.equal(checkExpr('hp <', ctx), false);
    assert.equal(checkExpr('hp < 50', ctx), false);
  });
});

describe('describeAction 标签', () => {
  it('全类型覆盖', () => {
    assert.equal(describeAction({ kind: 'none' }), '等待');
    assert.equal(describeAction({ kind: 'gem' }), '宝石');
    assert.equal(describeAction({ kind: 'item', id: '311', key: 'Cure' }), '物品 Cure');
    assert.equal(describeAction({ kind: 'defend' }), 'Defend');
    assert.equal(describeAction({ kind: 'focus' }), 'Focus');
    assert.equal(describeAction({ kind: 'spirit', on: true }), '开 Spirit');
    assert.equal(describeAction({ kind: 'spirit', on: false }), '关 Spirit');
    assert.equal(describeAction({ kind: 'scroll', id: '13111' }), '卷轴 13111');
    assert.equal(
      describeAction({ kind: 'scroll', id: '13111' }, { '13111': 'Scroll of Protection' }),
      '卷轴 Scroll of Protection',
    );
    assert.equal(describeAction({ kind: 'buff', id: '411' }), 'Buff 411');
    assert.equal(describeAction({ kind: 'draught', id: '11191' }), '药剂 11191');
    assert.equal(describeAction({ kind: 'infusion', id: '12601' }), '魔药 12601');
    assert.equal(describeAction({ kind: 'imperil', target: '2' }), 'Imperil → 2');
    assert.equal(describeAction({ kind: 'debuff', id: '213', target: '2' }), 'Debuff 213 → 2');
    assert.equal(describeAction({ kind: 'magic', id: '163', target: '1' }), '魔法 163 → 1');
    assert.equal(
      describeAction({ kind: 'magic', id: '163', target: '1' }, { '163': 'Ragnarok' }),
      '魔法 Ragnarok → 1',
    );
    assert.equal(describeAction({ kind: 'weapon', id: '1111', key: 'OFC', target: '1' }), 'OFC → 1');
    assert.equal(describeAction({ kind: 'attack', target: '3' }), '普攻 → 3');
    assert.equal(describeAction({ kind: 'halt', message: 'x' }), '暂停(异常)');
  });
});
