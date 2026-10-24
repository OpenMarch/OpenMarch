# Web editor

The desktop app in a browser tab, with no Electron, served at
[editor.openmarch.com](https://editor.openmarch.com) (latest release) and
[editor-nightly.openmarch.com](https://editor-nightly.openmarch.com) (latest
`main`). There are no accounts
and nothing is uploaded: a person opens a `.dots` file or creates a new
show, and the browser keeps it, saved as they work, alongside their other
shows. Backing up shares or downloads the `.dots` file to keep a copy
somewhere else.

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

| Piece             | In Electron                | Here                                                                                          |
| ----------------- | -------------------------- | --------------------------------------------------------------------------------------------- |
| Renderer, preload | `src/`, `electron/preload` | The same code, started by `renderer/index.ts` once the worker is ready                        |
| IPC               | Electron                   | `postMessage` to the worker (`renderer/ipc.ts`, `protocol.ts`)                                |
| Database handlers | `database.services.ts`     | The same file, in the worker (`worker/index.ts`)                                              |
| SQLite            | `node:sqlite` on a file    | `worker/sqlite.ts`: the official SQLite WebAssembly build, in memory                          |
| Opening a show    | `setActiveDb`              | `worker/index.ts`: the same steps, without the backup                                         |
| Saving            | Every write is on disk     | A show library in browser storage (`worker/library.ts`); **Back up** to keep a copy elsewhere |
| Settings          | electron-store             | `localStorage` (`renderer/handlers.ts`)                                                       |
| File dialogs      | Native                     | File pickers and downloads (`renderer/handlers.ts`)                                           |
| Settings window   | A second `BrowserWindow`   | A full-screen sheet over the app (`src/components/WebSettingsSheet.tsx`)                      |
| Node modules      | `fs`, `path`, `crypto`     | Stand-ins in `worker/`                                                                        |

`vite.web.config.mts` points `electron` at `worker/electron.ts` for
main-process code and at `renderer/electron.ts` for the preload.

In the app's own code, `isWebBuild` (`src/utilities/webBuild.ts`) turns off
what has no meaning in a browser: the window buttons and native menu in the
title bar (replaced by `WebFileMenu`), the update check, and the new-show
wizard's file location, every export but video (and mobile upload), and the settings for
plugins, privacy, developer tools and file repair. "Save a copy" backs up the file;
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

### Shows in the browser

**The model, honestly:** work lives on this device, in this browser. It is
saved as the person works, so closing the tab, a crash or a reload loses
nothing, but it is only here. Backing up is the only copy anywhere else.
If the browser's site data is cleared (by the person, by the browser when
space runs low, or by Safari after a week without a visit to a website that
isn't on the Home Screen), shows that weren't backed up are gone.

- **Library.** The browser keeps any number of shows in its origin private
  file system (OPFS), under `openmarch-<channel>/library/`
  (`worker/library.ts`; the index format and rules are pure functions in
  `src/utilities/webLibrary.ts`). The start page lists them with when each
  was edited and backed up, and opens, renames, duplicates, backs up, shows
  the versions of, or deletes (after asking) each one
  (`src/components/web/WebShowLibrary.tsx`). Opening a `.dots` file or
  creating a show adds it; nothing replaces another show.
- **Autosave.** The open show lives in memory in the worker; a copy goes to
  the library on the first change after a quiet spell and at most twice a
  second after that, and when the page is hidden. Every write is crash-safe:
  the show (and the index) is written to a new file, and the previous one is
  removed only once the new one is whole; reading takes the newest whole
  file. A full disk drops the show's oldest versions and tries again.
- **Versions.** Each show keeps its last 20 versions: at most one per two
  minutes of editing, one when it's opened (if it changed since the last),
  and one before a restore. Restoring a version keeps the state it replaces
  as a new version, so nothing is lost (`src/components/web/WebVersionsDialog.tsx`).
- **Status.** The title bar says "Saved on this iPad" (or "in this
  browser"), "Saving…", or what went wrong, and when the show was last
  backed up; tap it for Back up and Versions (`src/components/web/WebSaveStatus.tsx`).
- **Back up.** Shares the `.dots` file through the share sheet on iPads and
  Android tablets (Files, Google Drive, email…) and downloads it elsewhere or
  if sharing isn't possible, then records the time. A show opened from a
  file counts as backed up by that file. A show with changes from three or
  more days of editing since its last backup gets a gentle reminder with a
  Back up button, at most once a day.
- **Keeping storage.** The page asks the browser to keep its storage
  (`navigator.storage.persist()`; Safari agrees for a Home Screen app). The
  first time in Safari on an iPad it explains how to add OpenMarch to the
  Home Screen instead of the usual welcome (`src/components/web/WebHomeScreenPrompt.tsx`).
  A Home Screen app has its own storage, apart from Safari's: a show made in
  Safari moves over by backing it up and opening the file in the app.
- **Earlier builds** kept one show as `openmarch-<channel>/<n>-<name>`; it
  becomes the library's first show, still open, and the old file is removed
  once the library has it.

Why in memory and not one of SQLite's OPFS VFSes: in benchmarks, updates
that fire the undo triggers were about 75 times slower on `opfs-sahpool`,
and the `opfs` VFS needs cross-origin isolation headers, which would block
cross-origin scripts, images and embeds.

Only one tab per channel holds the library (a Web Lock). A second tab keeps
its show in memory and says so, as does a browser without usable OPFS (such
as some private windows): such a tab warns that its work is lost when it
closes unless downloaded, and asks before closing with changes. Opening or
creating a show reloads the page, so such a tab hands the show to its next
page through IndexedDB (`renderer/handoff.ts`). A tab whose storage fails
while adding a show (e.g. it's full) becomes memory-only the same way; the
library keeps its other shows. A stored show this build can't open stays in
the library and says so. Storage is namespaced by channel, for builds that
share an origin (such as local `web:dev` and `web:preview`).

**Limits.** No sync between devices or browsers, no cloud copy, and no
recovery of shows lost with cleared site data. Versions are whole copies of
the show, so they take space (20 per show). Private Browsing detection is a
best effort: a browser that hands out storage and drops it at the end of the
session looks like a normal one.

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
