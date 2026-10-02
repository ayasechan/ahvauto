# 系统架构

## 总览

```
游戏页面 DOM ──readSnapshot──▶ Snapshot ──decide──▶ Action ──execute──▶ 点击
                                   ▲                    │
                          条件表达式 (expr/)            ▼
                                               游戏 api_call → 响应
                                                     │ handleRec 直调
                                                     ▼
                                                     recorder ──▶ IDB (records/turns/logs) + stats ──▶ kv → UI
```

- **感知**（`src/lib/combat/snapshot.ts`）：每回合把 DOM 一次性读成纯 `Snapshot`
  （血蓝/怪/buff/技能可用性/姿态），是唯一把 DOM 读成快照的地方（他处仍有零散只读 DOM）。
- **决策**（`src/lib/combat/decide.ts`）：规则表按优先级求值，首个命中即决策。
  纯函数，决策单测覆盖（以 `npm test` 为准）。详见 `docs/COMBAT.md`。
- **执行**（`src/lib/combat/execute.ts`）：把动作翻译成点击。法术书/Buff 直调
  `getElementById`，其余经 `click`/`qs`（纯数字 id 回落 `getElementById`，imperil 经 `go` 回落等效直调）；卷轴/药剂/魔药走物品栏 `.bti3`；`item` 内部分流：`id > 10000` 走 `.bti3`，否则（含 Cure 311 / FC 313）走法术书（与原版“判哪点哪”同构，见 `docs/ITEMS.md`）。
- **驱动**（`src/lib/battle.ts`）：劫持 `api_call/api_response`（游戏动态查找，
  覆盖有效），响应→`eventEnd`（DOM 锚点，非导出函数）→统计→`main()` 下一轮。发包三道门会被游戏静默吞，
  看门狗（8s 补点／25s 重载）兜底。
- **UI**（`src/ui/`）：Svelte 14 页设置面板；战斗内状态条由 `battle.ts:battleInfo` 直写 `.ahvauto-log`，非 Svelte 组件。详见下。
- **分层约束**：纯逻辑（`combat/decide`、`expr`、`stats`）配单测；DOM 触点在
  `snapshot.ts`/`execute.ts`/`battle.ts`/`meta.ts`，另有 `conditions.ts`（逃跑轨，读物品栏/效果栏）、`main.ts`（挂载按钮）、`dom.ts` 本体及 `ui/`；条件求值双轨：决策内走 `combat/context.ts`（读快照），逃跑走 `conditions.ts`（读 store/DOM），勿混用。

## 目录结构

```
src/
  main.ts            # 入口：页面分流 → fsm transition（boot/field/battle/riddle）
  lib/
    combat/          # 战斗算法包（快照/决策/执行，纯逻辑＋单测）
    expr/            # 条件表达式语言
    stats/           # 数据收集 v2（类型/解析/生命周期/查询）
    *.ts             # 其余：流程编排＋配置存储＋判定支撑＋基础支撑（职责见各文件头注释）
  ui/
    tabs/            # 14 页设置面板（Main/Item/Channel/Buff/Debuff/Skill/Scroll/
                     #   Infusion/Alarm/Rule/Drop/Usage/About/Feedback）
                     # 外壳：App.svelte＋主题 theme.css＋条件编辑器 ConditionEditor.svelte
scripts/cdp/         # 浏览器运维脚本（TS，npx tsx 运行，详见其 README）
```

## 存储（铁律：`hvAA-` 只读，`ahvauto-` 读写）

| 位置                                                                           | 内容                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hvAA-option`（旧）                                                            | 原版配置，只读，“关于→导入旧配置”手动导入                                                                                                                                                                                     |
| `ahvauto-option`                                                               | 新配置（表达式字符串版条件，`store.ts:options/sanitizeOptions` 唯一读写）                                                                                                                                                     |
| `ahvauto-disabled`                                                             | 暂停位（`store.ts:isDisabled/setDisabled`）                                                                                                                                                                                   |
| 战斗上下文（`ROUND_TYPE/ROUND_NOW/ROUND_ALL/MONSTER_STATUS/MONSTER_BASE_KEY`） | 回合/血条快照缓存（`store.ts:kv*` 经常量读写）                                                                                                                                                                                |
| 数据收集（`STATS/BATTLES/CUR_BATTLE_KEY`）                                     | 总数/单场/进行中；单场只留最新 50，空闲修剪                                                                                                                                                                                   |
| `ARENA/ENCOUNTER_KEY`                                                          | 竞技场队列＋token／遭遇战计数                                                                                                                                                                                                 |
| `ahvauto-backup`                                                               | 配置备份字典（`store.ts:loadBackups/saveBackups`）                                                                                                                                                                            |
| `STAMINA_LOG_KEY`                                                              | 体力消耗记录                                                                                                                                                                                                                  |
| `sessionStorage: ahvauto-spell-delay/nospell-delay`                            | 发包延迟（注入脚本与 userscript 两侧同读）                                                                                                                                                                                    |
| IDB `ahvauto-debug`（v5）                                                      | `records`（`{seq,data}` 去冗余 gzip 包，上限 2000，`seq` keyPath）、`turns`（`{t,data}` 回合现场，上限 2000，自增 key）、`logs`（运行日志原文不 gzip，上限 1000，自增 key）；导出走 JSONL+gzip（面板与 CDP 共 `toJsonlLine`） |

`LEGACY_BATTLE_CODE_KEY` 为旧键，仅启动清理（`clearFieldCtx`），无现行写入。

注意：游戏页把 `localStorage.setItem` 包了一层丢弃 `hvAA*` key，
全仓一律直接赋值（`store.ts` 有注释）。

## 状态机（两处，都是小的）

1. **顶层**（`fsm.ts`）：`boot → field / battle / riddle`＋正交暂停位＋命名定时器
   （`after(name, ms, fn)`，同名覆盖）。转移写 logtape。
2. **记录生命周期**（`stats/lifecycle.ts`）：`idle → open → idle`（begin/turn/end），
   无局 turn 自动开 `?` 局保证总数可对账，转移写 debug 日志。

回合内决策是规则表（有序 first-match），不是状态机——行间无状态可跟踪，
硬套只是 ceremony（结论见实现记录）。

## 测试

`npm test`（tsx 直跑 `src/**/*.test.ts`，零依赖）：
`expr`（表达式）、`legacy`（旧配置导入）、`stats`（解析＋分段＋CSV）、
`meta`（竞技场表单解析）、`recorder`（gzip 回环＋JSONL 行格式＋解码）、`combat/decide`
（决策规则 36 用例）、`template`、`maintenance`（空闲修剪）。真机验证走 CDP（`scripts/cdp/`）。
