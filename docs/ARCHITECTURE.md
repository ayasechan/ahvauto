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
  纯函数，决策 36 用例、全仓 133 单测覆盖。详见 `docs/COMBAT.md`。
- **执行**（`src/lib/combat/execute.ts`）：把动作翻译成点击。法术书/Buff 直调
  `getElementById`，其余经 `click`/`qs`（纯数字 id 回落 `getElementById`，imperil 经 `go` 回落等效直调）；卷轴/药剂/魔药走物品栏 `.bti3`；`item` 内部分流：`id > 10000` 走 `.bti3`，否则（含 Cure 311 / FC 313）走法术书（与原版“判哪点哪”同构，见 `docs/ITEMS.md`）。
- **驱动**（`src/lib/battle.ts`）：劫持 `api_call/api_response`（游戏动态查找，
  覆盖有效），响应→`eventEnd`（DOM 锚点，非导出函数）→统计→`main()` 下一轮。发包三道门会被游戏静默吞，
  看门狗（8s 补点／25s 重载）兜底。
- **UI**（`src/ui/`）：Svelte 14 页设置面板；战斗内状态条由 `battle.ts:battleInfo` 直写 `.hvAALog`，非 Svelte 组件。详见下。
- **分层约束**：纯逻辑（`combat/decide`、`expr`、`stats`）配单测；DOM 触点在
  `snapshot.ts`/`execute.ts`/`battle.ts`/`meta.ts`，另有 `conditions.ts`（逃跑轨，读物品栏/效果栏）、`main.ts`（挂载按钮）、`dom.ts` 本体及 `ui/`；条件求值双轨：决策内走 `combat/context.ts`（读快照），逃跑走 `conditions.ts`（读 store/DOM），勿混用。

## 目录结构

```
src/
  main.ts            # 入口：页面分流 → fsm transition（boot/field/battle/riddle）
  preview-ui.ts      # CDP 注入预览入口（临时，用完即删，不进生产 bundle）
  lib/
    battle.ts        # 战斗循环 main/newRound/看门狗/保底停机（eventEnd 为内部 DOM 锚点）
    combat/          # 战斗算法包（纯逻辑＋单测）
      types.ts       # Snapshot / Action / DecideResult
      snapshot.ts    # DOM→快照，集火权重 orderTargets，目标 resolveTarget
       context.ts     # 决策内条件求值上下文（纯：isCd/buffTurn 读快照；decide.ts:362 evalContext + checkExpr）
      decide.ts      # 决策规则表（优先级即表顺序）
      execute.ts     # 动作→点击，describeAction 可读标签
    expr/            # 条件表达式语言（tokenizer/parser/evaluator/suggest/migrate）
    store.ts         # Svelte store＋持久化（见存储）
    fsm.ts           # 顶层状态机（boot/field/battle/riddle）＋命名定时器
    meta.ts          # 战斗外：答题告警/遭遇战/闲置竞技场
    maintenance.ts   # 非战斗空闲集中修剪（IDB records/turns/logs＋battles2）
    http.ts          # fetch 版 await 请求（替代原 XHR 回调）
    stats.ts         # 数据收集 v2（parseTurn 规则表＋对局状态机）
    recorder.ts      # IDB 录制（请求/响应配对＋回合现场＋运行日志）
    notify.ts        # 桌面通知/音频/推送
    tables.ts        # 静态 ID 表（技能/物品/卷轴/魔药）
     conditions.ts    # 逃跑条件＋编辑器提示轨（读 store/DOM：battleVars/evalCtx/checkCondition；decide 外唯一条件入口）
     dom.ts / defaults.ts / types.ts / storage-keys.ts / template.ts / legacy-import.ts 等（树仅列主要文件，见实盘）
    logger.ts        # logtape＋console/IDB 双 sink（logfmt，IDB 经 recorder logs 表）
    i18n.ts        # 简/繁/英三语字典（key 三端保持同步）
  ui/
    App.svelte       # 面板外壳＋14 tab 菜单（button 实现）
    ConditionEditor.svelte  # 条件文本编辑器（即时编译校验）
    theme.css          # 面板全局样式
    tabs/*.svelte    # 14 页（Main/Item/Channel/Buff/Debuff/Skill/Scroll/
                     #   Infusion/Alarm/Rule/Drop/Usage/About/Feedback）
scripts/cdp/         # 浏览器运维脚本（TS，npx tsx 运行，详见其 README）
```

## 存储（铁律：`hvAA-` 只读，`ahvauto-` 读写）

| 位置                                                            | 内容                                                                                                                                                                                                                          |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hvAA-option`（旧）                                             | 原版配置，只读，“关于→导入旧配置”手动导入                                                                                                                                                                                     |
| `ahvauto-option`                                                | 新配置（表达式字符串版条件）                                                                                                                                                                                                  |
| `ahvauto-disabled`                                              | 暂停位                                                                                                                                                                                                                        |
| `ahvauto-roundType/roundNow/roundAll/monsterStatus/monsterBase` | 战斗上下文                                                                                                                                                                                                                    |
| `ahvauto-stats2/battles2/curBattle2`                            | 数据收集（总数/单场/进行中；单场只留最新 50，空闲修剪）                                                                                                                                                                       |
| `ahvauto-arena/encounter`                                       | 竞技场队列＋token／遭遇战计数                                                                                                                                                                                                 |
| `ahvauto-backup`                                                | 配置备份字典                                                                                                                                                                                                                  |
| `ahvauto-staminaLostLog`                                        | 体力消耗记录                                                                                                                                                                                                                  |
| `sessionStorage: ahvauto-spell-delay/nospell-delay`             | 发包延迟（注入脚本与 userscript 两侧同读）                                                                                                                                                                                    |
| IDB `ahvauto-debug`（v5）                                       | `records`（`{seq,data}` 去冗余 gzip 包，上限 2000，`seq` keyPath）、`turns`（`{t,data}` 回合现场，上限 2000，自增 key）、`logs`（运行日志原文不 gzip，上限 1000，自增 key）；导出走 JSONL+gzip（面板与 CDP 共 `toJsonlLine`） |

`battleCode` 为旧键，仅启动清理（`kvDel`），无现行写入。

注意：游戏页把 `localStorage.setItem` 包了一层丢弃 `hvAA*` key，
全仓一律直接赋值（`store.ts` 有注释）。

## 状态机（两处，都是小的）

1. **顶层**（`fsm.ts`）：`boot → field / battle / riddle`＋正交暂停位＋命名定时器
   （`after(name, ms, fn)`，同名覆盖）。转移写 logtape。
2. **记录生命周期**（`stats.ts`）：`idle → open → idle`（begin/turn/end），
   无局 turn 自动开 `?` 局保证总数可对账，转移写 debug 日志。

回合内决策是规则表（有序 first-match），不是状态机——行间无状态可跟踪，
硬套只是 ceremony（结论见实现记录）。

## 测试

`npm test`（tsc 编译到 `/tmp` ＋ `node --test`，零依赖）：
`expr`（表达式）、`legacy`（旧配置导入）、`stats`（解析＋分段＋CSV）、
`meta`（竞技场表单解析）、`recorder`（gzip 回环＋JSONL 行格式＋解码）、`combat/decide`
（决策规则 36 用例）、`template`、`maintenance`（空闲修剪）。真机验证走 CDP（`scripts/cdp/`）。
