# Web editor

The desktop app in a browser tab, with no Electron, served at
[editor.openmarch.com](https://editor.openmarch.com) (latest release) and
[editor-nightly.openmarch.com](https://editor-nightly.openmarch.com) (latest
`main`). There are no accounts
and nothing is uploaded: a person opens a `.dots` file from their computer or
creates a new show, edits it in the browser, and saves by downloading it.

```bash
pnpm run web:dev       # local server with hot reload (port 7780)
pnpm run web:build     # static site in dist-web/
pnpm run web:preview   # serve dist-web/
```

Build the workspace packages first
(`pnpm turbo run build --filter="@openmarch/desktop^..."` from the root).

## How it works

The renderer reaches Electron's main process only through `window.electron`,
which the preload builds on `ipcRenderer`. The web build keeps both ends and
runs the main process's database code in a Web Worker:

| Piece             | In Electron                | Here                                                                   |
| ----------------- | -------------------------- | ---------------------------------------------------------------------- |
| Renderer, preload | `src/`, `electron/preload` | The same code, started by `renderer/index.ts` once the worker is ready |
| IPC               | Electron                   | `postMessage` to the worker (`renderer/ipc.ts`, `protocol.ts`)         |
| Database handlers | `database.services.ts`     | The same file, in the worker (`worker/index.ts`)                       |
| SQLite            | `node:sqlite` on a file    | `worker/sqlite.ts`: the official SQLite WebAssembly build, in memory   |
| Opening a show    | `setActiveDb`              | `worker/index.ts`: the same steps, without the backup                  |
| Saving            | Every write is on disk     | A copy in browser storage (`worker/storage.ts`); **Download** to keep  |
| Settings          | electron-store             | `localStorage` (`renderer/handlers.ts`)                                |
| File dialogs      | Native                     | File pickers and downloads (`renderer/handlers.ts`)                    |
| Settings window   | A second `BrowserWindow`   | A second tab at `#settings`                                            |
| Node modules      | `fs`, `path`, `crypto`     | Stand-ins in `worker/`                                                 |

`vite.web.config.mts` points `electron` at `worker/electron.ts` for
main-process code and at `renderer/electron.ts` for the preload.

In the app's own code, `isWebBuild` (`src/utilities/webBuild.ts`) turns off
what has no meaning in a browser: the window buttons and native menu in the
title bar (replaced by `WebFileMenu`), the update check, and the new-show
wizard's file location, export (and mobile upload), and the settings for
plugins, privacy, developer tools and file repair. Saving downloads the file;
⌘/Ctrl+S and ⌘/Ctrl+O are bound, since there is no native menu to bind
them, so swapping marchers moves to ⌘/Ctrl+Shift+S.

There is no analytics or error reporting on the web: PostHog has no key,
Sentry is stubbed, and the opt-in prompt never shows.

### The show in the browser

There is one show at a time. It lives in memory in the worker, and a copy
goes to the browser's origin private file system (OPFS) on the first change
after a quiet spell and at most twice a second after that, so a reload or
crash reopens it. That copy is a convenience, not the saved file: browsers
may clear site storage (Safari after 7 days without a visit), so the page
says once per browser session to download the show when finished. Closing
the tab, closing the show or opening another asks first if there are changes
since the last download.

Why in memory and not one of SQLite's OPFS VFSes: in benchmarks, updates
that fire the undo triggers were about 75 times slower on `opfs-sahpool`,
and the `opfs` VFS needs cross-origin isolation headers, which would block
cross-origin scripts, images and embeds.

Only one tab per channel holds the storage (a Web Lock). A second tab keeps
its show in memory and says so. Storage is also namespaced by channel, for
builds that share an origin (such as local `web:dev` and `web:preview`).

## What doesn't work on the web

These are hidden, or answer the way the app expects when they're
unavailable:

- PDF, video and mobile export (they use Electron's `printToPDF`, file
  streams and sign-in)
- Sign-in, plugins, automatic updates, analytics
- Recent files, repairing a file, and backups before migrating

## Deploying

`.github/workflows/web-editor.yaml` builds and deploys with Wrangler
(`web/wrangler.jsonc`), each site its own Worker on a Custom Domain:

- every push to `main` → `editor-nightly.openmarch.com` (Worker
  `openmarch-editor-nightly`)
- every published, non-pre-release GitHub release → `editor.openmarch.com`
  (Worker `openmarch-editor`)
- either by hand from the Actions tab (`workflow_dispatch`)

It needs the `CLOUDFLARE_API_TOKEN` secret and `CLOUDFLARE_ACCOUNT_ID`
variable. The stable job fails for a release tag that predates the web
editor.

`WEB_CHANNEL` (`stable`, `nightly`, or `dev` by default) names a build's
channel.
