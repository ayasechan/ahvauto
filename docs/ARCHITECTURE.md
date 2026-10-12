# 系统架构

## 总览

```
游戏页面 DOM ──readSnapshot──▶ Snapshot ──decide──▶ Action ──execute──▶ 点击
                                   ▲                    │
                          条件表达式 (expr/)            ▼
                                               游戏 api_call → XHR onload 点 #eventEnd
                                                     │ handleRec 直调（req/res）
                                                     ▼
                                                      bridge ──▶ IDB（records/turns，经 recordBattleTurn 写 cur）──▶ UI（总数读时求和）
```

（`logs` 由 `logger→logs.ts:appendLog` 写，`battles` 由 `lifecycle.ts:flushBattle` 落盘，不经 bridge。）

- **感知**（`src/combat/snapshot.ts`）：每回合把 DOM 一次性读成纯 `Snapshot`
  （血蓝/怪/buff/技能可用性/姿态），是唯一把 DOM 读成快照的地方（他处仍有零散只读 DOM）。
- **决策**（`src/combat/decide.ts`）：规则表按优先级求值，首个命中即决策。
  纯函数，决策单测覆盖（以 `npm test` 为准）。详见 `docs/COMBAT.md`。
- **执行**（`src/combat/execute.ts`）：决策动作写 DOM 的唯一入口（只发点击）。法术书/Buff 直调
  `getElementById`，其余经 `click`/`qs`（纯数字 id 回落 `getElementById`，imperil 经 `go` 回落等效直调）；卷轴/药剂/魔药走物品栏 `.bti3`；`item` 内部分流：`id > 10000` 走 `.bti3`，否则（含 Cure 311 / FC 313）走法术书（与原版“判哪点哪”同构，见 `docs/ITEMS.md`）。决策外写点：`api-hook.ts`（事件锚点/换轮）、`battle-info.ts`（面板）、`loop.ts`（标题/暂停钮文案）、`driver.ts`（click/goto/调试面）、`round.ts`（fixMonsterStatus）、`app/main.ts`（挂载按钮），勿归入 `execute`。
- **驱动**（`src/combat/api-hook.ts`）：劫持 `api_call/api_response`（游戏动态查找，
  覆盖有效），XHR `onload` 点 `#eventEnd`（`#eventEnd`/`#eventStart` 由 `src/combat/api-hook.ts:installReloader` 创建一次、每轮复点；每包必点 `#eventStart`）
  →统计→`main()` 下一轮。发包失败会被游戏静默吞，
  看门狗（8s 补点／25s 重载）兜底。
- **UI**（`src/ui/`）：Svelte 13 页设置面板；战斗内状态条由 `combat/battle-info.ts:battleInfo` 直写 `.ahvauto-log`，非 Svelte 组件。详见下。
- **分层约束**：纯逻辑（`combat/decide`、`expr`、`data/stats`）配单测；DOM 触点在
  `snapshot.ts`/`execute.ts`/`round.ts`/`loop.ts`/`watchdog.ts`/`api-hook.ts`/`driver.ts`，另有 `combat/escape-cond.ts`（逃跑轨，读 svelte store/物品栏/效果栏）、`app/main.ts`（挂载按钮）、`field/encounter.ts`（体力读数/跳转/挂载）、`field/idle-arena.ts`（跳转/标题）、`notify/notify.ts`（音频节点/系统通知）、`platform/dom.ts` 本体及 `ui/`；条件求值双轨：决策内走 `combat/context.ts`（读快照），逃跑走 `combat/escape-cond.ts`（读 svelte store/DOM），勿混用。

## 目录结构

```
src/
  app/             # 入口编排：main.ts（页面分流 → fsm transition）＋fsm.ts＋maintenance.ts
  platform/        # 基础支撑：dom/dom-ids/http/storage-keys/logger/i18n/i18n-dict（DOM/网络/日志/文案/key 单一来源，词典在 i18n-dict）
  config/          # 配置：types（barrel）/options-types/battle-types/defaults/tables/store（barrel）
                   #   ＋kv/paused/backups/delays/field-ctx/battle-state/ui-state/options/legacy-import
  combat/          # 战斗：snapshot/decide/execute/context/types/escape-cond（逃跑轨）
                   #   ＋driver/round/loop/watchdog/api-hook/battle-info/cost
  expr/            # 条件表达式语言（tokenizer/parser/evaluator/index/suggest/migrate/errors，规格见 GRAMMAR.md）
  field/           # 战斗外：riddle/encounter/repair/idle-arena/arena
  data/            # 数据：stats/（types/parse/lifecycle/queries，barrel 为 stats.ts）
                   #   ＋db＋debug/logs/bridge（open() 仅 db.ts）
  notify/          # 告警：notify/template
  ui/
    App.svelte＋theme.css
    battle/        # Main/Channel/Buff/Debuff/Skill/Rule
    item/          # Item/Scroll/Infusion
    system/        # Alarm/Usage/About/Feedback（目录归位≠开关分组：Alarm 属 battle 组，Usage 属 monitor 组）
    shared/        # ConditionEditor.svelte（非分组）
    tabs.ts        # 13 页注册表（TAB_DEFS＋TAB_GROUPS：battle/item/monitor/sys）
    tabs.test.ts
scripts/cdp/         # 浏览器运维脚本（TS，npx tsx 运行，详见其 README）
```

## 存储（铁律：`hvAA-` 只读，`ahvauto-` 读写）

| 位置                                                                                           | 内容                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `hvAA-option`（旧）                                                                            | 原版配置，只读，“关于→导入旧配置”手动导入                                                                                                                                                                                                                                                                                                                                                  |
| `ahvauto-option`                                                                               | 新配置（表达式字符串版条件，`config/options.ts:options/sanitizeOptions` 唯一读写）                                                                                                                                                                                                                                                                                                         |
| `ahvauto-disabled`                                                                             | 暂停位（`config/paused.ts:isDisabled/setDisabled`）                                                                                                                                                                                                                                                                                                                                        |
| 战斗上下文（`ROUND_TYPE_KEY/ROUND_NOW_KEY/ROUND_ALL_KEY/MONSTER_STATUS_KEY/MONSTER_BASE_KEY`） | 回合/血条快照缓存（`config/kv.ts:kv*` 经常量读写）                                                                                                                                                                                                                                                                                                                                         |
| 数据收集（IDB `ahvauto-debug` v7 `battles/cur` 表）                                            | 单场全量行/进行中局；总数读时对单场求和（无累计键）；单场只留最新 2000，空闲修剪                                                                                                                                                                                                                                                                                                           |
| `ARENA_KEY/ENCOUNTER_KEY`                                                                      | 竞技场队列＋token／遭遇战计数                                                                                                                                                                                                                                                                                                                                                              |
| `ahvauto-backup`                                                                               | 配置备份字典（`config/backups.ts:loadBackups/saveBackups`）                                                                                                                                                                                                                                                                                                                                |
| `STAMINA_LOG_KEY`                                                                              | 体力消耗记录                                                                                                                                                                                                                                                                                                                                                                               |
| `sessionStorage: ahvauto-spell-delay/nospell-delay`                                            | 发包延迟（`ahvauto-spell-delay`/`ahvauto-nospell-delay`，注入脚本与 userscript 两侧同读，抖动 50%–150%，`platform/http.ts:jitter`）                                                                                                                                                                                                                                                        |
| IDB `ahvauto-debug`（v7）                                                                      | `records`（`{seq,data}` 去冗余 gzip 包，上限 2000，`seq` keyPath）、`turns`（`{t,data}` 回合现场，上限 50000，自增 key）、`logs`（运行日志原文不 gzip，上限 1000，自增 key）、`battles`（单场全量行，上限 2000）、`cur`（进行中局单行）；导出走 JSONL+gzip（面板与 CDP 共 `toJsonlLine`）。已知缺口：`records` 表仅 `old<3` 重建，`old>=3` 缺表不补建（`turns/logs/battles/cur` 有补建）。 |

`LEGACY_BATTLE_CODE_KEY` 为旧键，仅启动清理（`clearFieldCtx`），无现行写入。
`STATS_KEY=stats2` / `BATTLES_KEY=battles2` / `CUR_BATTLE_KEY=curBattle2` 为 v2 旧键，仅启动清理，不迁移。

注意：游戏页把 `localStorage.setItem` 包了一层丢弃 `hvAA*` key，
写一律直接赋值（`config/kv.ts`、`config/options.ts` 有注释），读仍用 `getItem`、删用 `removeItem`。

## 状态机（两处，都是小的）

1. **顶层**（`app/fsm.ts`）：`boot → field / battle / riddle`＋正交暂停位＋命名定时器
   （`after(name, ms, fn)`，同名覆盖）。转移写 logtape。
2. **记录生命周期**（`data/stats/lifecycle.ts`）：`idle → open → idle`（beginBattle/recordBattleTurn/endBattle），
   写路径平时只碰 `cur` 表（异步串行、fire-and-forget 不挡战斗），终局时整行落 `battles` 表，
   总数读时求和（`deriveTotals`：已落盘局＋进行中局，`battles` 只计已落盘），转移写 debug 日志。

回合内决策是规则表（有序 first-match），不是状态机——行间无状态可跟踪。

## 战斗外（`app/main.ts` field 入口 → `field/`）

顺序：`encounterCheck` → 体力门槛 → `repairEquipment` → 定时起 `idleArena`。
修装备失败只记日志（warning），绝不抛、绝不挡开战；页面跳走导致的中止静默忽略。

- **跨天口径（UTC+0）**：`platform/http.ts:todayKey()` 取 `getUTC*` 生成 `YYYY/M/D`，
  `field/encounter.ts:encounterCheck`（遭遇战 24 次/日）与 `idleArena`（队列＋token 按日重置）
  均以此字符串比对缓存 `dateNow/date` 判定跨天。北京时间 08:00 才算第二天
  （00:00–07:59 仍算前一天）。

- **修装备接口**（CDP 真机录制，ON/OFF 各一次成功提交）：`GET ?s=Bazaar&ss=am&screen=repair`
  取 `postoken`＋`input[name="eqids[]"]` 的 id＋行尾 `NN%` 耐久，按 `repairValue` 阈值
  （耐久 ≤ N%）过滤后一次 POST 全修：`postoken + eqids[]×N`（`repairCharms` 开才带
  `replace_charms=on`，关则整键省略）；成功信号＝被修 id 从响应列表消失
  （满耐久装备不在 repair 列表）。成本走材料（选中后 `#itemlist` 的 Total Repair Cost），
  页内确认框实测不弹出。解析纯函数 `parseRepairForm` 配单测（真页片段）。

## 掉落口径（`data/stats/parse.ts` 记录，`data/stats/queries.ts`＋Usage 展示）

- 记录全量入库：红装（textlog 掉落 span `#FF0000`）存全名，不做品质过滤；
  名中无品质词（`Crude…Peerless` 均不出现）加 `Equipment of ` 前缀标记后入库。
  水晶 `Nx` 展开，Credit 只记账不进 drops。
  结算奖励同样纳入：`Bonus! […]` 走掉落口径，`obtained Nx […]` 展开 N 件，
  无括号 `You gain N Credits!` 记账。
- 展示分组＋过滤：汇总/单场/CSV 经 `displayDropKey` 分组，
  含品质词的掉落归入 `Equipment of <品质>` 桶，无品质词标记剥回原名展示；
  总表汇总另经 `dropGroup` 按原键分八组（装备/消耗品/素材/奖杯/遗物/手办/怪物道具/其它），
  组内同上聚合降序；战斗水晶掉落官方无分组，进其它。
  `dropQuality` 只在展示层经 `meetsDropQuality` 生效
  （面板下拉预设：全部 / 数字 `0-7` 起始档；空或越界不过滤，无品质词恒显示），
  作用于掉落汇总与掉落 CSV；单场列表/详情与单场 CSV 为全量。
  面板汇总行标注当前阈值（`qualityFilterLabel`），阈值期历史缺数不可恢复。
- 历史数据不兼容：旧 `Equipment of <品质>` 桶键与新分组同名 natural 合并，不迁移不清理；
  阈值期已丢的低品质装备无法找回。

## 文案口径（i18n：语言、专名、标点、数字日期）

- 语言：`options.lang`（`0` 简／`1` 繁／`2` 英），`tr` 取对应下标、缺失回 `t[0]`；
  引擎一律 `tr(lang)` 传参，`tt()` 为遗留兼容（当前零调用）。占位符 `{var}` 插值，嵌套翻译用 `{k: key}`；
  中文无复数，英文词条内写全（`battles`／`Credits`）。
- 专名保留（恒英文，不进i18n）：技能／物品／卷轴／魔药展示名
  （`Protection`／`OFC`／`T3`／`Cure`／`Scroll of…`／`Health Draught`／`Fire Infusion`…）、
  元素与战斗风格双语行中的英文半边、`Grindfest`／`Ether Tap`、
  `道具界`／`怪物道具`（游戏界名·掉落分类）、`BUFF`／`DEBUFF` 页名、CSV 表头与时间列；
  `Stamina` 为游戏内资源原文，UI 标签走 `battle.stamina` 三语（体力／體力／Stamina）；
  `describeAction` 的 `names` 参数恒英文，动作外壳词走 `action.*` 翻译。
- 术语：事件推送统一`告警`（Alarm 页中文亦`告警`）；`main.warn` 用`通知`；
  UI 统一`物品`（`道具`只出现在专名内）；`攻击模式`（字段）／`攻击规则`（页名）／
  `战斗风格`（字段）三者本就不同，不合并；行文用`增益`／`减益`，页名保留 `BUFF`；
  `魔药`（infusion）≠`药剂`（draught）。
- 标点：UI 行内标签统一半角 `: `；`prompt()` 对话框文本用全角 `：`；
  中／繁问号全角 `？`（英文 `?`）；单位 `ms` 前空格，`%` 前紧贴后空格；
  英文 `s alarm` 无逗号；中文范围用 `～`，英文用 `-`。
- 数字日期：展示层跟 `options.lang`（`LANG_LOCALE`：`0→zh-CN`／`1→zh-TW`／`2→en-US`），
  `fmtCompact` 的 `k`／`M` 后缀保留，只换千分位；存储键（`round.ts` 体力台账）、
  CSV、推送正文、游戏页 tooltip 用浏览器默认 locale，不跟语言（机器口径，代码注释声明）。

## 测试

`npm test`（`node --import tsx/esm --test "src/**/*.test.ts"`，`--localstorage-file` 落盘隔离，零依赖）：
`expr/expr.test.ts`（表达式）、`config/legacy.test.ts`（旧配置导入）、`data/stats.test.ts`（解析＋行内累加＋读时求和＋CSV/折叠 `foldDrops`）、
`field/arena.test.ts`（竞技场选项）＋`field/meta.test.ts`（竞技场/修装备表单解析）、`data/recorder.test.ts`（gzip 回环＋JSONL 行格式＋解码＋`handleRec` 单 smoke）、
`combat/decide.test.ts`（全文件 37 用例：决策规则＋集火/保底/上下文）、`notify/template.test.ts`、`ui/tabs.test.ts`（13 页注册表）。IDB 异步路径（落盘/修剪）与空闲修剪走 CDP 真机验证。
