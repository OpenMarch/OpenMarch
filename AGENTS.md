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

## Cursor Cloud specific instructions

The startup update script (`nvm use 24` + `corepack enable` + `pnpm install --no-frozen-lockfile`) refreshes deps. Standard build/lint/test/run commands are above; notes below are only the non-obvious caveats discovered when running each service in the cloud VM.

### Toolchain

- Node 24 is required. `~/.bashrc` prepends nvm's Node 24 ahead of the sandbox `/exec-daemon/node` (which is Node 22). If `node -v` ever shows v22, run `nvm use 24` (pnpm comes from corepack in the Node 24 bin).

### Desktop (`pnpm desktop dev`, or `cd apps/desktop && pnpm run dev`)

- Electron runs headless on `DISPLAY :1` with `--no-sandbox`. Harmless log noise: D-Bus "Failed to call method"/"Could not parse server address" lines, and an `electron-updater` "Cannot destructure property 'autoUpdater'" unhandled rejection (auto-updater is disabled in dev). None of these stop the app.
- Single-instance lock: the app uses `app.requestSingleInstanceLock()`, so only ONE instance runs. If Electron exits immediately right after logging `Sentry error reporting enabled: false`, a stale instance/lock is blocking it — kill leftover `electron/dist/electron` PIDs and `rm -f ~/.config/OpenMarch/SingletonLock`.
- To launch straight into the editor (skip the New File dialog), set `databasePath` in `~/.config/OpenMarch/config.json` to a `.dots` file copied from `apps/desktop/electron/database/migrations/_blank.dots`. The New File / Open File UI also works.
- Editor `ERR_INSUFFICIENT_RESOURCES`: happens when Vite skips dependency pre-bundling because the shared-package `tsup --watch` builds (started by `pnpm desktop dev`) race Vite's dep scan. Avoid by pre-building packages (`pnpm build`, or rely on persisted `dist`) so the Vite optimizer cache at `apps/desktop/node_modules/.vite/deps` warms; running `cd apps/desktop && pnpm run dev` (no watchers) is the most reliable.
- Electron binary gotcha: the `electron` postinstall occasionally extracts incompletely (only `dist/locales`), giving "Electron failed to install correctly". Fix once (persists in the snapshot): unzip `~/.cache/electron/<hash>/electron-*.zip` into `node_modules/.pnpm/electron@*/node_modules/electron/dist`, then `printf 'electron' > .../electron/path.txt` (NO trailing newline — `echo` breaks it).

### Website (`pnpm site dev`)

- Astro/Starlight on `http://localhost:4321`. Docs search (Pagefind) only works in production builds, not in dev.

### CMS (`pnpm --filter @openmarch/cms dev`)

- Next.js on `http://localhost:3000`; admin at `/admin`. Needs `apps/cms/.env` with a real `PAYLOAD_SECRET` (`echo PAYLOAD_SECRET="$(openssl rand -base64 64)" > apps/cms/.env`). Uses local Cloudflare bindings (D1/R2 persisted under `.wrangler/state`) — no Cloudflare login required for dev.
- The admin renders blank ("internal-module-error … not found in importMap") until you run `pnpm --filter @openmarch/cms run generate:importmap`; the committed `importMap.js` is stale versus the Payload version pulled in by the root `pnpm.overrides` (it's a generated file, so regenerate rather than commit).
- KNOWN PRE-EXISTING ISSUE: the Lexical rich-text Post editor errors with "Cannot destructure property 'config' … useConfig". Root `pnpm.overrides` bump `payload`/`@payloadcms/next`/`graphql`/`storage-r2` to 3.84.x while `@payloadcms/ui`/`richtext-lexical`/`db-d1-sqlite` stay at 3.73.0 (two `@payloadcms/ui` versions resolve). Admin auth, dashboard, and collection lists work, but creating/editing rich-text posts won't until the `@payloadcms/*` versions are aligned.
