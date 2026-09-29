import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { parseTurn, stripHtml, battlesToCsv, beginBattle, beginRound, endBattle, recordBattleTurn, getBattles, getTotals, getCurBattle, clearStats, recState, addCost, addKills, takenAvg, takenPhysAvg, takenMagAvg } from './stats';
import type { BattleRow, Totals, CurBattle } from './stats';
import { options, kvSet } from './store';

beforeEach(() => {
  clearStats();
  options.update((o) => ({ ...o, recordUsage: true }));
});

/** 以下 fixture 全部取自真实战斗响应（logs/battle-records-1.json），逐字引用 */

const TURN_IMPERIL = [
  'You cast Imperil.',
  'Peerlesssss2 Great Mace gains the effect Imperiled.',
  'Type Delta Astrea partially resists the effects of your spell.',
  'Type Delta Astrea gains the effect Imperiled.',
  'Type Delta Astrea glances you, causing 600 points of Slashing damage.',
  'Your spike shield hits Type Delta Astrea for 26 points of elec damage.',
  'Cooldown expired for Ragnarok',
];

const TURN_EVADE = [
  'You cast Imperil.',
  'Nana Morse gains the effect Imperiled.',
  'You evade the attack from Peerlesssss2 Great Mace.',
  'Hemidactylus uses Slashes, but misses the attack.',
];

const TURN_NUKE = [
  'You cast Disintegrate.',
  'Peerlesssss2 Great Mace  was crit for 361489 Dark damage',
  'Peerlesssss2 Great Mace has been defeated.',
  'Nana Morse  was hit for 148691 Dark damage',
  'Nana Morse has been defeated.',
  'Regen restores 2026 points of health.',
  'Regeneration restores 54 points of health.',
  'Replenishment restores 32 points of magic.',
];

const TURN_VICTORY = [
  'You cast Ragnarok.',
  'Tsunashi Kaoru  was hit for 266990 Dark damage',
  'Tsunashi Kaoru has been defeated.',
  'Regen restores 2026 points of health.',
  'You are Victorious!',
  'Tsunashi Kaoru dropped <span style="color:#A89000">[127 Credits]</span>',
  'Snake-arms Helen dropped <span style="color:#00B000">[Scroll of Absorption]</span>',
  'You gain 4273664 EXP!',
];

const TURN_POTION = [
  'You use Mana Potion.',
  'Recovered 450 points of magic.',
  'Kumakura Shouko hits you, causing 830 points of Piercing damage.',
];

describe('parseTurn 真实数据', () => {
  it('imperil 轮：施法＋承伤＋反伤，不多不少', () => {
    const { stat: s } = parseTurn(TURN_IMPERIL);
    assert.deepEqual(s.casts, { Imperil: 1 });
    assert.equal(s.taken, 600);
    assert.deepEqual(s.takenByType, { Slashing: 600 });
    assert.equal(s.damage, 26);
    assert.deepEqual(s.damageByType, { elec: 26 });
    assert.equal(s.crits, 0);
    assert.equal(s.kills, 0);
    assert.equal(s.exp, 0);
  });
  it('闪避/未命中分别计数，不计承伤', () => {
    const { stat: s } = parseTurn(TURN_EVADE);
    assert.equal(s.evades, 1);
    assert.equal(s.misses, 1);
    assert.equal(s.taken, 0);
  });
  it('核爆轮：暴击、击杀、治疗分流（回复按来源归因）', () => {
    const { stat: s } = parseTurn(TURN_NUKE);
    assert.equal(s.damage, 361489 + 148691);
    assert.equal(s.crits, 1);
    assert.deepEqual(s.damageByType, { Dark: 361489 + 148691 });
    assert.equal(s.kills, 2);
    assert.equal(s.healedHp, 2026 + 54);
    assert.equal(s.restoredMp, 32);
    assert.deepEqual(s.restoreBySource, { Regen: 2026, Regeneration: 54, Replenishment: 32 });
    assert.deepEqual(s.casts, { Disintegrate: 1 });
  });
  it('胜利轮：击杀＋掉落＋经验', () => {
    const { stat: s } = parseTurn(TURN_VICTORY);
    assert.equal(s.kills, 1);
    assert.equal(s.credit, 127);
    assert.equal(s.exp, 4273664);
    assert.deepEqual(s.casts, { Ragnarok: 1 });
  });
  it('药水轮：物品＋回蓝＋承伤（回蓝归因到所用物品）', () => {
    const { stat: s } = parseTurn(TURN_POTION);
    assert.deepEqual(s.itemsUsed, { 'Mana Potion': 1 });
    assert.equal(s.restoredMp, 450);
    assert.deepEqual(s.restoreBySource, { 'Mana Potion': 450 });
    assert.equal(s.taken, 830);
    assert.equal(s.takenPhys, 830);
    assert.equal(s.takenMag, 0);
    assert.equal(s.takenCount, 1);
  });
  it('护盾吸收：残伤计承伤，吸收量另计（残伤 spirit→魔法组）', () => {
    const { stat: s } = parseTurn(['Your spirit shield absorbs 648 points of damage from the attack into 11 points of spirit damage.']);
    assert.equal(s.taken, 11);
    assert.deepEqual(s.takenByType, { spirit: 11 });
    assert.equal(s.absorbed, 648);
    assert.equal(s.takenMag, 11);
    assert.equal(s.takenPhys, 0);
    assert.equal(s.takenCount, 1);
  });
  it('承伤物/魔拆分：pierc|crush|slash 进物理组，其余进魔法组', () => {
    const { stat: s } = parseTurn([
      'Kumakura Shouko hits you, causing 830 points of Piercing damage.',
      'Type Delta Astrea glances you, causing 600 points of Slashing damage.',
      'Shinokawa Shioriko uses Lost clock, which hits! You partially parry the attack, and take 4829 Fire damage.',
    ]);
    assert.equal(s.taken, 830 + 600 + 4829);
    assert.equal(s.takenCount, 3);
    assert.equal(s.takenPhys, 830 + 600);
    assert.equal(s.takenMag, 4829);
    assert.equal(takenAvg(s), Math.round((830 + 600 + 4829) / 3));
    assert.equal(takenPhysAvg(s), Math.round((830 + 600) / 3));
    assert.equal(takenMagAvg(s), Math.round(4829 / 3));
    assert.equal(takenAvg({ taken: 0, takenCount: 0 }), 0);
  });
  it('Vital Theft 行计伤害（无 points-of 格式，独立规则）', () => {
    const { stat: s } = parseTurn(['Vital Theft hits Goblin for 500 damage.']);
    assert.equal(s.damage, 500);
    assert.deepEqual(s.damageByType, { 'Vital Theft': 500 });
  });
  it('drain 行归因 drain（HP/MP 混记到对应总量）', () => {
    const { stat: s } = parseTurn([
      'You drain 300 HP from Goblin.',
      'You drain 200 points of magic from Goblin.',
    ]);
    assert.equal(s.healedHp, 300);
    assert.equal(s.restoredMp, 200);
    assert.deepEqual(s.restoreBySource, { drain: 500 });
  });
  it('无来源回复行沿用本轮 cast（You cast X.→X），否则记 unknown', () => {
    const withCast = parseTurn(['You cast Vital Theft.', 'Recovered 120 points of spirit.']);
    assert.equal(withCast.stat.restoredSp, 120);
    assert.deepEqual(withCast.stat.restoreBySource, { 'Vital Theft': 120 });
    const bare = parseTurn(['You are healed for 10504 Health Points.']);
    assert.equal(bare.stat.healedHp, 10504);
    assert.deepEqual(bare.stat.restoreBySource, { unknown: 10504 });
  });
  it('mpCost/ocCost 行里没有记 0，addCost 供 capture-agent 补记', () => {
    const { stat: s } = parseTurn(TURN_IMPERIL);
    assert.equal(s.mpCost, 0);
    assert.equal(s.ocCost, 0);
    addCost(s, 45, 12);
    addCost(s, 5, 3);
    assert.equal(s.mpCost, 50);
    assert.equal(s.ocCost, 15);
  });
  it('addKills 在终局补怪/Boss 构成（cur＋totals 双写，回写后随行落盘）', () => {
    beginBattle('ar', 'AR 1/35');
    recordBattleTurn(['Y was hit for 100 Dark damage']);
    const t = getTotals();
    const cur = getCurBattle();
    assert.ok(cur);
    addKills(cur as CurBattle, t as Totals, 8, 1);
    // 模拟 capture-agent 终局流程：回写 kv 后再 endBattle
    kvSet('curBattle2', cur);
    kvSet('stats2', t);
    endBattle('victory');
    const rows = getBattles();
    assert.equal(rows[0].monsters, 8);
    assert.equal(rows[0].bosses, 1);
    assert.equal(getTotals().monsters, 8);
    assert.equal(getTotals().bosses, 1);
  });
  it('直接治疗计入 healedHp', () => {
    const { stat: s } = parseTurn(['You are healed for 10504 Health Points.']);
    assert.equal(s.healedHp, 10504);
  });
  it('Focusing 单独计数，不进 buffs', () => {
    const { stat: s } = parseTurn(['You gain the effect Focusing.']);
    assert.equal(s.focus, 1);
    assert.deepEqual(s.buffs, {});
  });
  it('熟练度按原版格式累加（保留 3 位小数）', () => {
    const { stat: s } = parseTurn(['You gain 2.5 points of Dark proficiency.']);
    assert.deepEqual(s.proficiency, { Dark: 2.5 });
  });
  it('抵抗/未命中进 misses，被闪招架且受伤仍计承伤', () => {
    const { stat: s } = parseTurn([
      'Abomination partially resists the effects of your spell.',
      'Your attack misses',
    ]);
    assert.equal(s.misses, 2);
    assert.equal(s.taken, 0);
  });
  it('抵抗但命中：计伤害不计 miss（hit 优先于 miss）', () => {
    const { stat: s } = parseTurn(['Arya Stark resists, and was hit for 86331 Dark damage']);
    assert.equal(s.damage, 86331);
    assert.equal(s.misses, 0);
  });
  it('Credit 掉落只计 credit，不进 drops（credit 优先于 dropItem）', () => {
    const { stat: s, drops } = parseTurn(['Tsunashi Kaoru dropped <span>[127 Credits]</span>']);
    assert.equal(s.credit, 127);
    assert.deepEqual(drops, []);
  });
  it('实物掉落进 drops（stripHtml 后）', () => {
    const { drops } = parseTurn(['Snake-arms Helen dropped <span>[Scroll of Absorption]</span>']);
    assert.deepEqual(drops, ['Scroll of Absorption']);
  });
  it('stripHtml 去标签', () => {
    assert.equal(stripHtml('a<span style="x">[127 Credits]</span>b'), 'a[127 Credits]b');
  });
  it('battlesToCsv 转义与 BOM（含 monster/boss 列）', () => {
    const rows: BattleRow[] = [
      { key: '09/27', startedAt: 0, type: 'ar', result: 'victory', rounds: 3, turns: 9, damage: 100, taken: 5, exp: 10, credit: 2, kills: 1, monsters: 8, bosses: 1, drops: [] },
      { key: '09/27', startedAt: 1, type: 'ba', result: 'defeat', rounds: 1, turns: 10, damage: 200, taken: 6, exp: 20, credit: 0, kills: 2, monsters: 3, bosses: 0, drops: ['a,b', 'c"d'] },
    ];
    const csv = battlesToCsv(rows);
    assert.equal(csv.charCodeAt(0), 0xfeff);
    const lines = csv.split('\n');
    assert.equal(lines[0].replace(/^\uFEFF/, ''), 'time,type,result,rounds,turns,damage,taken,kills,monster,boss,exp,credit,drops');
    assert.ok(lines[1].includes(',ar,victory,3,9,100,5,1,8,1,10,2,'));
    assert.ok(lines[2].includes('"a,b; c""d"'));
  });
  it('多轮汇成一局：类型/轮数/结果', () => {
    beginBattle('ar', 'AR 1/35');
    recordBattleTurn(['You cast Imperil.', 'X has been defeated.']);
    beginRound();
    beginRound();
    recordBattleTurn(['Y was hit for 100 Dark damage']);
    assert.equal(getBattles().length, 0);
    endBattle('victory');
    const rows = getBattles();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].type, 'ar');
    assert.equal(rows[0].rounds, 3);
    assert.equal(rows[0].result, 'victory');
    assert.equal(rows[0].kills, 1);
    assert.equal(rows[0].damage, 100);
    assert.equal(getTotals().battles, 1);
    assert.equal(getTotals().turns, 2);
  });
  it('新开局顶掉未终局，记 interrupted', () => {
    beginBattle('ar', 'AR 1/35');
    recordBattleTurn(['Y was hit for 50 Dark damage']);
    beginBattle('ba', 'BA 1/1');
    const rows = getBattles();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].result, 'interrupted');
    assert.equal(rows[0].type, 'ar');
    endBattle('defeat');
    const rows2 = getBattles();
    assert.equal(rows2.length, 2);
    assert.equal(rows2[1].result, 'defeat');
    assert.equal(rows2[1].type, 'ba');
  });
  it('状态机 idle/open 转移', () => {
    assert.equal(recState(), 'idle');
    beginBattle('ar', 'x');
    assert.equal(recState(), 'open');
    endBattle('victory');
    assert.equal(recState(), 'idle');
  });
  it('endBattle 无局时忽略，不产生空行', () => {
    endBattle('victory');
    assert.equal(getBattles().length, 0);
    assert.equal(getTotals().battles, 0);
  });
  it('无局的 turn 自动开未知局，totals 可对账', () => {
    recordBattleTurn(['Y was hit for 10 Dark damage']);
    assert.equal(recState(), 'open');
    assert.equal(getTotals().turns, 1);
    endBattle('victory');
    const rows = getBattles();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].type, '?');
    assert.equal(rows[0].damage, 10);
  });
});
