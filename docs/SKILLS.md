# 技能接口

## ID 编码规律

| 系列 | 编码 | 例子 |
|---|---|---|
| 魔法 | `1<攻击模式><阶>` | 暗 T3＝`163`、暗 T1＝`161` |
| 武器 | `2<战斗风格>0<阶>` | 单手法杖 T3＝`2503` |
| OFC / FRD | 固定 | `1111`（需 8 OC）/ `1101`（需 4 OC） |
| Debuff | `21x/22x/23x` | Imperil `213`、MagNet `233`、Sleep `222` |
| Buff | `31x/41x/42x/43x` | Protection `411`、Spark of Life `422`、Haste `412` |
| Cure / Full-Cure / Regen | `311/313/312` | 法术书按钮（同时是物品 key） |

可用性一律：元素存在＋`opacity !== 0.5`（灰＝CD/缺蓝/条件不满足）。

## 魔法三阶（`attack` 规则内）

`attackStatus` 为 0（物理）整段跳过；否则高阶（`1x3`，需 `highSkillCondition`）
→ 中阶（`1x2`，需 `middleSkillCondition`）→ 低阶（`1x1`，无条件）。
法师（1-6）主输出即此链；之后武器能放则覆盖（原版实效），最后普攻兜底。

## 武器链（战士向，法师 Spirit 关则全跳过）

- 前置：**Spirit 开启中**＋各自条件＋可用＋OC 足（OFC 8 / FRD 4 / T 系 2）。
- OTOS（一回合一次）：`skillOTOS_*` 开关开且本轮已用则跳过；计数每轮清零。
- Merciful Blow：仅单手（style 2）＋T3，目标血 <25% 且流血（`wpn_bleed`）则转火。
- 顺序默认 `OFC→FRD→T3→T2→T1`，可在技能页调整。

## Buff（9＋5）

主 Buff：`Pr411/SL422/SS423/Ha412/AF432/He431/Re312/SV413/Ab421`，
按用户顺序补“不存在”的。药水见 `docs/ITEMS.md`。
Channeling 窗口（1MP＋150% 伤害）三段：按 Buff 顺序补缺 →
`channelSkill2` 顺序直放 → ReBuff 最早过期者（含 Cloak of the Fallen 转 SL 特例）。

## Debuff（9）

`Sle222/Bl231/Slo221/Im213/MN233/Si232/Dr211/We212/Co223`。
- `allIm` 开：给全场补 Imperil（隔 3 遍历＋顺序遍历）。
- 常规：按用户顺序给集火目标补缺失项。
- 单怪上限 6 格：满且最后一格剩余回合不达标→（`turnAlert` 开）弹框暂停等人工。

## 卷轴（`SCROLL_LIB`，走物品栏）

| 键 | id | 覆盖 buff（任一存在即跳过） |
|---|---|---|
| Go | 13299 | absorb＋shadowveil＋sparklife |
| Av | 13199 | haste＋protection |
| Pr/Sw/Li/Sh/Ab | 13111/13101/13221/13211/13201 | protection/haste/sparklife/shadowveil/absorb |

另有 `roundTypes`（ar/rb/gr/iw/ba）门＋单卷轴条件。
`scrollFirst` 勾选后只认 `_scroll` 后缀 buff（技能版 buff 不挡卷轴）。

## 魔药（`INFUSION_LIB`，走物品栏）

按 `attackStatus` 查表：1 火 12101 / 2 冰 12201 / 3 雷 12301 /
4 风 12401 / 5 圣 12501 / 6 暗 12601；物理（0）跳过；已有对应 buff 跳过。
