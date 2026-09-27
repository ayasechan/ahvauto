import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseBattleForm } from './meta';

/** 线上真实片段（2026-09 arena/gr/rb 页实测） */
const AR_HTML = `
<form id="initform" action="" method="post">
<input type="hidden" id="initid" name="initid" value="">
<input type="hidden" name="postoken" value="abc123">
</form>
<img src="startchallenge.png" onclick="init_battle(19,0)">
<img src="startchallenge.png" onclick="init_battle(111,5)">
<script>function init_battle(id, entrycost) {}</script>
`;

const GR_HTML = `
<input type="hidden" name="postoken" value="xyz789">
<img src="startgrindfest.png" onclick="init_battle(1)">
`;

describe('parseBattleForm 线上格式', () => {
  it('ar 页：postoken＋id 表，第二参是费用照收', () => {
    const t = parseBattleForm(AR_HTML);
    assert.equal(t.postoken, 'abc123');
    assert.equal(t.ids['19'], '0');
    assert.equal(t.ids['111'], '5');
  });
  it('函数定义 init_battle(id, entrycost) 不被误收', () => {
    const t = parseBattleForm(AR_HTML);
    assert.equal('id' in t.ids, false);
  });
  it('gr 页：init_battle(1)', () => {
    const t = parseBattleForm(GR_HTML);
    assert.equal(t.postoken, 'xyz789');
    assert.equal(t.ids['1'], '');
  });
  it('无 postoken 返回 null', () => {
    const t = parseBattleForm('<html></html>');
    assert.equal(t.postoken, null);
    assert.deepEqual(t.ids, {});
  });
});
