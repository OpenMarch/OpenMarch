# OpenMarch Desktop Agent Notes

Scoped guidance for `apps/desktop`. The root `AGENTS.md` still applies; this file
adds what is specific to the Electron + React app.

## Desktop Verification

- From `apps/desktop`, run `pnpm tsc --noEmit` for typechecking; there is no package `typecheck` script.
- From `apps/desktop`, run a focused unit test as `pnpm run test:focused <relative-test-file>`; Vitest only includes `**/__test__/**.test.ts?(x)`.
- Tests that use `getTestWithHistory` need history enabled: `pnpm run test:history <relative-test-file>`.
- Desktop e2e tests run against a production build. First ensure `apps/desktop/dist-electron` exists via `pnpm run build:electron`, install browsers with `pnpm exec playwright install --with-deps`, then run `pnpm run e2e` from `apps/desktop`.
- New desktop e2e files must be `apps/desktop/e2e/tests/*.spec.mts`; Playwright support files in that suite use `.mts`/`.mjs`.

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

## Generated Or Derived Files

- `apps/desktop/src/styles/apply-tailwind-vars.cjs` is run by desktop `dev` and `build`; run `pnpm run apply-styles` manually if you need regenerated desktop style variables without starting Vite.
