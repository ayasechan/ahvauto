import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LOG_LEVELS, isAppLogLevel, resolveLogLevel } from './logger';
import { sanitizeOptions } from '../config/options';

describe('LOG_LEVELS（面板可选四档）', () => {
  it('固定为 debug/info/warning/error，不含 trace/fatal', () => {
    assert.deepEqual([...LOG_LEVELS], ['debug', 'info', 'warning', 'error']);
  });
  it('isAppLogLevel 拒绝 trace/fatal/非法值', () => {
    assert.equal(isAppLogLevel('info'), true);
    assert.equal(isAppLogLevel('trace'), false);
    assert.equal(isAppLogLevel('fatal'), false);
    assert.equal(isAppLogLevel('verbose'), false);
    assert.equal(isAppLogLevel(undefined), false);
  });
});

describe('resolveLogLevel（阈值归一化＋老配置迁移）', () => {
  it('合法值直通', () => {
    assert.equal(resolveLogLevel('warning', false), 'warning');
    assert.equal(resolveLogLevel('error', true), 'error');
  });
  it('非法/缺失回 info，debug 开才补 debug', () => {
    assert.equal(resolveLogLevel(undefined, false), 'info');
    assert.equal(resolveLogLevel('verbose', false), 'info');
    assert.equal(resolveLogLevel(undefined, true), 'debug');
  });
});

describe('sanitizeOptions logLevel 迁移', () => {
  it('缺字段＋debug:true→补 debug；缺字段＋debug 关→info', () => {
    const a = sanitizeOptions({ main: { debug: true } });
    assert.equal(a?.main.logLevel, 'debug');
    const b = sanitizeOptions({ main: { debug: false } });
    assert.equal(b?.main.logLevel, 'info');
  });
  it('显式 logLevel 优先于 debug；非法值回落', () => {
    const a = sanitizeOptions({ main: { debug: true, logLevel: 'warning' } });
    assert.equal(a?.main.logLevel, 'warning');
    const b = sanitizeOptions({ main: { debug: false, logLevel: 'verbose' } });
    assert.equal(b?.main.logLevel, 'info');
  });
});
