# Testing

## Writing tests

Use Vitest to write all unit tests.

Tests should be placed in a **test** folder within the same directory of the file being tested.

Never use mocks for packages or database operations.
Everything should be able to be tested with the real functionality.
If you run into trouble getting a module to import correctly, please ask for assistance.
The only exception to this is mocking React context providers when trying to render components that rely on the hooks.

## Running tests

Since the is a monorepo, be sure to change directory to the package or app where you want to run tests.
E.g. `pnpm --dir apps/desktop run test:focused <relative-test-file>`.

Use `test:focused` rather than `test` for a single file: the `test` script ends in
`--silent`, and Vitest 4 parses a trailing path as that flag's value and exits.
Tests that use `getTestWithHistory` need `pnpm --dir apps/desktop run test:history
<relative-test-file>` instead.

Test databases are timeline files, like every file the app opens. The plain `db` fixture is a
copy of `_blank.dots` (version 8, no page-era tables). A data fixture (`marchersAndPages`,
`pages`, `marchers`, `beats`) loads its page show into a page-era file and converts it with the
app's own convert on open (see `apps/desktop/src/test/timelineMode.ts`). A file whose tests need
the page show unconverted (converter tests, or tests that convert it themselves) calls
`keepFixturesInPageMode(reason)` and converts with `convertPagesToTimeline` from
`@/test/convertPages`, which drops the page-era tables afterwards unless `keepPageTables` is set.
`keepFixturesInPageMode` keeps module state, so it needs vitest's per-file isolation (the
default) and throws under `--no-isolate`. History tests check the timeline data tables through
`timelineHistoryTables()`.

Each of those databases is built once per run and copied for every test
(`apps/desktop/src/test/fixtureCache.ts`), so a test file must not `vi.mock` the code that builds
them (migrations, undo triggers, convert on open), or fake `Date` or `setTimeout` while they're
built (faking only animation frames is fine).

Test files run in jsdom by default. A `.ts` test that needs no DOM can start with
`// @vitest-environment node`, which skips building the browser environment for that file.

To test a feature end to end in the renderer, render it with
`apps/desktop/src/test/featureHarness.tsx` (the app's providers, the timeline resolver host, page
and marcher selection, and `positionOn`, which reads the resolver).
