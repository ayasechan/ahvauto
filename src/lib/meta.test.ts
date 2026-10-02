import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseBattleForm, parseRepairForm } from './meta';

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

/** 修装备页真实片段（2026-10-03 CDP 实录结构，postoken 已脱敏） */
const REPAIR_HTML = `
<form id="equipform" method="post"><input type="hidden" name="postoken" value="tok123">
<div id="equiplist" onmouseleave="rehover_last_checked()">
<table><tbody>
<tr class="eqselall"><th colspan="2"><label class="lc" id="equipcount"><input type="checkbox" onclick="select_all()"><span></span> Selected 0 of 2 matching equipment available to repair</label></th></tr>
<tr class="eqtplabel"><td colspan="2">Phase Armor</td></tr>
<tr onmouseover="hover_equip(270174520)" onmouseout="unhover_equip(270174520)" onclick="return select_equip(270174520,event,this)"><td><label class="lc"><input name="eqids[]" type="checkbox" id="e270174520" value="270174520"><span></span> Legendary Charged Phase Pants of Fenrir</label></td><td>95%</td></tr>
<tr onmouseover="hover_equip(281323861)" onmouseout="unhover_equip(281323861)" onclick="return select_equip(281323861,event,this)"><td><label class="lc"><input name="eqids[]" type="checkbox" id="e281323861" value="281323861"><span></span> Legendary Charged Phase Shoes of Fenrir</label></td><td>91%</td></tr>
</tbody></table></div></form>
`;

describe('parseRepairForm 线上格式', () => {
  it('postoken＋id/耐久表', () => {
    const t = parseRepairForm(REPAIR_HTML);
    assert.equal(t.postoken, 'tok123');
    assert.deepEqual(t.items, [
      { id: '270174520', durability: 95 },
      { id: '281323861', durability: 91 },
    ]);
  });
  it('修光后（无 eqids[]）返回空表', () => {
    const t = parseRepairForm('<form><input type="hidden" name="postoken" value="tok123"></form>');
    assert.equal(t.postoken, 'tok123');
    assert.deepEqual(t.items, []);
  });
  it('无 postoken 返回 null', () => {
    const t = parseRepairForm('<html></html>');
    assert.equal(t.postoken, null);
    assert.deepEqual(t.items, []);
  });
});
