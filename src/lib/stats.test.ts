import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTurn,
  stripHtml,
  battlesToCsv,
  dropsToCsv,
  topDrops,
  foldDrops,
  formatDrops,
  deriveTotals,
  applyTurnToCur,
  rowFromCur,
  addCost,
  addKills,
  normalizeDrop,
  dropColorKind,
  equipQuality,
  displayDropKey,
  dropGroup,
  groupedDrops,
  takenAvg,
  takenPhysAvg,
  takenMagAvg,
  emptyTurn,
  emptyTotals,
  newCur,
  BATTLES_CAP,
} from './stats';
import type { BattleRow, Totals, CurBattle } from './stats';

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

/** 单场行工厂：全量 TurnStat 默认＋按需覆盖（v3 行恒全量）。 */
function makeRow(over: Partial<BattleRow> = {}): BattleRow {
  return {
    ...emptyTurn(),
    key: 'k',
    startedAt: 1,
    endedAt: 2,
    type: 'ar',
    code: '',
    result: 'victory',
    rounds: 1,
    turns: 1,
    monsters: 0,
    bosses: 0,
    drops: [],
    modes: {},
    ...over,
  };
}

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
    const { stat: s } = parseTurn([
      'Your spirit shield absorbs 648 points of damage from the attack into 11 points of spirit damage.',
    ]);
    assert.equal(s.taken, 11);
    assert.deepEqual(s.takenByType, { spirit: 11 });
    assert.equal(s.absorbed, 648);
    assert.equal(s.takenMag, 11);
    assert.equal(s.takenPhys, 0);
    assert.equal(s.takenCount, 1);
  });
  it('承伤物/魔拆分：pierc|crush|slash 进物理组，其余进魔法组（均值各除各的 count）', () => {
    const { stat: s } = parseTurn([
      'Kumakura Shouko hits you, causing 830 points of Piercing damage.',
      'Type Delta Astrea glances you, causing 600 points of Slashing damage.',
      'Shinokawa Shioriko uses Lost clock, which hits! You partially parry the attack, and take 4829 Fire damage.',
    ]);
    assert.equal(s.taken, 830 + 600 + 4829);
    assert.equal(s.takenCount, 3);
    assert.equal(s.takenPhys, 830 + 600);
    assert.equal(s.takenMag, 4829);
    assert.equal(s.takenPhysCount, 2);
    assert.equal(s.takenMagCount, 1);
    assert.equal(takenAvg(s), Math.round((830 + 600 + 4829) / 3));
    assert.equal(takenPhysAvg(s), Math.round((830 + 600) / 2));
    assert.equal(takenMagAvg(s), Math.round(4829 / 1));
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
  it('addKills 只改当前局（随行落盘，总数读时求和）', () => {
    const cur = newCur('ar', 'AR 1/35');
    addKills(cur, 8, 1);
    assert.equal(cur.monsters, 8);
    assert.equal(cur.bosses, 1);
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
  it('battlesToCsv 转义与 BOM（含 code/monster/boss 列）', () => {
    const rows: BattleRow[] = [
      makeRow({
        startedAt: 0,
        endedAt: 1,
        type: 'ar',
        code: 'AR 1/35',
        rounds: 3,
        turns: 9,
        damage: 100,
        taken: 5,
        exp: 10,
        credit: 2,
        kills: 1,
        monsters: 8,
        bosses: 1,
      }),
      makeRow({
        startedAt: 1,
        endedAt: 2,
        type: 'ba',
        code: 'BA 1/1',
        result: 'defeat',
        rounds: 1,
        turns: 10,
        damage: 200,
        taken: 6,
        exp: 20,
        kills: 2,
        monsters: 3,
        drops: ['a,b', 'c"d'],
      }),
    ];
    const csv = battlesToCsv(rows);
    assert.equal(csv.charCodeAt(0), 0xfeff);
    const lines = csv.split('\n');
    assert.equal(
      lines[0].replace(/^\uFEFF/, ''),
      'time,type,code,result,rounds,turns,damage,taken,kills,monster,boss,exp,credit,drops',
    );
    assert.ok(lines[1].includes(',ar,AR 1/35,victory,3,9,100,5,1,8,1,10,2,'));
    assert.ok(lines[2].includes('"a,b; c""d"'));
  });
  it('格挡/招架计入 evade（原口径）', () => {
    assert.equal(parseTurn(['You parry the attack from Goblin.']).stat.evades, 1);
    assert.equal(parseTurn(['You block the attack from Goblin.']).stat.evades, 1);
  });
  it('掉落颜色识别（红装/水晶/金币）', () => {
    assert.equal(dropColorKind('<span style="color:#FF0000">[Peerless Sword]</span>'), 'equip');
    assert.equal(dropColorKind('<span style="color:rgb(186, 5, 180)">[Crystal]</span>'), 'crystal');
    assert.equal(dropColorKind('<span style="color:#A89000">[127 Credits]</span>'), 'credit');
    assert.equal(dropColorKind('plain text'), '');
  });
  it('红装记全名＋档位/文本过滤，无品质词不记录', () => {
    assert.deepEqual(normalizeDrop('Peerless Sword of Doom', 'equip', ''), [
      'Peerless Sword of Doom',
    ]);
    assert.deepEqual(normalizeDrop('Peerless Sword of Doom', 'equip', '6'), [
      'Peerless Sword of Doom',
    ]);
    assert.equal(normalizeDrop('Average Sword of Doom', 'equip', '6'), null);
    assert.equal(normalizeDrop('Peerless Sword of Doom', 'equip', 'Epic'), null);
    assert.deepEqual(normalizeDrop('Peerless Sword of Doom', 'equip', 'Peerless'), [
      'Peerless Sword of Doom',
    ]);
    assert.equal(normalizeDrop('Sword of Doom', 'equip', ''), null);
    assert.deepEqual(normalizeDrop('Average Sword of Doom', 'equip', '8'), [
      'Average Sword of Doom',
    ]);
    assert.deepEqual(normalizeDrop('Average Sword of Doom', 'equip', '99'), [
      'Average Sword of Doom',
    ]);
  });
  it('水晶 Nx 展开，Credit 不进 drops', () => {
    assert.deepEqual(normalizeDrop('2x Crystal of Unknown', 'crystal'), [
      'Crystal of Unknown',
      'Crystal of Unknown',
    ]);
    assert.deepEqual(normalizeDrop('Crystal of Unknown', 'crystal'), ['Crystal of Unknown']);
    assert.equal(normalizeDrop('127 Credits', 'credit'), null);
  });
  it('红装行经 parseTurn 记全名（含 HTML 颜色）', () => {
    const { drops } = parseTurn([
      'Goblin dropped <span style="color:#FF0000">[Peerless Sword of Doom]</span>',
    ]);
    assert.deepEqual(drops, ['Peerless Sword of Doom']);
  });
  it('结算奖励纳入统计：Bonus/obtained/gainCredit', () => {
    assert.deepEqual(
      parseTurn(['Arena Token Bonus! <span style="color:#254117">[Chaos Token]</span>']).drops,
      ['Chaos Token'],
    );
    assert.deepEqual(
      parseTurn([
        'Battle Clear Bonus! <span style="color:#FF0000">[Superior Estoc of Slaughter]</span>',
      ]).drops,
      ['Superior Estoc of Slaughter'],
    );
    assert.deepEqual(
      parseTurn(['You obtained 5x <span style="color:#254117">[Soul Fragments]</span>']).drops,
      Array(5).fill('Soul Fragments'),
    );
    const gained = parseTurn(['You gain 1000 Credits!']);
    assert.equal(gained.stat.credit, 1000);
    assert.deepEqual(gained.drops, []);
  });
  it('展示只分品质不分基型（equipQuality/displayDropKey）', () => {
    assert.equal(equipQuality('Superior Estoc of Slaughter'), 'Superior');
    assert.equal(equipQuality('Superior Redwood Staff of the Fox'), 'Superior');
    assert.equal(equipQuality('Scroll of Absorption'), null);
    assert.equal(displayDropKey('Superior Estoc of Slaughter'), 'Equipment of Superior');
    assert.equal(displayDropKey('Superior Redwood Staff of the Fox'), 'Equipment of Superior');
    assert.equal(displayDropKey('Crystal of Unknown'), 'Crystal of Unknown');
    assert.equal(
      formatDrops(['Superior Estoc of Slaughter', 'Superior Redwood Staff of the Fox']),
      'Equipment of Superior×2',
    );
    assert.deepEqual(
      topDrops(
        { drops: { 'Superior Estoc of Slaughter': 1, 'Superior Redwood Staff of the Fox': 2 } },
        10,
      ),
      [['Equipment of Superior', 3]],
    );
  });
  it('相同掉落累加折叠：首见顺序＋×n（空数组返回空）', () => {
    assert.deepEqual(foldDrops(['a', 'b', 'a', 'a', 'b', 'c']), [
      ['a', 3],
      ['b', 2],
      ['c', 1],
    ]);
    assert.deepEqual(foldDrops([]), []);
    assert.equal(formatDrops(['a', 'b', 'a']), 'a×2; b');
    assert.equal(formatDrops(['Scroll of Absorption']), 'Scroll of Absorption');
    assert.equal(formatDrops([]), '');
  });
  it('单场 CSV 相同掉落折叠为×n', () => {
    const rows: BattleRow[] = [
      makeRow({ drops: ['Crystal of Unknown', 'Crystal of Unknown', 'Scroll of Absorption'] }),
    ];
    assert.ok(battlesToCsv(rows).includes('Crystal of Unknown×2; Scroll of Absorption'));
  });
});

describe('行内累加＋读时求和（v3）', () => {
  it('applyTurnToCur：全字段并入当前局（含承伤拆分/回复/掉落/分布）', () => {
    const cur: CurBattle = newCur('ar', 'AR 1/35');
    const { stat: st, drops } = parseTurn(TURN_VICTORY);
    applyTurnToCur(cur, st, drops);
    assert.equal(cur.turns, 1);
    assert.equal(cur.damage, 266990);
    assert.equal(cur.kills, 1);
    assert.equal(cur.exp, 4273664);
    assert.equal(cur.credit, 127);
    assert.deepEqual(cur.drops, ['Scroll of Absorption']);
    assert.deepEqual(cur.casts, { Ragnarok: 1 });
    assert.equal(cur.healedHp, 2026);
  });
  it('rowFromCur：剥离 cur 主键 k，分布深拷贝', () => {
    const cur = {
      ...newCur('ba', 'BA 1/1'),
      k: 'cur',
      turns: 3,
      damage: 50,
      damageByType: { Dark: 50 },
      drops: ['x'],
    } as CurBattle & { k: string };
    const row = rowFromCur(cur, 'victory', 99);
    assert.equal((row as unknown as Record<string, unknown>).k, undefined);
    assert.equal(row.result, 'victory');
    assert.equal(row.endedAt, 99);
    assert.equal(row.turns, 3);
    assert.deepEqual(row.drops, ['x']);
    row.drops.push('mut');
    row.damageByType.Dark = 0;
    assert.deepEqual(cur.drops, ['x']);
    assert.equal(cur.damageByType.Dark, 50);
  });
  it('deriveTotals：空表回空表', () => {
    assert.deepEqual(deriveTotals([]), emptyTotals());
  });
  it('deriveTotals：标量＋分布＋掉落求和，battles=行数', () => {
    const t: Totals = deriveTotals([
      makeRow({
        startedAt: 10,
        turns: 2,
        damage: 100,
        crits: 1,
        taken: 5,
        takenPhys: 5,
        takenPhysCount: 1,
        takenCount: 1,
        exp: 7,
        credit: 3,
        kills: 1,
        monsters: 4,
        bosses: 1,
        drops: ['a', 'b', 'a'],
        damageByType: { Dark: 100 },
        casts: { Ragnarok: 1 },
        modes: { attack: 2 },
      }),
      makeRow({
        startedAt: 5,
        turns: 3,
        damage: 200,
        taken: 6,
        takenMag: 6,
        takenMagCount: 1,
        takenCount: 1,
        exp: 8,
        kills: 2,
        monsters: 2,
        drops: ['b'],
        damageByType: { Dark: 200 },
        casts: { Imperil: 1 },
        modes: { defend: 1 },
      }),
    ]);
    assert.equal(t.battles, 2);
    assert.equal(t.turns, 5);
    assert.equal(t.damage, 300);
    assert.equal(t.crits, 1);
    assert.equal(t.taken, 11);
    assert.equal(t.exp, 15);
    assert.equal(t.credit, 3);
    assert.equal(t.kills, 3);
    assert.equal(t.monsters, 6);
    assert.equal(t.bosses, 1);
    assert.equal(t.startedAt, 5);
    assert.deepEqual(t.drops, { a: 2, b: 2 });
    assert.equal(t.dropsCount, 4);
    assert.deepEqual(t.damageByType, { Dark: 300 });
    assert.deepEqual(t.casts, { Ragnarok: 1, Imperil: 1 });
    assert.deepEqual(t.modes, { attack: 2, defend: 1 });
  });
  it('deriveTotals：进行中局计入总数、battles 只计已落盘', () => {
    const live: CurBattle = { ...newCur('ar', 'AR 1/2'), startedAt: 3, turns: 4, damage: 40 };
    const t = deriveTotals([makeRow({ startedAt: 10, turns: 2, damage: 100 })], live);
    assert.equal(t.battles, 1);
    assert.equal(t.turns, 6);
    assert.equal(t.damage, 140);
    assert.equal(t.startedAt, 3);
  });
  it('topDrops/dropsToCsv：降序＋转义', () => {
    const csv = dropsToCsv({ drops: { 'a,b': 2, 'c"d': 1 } } as Totals);
    assert.equal(csv.charCodeAt(0), 0xfeff);
    const lines = csv.split('\n');
    assert.equal(lines[0].replace(/^\uFEFF/, ''), 'name,count');
    assert.ok(lines[1].startsWith('"a,b",2'));
    assert.deepEqual(topDrops({ drops: { x: 3, y: 5 } }, 1), [['y', 5]]);
    assert.deepEqual(topDrops({} as Pick<Totals, 'drops'>), []);
  });
  it('BATTLES_CAP 为 2000（IDB 全量行上限）', () => {
    assert.equal(BATTLES_CAP, 2000);
  });
});

describe('掉落分组（总表八行，market 官方口径）', () => {
  it('dropGroup：装备/消耗品/素材/奖杯/遗物/手办/怪物道具/其它', () => {
    assert.equal(dropGroup('Equipment of Superior'), 'equip');
    assert.equal(dropGroup('Superior Estoc of Slaughter'), 'equip');
    assert.equal(dropGroup('Scroll of Absorption'), 'consumable');
    assert.equal(dropGroup('Health Potion'), 'consumable');
    assert.equal(dropGroup('Mana Draught'), 'consumable');
    assert.equal(dropGroup('Infusion of Flames'), 'consumable');
    assert.equal(dropGroup('Flower Vase'), 'consumable');
    assert.equal(dropGroup('Binding of Slaughter'), 'material');
    assert.equal(dropGroup('Lesser Fire Strike Charm'), 'material');
    assert.equal(dropGroup('Low-Grade Cloth'), 'material');
    assert.equal(dropGroup('Legendary Weapon Core'), 'material');
    assert.equal(dropGroup('Voidseeker Shard'), 'material');
    assert.equal(dropGroup('Shade Fragment'), 'material');
    assert.equal(dropGroup('Unicorn Horn'), 'trophy');
    assert.equal(dropGroup('Gold Coupon'), 'trophy');
    assert.equal(dropGroup('Broken Glasses'), 'trophy');
    assert.equal(dropGroup('Bath Salts'), 'trophy');
    assert.equal(dropGroup('Precursor Artifact'), 'relic');
    assert.equal(dropGroup('Vibrant Catalyst (Final Edition)'), 'relic');
    assert.equal(dropGroup('Twilight Sparkle Figurine'), 'figure');
    assert.equal(dropGroup('Crystal of Vigor'), 'monsteritem');
    assert.equal(dropGroup('Monster Chow'), 'monsteritem');
    // `Crystal of Unknown` 为虚构名（真实为 Flames/Frost/…），专测名单外水晶进 other。
    assert.equal(dropGroup('Crystal of Unknown'), 'other');
    assert.equal(dropGroup('Chaos Token'), 'other');
    assert.equal(dropGroup('Soul Fragments'), 'other');
  });
  it('groupedDrops：恒 8 组固定行序、组内聚合降序、空组空数组', () => {
    const gs = groupedDrops({
      drops: {
        'Superior Estoc of Slaughter': 1,
        'Superior Redwood Staff of the Fox': 2,
        'Scroll of Absorption': 3,
        'Crystal of Vigor': 4,
        'Crystal of Unknown': 5,
      },
    });
    assert.deepEqual(
      gs.map((g) => g.group),
      ['equip', 'consumable', 'material', 'trophy', 'relic', 'figure', 'monsteritem', 'other'],
    );
    assert.deepEqual(gs[0].entries, [['Equipment of Superior', 3]]);
    assert.deepEqual(gs[1].entries, [['Scroll of Absorption', 3]]);
    assert.deepEqual(gs[2].entries, []);
    assert.deepEqual(gs[6].entries, [['Crystal of Vigor', 4]]);
    assert.deepEqual(gs[7].entries, [['Crystal of Unknown', 5]]);
    assert.deepEqual(
      groupedDrops({ drops: {} }).map((g) => g.entries),
      [[], [], [], [], [], [], [], []],
    );
  });
});
