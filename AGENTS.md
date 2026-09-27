# AGENTS.md — hvauto (HentaiVerse userscript, TS+Svelte)

Vite + Svelte 5 + TS userscript (`vite-plugin-monkey` → `dist/hvauto.user.js`).
Original script preserved at `legacy/hvauto.js` (reference only). No CI.

## Commands

- `npm test` — compiles `src/lib/**/*.test.ts` with `tsc` to `/tmp`, runs `node --test`.
  Tests needing kv use real storage via `node --localstorage-file=` (Node 26 has a
  native shadowing `localStorage`; stubbing it does NOT work).
- `npm run check` — `svelte-check` + `tsc -p tsconfig.node.json`. Must be 0 errors.
- `npm run build` — production bundle. `npm run dev` (`:5173`) — Violentmonkey
  `server:` install hot-reloads from it; marker is the `hvAA·dev` float button.
- `*.test.ts` is excluded from tsconfig (never part of typecheck/packaging).
- CDP ops: `npx tsx scripts/cdp/<name>.ts` (see `scripts/cdp/README.md`).
  Target auto-discovers the hentaiverse page. Default to reads; writes need
  explicit user approval. Never click game battle buttons or use items.
  Artifacts go to `logs/` (gitignored).

## Architecture (see `docs/ARCHITECTURE.md`)

DOM → `combat/snapshot.ts` → `combat/decide.ts` (ordered rule table,
first match wins) → `combat/execute.ts` (clicks) → game `api_call` →
response → `eventEnd` → next turn. Stats/logging consume responses via
`postMessage` bridge (`recorder.ts`) — page and userscript run in different
JS worlds; filter only on the `hvaa-rec` marker (`e.source` differs across worlds).

## Gotchas (all verified live, do not regress)

- **No dynamic `import()` in `src/`** — forces SystemJS output, dead in page.
- **Never `localStorage.setItem` with `hvAA*` keys** — the game page patches it
  to silently drop them. Always use direct assignment. Same for `removeItem` safety:
  verified working, but reads/writes go through `store.ts` helpers.
- **`Infinity` dies in JSON** (`→null`) — normalize back on every kv read of HP arrays.
- **`bind:` must never receive `undefined`** (Svelte `props_invalid_value` kills tab
  switches). Conditions records are pre-filled/backfilled; keep it that way.
- **Finishing order is ascending, always** — `ruleReverse` flips the weight formula,
  never the sort. Dead (`Infinity`) sorts last.
- **Target clicks need a live target**: check `#mkey_<id>` has an `onclick`
  handler (dead monsters don't) — see `resolveTarget`.
- **Skill/item clicks route by id**: `>10000` → `.bti3` shelf div,
  else `document.getElementById` (never `querySelector('#411')` — invalid selector).
- **Spells need lock+target in the same turn** (game mechanic); a lone lock click
  sends nothing and the loop starves.
- **The game silently swallows clicks** when busy/target-locked/request-in-flight
  (see `hvc.js` `touch_and_go`/`commit_target`). The 8s-retry/25s-reload watchdog
  in `battle.ts` is the backstop — don't remove it.
- **IDB**: only `recorder.ts` may `open()` with a version number (a versioned open
  without handler permanently poisons upgrades). Tools must open versionless.
- **No `eval`/`new Function`** anywhere (CSP + imported stranger configs).
- Storage: `hvAA-` (legacy) is read-only; everything new lives under `hvAA3-`.
  Never write legacy keys. `main.debug` gates IDB recording; stats gate on
  `recordUsage`/`dropMonitor`.

## Conventions

- Conventional commits, English. Don't commit `logs/`, `dist/`, scratch `__tmp-*`.
- Trilingual UI via `src/lib/i18n.ts` dict (`tr(lang, key)`); keep keys in sync.
- Pure logic + unit tests (`combat/decide`, `expr`, `stats`); DOM only in
  `snapshot.ts`/`execute.ts`/`battle.ts`/`meta.ts`.
- Docs: `README.md` (users), `docs/{DEV,ARCHITECTURE,COMBAT,ITEMS,SKILLS,CLASSES}.md`,
  `src/lib/expr/GRAMMAR.md` (condition language spec — edit spec before parser).
- When game behavior is uncertain, read `hvc.js`/page DOM via CDP (read-only)
  instead of guessing; one controlled single-action experiment beats ten theories.
