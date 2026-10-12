# 物品接口（`src/config/tables.ts:ITEM_IDS/DRAUGHT_LIB/BUFF_LIB/SCROLL_LIB/INFUSION_LIB`）

## ID 表

| key                 | id    | 形态              | 说明                                                                        |
| ------------------- | ----- | ----------------- | --------------------------------------------------------------------------- |
| Cure                | 311   | 法术书按钮        | 小回复；快照 `skills[311]`＝存在＋`opacity !== 0.5`（旧 `isOn` 法术书分支） |
| FC（Full-Cure）     | 313   | 法术书按钮        | 回满；同上                                                                  |
| HP（Health Potion） | 11195 | 物品栏 `.bti3` 格 | 有格＝有货（不看数量/灰度）                                                 |
| HE（Health Elixir） | 11199 | 物品栏            | 同上                                                                        |
| MP（Mana Potion）   | 11295 | 物品栏            | 同上                                                                        |
| ME（Mana Elixir）   | 11299 | 物品栏            | 同上                                                                        |
| SP（Spirit Potion） | 11395 | 物品栏            | 同上                                                                        |
| SE（Spirit Elixir） | 11399 | 物品栏            | 同上                                                                        |
| LE（Last Elixir）   | 11501 | 物品栏            | 同上                                                                        |
| ED（Energy Drink）  | 11401 | 物品栏            | 同上                                                                        |

`id > 10000` 走物品栏存在性，否则走法术书可用性——两边判定不同，
执行层必须“判哪点哪”（`src/combat/execute.ts:76-86`），点错元素会静默失败。
点击路由：`item` 按 `Number(id) > 10000` 分流（物品栏 `.bti3` vs 法术书）；
`scroll`/`draught`/`infusion` 走物品栏 `.bti3`；`buff` 走法术书。
旧 `isOn` 已拆分（`src/platform/dom.ts` 现无 `isOn`）：判在 `src/combat/snapshot.ts`，
点在 `src/combat/execute.ts`，`id > 10000` 以 `Number(id)` 判定；
表达式内仍有统一查询 `isCd(id)`（DOM 版 `src/combat/escape-cond.ts:46-54`、
快照版 `src/combat/context.ts:27-31`，可用=0/CD 中=1）。
法术书直点用 `document.getElementById`（纯数字 id `querySelector` 会抛错），其余经 `qs`/选择器。
注：Cure/FC=311/313 在 `tables.ts:ITEM_IDS`、`ItemTab.svelte:NAMES`、
`ChannelTab.svelte:CHANNEL_SECOND_ID`（键 `Cu`/`FC`）三处复用同一 id。

## 施放顺序

物品页用户自排（`item.order: [{key, id}]`），决策按序取首个
“启用＋条件通过＋可用”。**注意**：弱回复排在强回复前面会截胡
（如 Cure 在 FC 前，低血量永远吃 Cure）——这是用户配置语义，非 bug。

## 宝石（`#ikey_p`）

文本全等匹配：`Health Gem`（hp≤hp1）/ `Mana Gem`（mp≤mp1）/
`Spirit Gem`（sp≤sp1，默认 50/70/75）/ `Mystic Gem` 无条件。
决策链首位。

## 药水/花瓶/口香糖（`DRAUGHT_LIB`，走 Buff 规则后半段）

| key | id    | 判定 buff |
| --- | ----- | --------- |
| HD  | 11191 | healthpot |
| MD  | 11291 | manapot   |
| SD  | 11391 | spiritpot |
| FV  | 19111 | flowers   |
| BG  | 19131 | gum       |

固定顺序 HD→MD→SD→FV→BG（不可排），要求：对应 buff 不存在＋开关＋
条件＋物品栏有货。主 Buff（Pr/SL/SS/Ha/AF/He/Re/SV/Ab）扫完才扫这里。

## 主 Buff（`BUFF_LIB`，走法术书）

| key | id  | 展示名（恒英文） |
| --- | --- | ---------------- |
| Pr  | 411 | Protection |
| SL  | 422 | Spark of Life |
| SS  | 423 | Spirit Shield |
| Ha  | 412 | Haste |
| AF  | 432 | Arcane Focus |
| He  | 431 | Heartseeker |
| Re  | 312 | Regen |
| SV  | 413 | Shadow Veil |
| Ab  | 421 | Absorb |

Buff 动作走法术书直点（`execute.ts:buff→spellbook`），判定看法术书可用性。

## 卷轴（`SCROLL_LIB`，走物品栏 `.bti3`）

| key | id    | 展示名（恒英文） |
| --- | ----- | ---------------- |
| Go  | 13299 | Scroll of the Gods |
| Av  | 13199 | Scroll of the Avatar |
| Pr  | 13111 | Scroll of Protection |
| Sw  | 13101 | Scroll of Swiftness |
| Li  | 13221 | Scroll of Life |
| Sh  | 13211 | Scroll of Shadows |
| Ab  | 13201 | Scroll of Absorption |

卷轴页按小写码对照 Usage 台账 `TYPE_KEY`（见 `ScrollTab.svelte`）；展示名恒英文专名，不进i18n。

## 魔药（`INFUSION_LIB`，走物品栏 `.bti3`）

| key（攻击模式） | id    | 展示名（恒英文） |
| --- | ----- | ---------------- |
| 1   | 12101 | Fire Infusion |
| 2   | 12201 | Cold Infusion |
| 3   | 12301 | Elec Infusion |
| 4   | 12401 | Wind Infusion |
| 5   | 12501 | Holy Infusion |
| 6   | 12601 | Dark Infusion |

决策按 `attackStatus` 查表（`decide.ts` infusion 规则），魔药页仅全局 `enabled+condition`（`InfusionTab.svelte`），无 per-key 开关。
