# UI 规范（ahvauto 面板）

设计源：Penpot `C-监控数据 / C1-Usage-数据记录`（实现细节看画布注释，不进界面）。
实现：`src/ui/App.svelte`（960px 壳＋208px 侧栏）＋ `src/ui/tabs/*.svelte` ＋ `src/ui/theme.css`（`hv-light` token）。

## 设计 token（`hv-light`）

`--hv-bg #EDF1F7 / --hv-panel #FFF / --hv-card #FFF / --hv-line #E2E8F0 / --hv-primary #2563EB / --hv-t1 #1E293B / --hv-t2 #475569 / --hv-t3 #94A3B8 / --hv-input #F1F5F9`；圆角卡片 10 / 输入 8 / 胶囊 999；主按钮蓝底白字，次按钮白底灰边，危险红字红边（`#DC2626/#FECACA`）；胜 pill `#DCFCE7/#15803D`；chips `#EEF2FF/#BFDBFE`；zebra `#F8FAFC`；表头 `#F1F5F9` sticky。

## 数据记录页（Usage）

按 `C1` 自上而下六段，全走 `deriveTotals` 同一快照：

1. **工具条**（`tb-card`）：刷新（主）/ 导出 CSV / 导出掉落 CSV（次）/ 清空（危险）＋时间筛选（近1天/近7天/全部，默认近7天）＋品质过滤。时间筛选影响汇总＋列表＋战斗 CSV（含进行中局）；品质过滤只影响汇总＋掉落 CSV，场次列表恒全量。
2. **KPI×4**：Rounds（副：共 N 场）/ 总伤害（副：crit）/ 总承伤（副：evade/miss）/ EXP·Credit（副：掉落总数）。11px 灰标题＋18px 黑数值。
3. **伤害构成**：首行 Dark 标 `·Dark 断层`（线性满条，线性下其余不可见属预期）；第二组`其余伤害（对数刻度）`排除 Dark 后 `log10(v+1)` 归一化，tooltip 注明口径。恢复/护盾为纯文本行。
4. **掉落/施放**：Top5 chips＋`展开全部`（`<details>`），分组顺序固定：装备→消耗品→素材→奖杯→遗物→手办→怪物道具→其它（手办＝游戏 Figurine 掉落，有意保留）。
5. **单场战斗**：标题＋过滤后计数＋点击行看详情提示；`live-banner`（绿底整条可点，行内展开进行中局 `cur` 简版详情，与单场行展开独立）；5 列 时间/类型/DMG/Taken/结果，横向滚动，默认 20 行＋`加载更多（剩余 N 场）`；空状态纯文字占位；行点击在该行下方行内展开详情（`battleDetail` 全字段表：起止时间/类型/代号/结果/轮/回合/伤害/承伤/击杀/怪/Boss/EXP/Credit/掉落全量＋伤害/承伤 Top5＋施放/物品全量，`colspan=5`），同一时间只展开一行，再点收起，`refresh` 后按 `key+startedAt` 回找保留展开。
6. **台账**：Encounters＋Stamina 近 5 条（示例 `-12 (09:58)` 形），无记录显示占位文案，不断尾。

## 界面禁区

dev 备注（TopN 规则、列定义、sticky/zebra、分页备选、log 公式）只进 Penpot 注释，不上界面；用户文案禁技术黑话（`log 刻度` 只出现在 tooltip）；中/繁/英三语 key 全放 `src/lib/i18n.ts`（`usage.*`）。

## 验证

`npm test` ＋ `npm run check` ＋ `npx tsx scripts/cdp/ui-tabshot.ts Usage logs/ui-tab.png` 对稿。
