# 待办（自动修武器等未实现功能）

## 战斗前自动修复武器（未实现）

- 现状：仅 UI 有开关（`MainTab.svelte` `repair/repairValue`）＋配置携带（`types.ts`/`defaults.ts`/`legacy-import.ts`），战斗/战斗外逻辑零读取。
- 原版：`legacy/hvauto.js` 曾亲手封印（`if (false && g("option").repair)`，注“暂时禁用自动修复武器，网页更新需要适配”）；原流程走 Bazaar 查装备 → Forge 按 `repairValue` 阈值逐件修（见 `legacy/hvauto.js` 修装备流程）。
- 要做：按当前游戏页面适配修装备流程（找装备列表＋耐久＋修接口），接到战斗前/闲置链路（如 `meta.ts`），阈值语义沿用 `repairValue`（耐久 ≤ N% 即修）；失败只告警不打断战斗，缺钱/无装备时跳过。
- 验收：开 `repair` 且有低耐久装备时战斗前触发一次修复并记日志；关开关则全跳过；`npm test` 相关用例通过。
