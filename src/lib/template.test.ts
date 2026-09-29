import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderTemplate } from './template';
import type { WebhookVars } from './template';

const VARS: WebhookVars = {
  kind: 'Defeat',
  title: 'hvAutoAttack 战败',
  text: 'line1\nline2',
  url: 'https://hentaiverse.org/?s=Battle&ss=ba',
  time: '2026-09-29T00:00:00.000Z',
};

describe('renderTemplate', () => {
  it('替换全部 5 个变量', () => {
    const out = renderTemplate('{kind}|{title}|{text}|{url}|{time}', VARS);
    assert.equal(out, 'Defeat|hvAutoAttack 战败|line1\nline2|https://hentaiverse.org/?s=Battle&ss=ba|2026-09-29T00:00:00.000Z');
  });
  it('同一变量出现多次全换，不误伤 JSON 双花括号', () => {
    const out = renderTemplate('{"kind":"{kind}","x":{},"more":"{kind}"}', VARS);
    assert.equal(out, '{"kind":"Defeat","x":{},"more":"Defeat"}');
  });
  it('未知占位原样保留', () => {
    assert.equal(renderTemplate('{kind} {foo} { Kind}', VARS), 'Defeat {foo} { Kind}');
  });
  it('空模板返回空串', () => {
    assert.equal(renderTemplate('', VARS), '');
  });
});
