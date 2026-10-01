import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { kvSet, kvGet } from './store';
import { pruneBattles, BATTLES_CAP, clearStats } from './stats';
import { pruneStoredLogs, getStoredLogs, clearStoredLogs } from './logger';
import { LOGS_KEY } from './storage-keys';

beforeEach(() => {
  clearStats();
  clearStoredLogs();
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

  it('pruneStoredLogs 只留最新 500 条', () => {
    const arr = Array.from({ length: 505 }, (_, i) => ({
      t: i,
      level: 'info',
      category: ['hvauto'],
      message: `m${i}`,
      props: {},
    }));
    localStorage[LOGS_KEY] = JSON.stringify(arr);
    pruneStoredLogs();
    const kept = getStoredLogs();
    assert.equal(kept.length, 500);
    assert.equal(kept[0].message, 'm5');
  });

  it('pruneStoredLogs 未超限不碰', () => {
    localStorage[LOGS_KEY] = JSON.stringify([
      { t: 1, level: 'info', category: ['hvauto'], message: 'a', props: {} },
    ]);
    pruneStoredLogs();
    assert.equal(getStoredLogs().length, 1);
  });
});
