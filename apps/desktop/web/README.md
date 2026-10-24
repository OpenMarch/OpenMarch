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

| Piece             | In Electron                | Here                                                                     |
| ----------------- | -------------------------- | ------------------------------------------------------------------------ |
| Renderer, preload | `src/`, `electron/preload` | The same code, started by `renderer/index.ts` once the worker is ready   |
| IPC               | Electron                   | `postMessage` to the worker (`renderer/ipc.ts`, `protocol.ts`)           |
| Database handlers | `database.services.ts`     | The same file, in the worker (`worker/index.ts`)                         |
| SQLite            | `node:sqlite` on a file    | `worker/sqlite.ts`: the official SQLite WebAssembly build, in memory     |
| Opening a show    | `setActiveDb`              | `worker/index.ts`: the same steps, without the backup                    |
| Saving            | Every write is on disk     | A copy in browser storage (`worker/storage.ts`); **Download** to keep    |
| Settings          | electron-store             | `localStorage` (`renderer/handlers.ts`)                                  |
| File dialogs      | Native                     | File pickers and downloads (`renderer/handlers.ts`)                      |
| Settings window   | A second `BrowserWindow`   | A full-screen sheet over the app (`src/components/WebSettingsSheet.tsx`) |
| Node modules      | `fs`, `path`, `crypto`     | Stand-ins in `worker/`                                                   |

`vite.web.config.mts` points `electron` at `worker/electron.ts` for
main-process code and at `renderer/electron.ts` for the preload.

In the app's own code, `isWebBuild` (`src/utilities/webBuild.ts`) turns off
what has no meaning in a browser: the window buttons and native menu in the
title bar (replaced by `WebFileMenu`), the update check, and the new-show
wizard's file location, every export but video (and mobile upload), and the settings for
plugins, privacy, developer tools and file repair. Saving downloads the file;
⌘/Ctrl+S and ⌘/Ctrl+O are bound, since there is no native menu to bind
them, so swapping marchers moves to ⌘/Ctrl+Shift+S.

There is no analytics or error reporting on the web: PostHog has no key,
Sentry is stubbed, and the opt-in prompt never shows.

### Tablets

On iPads (Safari) and Android tablets (Chrome) the page doesn't zoom or
bounce (`renderer/touchGestures.ts` and the global CSS), and "Add to Home
Screen" opens it full screen with the app icon (`public/`, tags added by
`vite.web.config.mts`). iOS greys out `.dots` files in a picker that names
the extension, so there the picker accepts any file and the choice is
checked afterwards, and saving offers the share sheet ("Save to Files")
before falling back to a download (`renderer/filePicking.ts`).

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
its show in memory and says so, as does a private window without OPFS.
Opening or creating a show reloads the page, so such a tab hands the show to
its next page through IndexedDB (`renderer/handoff.ts`), and keeps its
"changed since download" flag to itself rather than in the shared
`localStorage` key. A tab whose storage fails while opening or creating a
show (e.g. it's full) removes the old show's copy and becomes memory-only
the same way. A stored show this build can't reopen is kept for a later
build, and opening or creating a show asks before replacing it. Storage is
also namespaced by channel, for
builds that share an origin (such as local `web:dev` and `web:preview`).

### Video export

The export dialog offers only video on the web (File menu › Export
video…, or the toolbar's Export video). The renderer draws and encodes the
frames as in Electron (`src/components/exporting/video/`, mediabunny over
WebCodecs); the page answers `export:videoStart`, `export:videoChunk` and
`export:videoEnd` instead of the main process (`renderer/videoExport.ts`):

- The chunks go to a file in the origin private file system, written by a
  worker through a sync access handle (`renderer/videoFile.worker.ts`), so
  the video is never held in memory. Without OPFS (some private windows)
  they're kept in memory and the dialog warns that a long show may not fit.
- Saving needs a fresh tap, since the share sheet won't open minutes after
  the Export tap, so the dialog shows **Save video** when the video is done.
  On iPads it opens the share sheet (Save Video to Photos, Save to Files,
  AirDrop); elsewhere it downloads. The temporary file is removed once
  saved, and leftovers (unsaved, older than an hour) on the next export.
- Codecs (`encodingTarget.ts`): MP4 with H.264 and AAC, since that's what
  an iPad saves to Photos. Safari encodes H.264 from 16.4 but has no
  `AudioEncoder` before Safari 26, and Chrome on Linux has no AAC encoder,
  so where AAC is missing the bundled WebAssembly build of FFmpeg's AAC
  encoder (`@mediabunny/aac-encoder`, about 1 MB, loaded only then) makes
  the sound. If WebAssembly is off (as in the iPhone and iPad high-security mode), Opus in WebM is
  used where available, else the video is silent and the dialog says so
  before starting.
- Tablets: 720p and 30 fps by default, 1080p optional, no 4K; the audio is
  sliced as it's encoded rather than copied whole; the screen is kept on
  with the Screen Wake Lock API where available, and the dialog says that
  switching apps or locking the screen may stop the export. Closing the
  dialog cancels it.

## What doesn't work on the web

These are hidden, or answer the way the app expects when they're
unavailable:

- PDF and mobile export (they use Electron's `printToPDF` and sign-in)
- Sign-in, plugins, automatic updates, analytics
- Recent files, repairing a file, and backups before migrating

## Deploying

Cloudflare Workers Builds builds and deploys each site from a branch, as
its own Worker on a Custom Domain (`web/wrangler.jsonc`):

- `main` → `editor-nightly.openmarch.com` (Worker
  `openmarch-editor-nightly`)
- `stable` → `editor.openmarch.com` (Worker `openmarch-editor`)

`.github/workflows/web-editor.yaml` force-pushes each published,
non-pre-release GitHub release's tag to `stable`. To roll back, run it from
the Actions tab with an older tag. A tag that predates the web editor fails
to build.

Only that workflow can move `stable`: a ruleset blocks every push except
from deploy keys, and the workflow pushes with the `STABLE_DEPLOY_KEY`
deploy key (`GITHUB_TOKEN` can't bypass a ruleset or push workflow-file
changes). Keep it the repo's only deploy key, since any deploy key can push
to `stable`.

The build settings live in each Worker's **Settings → Builds** in the
Cloudflare dashboard. Both use the repo root as the root directory and:

```bash
# build
pnpm turbo run build --filter="@openmarch/desktop^..." && pnpm --filter @openmarch/desktop run web:build
# deploy (nightly adds --env nightly)
pnpm --filter @openmarch/desktop exec wrangler deploy -c web/wrangler.jsonc
```

with the build variables `WEB_CHANNEL` (`nightly` or `stable`) and
`NODE_VERSION=24`.

`WEB_CHANNEL` (`stable`, `nightly`, or `dev` by default) names a build's
channel.
