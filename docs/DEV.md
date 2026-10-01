# 开发文档（ahvauto TS 重写版）

相关文档：`README.md`（用户手册）、`docs/CLASSES.md`（战士/法师玩法对照，改配置先看）、
`docs/ARCHITECTURE.md`（系统架构）、`docs/COMBAT.md`（战斗算法）、
`docs/ITEMS.md`（物品接口）、`docs/SKILLS.md`（技能接口）、
`src/lib/expr/GRAMMAR.md`（条件表达式规格）、`scripts/cdp/README.md`（浏览器运维）。

## 常驻后台进程

| 进程                        | 启动                                                                            | 作用                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `npm run dev`（vite :5173） | `setsid nohup npm run dev > logs/dev-server.log 2>&1 < /dev/null &`             | VM dev 版（`server:` 安装）热更新源。改 `src/` 即触发页面 reload，新代码直接生效，**不用重装脚本** |
| `vite build --watch`        | `setsid nohup npx vite build --watch > logs/build-watch.log 2>&1 < /dev/null &` | `src/` 变动自动重编 `dist/ahvauto.user.js`（生产安装包）                                           |

验证 dev 联通：改完 reload 页面，悬浮钮统一显示 `hvAA·dev`（dev/dist 均此文案，不再用于区分版本；以热更新生效为准）。

## 常用命令

```bash
npm test    # 单元测试（tsc 编译到 /tmp + node --test，零依赖）
npm run check   # svelte-check + tsc（0 errors 方可合）
npm run lint / npm run fmt:check   # 只读检查（oxlint / oxfmt）
npm run lint:fix / npm run fmt     # 落盘修复
npm run build   # 生产打包 dist/
npx tsx scripts/cdp/<脚本>.ts   # 浏览器运维（见 scripts/cdp/README.md）
```

提交走 conventional commits（英文）；不提交 `logs/`、`dist/`、`__tmp-*`。

`npm test` 说明：测试经 tsc 编译后跑；`stats.test.ts` 等依赖 localStorage 的用例跑在
`node --localstorage-file=/tmp/hvaa-test-ls.json` 真存储上（Node 26 原生 global 盖掉 stub）。
`src/**/*.test.ts` 已在 tsconfig exclude，不进打包类型检查。

## 存储命名空间（铁律）

- 旧脚本：`hvAA-` 前缀——**只读不写**。
- 新脚本：`ahvauto-` 前缀（`ahvauto-option` / `ahvauto-disabled` / KV / 日志 / 备份）。
- 旧配置不再自动导入，需面板“关于→导入旧配置”手动触发（含权重、条件翻译），见 `src/lib/legacy-import.ts`。

## 安全铁律（测战斗时）

1. `inject*` 前必须 `verify` 通过（`ahvauto-disabled` 置位，角色暂停）。
2. 注入的要么是预览 bundle（不跑战斗逻辑），要么在暂停预置下注入全量。
3. 会话前后 `backup` 留档，`logs/` 已 gitignore。
4. 不点游戏战斗按钮，不用高级道具（脚本里没有这类操作；要加先确认）。
5. 保底停机线默认开：血量 ≤15% 暂停＋告警（`hpFloorPause/hpFloor`，主要选项可调）。

## 调试面

- `window.__hvaa`：核心字段 `{step（规则名）/lastError/lastAction/history/nr}` ＋页世界钩子附加 `{apiCalls/lastReq/lastSend/fired}`（＋独立序号 `__hvaaSeq`），只读定位 stall。
- IDB `ahvauto-debug`：`records`（请求/响应配对，keyPath seq，v4）、`turns`（每回合快照＋规则＋动作）。
  ⚠️ 外部工具 open IDB **不许带版本号**（会空提交版本跳过升级，v2 就是这么坏的）。
- `ahvauto-logs`：logtape 日志（含 `fsm boot -> battle`、`rec begin/end` 转移）。
- 门控：`main.debug` 开才写 IDB 录制；数据统计门控 `recordUsage`。
- `logs/`：战斗快照、录制导出、localStorage 备份（不出仓库）。

## 已知的坑（别再踩）

1. 游戏页把 `localStorage.setItem` 包了一层，静默丢弃 `hvAA*` 开头 key——`hvAA*` 禁 `setItem`（`preview-ui.ts` 拦截器同理），其余直接赋值（`store.ts` 有注释）。
2. `Infinity` 过 JSON 变 `null`——读回必须归一化（死亡判定依赖）。
3. `src` 生产入口（`src/main.ts`，monkey 打包）禁动态 `import()`，会切 SystemJS（页内无 `System` 直接暴毙）——`src/preview-ui.ts`＋`vite.preview.config.ts` 临时预览链（不过 monkey）豁免。
4. （已删除：`postMessage` 录制桥已移除，统计走 `handleRec` 直调。）
5. `bind:` 传 `undefined` 会炸 tab 切换（`props_invalid_value`）——必须预填 key：item/buff/debuff/scroll conditions＋enabledMap、debuff.turns、rule.weights、channel.first/useSecond、scroll.roundTypes/first、alarm.audio/audioEnable/telegram/webhook（`backfill/backfillBool/backfillNum/backfillAlarm`＋单测守护）。
6. 集火排序恒升序（原版亦然），`ruleReverse` 只反公式不反排序；点目标前验 `onclick`（死怪没有）。
7. 魔法 lock＋目标必须同回合两次点击（游戏机制），只锁不等于是 stall 主因之一。
8. 发包三道门（忙/已锁/在途）会静默吞点击——看门狗（8s 补点／25s 重载）是最终兜底。
9. `delayReload`（用户配置 30s）调试期会掀桌子（reload 清注入态）；常驻版无此问题。
10. CDP `evaluate` 偶发把游戏页自身未捕获异常算到结果头上——`common.ts` 只在无有效值时才抛。
11. 全仓禁 `eval`/`new Function`（CSP + 外来陌生配置）。
