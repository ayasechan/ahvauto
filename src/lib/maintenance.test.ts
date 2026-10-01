import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { kvSet, kvGet } from './store';
import { pruneBattles, BATTLES_CAP, clearStats } from './stats';

beforeEach(() => {
  clearStats();
});

describe('idle prune (non-battle)', () => {
  it('pruneBattles 只留最新 BATTLES_CAP 场', () => {
    const rows = Array.from({ length: BATTLES_CAP + 5 }, (_, i) => i + 1);
    kvSet('battles2', rows);
    pruneBattles();
    const kept = kvGet('battles2', true) as number[];
    assert.equal(kept.length, BATTLES_CAP);
    assert.deepEqual(kept.slice(0, 2), [6, 7]);
  });

  it('pruneBattles 未超限不碰', () => {
    kvSet('battles2', [1, 2, 3]);
    pruneBattles();
    assert.deepEqual(kvGet('battles2', true), [1, 2, 3]);
  });
});
