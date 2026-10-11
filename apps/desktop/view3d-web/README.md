# 3D View web preview (temporary, fork only)

> **Remove this before the 3D View goes upstream.** This folder, the demo
> `.dots` files and the `view3d-web:*` scripts in `apps/desktop/package.json`
> exist only so other developers can try the 3D View in a browser while it is
> in development. They may live on the fork (`AlexDumo/OpenMarch-timeline`),
> including its `main` branch, but must never reach `OpenMarch/OpenMarch`.
> Before any PR to `OpenMarch/OpenMarch` that carries the 3D View, delete:
>
> - `apps/desktop/view3d-web/` (including `public/demos/`, which holds real shows)
> - the `view3d-web:dev`, `view3d-web:build` and `view3d-web:deploy` scripts in
>   `apps/desktop/package.json`

A static site that runs the 3D View window in a browser, with no Electron. It
shows a demo show, or any `.dots` file the viewer opens or drops on the page.
Viewing only: playback, cameras and the venue settings work. Settings changes
last until the page reloads, and nothing is ever saved to a file.

## Commands

From `apps/desktop`:

```bash
pnpm run view3d-web:dev      # local server with hot reload
pnpm run view3d-web:build    # static site in view3d-web/dist
pnpm run view3d-web:deploy   # build, then upload to Cloudflare Pages
```

## How it works

The 3D View window reaches the rest of the app only through `window.view3d`
(`electron/preload/view3d.ts`). This folder supplies a stand-in for it, and
nothing in `src/` changes:

| `window.view3d`      | In the app                       | Here (`host.ts`)                                                         |
| -------------------- | -------------------------------- | ------------------------------------------------------------------------ |
| `sqlRead`            | Main reads the open show         | sql.js reads the show in memory, after applying any pending migrations   |
| `on`, `hello`        | The editor sends clock/selection | The host sends its own clock and selected page                           |
| `requestPlayback`    | The editor's playback actions    | The same rules: play from the selected page, step pages, stop at the end |
| `requestVenueChange` | The editor saves it with undo    | Written to the in-memory copy only                                       |

The host also plays the show's music with Web Audio, applying the show's audio
offset as the editor does. A build alias in `vite.config.mts` replaces the
window's `TitleBar` with `WebTitleBar.tsx`: the demo picker, Open .dots, and
mute. A dropped or opened file is read in the browser and never uploaded.

## Demo shows

`public/demos/` holds the demo `.dots` files, listed in `demos.ts`. To add one,
copy the file there and add an entry. Cloudflare Pages rejects files over
25 MiB, which includes a show's embedded music.
