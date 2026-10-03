# 竞技场对照表（ar / rb / gr）

来源：`12422` CDP 只读采集（2026-10-02 建表，2026-10-04 复核，
`PFUDOR Lv.500 / Persistent`），对 `?s=Battle&ss=ar|rb|gr` 做页内
`fetch`＋`DOMParser` 解析 `#arena_list`，未点击任何开战按钮。
表头顺序与游戏一致：
Challenge / Highest Clear / Min Level / Rounds / EXP Mod / Entry Cost / Clear Bonus。

`id` 即 `init_battle(id, entrycost)` 第一参数（开战 `initid`）；
第二参数是入场费（token 数），不是凭据（见 `meta.ts:parseBattleForm`）。
开战凭据是表单 `postoken`，每次现抓现用。

## The Arena（`ss=ar`，单页无分页）

| Challenge             | id  | Rounds | Min Level | EXP  | Entry Cost |
| --------------------- | --- | ------ | --------- | ---- | ---------- |
| Endgame               | 17  | 35     | Lv. 100   | X1.0 | -          |
| Longest Journey       | 19  | 40     | Lv. 110   | X1.1 | -          |
| Dreamfall             | 20  | 45     | Lv. 120   | X1.2 | -          |
| Exile                 | 21  | 50     | Lv. 130   | X1.3 | -          |
| Sealed Power          | 23  | 55     | Lv. 140   | X1.5 | -          |
| New Wings             | 24  | 60     | Lv. 150   | X1.6 | -          |
| To Kill a God         | 26  | 65     | Lv. 165   | X1.8 | -          |
| Eve of Death          | 27  | 70     | Lv. 180   | X1.9 | -          |
| The Trio and the Tree | 28  | 75     | Lv. 200   | X2.0 | -          |
| End of Days           | 29  | 80     | Lv. 225   | X2.2 | -          |
| Eternal Darkness      | 32  | 85     | Lv. 250   | X2.5 | -          |
| A Dance with Dragons  | 33  | 90     | Lv. 300   | X3.0 | -          |
| Post-Game Content     | 34  | 95     | Lv. 400   | X4.0 | -          |
| Secret Pony Level     | 35  | 100    | Lv. 500   | X5.0 | -          |

说明：本次账号下只列出以上 14 行（`Clear Bonus` 全为 `1,000 C`）。
`id 16`（旧复选框的 Lv.90 项）本次未出现，未收录。

## Ring of Blood（`ss=rb`，均为单轮）

| Challenge                | id  | Rounds | Min Level | Entry Cost |
| ------------------------ | --- | ------ | --------- | ---------- |
| Konata                   | 105 | 1      | Lv. 50    | 1 Token    |
| Mikuru Asahina           | 106 | 1      | Lv. 75    | 2 Tokens   |
| Ryouko Asakura           | 107 | 1      | Lv. 75    | 2 Tokens   |
| Yuki Nagato              | 108 | 1      | Lv. 75    | 2 Tokens   |
| Real Life                | 109 | 1      | Lv. 100   | 3 Tokens   |
| Invisible Pink Unicorn   | 110 | 1      | Lv. 150   | 3 Tokens   |
| Flying Spaghetti Monster | 111 | 1      | Lv. 200   | 5 Tokens   |
| Triple Trio and the Tree | 112 | 1      | Lv. 250   | 10 Tokens  |

说明：单项可用性随账号状态变化：刚打完的项显示 `Cooldown: NH NM`
（灰按钮 `startchallenge_d.png`、无 `onclick`，如 10-04 复核时 `110` 的
`Cooldown: 15H 36M`）；`112` 在 10-02 快照时置灰，10-04 复核时可点
（`init_battle(112,10)`）。规律：`parseBattleForm` 只收录可点击项，
缺席＝当前不可开战，调用方按 `unavailable` 跳过而非重试。
`Clear Bonus` 全为 `1,000 C`，`EXP` 全为 `X1.0`。

## Grindfest（`ss=gr`）

单入口：`init_battle(1)`，文案“up to 1000 rounds”，每次耗 1 体力。
无 `#arena_list` 表格（`#grindfest` 文案页）。

## 代码对应（别用反）

- 开局判定（`battle.ts:newRound`）：`Initializing arena challenge <id>` 取首个数字，
  `<= 35 → ar`，否则 `rb`；`Initializing Grindfest → gr`；
  `(Round a / b)` 进 `ROUND_NOW/ROUND_ALL`（`ba` 遭遇战固定 `1/1`）。
- 闲置队列（`meta.ts:idleArena`）：纯数字 `NaN → gr`，`>= 105 → rb`，否则 `ar`
  （竞技场单页，勿用 `ar&page=2`，其实测 GET 与 `ar` 相同、POST 会被拒绝）；
  队列中单个 `'gr'` 配 `cache.gr` 计数：开战成功只 `gr--` 不移出队列，
  耗尽/`unavailable`/超限才移出。定时抖动 90%–110%（`main.ts` field 入口）。
- 开战三态（`meta.ts:StartResult`）：`startBattle` 开战前用新鲜表单校验
  `initid` 是否仍在列——缺席（用户提前完成/Cooldown）报 `unavailable`，
  调用方直接消费该项并试下一项；取表单失败（无 postoken）/网络异常/POST 被拒
  （响应无战斗）报 `retry`，保留队列 60 秒后重试；
  同一项连续失败达 `ARENA_MAX_RETRY=3` 按永久失败跳过。
  成功才清 `fails` 计数。缺席≠失败，不要拿重试去等 Cooldown。
- 复测：连 `12422` 自动发现 `hentaiverse.org` 页，对三页分别取
  `#arena_list tr` 的 `td` 文本＋`img[onclick]` 的 `init_battle(...)` 即可；
  `gr` 页改读 `#grindfest`＋`init_battle(1)`。
