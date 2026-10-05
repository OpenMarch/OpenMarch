# Browser scenario tests

These tests drive the real renderer in headless Chromium, with no Electron
process. They are for user workflows inside an open show: creating marchers,
adding music and pages, moving marchers on the canvas, undo and redo.

```bash
pnpm run build:browser   # about 10 seconds; rerun after changing app code
pnpm run e2e:browser     # all scenarios, four at a time
pnpm run e2e:browser e2e/browser/tests/pages.spec.mts
```

They need no display, no Docker and no `build:electron`, and each test gets
its own show file, so several runs can share a machine.

## How it works

The renderer only reaches the main process through `window.electron`, which
the preload script builds on `ipcRenderer`. The harness keeps both ends and
replaces the wire between them:

| Piece                | In Electron                      | In these tests                                                             |
| -------------------- | -------------------------------- | -------------------------------------------------------------------------- |
| Renderer             | `src/`                           | The same code, built by `vite.browser.config.mts`                          |
| `window.electron`    | `electron/preload/index.ts`      | The same file, bundled with `preload/electron.ts` standing in for Electron |
| IPC                  | Electron                         | Two functions Playwright exposes on the page                               |
| Database handlers    | `database.services.ts`           | The same file, registered by `host/index.ts` in the test process           |
| Opening a show       | `setActiveDb` in `main/index.ts` | Restated in `host/index.ts`: check the file, apply migrations              |
| Settings, theme, etc | `main/index.ts`                  | Restated in `host/index.ts` over an in-memory store                        |

SQL runs through the app's own `sql:proxy` handler on `node:sqlite`, against a
copy of `_blank.dots` in the test's output folder.

## Checking the harness against Electron

The same scenarios also run in the built Electron app, to catch the stand-ins
above drifting from the real thing:

```bash
pnpm run build                    # the Electron build the app is launched from
pnpm run e2e:scenarios:electron   # needs a display (Xvfb on a headless machine)
```

Each launch gets its own `--user-data-dir`, so these run in parallel too. Run
them before merging a change to the harness, the preload or the main process.

## What belongs in the Electron suite instead

A channel the host doesn't register rejects with Electron's own "No handler
registered" error, so a test that wanders into these fails loudly:

- opening, saving, closing and creating files, and the launch page
- native dialogs and menus
- PDF and video export, audio import
- sign-in, plugins, updates

Those stay in `e2e/tests/`, which runs the packaged app.

## Writing a test

```ts
import { test, expect } from "../fixtures.mjs";
import { createMarchers, expectCanvasMatchesShow } from "../app.mjs";

test("creates marchers", async ({ show }) => {
  await createMarchers(show.page, { quantity: 8, section: "Baritone" });

  expect(show.query("SELECT id FROM marchers")).toHaveLength(8);
  await expectCanvasMatchesShow(show);
});
```

- `show.page` is the app with a blank show open.
- `await show.query(sql, ...params)` reads the show file, to assert on what was
  saved. Don't open the file yourself: under Electron a second process reading
  it makes the app's writes fail with "database is locked".
- Don't rely on the window size or on a particular marcher being in view; the
  two targets lay out slightly differently.
- `expectCanvasMatchesShow(show)` waits until every marcher is drawn where the
  file says it is. Call it after any step that moves marchers or changes page.
- `test.use({ seedSql: [...] })` starts from an existing show
  (see `tests/existing-show.spec.mts`).
- A test fails if the page logs an error or throws. Allow a known message with
  `test.use({ allowedPageErrors: [/.../] })`.
- Put steps a user takes (fill a form, drag a dot) in `app.mts` so specs read
  as scenarios.
