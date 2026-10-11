# Web test build (temporary, do not merge to OpenMarch's `main`)

> **Do not merge this folder, its demo `.dots` files, `tsconfig.web.json`,
> the `web:*` scripts in `apps/desktop/package.json`, `lab/` or
> `.github/workflows/lab-deploy.yaml` into OpenMarch's `main` branch.** They exist so testers can try features that are still in
> development, in a browser, and give feedback. They live on the fork.

A static site that runs the whole editor in a browser, with no Electron. The
start screen offers a demo show, the tester's own `.dots` file (read in the
browser, never uploaded), or a new show. Edits last until the tab is closed
or reloaded; **Download .dots** saves a copy.

## Commands

From `apps/desktop`, after the workspace packages are built
(`pnpm turbo run build --filter="@openmarch/desktop^..."` from the root):

```bash
pnpm run web:dev     # local server with hot reload
pnpm run web:build   # static site in web/dist
npx tsc --noEmit -p tsconfig.web.json   # typecheck this folder
```

## How it works

The renderer reaches the main process only through `window.electron`, which
the preload builds on `ipcRenderer`. As in the browser e2e harness
(`e2e/browser/`), both ends are the app's own code. The difference is that
here the main-process side runs in the page too:

| Piece             | In Electron                | Here                                                                |
| ----------------- | -------------------------- | ------------------------------------------------------------------- |
| Renderer, preload | `src/`, `electron/preload` | The same code                                                       |
| IPC               | Electron                   | `shims/electron.ts` calls the handlers directly, copying the values |
| Database handlers | `database.services.ts`     | The same file                                                       |
| SQLite            | `node:sqlite` on a file    | `shims/sqlite.ts`: sql.js, every show in memory                     |
| Files             | `fs`, `path`               | `shims/fs.ts`, `shims/path.ts`: bundled migrations, in-memory shows |
| Opening a show    | `openShowDatabase`         | `host.ts`: the same steps, with convert on open and no backup       |
| Settings          | electron-store             | `localStorage`                                                      |
| File dialogs      | Native                     | The start screen, a file input for music, a download for Save       |

A page-era show converts to timelines when it opens, with the app's own
converter. A new show starts as a timeline show.

Anything else the app asks the main process for rejects the way Electron
does for an unregistered channel: PDF and video export, plugins, sign-in,
updates and recent files don't work here.

## Publishing to the lab

A test is a folder `lab/<id>/` with `experiment.md` (the test's title, intro
and questions) and, optionally, an intro video or GIF. To publish one:

1. Open a pull request on the fork that adds or changes exactly one
   `lab/<id>/experiment.md`.
2. Add the **`lab`** label.

`.github/workflows/lab-deploy.yaml` builds this site and publishes it to the
OpenMarch lab, with a link to the pull request and credit to its author, and
comments on the pull request with the test's link. It publishes again on
every push while the label is on. Removing the label or closing the pull
request closes the test; its feedback stays. The lab adds its feedback widget
to the page; nothing here knows about it. The manifest format and the lab
itself are in the `OpenMarch/om-lab` repository.

## Demo shows

`public/demos/` holds the demo `.dots` files, listed in `demos.ts`. To add
one, copy the file there and add an entry. Cloudflare rejects files over
25 MiB, which includes a show's embedded music.

## Known gaps

- Reloading the tab loses the show's edits (the URL reopens the demo or a new
  show, not your changes).
- The window buttons in the title bar do nothing.
- Undoing the creation of selected marchers logs "SelectedMarcher not found
  on Canvas". That comes from the canvas code, not this build.
