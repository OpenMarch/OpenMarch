# OpenMarch Desktop Agent Notes

Scoped guidance for `apps/desktop`. The root `AGENTS.md` still applies; this file
adds what is specific to the Electron + React app.

## Desktop Verification

- From `apps/desktop`, run `pnpm tsc --noEmit` for typechecking; there is no package `typecheck` script.
- From `apps/desktop`, run a focused unit test as `pnpm run test:focused <relative-test-file>`; Vitest only includes `**/__test__/**.test.ts?(x)`.
- Tests that use `getTestWithHistory` need history enabled: `pnpm run test:history <relative-test-file>`.
- Desktop e2e tests run against a production build. First ensure `apps/desktop/dist-electron` exists via `pnpm run build:electron`, install browsers with `pnpm exec playwright install --with-deps`, then run `pnpm run e2e` from `apps/desktop`.
- New desktop e2e files must be `apps/desktop/e2e/tests/*.spec.mts`; Playwright support files in that suite use `.mts`/`.mjs`.
- Browser scenario tests (`apps/desktop/e2e/browser/tests/*.spec.mts`) run the renderer in headless Chromium against the real database handlers, with no Electron build or display: `pnpm run build:browser`, then `pnpm run e2e:browser`. Prefer them for user workflows inside an open show; keep Electron e2e for what only Electron does. The same scenarios run in Electron with `pnpm run e2e:scenarios:electron`. See `e2e/browser/README.md`.

## Field Freeze (Fabric)

- The Fabric field is being replaced by a three.js field ([ADR 0005](../../docs/adr/0005-three-field-renderer.md), plan in [docs/field](../../docs/field/README.md)). Until fork ticket #209 merges, field drawing and field interaction on Fabric are frozen: `src/components/canvas/`, `src/global/classes/canvasObjects/`, and the Fabric parts of `src/timeline/` and `MarcherRotationInput.tsx`.
- Fix only real breakage there, and add a parity scenario that pins each fix. Build new field behavior on the new field, not on Fabric. Box v1 (fork PR #181) is held and rebuilt in #204.

## Web Editor

- `web/` and `vite.web.config.mts` build the app for the browser (editor.openmarch.com): the main process's database code runs in a worker. Read `web/README.md` before changing the preload, IPC channels, `database.services.ts`, or anything that opens or saves files.
- Gate browser-only behavior on `isWebBuild` from `src/utilities/webBuild.ts`. Check with `pnpm run web:build`.

## Desktop Database

- Current renderer database access goes through Drizzle SQLite proxy in `apps/desktop/src/global/database/db.ts`, backed by schema in `apps/desktop/electron/database/migrations/schema.ts`.
- Low-level shared database functions live in `apps/desktop/src/db-functions`; feature-specific multi-table operations can stay beside the feature component.
- For undo/redo-aware writes, use and await `transactionWithHistory(db, "operationName", async (tx) => ...)`; un-awaited transactions can invalidate queries before writes finish.
- Prefer `{action}InTransaction` helpers for new table operations by default. Only add standalone transaction wrappers when callers actually need them.
- When changing the desktop schema, edit `electron/database/migrations/schema.ts`, run `pnpm run migrate` from `apps/desktop`, then inspect the generated SQL for bad column copies before trusting it.
- After migration changes, launch the desktop app and open an older `.dots` file to catch migration/runtime SQLite errors.

## Desktop Data And Tests

- Unit tests should use real database/package behavior; avoid mocks for packages or database operations except React context providers needed to render hook-dependent components.
- Multi-query hooks should put transformation logic in an exported stable combine function prefixed with `_`; do not pass inline `combine` functions to `useQueries`.
- `src/global/classes` is moving away from classes toward readonly interfaces plus pure exported functions; avoid adding new class-style data models there.

## Fork-only Code

- `apps/desktop/view3d-web/` (the 3D View web preview, with real demo shows) and the `view3d-web:*` scripts in `package.json` are fork-only. They may sit on the fork's `main`, but delete them from any branch before opening a PR to `OpenMarch/OpenMarch`; `view3d-web/README.md` lists everything to remove.

## Generated Or Derived Files

- `apps/desktop/src/styles/apply-tailwind-vars.cjs` is run by desktop `dev` and `build`; run `pnpm run apply-styles` manually if you need regenerated desktop style variables without starting Vite.
