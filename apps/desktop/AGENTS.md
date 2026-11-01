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

## UI Text

- Show keyboard shortcuts as keycaps, never as plain text. A shortcut is one `Keycaps` unit, a cap per key joined by "+" (e.g. Ctrl + Z), so never build one from separate caps or write the "+" yourself: build the keys with `formatBindingKeys` (`src/shortcuts/bindings.ts`, so Mac shows ⌘ and others Ctrl) and render them with `Keycaps` (`src/components/ui/Keycaps.tsx`). Inside translated text, put a tag in the string (`zoom out with <keys></keys>`) and render it with `<T params={{ keys: () => <Keycaps … /> }}>`. For an action's own shortcut use `getActionShortcutKeys` (`src/shortcuts/labels.ts`). The timeline's small muted caps (`Keycaps` in `src/components/timeline/ShortcutTooltip.tsx`) follow the same rule.

## Field

- The field is `src/field/`: a renderer-free editor (`editor/`) and a React Three Fiber renderer (`three/`) with an SVG overlay ([ADR 0005](../../docs/adr/0005-three-field-renderer.md), [docs/field](../../docs/field/README.md)). Keep editing rules in the editor, with Vitest tests there, and check behavior through browser scenarios that read the field test API (`window.fieldTest`) and saved data, never three.js objects.
- Features started on the old Fabric field port by [docs/field/porting-fabric-features.md](../../docs/field/porting-fabric-features.md).

## Shapes

- The shape tool lives in `src/shapes/` (spec [08-shape-system-ux.md](../../docs/timeline/research/shapes/08-shape-system-ux.md)). Read `src/shapes/AGENTS.md` for the map, the shape host contract and the test seams before changing it.

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
- Lab test versions are fork-only: `src/lab/labVariant.ts`, `web/variants.ts`, the `labVariants()` / `__LAB_VARIANTS__` wiring in `vite.web.config.mts` (with its `yaml` devDependency), `LAB_MANIFEST` in `.github/workflows/lab-deploy.yaml`, and the `lab/*/experiment.md` manifests. Delete them, and the `initVariants`/`mountVariantSwitch` calls in `web/renderer/index.ts`, from any branch before opening a PR to `OpenMarch/OpenMarch`.

## Generated Or Derived Files

- `apps/desktop/src/styles/apply-tailwind-vars.cjs` is run by desktop `dev` and `build`; run `pnpm run apply-styles` manually if you need regenerated desktop style variables without starting Vite.
