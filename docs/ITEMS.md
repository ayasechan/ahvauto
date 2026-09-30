# 物品接口（`src/lib/tables.ts:ITEM_IDS`）

## ID 表

| key                 | id    | 形态              | 说明                              |
| ------------------- | ----- | ----------------- | --------------------------------- |
| Cure                | 311   | 法术书按钮        | 小回复；走 `isOn`＝元素存在＋非灰 |
| FC（Full-Cure）     | 313   | 法术书按钮        | 回满；同上                        |
| HP（Health Potion） | 11195 | 物品栏 `.bti3` 格 | 有格＝有货（不看数量/灰度）       |
| HE（Health Elixir） | 11199 | 物品栏            | 同上                              |
| MP（Mana Potion）   | 11295 | 物品栏            | 同上                              |
| ME（Mana Elixir）   | 11299 | 物品栏            | 同上                              |
| SP（Spirit Potion） | 11395 | 物品栏            | 同上                              |
| SE（Spirit Elixir） | 11399 | 物品栏            | 同上                              |
| LE（Last Elixir）   | 11501 | 物品栏            | 同上                              |
| ED（Energy Drink）  | 11401 | 物品栏            | 同上                              |

`id > 10000` 走物品栏存在性，`≤ 9999` 走法术书可用性——两边判定不同，
执行层必须“判哪点哪”（`combat/execute.ts`），点错元素会静默失败。
取元素一律 `document.getElementById`，`querySelector('#411')` 是非法选择器。

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
