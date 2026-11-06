# Lab test builds (fork-only, do not merge to OpenMarch's `main`)

> **Do not merge the lab pieces into OpenMarch's `main` branch:** this file,
> the `lab` channel in `vite.web.config.mts` (with `LAB_TEST_ID`,
> `LAB_MANIFEST` and the `VITE_PUBLIC_LAB_*` values) and its wording in the
> app (`webChannel === "lab"`), `renderer/lab.ts` and its calls in
> `renderer/index.ts`, the version switch (`variants.ts`, `src/lab/`), the
> example shows (`demos.ts`, `public/demos/`, which the fork's `preview`
> channel uses too), `lab/` and
> `.github/workflows/lab-deploy.yaml`. They exist so testers can try features
> that are still in development, in a browser, and give feedback. They live
> on the fork.

A lab test build is the production web editor (`README.md`) built on its
`lab` channel. There is one browser build: the lab publishes the same
worker, storage, Settings and 3D View windows that editor.openmarch.com runs,
with these differences:

- **Straight into a show.** A tester lands in the editor with the test's
  show open, with no welcome flow, "Web" notice or start page
  (`renderer/lab.ts`). The show is the example show the manifest's `show`
  names (below), or Part 1 Demo; a page-era show converts to timelines as
  it opens. The editor mode is the manifest's `mode`, or Expert, and the
  language and theme are the defaults; Settings changes them.
  - A reload keeps the tester's show, edits and all, as on the web editor.
  - **Close file** starts over: the page reloads into a fresh copy of the
    test's show (after asking, if there are changes since the last
    download).
  - **Open file** opens the tester's own `.dots`, and a reload keeps it.
    **New file** goes to the start page's new-show dialog, as on the web
    editor; the start page also offers the example shows.
  - The "Web" notice still opens from the title bar's "Web" badge.
- **Example shows.** The start page offers the shows in `public/demos/`
  (listed in `demos.ts`), as the `preview` channel does, so a tester doesn't
  need a `.dots` file of their own.
- **Served from a folder.** The lab serves each test at
  `https://lab.openmarch.com/x/<test id>/`, so the build's URLs are relative
  (`base: "./"`): its scripts, the worker, SQLite's WebAssembly, the 3D
  models, the example shows and the Settings (`#settings`) and 3D View
  (`?view=3d`) windows all load from that folder.
- **Its own storage.** Every test shares the origin `lab.openmarch.com`, so
  what a build keeps in the browser is namespaced by its test id, as
  `lab-<test id>`, rather than by channel (`renderer/channel.ts`, used by
  the page and the worker). The kept show (OPFS), its Web Lock, the
  settings, the hand-off between reloads, the channels between windows and
  the Settings window's name are each test's own, so two tests open in one
  browser don't see each other's show or settings. Preferences the app
  keeps in `localStorage` itself (UI settings, shortcuts, 3D View quality)
  are shared by every build on the origin, as they are between production
  channels.
- **Wording.** The title bar says "lab" next to the version, and the "Web"
  notice says it is a test build.
- **No `_headers` file.** The lab's Worker serves the files itself. The app
  needs no special headers (no cross-origin isolation; see "The show in the
  browser" in `README.md`).

## Commands

From `apps/desktop`, after the workspace packages are built
(`pnpm turbo run build --filter="@openmarch/desktop^..."` from the root):

```bash
WEB_CHANNEL=lab LAB_TEST_ID=my-test pnpm run web:dev     # local server
WEB_CHANNEL=lab LAB_TEST_ID=my-test pnpm run web:build   # static site in dist-web/
```

A lab build without `LAB_TEST_ID` (a-z, 0-9 and -) fails. `LAB_MANIFEST`,
the test's `lab/<id>/experiment.md` (from the repository root), gives the
build the manifest's `show` and `mode` (below); without it the build opens
Part 1 Demo in Expert mode. To try it as the
lab serves it, copy `dist-web/` to `<folder>/x/my-test/`, serve `<folder>`
(e.g. with `python3 -m http.server`) and open `/x/my-test/`.

## Publishing to the lab

A test is a folder `lab/<id>/` with `experiment.md` (the test's title, intro
and questions) and, optionally, an intro video or GIF. Two front-matter
fields are the build's, and the lab ignores them:

```yaml
show: part1 # the example show it opens: an id in demos.ts (default: part1)
mode: basic # the editor mode: basic or expert (default: expert)
```

A value that isn't one of these fails the build. To publish one:

1. Open a pull request on the fork that adds or changes exactly one
   `lab/<id>/experiment.md`.
2. Add the **`lab`** label.

`.github/workflows/lab-deploy.yaml` builds the web editor with
`WEB_CHANNEL=lab`, `LAB_TEST_ID=<id>` and `LAB_MANIFEST`, publishes `apps/desktop/dist-web`
to the OpenMarch lab, with a link to the pull request and credit to its
author, and comments on the pull request with the test's link. It publishes
again on every push while the label is on. Merging the pull request archives
the test: it's closed and hidden from testers. Removing the label or closing
the pull request unmerged closes it. Its feedback stays either way. The lab
adds its feedback widget to the page (a script before `</body>` in
`index.html`). The build only keeps it out of the 3D View window
(`keepLabWidgetOut` in `renderer/lab.ts`, which claims the widget's
`om-lab-widget` element first); Settings keeps it. The manifest format and
the lab itself are in the `OpenMarch/om-lab` repository.

## Comparing versions

A test can build two or more versions of a behavior into one build, so
testers try them side by side on the same show instead of in two builds
(switching keeps the show and its edits as they are). List them in the manifest's front matter;
the first is the one testers start on:

```yaml
variants:
  - id: play-on
    label: A
    description: What the app does now
  - id: from-flag
    label: B
    description: Space plays from the start flag
```

The build then shows a **Version** switch at the bottom left (`variants.ts`). It
sets the URL's `variant` parameter without reloading, so a reload keeps it
and the feedback (which records the page's URL) says which version was on.
App code reads the version with `useLabVariant()` or `getLabVariant()` from
`src/lab/labVariant.ts`, which is `null` with no `variant` in the URL,
meaning the current behavior:

```ts
if (getLabVariant() === "from-flag") return playFromStartFlag();
```

Ask in the questions which version testers preferred and why. Once a version
wins, build it without the switch.

Locally, point the build at the manifest:
`WEB_CHANNEL=lab LAB_TEST_ID=<id> LAB_MANIFEST=lab/<id>/experiment.md pnpm run web:build`
(the manifest path is from the repository root). Other channels ignore
`LAB_MANIFEST`.

## Demo shows

`public/demos/` holds the demo `.dots` files, listed in `demos.ts`. To add
one, copy the file there and add an entry. The preview Worker's Cloudflare
static assets reject files over 25 MiB, which includes a show's embedded
music.
