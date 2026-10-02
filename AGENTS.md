# AGENTS.md — ahvauto (HentaiVerse userscript, TS+Svelte)

Vite + Svelte 5 + TS userscript (`vite-plugin-monkey` → `dist/ahvauto.user.js`).
Original script preserved at `legacy/hvauto.js` (reference only). No CI.

## Commands

- `npm test` — unit tests (`node --test` with tsx loader, no build step). Details → `docs/DEV.md`.
- `npm run check` — `svelte-check` + `tsc -p tsconfig.node.json`. Must be 0 errors.
- `npm run lint` / `npm run fmt:check` — read-only. `lint:fix` / `fmt` apply fixes.
- `npm run build` — production bundle. `npm run dev` (`:5173`) for hot-reload.
- CDP ops: `npx tsx scripts/cdp/<name>.ts` (see `scripts/cdp/README.md`).
  Default to reads; writes need explicit user approval.

## Architecture (see `docs/ARCHITECTURE.md`)

`snapshot → decide → execute → api_call → eventEnd（DOM 锚点） → next turn`;
stats/logging via direct `handleRec` calls (`recorder.ts`).

## Gotchas (rules only; explanations live in docs/ — do not re-expand here)

- **No dynamic `import()` in `src/`** (`docs/DEV.md` 坑 #3).
- **Never `localStorage.setItem` with `hvAA*` keys** (`docs/DEV.md` 坑 #1).
- **`Infinity` dies in JSON** (`→null`) — normalize on read (`docs/DEV.md` 坑 #2).
- **`bind:` must never receive `undefined`** (`docs/DEV.md` 坑 #4).
- **Finishing order is ascending, always** (`docs/COMBAT.md` 集火).
- **Target clicks need a live target** (`#mkey_<id>` `onclick`) (`docs/COMBAT.md` 集火).
- **Skill/item clicks route by kind** (item by id: `>10000` → `.bti3`, else `getElementById`; scroll/draught/infusion → shelf, buff → spellbook) (`docs/ITEMS.md`).
- **Spells need lock+target in the same turn** (`docs/DEV.md` 坑 #6).
- **The game silently swallows clicks** when busy/locked/in-flight — don't remove the watchdog (`docs/DEV.md` 坑 #7).
- **IDB**: only `recorder.ts` may `open()` with a version number (`docs/DEV.md` 调试面).
- **No `eval`/`new Function`** (`docs/DEV.md` 坑 #10).
- Storage: `hvAA-` read-only, new keys under `ahvauto-` (`docs/DEV.md` 存储命名空间).

## Conventions

- Workflow: commits → `docs/DEV.md` 常用命令; i18n/layering → `docs/ARCHITECTURE.md`.
- Doc index → `README.md` (文档节); spec → `src/lib/expr/GRAMMAR.md`.
