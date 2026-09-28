import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { gzipStr, gunzip, keysToDelete, decodeRecordRow, decodeTurnRow } from './recorder';

describe('recorder gzip', () => {
  it('回环', async () => {
    const s = JSON.stringify({ seq: 7, req: { mode: 'magic', skill: 163 }, text: '中文' });
    assert.equal(await gunzip(await gzipStr(s)), s);
  });
});

describe('decodeRecordRow', () => {
  it('正常行回环（语义与旧实现一致：{ seq: row.seq, ...parsed }）', async () => {
    const inner = { seq: 7, tReq: 123, req: { a: 1 }, tRes: 456, res: { b: 2 }, rttMs: 333 };
    const data = await gzipStr(JSON.stringify(inner));
    assert.deepEqual(await decodeRecordRow({ seq: 9, tReq: 0, req: null, data }), {
      ...inner,
      seq: 7,
    });
  });
  it('gzip 损坏 → null', async () => {
    assert.equal(
      await decodeRecordRow({ seq: 1, tReq: 0, req: null, data: new Uint8Array([1, 2, 3]).buffer }),
      null,
    );
  });
  it('gzip 正常但非 JSON → null', async () => {
    const data = await gzipStr('not-json{{{');
    assert.equal(await decodeRecordRow({ seq: 1, tReq: 0, req: null, data }), null);
  });
});

describe('decodeTurnRow', () => {
  it('正常行回环', async () => {
    const turn = { t: 1, round: 'r1', turn: 2, rule: 'x', action: null, otos: {}, snap: null };
    const data = await gzipStr(JSON.stringify(turn));
    assert.deepEqual(await decodeTurnRow({ data }), turn);
  });
  it('坏记录 → null', async () => {
    assert.equal(await decodeTurnRow({ data: new Uint8Array([9, 9]).buffer }), null);
  });
});

describe('keysToDelete', () => {
  it('空表', () => {
    assert.deepEqual(keysToDelete([], 1000), []);
  });
  it('未超限', () => {
    assert.deepEqual(keysToDelete([1, 2, 3], 1000), []);
  });
  it('刚好', () => {
    assert.deepEqual(keysToDelete([1, 2, 3], 3), []);
  });
  it('超限删最老', () => {
    assert.deepEqual(keysToDelete([1, 2, 3, 4, 5], 3), [1, 2]);
  });
});
