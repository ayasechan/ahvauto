# 战斗算法

## 主循环（`battle.ts:main`）

每回合：读快照 → `decide()` → 执行 → 看门狗布防。一回合只做一个逻辑动作
（魔法/武器是“锁技能＋点目标”两次点击，发一次包）。

## 决策规则表（`combat/decide.ts`，顺序即优先级）

| #   | 规则     | 触发                                                                                                                                         |
| --- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | gem      | 宝石阈值（Health≤hp1 / Mana≤mp1 / Spirit≤sp1，Mystic 无条件）                                                                                |
| 2   | item     | 用户顺序首个“启用＋条件通过＋有货/可用”                                                                                                      |
| 3   | defend   | 开关＋条件                                                                                                                                   |
| 4   | scroll   | 开关＋条件＋轮次类型＋逐卷轴开关/条件＋有货＋对应 buff 缺失（`scrollFirst` 勾选只认 `_scroll` 后缀）                                         |
| 5   | channel  | 仅 Channeling 窗口：按 Buff 顺序补缺 → 第二顺序（`useSecond`＋`secondOrder`）→ ReBuff 最早过期（含 Ab，含 Cloak of Fallen 特例）             |
| 6   | buff     | 按顺序补缺失 Buff；再补药剂/花瓶/口香糖                                                                                                      |
| 7   | infusion | 魔法属性（`attackStatus>=1`，0 物理与 -1 未选均跳过）＋开关＋条件＋对应魔药缺失＋有货/可用                                                   |
| 8   | imperil  | 开关＋`allIm`＋`213` 有货＋有怪没挂 Imperil（隔 3 遍历＋顺序遍历，点缺口怪的下一个可点活怪；无可点目标跳过；6 格满且告警开→`halt` 弹框暂停） |
| 9   | deskill  | 按顺序给集火目标补缺失 Debuff（含 6 格上限检查，失败弹框暂停）                                                                               |
| 10  | attack   | focus → Spirit 开关 →（EtherTap 跳过魔法）→ 武器链优先 → 高/中/低阶魔法 → 普攻（有可点活怪时兜底，否则 none）                                |

`focus`/`spirit` 在 attack 规则内部最先处理（与原版 `attack()` 内序一致）。

## 集火（`snapshot.ts:orderTargets`）

`finWeight ＝ 血量比×10 ± 身上 debuff 权重`，**永远升序**（`ruleReverse`
只反公式不反排序——曾反向排把死怪选成目标，已修），死怪（`Infinity`）垫底。
例外：活着的 Yggdrasil（怪名去空格后大小写无关全等）永远置顶，无视
`ruleReverse`；死了掉回权重排序。怪名从 `btm3` 解析进快照。
点目标前验 `onclick` handler（死怪没有），无 handler 顺延活怪。

## 武器链（attack 规则内）

- **与原版实效一致**：魔法点了不返回，武器能放就覆盖，最后必点目标。
- OFC（1111，需 8 OC）/ FRD（1101，需 4 OC）/ T3/T2/T1（`2<fightingStyle>0<阶>`，
  各需 2 OC），要求：Spirit 开启中＋条件＋可用＋OC 足＋OTOS 未用。
- OTOS（一回合一次）每轮清零（`newRound`）。
- Merciful Blow：仅单手（style 2）＋T3，目标血 <25% 且流血则转火。
- EtherTap：集火目标有 Coalesced Mana 且（无 Ether Tap(x2) 或 x2 快过期）且条件通过时**只跳过魔法**，武器照走。

## 保底与自救

- **保底停机线**：血量 ≤ `hpFloor`（默认 15%，可配可关）→ 暂停＋Error 告警。
  与条件系统无关，回血链哑火（药空/CD/缺蓝）时兜底。
- **发后看门狗**：8 秒无新发包→补点集火目标（有在途会被游戏吞掉，无害）；
  25 秒无进展→整页重载（常驻脚本自愈，CDP 注入调试时慎用）。
- **`halt`**：Debuff 格满且告警开时弹框＋暂停，等人工。

## 面板决策历史

`.hvAALog` 下方显示本轮最近 10 条（最新在上，Turn 号正标倒序展示），换轮清空（缓冲保留 20 条）。
`window.__hvaa` 同步暴露含 `{step（规则名）/lastError/lastAction/history/nr/apiCalls/lastReq/lastSend/fired}` 供 CDP 取证。
