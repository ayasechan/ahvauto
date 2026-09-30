import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compileExpression, evaluateExpression } from './index';
import type { EvalContext } from './index';
import { groupsToExpr, migrateCond, migrateOptions, BATTLE_VAR_NAMES } from './migrate';
import { battleVars } from '../conditions';

const ctx: EvalContext = {
  vars: {
    hp: 43,
    mp: 80,
    oc: 50,
    round_type: 'ar',
    turn: 5,
    target: { hp_pct: 22, debuffs: 2 },
  },
  funcs: {
    buff: (name) => {
      assert.equal(typeof name, 'string');
      return name === 'haste' ? 3 : 0;
    },
    isCd: (id) => {
      assert.equal(typeof id, 'number');
      return id === 411 ? 0 : 1;
    },
    boom: () => {
      throw new Error('should be short-circuited');
    },
  },
};

const t = (expr: string): boolean => evaluateExpression(expr, ctx);
const throws = (expr: string, part: string): void => {
  assert.throws(
    () => evaluateExpression(expr, ctx),
    (e: unknown) => {
      assert.ok(e instanceof Error);
      assert.ok(
        (e as Error).message.includes(part),
        `错误信息应包含 \`${part}\`，实际：${(e as Error).message}`,
      );
      return true;
    },
  );
};

describe('优先级与结合', () => {
  it('not > and > or', () => {
    assert.equal(t('not false and false'), false);
    assert.equal(t('not (false and false)'), true);
    assert.equal(t('not false or false'), true);
    assert.equal(t('true or false and false'), true);
    assert.equal(t('false or true and true'), true);
  });
  it('比较低于加法', () => {
    assert.equal(t('hp + 7 > 49'), true);
    assert.equal(t('2 + 3 * 4 == 14'), true);
    assert.equal(t('(2 + 3) * 4 == 20'), true);
  });
  it('一元负号', () => {
    assert.equal(t('-hp + 50 > 0'), true);
    assert.equal(t('-2 * 3 == -6'), true);
  });
  it('链式比较拒绝', () => {
    throws('1 < 2 < 3', '链式');
  });
});

describe('严格相等与类型', () => {
  it('同类型比较', () => {
    assert.equal(t('round_type == "ar"'), true);
    assert.equal(t('round_type != "rb"'), true);
    assert.equal(t('hp == 43'), true);
  });
  it('异类型 == 为 false（无隐式转换）', () => {
    assert.equal(t('hp == "43"'), false);
    assert.equal(t('hp != "43"'), true);
  });
  it('关系运算要求数字', () => {
    throws('round_type < 50', '要求数字');
    throws('hp + round_type > 0', '要求数字');
    throws('hp + "x" > 0', '要求数字');
  });
  it('and/or/not 要求布尔', () => {
    throws('hp and true', '布尔');
    throws('not hp', '布尔');
    throws('false or hp', '布尔');
  });
  it('除零抛错', () => {
    throws('1 / 0 > 0', '除数');
    throws('1 % 0 == 0', '取余');
  });
  it('顶层非布尔抛错', () => {
    throws('hp + 1', '布尔值');
  });
});

describe('变量与函数', () => {
  it('点路径', () => {
    assert.equal(t('target.hp_pct < 25'), true);
    assert.equal(t('target.debuffs == 2'), true);
  });
  it('未知变量抛错（fail-closed 上游处理）', () => {
    throws('unknown_var > 1', '未知变量');
    throws('target.nope > 1', '未知变量');
  });
  it('未知函数抛错', () => {
    throws('nosuchfn(1) > 0', '未知函数');
  });
  it('函数调用传参', () => {
    assert.equal(t('buff("haste") >= 2'), true);
    assert.equal(t('isCd(411) == 0'), true);
  });
  it('短路：右式不求值', () => {
    assert.equal(t('true or boom() == 1'), true);
    assert.equal(t('false and boom() == 1'), false);
  });
});

describe('词法错误提示', () => {
  it('拒绝 && || ! 单个 = 单引号', () => {
    throws('hp > 1 && mp > 1', 'and');
    throws('hp > 1 || mp > 1', 'or');
    throws('!true', 'not');
    throws('hp = 1', '==');
    throws("round_type == 'ar'", '双引号');
    throws('hp === 43', '严格相等');
  });
  it('字符串转义与未闭合', () => {
    assert.equal(t('"a\\"b" == "a\\"b"'), true);
    throws('"abc', '未闭合');
    throws('"\\q"', '转义');
  });
  it('空表达式与多余输入', () => {
    throws('', '为空');
    throws('   ', '为空');
    throws('hp > 1 xyz', '多余');
    throws('(hp > 1', '`)`');
  });
  it('嵌套深度上限', () => {
    throws(`${'('.repeat(70)}hp > 1${')'.repeat(70)}`, '嵌套');
  });
});

describe('未知名字的建议', () => {
  const msgOf = (expr: string): string => {
    try {
      evaluateExpression(expr, ctx);
    } catch (e) {
      assert.ok(e instanceof Error);
      return (e as Error).message;
    }
    assert.fail(`应抛错：${expr}`);
  };
  it('变量 typo 给建议', () => {
    assert.ok(msgOf('heal < 30').includes('是不是想说变量 `hp`'), msgOf('heal < 30'));
  });
  it('大小写错误优先报忽略大小写的匹配', () => {
    assert.ok(msgOf('HP < 30').includes('`hp`'), msgOf('HP < 30'));
    assert.ok(msgOf('TRUE or FALSE').includes('关键字'), msgOf('TRUE or FALSE'));
  });
  it('函数 typo 给建议', () => {
    assert.ok(msgOf('bufff("haste") > 0').includes('`buff`'), msgOf('bufff("haste") > 0'));
  });
  it('点路径 typo 给建议', () => {
    assert.ok(msgOf('target.hp_pxt < 25').includes('target.hp_pct'), msgOf('target.hp_pxt < 25'));
  });
  it('差太远不给建议', () => {
    assert.ok(!msgOf('zzzzzz > 1').includes('是不是'), msgOf('zzzzzz > 1'));
  });
});

describe('老格式迁移', () => {
  const VARS: Record<string, true> = Object.fromEntries(BATTLE_VAR_NAMES.map((k) => [k, true]));
  const lookup = (_name: string): undefined => undefined;
  it('变量名表与 battleVars 一致（漂移守护）', () => {
    assert.deepEqual([...BATTLE_VAR_NAMES].sort(), Object.keys(battleVars()).sort());
  });
  it('三元组翻译', () => {
    assert.equal(groupsToExpr({ 0: ['hp,1,50'] }, VARS, lookup), '(hp > 50)');
    assert.equal(groupsToExpr({ 0: ['_isCd_411,5,0'] }, VARS, lookup), '(isCd(411) == 0)');
    assert.equal(
      groupsToExpr({ 0: ['_buffTurn_haste,3,2'] }, VARS, lookup),
      '(buffTurn("haste") >= 2)',
    );
    assert.equal(groupsToExpr({ 0: ["roundType,5,'ar'"] }, VARS, lookup), '(roundType == "ar")');
    assert.equal(
      groupsToExpr({ 0: ['hp,1,50'], 1: ['mp,2,20'] }, VARS, lookup),
      '(hp > 50) or (mp < 20)',
    );
    assert.equal(groupsToExpr({}, VARS, lookup), '');
    assert.equal(groupsToExpr({ 0: ['hp,9,50'] }, VARS, lookup), '(false)');
    assert.equal(groupsToExpr({ 0: ['nope_var_xyz,1,50'] }, VARS, lookup), '(false)');
  });
  it('migrateCond：字符串保留/对象翻译/其他清空', () => {
    assert.equal(migrateCond('hp < 30', VARS, lookup), 'hp < 30');
    assert.equal(migrateCond({ 0: ['hp,1,50'] }, VARS, lookup), '(hp > 50)');
    assert.equal(migrateCond(undefined, VARS, lookup), '');
    assert.equal(migrateCond(42, VARS, lookup), '');
  });
  it('migrateOptions 走完整份', () => {
    const raw: Record<string, unknown> = {
      main: { defendCondition: { 0: ['hp,2,20'] }, spellDelay: 200 },
      buff: { condition: 'mp > 10', conditions: { Pr: { 0: ['mp,1,30'] } } },
      infusion: { enabled: false, condition: {} },
    };
    migrateOptions(raw);
    const main = raw.main as Record<string, unknown>;
    const buff = raw.buff as Record<string, { [k: string]: unknown }>;
    assert.equal(main.defendCondition, '(hp < 20)');
    assert.equal(main.spellDelay, 200);
    assert.equal(buff.condition, 'mp > 10');
    assert.equal(buff.conditions.Pr, '(mp > 30)');
    assert.equal((raw.infusion as Record<string, unknown>).condition, '');
  });
  it('migrateOptions 补齐缺失的条件键（bind 永不拿 undefined）', () => {
    const raw: Record<string, unknown> = {
      item: { conditions: {} },
      buff: { conditions: { Pr: '' } },
    };
    migrateOptions(raw);
    const itemConds = (raw.item as Record<string, unknown>).conditions as Record<string, unknown>;
    const buffConds = (raw.buff as Record<string, unknown>).conditions as Record<string, unknown>;
    for (const k of ['Cure', 'FC', 'HP', 'ED']) assert.equal(typeof itemConds[k], 'string');
    for (const k of ['HD', 'Pr', 'Ab']) assert.equal(typeof buffConds[k], 'string');
  });
});

describe('真实用例', () => {
  it('多行输入（换行视为空白）', () => {
    assert.equal(t('hp < 30 or\n  mp > 50 and turn >= 3'), true);
    assert.equal(t('\n\thp < 25\n'), false);
  });
  it('回血条件', () => {
    assert.equal(t('hp < 30 or (mp > 50 and oc >= 50)'), true);
  });
  it('高阶魔法', () => {
    assert.equal(t('turn >= 3 and buff("haste") >= 2'), true);
  });
  it('compile 缓存复用', () => {
    const a = compileExpression('hp < 30');
    const b = compileExpression('hp < 30');
    assert.equal(a, b);
  });
});
