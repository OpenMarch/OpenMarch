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

`pnpm --dir apps/desktop run test:timeline` runs the desktop suite with timeline mode on in the
fixtures (`VITEST_TIMELINE_MODE=true`, see `apps/desktop/src/test/timelineMode.ts`): data
fixtures are converted to timeline rows and the workspace `timelineMode` flag is set. A file whose
tests set up timeline mode themselves calls `keepFixturesInPageMode(reason)`; a test that asserts
page-mode behavior that timeline mode drops uses `it.skipIf(skipInTimelineMode(reason))`.
`test:timeline-history` sets both variables, and the ripple-affected history tests (page, beat,
measures, marcher, utility) then also check the five timeline data tables through
`timelineHistoryTables()`. `keepFixturesInPageMode` keeps module state, so it needs vitest's
per-file isolation (the default) and throws under `--no-isolate`.

Write paths read the flag from the file, not from a parameter that defaults to page mode:
`createMarchers` and `deleteMarchers` read it inside their edit (`timelineModeInTransaction`), and
helpers that can't read the database (`buildMarcherAppearancesByPageId`, `useRenderMarcherShapes`,
`canvasCoordinateWriter`, `setMarchersToNeighborPage`) require it. A timeline-native test picks the
mode with `setTimelineModeFlag(db, on)`.

To test a feature in whichever mode the fixture is in, render it with
`apps/desktop/src/test/featureHarness.tsx` (the app's providers, the timeline resolver host, page
and marcher selection, and `positionOn`, which reads the resolver in timeline mode and
`marcher_pages` otherwise). The coordinate actions, undo focus, the marcher inspector, the
coordinate sheet and drill chart exports, and the marcher add and delete mutations have such
tests, so `test:timeline` takes their timeline path.

A passing `test:timeline` run does not cover tests that don't use the `base.tsx` fixtures (mocked
databases, pure functions), or undo and redo checks unless `VITEST_ENABLE_HISTORY=true` is also
set (`test:timeline-history`).
