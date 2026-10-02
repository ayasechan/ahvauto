import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ARENA_AR, ARENA_RB, arenaLabel, parseArenaValue, serializeArenaQueue } from './arena';

describe('arena choices（docs/ARENA.md CDP 实测）', () => {
  it('ar 14 项 / rb 7 项，id 无重叠', () => {
    assert.equal(ARENA_AR.length, 14);
    assert.equal(ARENA_RB.length, 7);
    const ids = new Set([...ARENA_AR, ...ARENA_RB].map((c) => c.id));
    assert.equal(ids.size, 21);
  });
  it('首尾映射：17=35轮 / 35=100轮 / 105=RB50 / 111=RB200', () => {
    assert.deepEqual([ARENA_AR[0].id, ARENA_AR[0].rounds], ['17', 35]);
    assert.deepEqual([ARENA_AR[13].id, ARENA_AR[13].rounds], ['35', 100]);
    assert.equal(ARENA_RB[0].id, '105');
    assert.equal(ARENA_RB[6].id, '111');
  });
  it('label：gr 特判，未知 id 原样回显', () => {
    assert.equal(arenaLabel('gr'), 'Grindfest');
    assert.equal(arenaLabel('35'), 'Lv.500 Secret Pony Level');
    assert.equal(arenaLabel('105'), 'RB50 Konata');
    assert.equal(arenaLabel('999'), '999');
  });
  it('parse/serialize 回环，未知 token 不丢', () => {
    assert.deepEqual(parseArenaValue('35,34,gr'), ['35', '34', 'gr']);
    assert.deepEqual(parseArenaValue(' , ,'), []);
    assert.equal(serializeArenaQueue(['35', 'gr']), '35,gr');
    assert.equal(serializeArenaQueue(parseArenaValue('35,999,gr')), '35,999,gr');
  });
});
