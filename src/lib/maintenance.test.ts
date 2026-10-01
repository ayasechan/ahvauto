import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { kvSet, kvGet } from './store';
import { BATTLES_KEY } from './storage-keys';
import { pruneBattles, BATTLES_CAP, clearStats } from './stats';

beforeEach(() => {
  clearStats();
});

describe('idle prune (non-battle)', () => {
  it('pruneBattles 只留最新 BATTLES_CAP 场', () => {
    const rows = Array.from({ length: BATTLES_CAP + 5 }, (_, i) => i + 1);
    kvSet(BATTLES_KEY, rows);
    pruneBattles();
    const kept = kvGet(BATTLES_KEY, true) as number[];
    assert.equal(kept.length, BATTLES_CAP);
    assert.deepEqual(kept.slice(0, 2), [6, 7]);
  });

  it('pruneBattles 未超限不碰', () => {
    kvSet(BATTLES_KEY, [1, 2, 3]);
    pruneBattles();
    assert.deepEqual(kvGet(BATTLES_KEY, true), [1, 2, 3]);
  });
});
