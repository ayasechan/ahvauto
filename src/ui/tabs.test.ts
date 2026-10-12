import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TAB_DEFS, TAB_GROUPS } from './tabs';
import { defaultOptions } from '../config/defaults';

describe('ui tabs registry', () => {
  it('13 页，name 唯一，顺序即展示顺序', () => {
    assert.deepEqual(
      TAB_DEFS.map((t) => t.name),
      [
        'Main',
        'Item',
        'Channel',
        'Buff',
        'Debuff',
        'Skill',
        'Scroll',
        'Infusion',
        'Alarm',
        'Rule',
        'Usage',
        'About',
        'Feedback',
      ],
    );
  });
  it('7 个可开关页有 check，其余 6 个无', () => {
    assert.deepEqual(
      TAB_DEFS.filter((t) => t.check).map((t) => t.name),
      ['Channel', 'Buff', 'Debuff', 'Skill', 'Scroll', 'Infusion', 'Usage'],
    );
  });
  it('check get/set 回环：默认关→开→关', () => {
    for (const t of TAB_DEFS.filter((t) => t.check)) {
      const o = defaultOptions();
      assert.equal(t.check!.get(o), false);
      t.check!.set(o, true);
      assert.equal(t.check!.get(o), true);
      t.check!.set(o, false);
      assert.equal(t.check!.get(o), false);
    }
  });
  it('开关互相独立：开 Buff 不影响 Channel/Usage', () => {
    const o = defaultOptions();
    TAB_DEFS.find((t) => t.name === 'Buff')!.check!.set(o, true);
    assert.equal(TAB_DEFS.find((t) => t.name === 'Channel')!.check!.get(o), false);
    assert.equal(TAB_DEFS.find((t) => t.name === 'Usage')!.check!.get(o), false);
    assert.equal(o.debuff.enabled, false);
  });
  it('分组覆盖全部 13 页：battle 7 / item 3 / monitor 1 / sys 2', () => {
    assert.deepEqual(
      TAB_GROUPS.map((g) => g.key),
      ['battle', 'item', 'monitor', 'sys'],
    );
    const count = (group: string): number => TAB_DEFS.filter((t) => t.group === group).length;
    assert.deepEqual(
      [count('battle'), count('item'), count('monitor'), count('sys')],
      [7, 3, 1, 2],
    );
    for (const t of TAB_DEFS) {
      assert.ok(
        TAB_GROUPS.some((g) => g.key === t.group),
        `tab ${t.name} 的 group 无归属`,
      );
    }
  });
});
