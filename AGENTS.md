# OpenMarch Agent Notes

## Runtime And Commands

- Use `pnpm`; the root `package.json` pins `pnpm@10.11.0` and CI/package engines use Node 24. Older docs/hooks mention Node 22, but root `engines` and GitHub Actions are the executable source of truth.
- Install with `pnpm install`. CI uses `pnpm install --no-frozen-lockfile` in PR checks.
- Root shortcuts are Turbo filters: `pnpm desktop dev`, `pnpm site dev`, and `pnpm ui dev`.
- Root PR checks run `pnpm format:check`, `pnpm lint`, and `pnpm spellcheck`; desktop/package changes also run `pnpm build`, `pnpm test`, desktop history tests, e2e, and Electron builds.
- Many lint scripts run with `--fix`; use `pnpm format:check` when you need a non-mutating format check.

## Repo Shape

- This is a pnpm/Turbo monorepo: `apps/*` and `packages/*` are workspace packages.
- `apps/desktop` is the main Electron + React app; `@/*` maps to `apps/desktop/src/*` and `@om-electron/*` maps to `apps/desktop/electron/*`.
- `apps/website` is Astro/Starlight docs and site content.
- `apps/cms` is a Next/Payload/Cloudflare app with its own `apps/cms/AGENTS.md`; read that before CMS changes.
- `packages/core`, `packages/musicxml-parser`, and `packages/ui` are publishable/shared packages built with `tsup`; `packages/ui/src/tailwind.css` is the shared style source.
- Prefer existing UI primitives in `packages/ui/src/components/base`; icons should come from `@phosphor-icons/react`.

## Desktop Verification

- From `apps/desktop`, run `pnpm tsc --noEmit` for typechecking; there is no package `typecheck` script.
- From `apps/desktop`, run a focused unit test as `pnpm run test <relative-test-file>`; Vitest only includes `**/__test__/**.test.ts?(x)`.
- Tests that use `getTestWithHistory` need history enabled: `pnpm run test:history <relative-test-file> --silent`.
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
- In `apps/cms`, run `pnpm run generate:types` after Payload schema changes and `pnpm run generate:importmap` after creating or modifying Payload admin components.
