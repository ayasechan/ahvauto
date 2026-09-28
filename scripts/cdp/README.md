# CDP 运维脚本（TS，`npx tsx` 执行）

目标：本地 Chrome（`--remote-debugging-port=12422`）上已打开的 hentaiverse 页面。
目标页自动发现（URL 含 `hentaiverse.org`），可用 `CDP_URL` / `CDP_PAGE_WS` 覆盖。

| 脚本 | 用法 | 说明 |
|---|---|---|
| `recon.ts` | `npx tsx scripts/cdp/recon.ts` | 只读：页面模式、关键开关、textlog 尾巴 |
| `battle-log.ts` | `npx tsx scripts/cdp/battle-log.ts [输出]` | 只读：textlog 全文快照，默认存 `logs/` |
| `export-records.ts` | `npx tsx scripts/cdp/export-records.ts [输出] [--limit N] [--since-seq S]` | 只读：IDB 战斗记录分页导出（倒序游标＋分批落盘，默认最新 1000 条存 `logs/`） |
| `ops.ts` | `backup [输出]` / `verify` / `refresh` / `screenshot <文件>` / `inject <js> [css]` | 备份 localStorage、断言暂停、刷新页、截图、注入预览 bundle |
| `tabs.ts` | `npx tsx scripts/cdp/tabs.ts` | 14 个 tab 逐一切换＋内容签名校验 |
| `inject-full.ts` | `npx tsx scripts/cdp/inject-full.ts [bundle]` | 注入完整 userscript（先断言暂停，弹窗自动 dismiss） |

安全铁律（写进脚本的不变量）：

1. `inject*` 前必须 `verify` 通过（`hvAA-disabled` 置位，角色暂停）。
2. 注入的要么是预览 bundle（不跑战斗逻辑、不写 `hvAA*`），要么是暂停预置下的全量 bundle。
3. 任何会话前后用 `backup` 留档，`logs/` 已 gitignore，备份文件不出仓库。
4. 不点击任何游戏战斗按钮，不用高级道具（脚本里根本没有这类操作；如需加，先经用户确认）。
