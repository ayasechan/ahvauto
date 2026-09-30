import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isLegacyOption, importLegacyOption } from './legacy-import';

/** 按用户真实旧配置裁剪的 fixture */
const OLD = {
  version: '2.86',
  lang: '0',
  attackStatus: 6,
  fightingStyle: '5',
  hp1: 50,
  mp1: 70,
  sp1: 75,
  alert: true,
  encounter: true,
  idleArena: true,
  idleArenaValue: '35,34,33',
  idleArenaLevels: '500,400,300',
  delay: 200,
  delay2: 30,
  staminaPause: true,
  staminaWarn: true,
  staminaLose: 1,
  riddleAnswerTime: 1,
  scrollFirst: true,
  repairValue: 10,
  itemOrderName: 'HP,MP,Cure',
  itemOrderValue: '11195,11295,311',
  item: { HP: true, MP: true, Cure: true },
  itemCureCondition: { '0': ['hp,2,60'] },
  buffSkillSwitch: true,
  buffSkillOrderValue: 'SL,Ab',
  buffSkill: { SL: true, Ab: true, HD: true },
  buffSkillSDCondition: { '0': ['sp,2,90'] },
  debuffSkillSwitch: true,
  debuffSkillOrderValue: 'Sle,Im',
  debuffSkill: { Im: true, MN: true },
  debuffSkillAllIm: true,
  debuffSkillTurn: { Im: 5 },
  debuffSkillSleCondition: { '0': ['monsterAlive,1,8'] },
  skillSwitch: true,
  skillOrderValue: 'T3,T2,T1',
  skill: { T3: true, T2: true, T1: true },
  skillT3Condition: { '0': ['bossAlive,3,1'], '1': ['monsterAlive,3,6'] },
  scrollSwitch: true,
  scrollRoundType: { ar: true, gr: true },
  scroll: { Pr: true, Sw: true },
  scrollPrCondition: { '0': ['roundNow,1,300'], '1': ['roundType,5,"iw"', 'roundNow,1,60'] },
  infusionSwitch: true,
  infusionCondition: { '2': ['roundNow,5,95'] },
  middleSkillCondition: { '0': ['monsterAlive,3,1'] },
  turnOnSSCondition: { '0': ['oc,3,235'], '1': ['roundNow,2,5', 'oc,3,100'] },
  focusCondition: { '0': ['oc,3,100'] },
  turnOffSSCondition: { '0': ['oc,4,100', 'roundLeft,4,3'] },
  audioEnable: { Common: true, Riddle: true },
  audio: { Riddle: 'data:audio/mp3;base64,AAA' },
  weight: { Sle: 0, Bl: -3, Im: 10, MN: 4, Si: -10, CM: 3 },
  ruleReverse: true,
  dropMonitor: true,
  dropQuality: '6',
  recordUsage: true,
};

describe('旧配置导入', () => {
  it('识别旧格式', () => {
    assert.equal(isLegacyOption(OLD), true);
    assert.equal(isLegacyOption({ version: '3.0.0' }), false);
    assert.equal(isLegacyOption(null), false);
    assert.equal(isLegacyOption({}), false);
  });
  it('主选项与权重', () => {
    const o = importLegacyOption(OLD);
    assert.equal(o.main.attackStatus, 6);
    assert.equal(o.main.fightingStyle, '5');
    assert.equal(o.main.encounter, true);
    assert.equal(o.main.turnOnSS, false);
    assert.equal(o.main.spellDelay, 200);
    assert.equal(o.main.noSpellDelay, 30);
    assert.deepEqual(o.rule.weights, { Sle: 0, Bl: -3, Im: 10, MN: 4, Si: -10, CM: 3 });
    assert.equal(o.rule.reverse, true);
    assert.equal(o.dropQuality, '6');
    assert.equal(o.version, '3.0.0');
  });
  it('条件翻译', () => {
    const o = importLegacyOption(OLD);
    assert.equal(o.item.conditions.Cure, '(hp < 60)');
    assert.equal(o.main.middleSkillCondition, '(monsterAlive >= 1)');
    assert.equal(o.main.turnOnSSCondition, '(oc >= 235) or (roundNow < 5 and oc >= 100)');
    assert.equal(o.debuff.conditions.Sle, '(monsterAlive > 8)');
    assert.equal(
      o.scroll.conditions.Pr,
      '(roundNow > 300) or (roundType == "iw" and roundNow > 60)',
    );
    assert.equal(o.skill.t3Condition, '(bossAlive >= 1) or (monsterAlive >= 6)');
    assert.equal(o.infusion.condition, '(roundNow == 95)');
    assert.equal(o.main.turnOffSSCondition, '(oc <= 100 and roundLeft <= 3)');
    assert.equal(o.main.defendCondition, '');
    assert.equal(o.buff.conditions.HD, '');
  });
  it('顺序与开关', () => {
    const o = importLegacyOption(OLD);
    assert.deepEqual(o.item.order, [
      { key: 'HP', id: '11195' },
      { key: 'MP', id: '11295' },
      { key: 'Cure', id: '311' },
    ]);
    assert.deepEqual(o.buff.order, ['SL', 'Ab']);
    assert.deepEqual(o.skill.order, ['T3', 'T2', 'T1']);
    assert.equal(o.skill.t3, true);
    assert.equal(o.skill.ofc, false);
    assert.equal(o.debuff.allIm, true);
    assert.deepEqual(o.debuff.turns, { Im: 5 });
    assert.equal(o.scroll.roundTypes.ar, true);
    assert.equal(o.scroll.roundTypes.rb, false);
    assert.equal(o.channel.enabled, false);
    assert.equal(o.alarm.audio.Riddle, 'data:audio/mp3;base64,AAA');
  });
});
