import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { gzipStr, gunzip } from './recorder';

describe('recorder gzip', () => {
  it('回环', async () => {
    const s = JSON.stringify({ seq: 7, req: { mode: 'magic', skill: 163 }, text: '中文' });
    assert.equal(await gunzip(await gzipStr(s)), s);
  });
});
