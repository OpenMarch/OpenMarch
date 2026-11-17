# Website and user guide

`apps/website` is openmarch.com: the Astro home pages, the blog, and the docs (Starlight) under
`src/content/docs`. Most agent work here is on the **user guide**, `src/content/docs/guides` and
`src/content/docs/troubleshooting`. Read [docs/conventions/user-docs.md](../../docs/conventions/user-docs.md)
first: it says what a good page is, how to name things, and which words to use. This file says how
to make and check the pages.

## When the app changes

The guide describes the app on `main`, so a change to how the app looks or behaves updates the
guide **in the same pull request, before it's pushed**. This is part of finishing the change,
like its tests. Whoever makes the change, person or agent, does all of it:

1. **Find the pages.** `pnpm --dir apps/website docs:impact` lists the guide pages whose `covers`
   name a file you changed, and the pages using a label or shortcut you changed. Also search the
   guide for the feature's name and its old label text: `covers` isn't complete.
2. **Update the words.** Read each page and fix what's no longer true, including what's
   missing: a new option, a new step, a new limit. Write to `docs/conventions/user-docs.md`.
   A new feature gets its section or page.
3. **Re-record the pictures** that show what changed (`node scripts/docs-media/capture.mjs <shot>`
   from `apps/desktop`, below), and add shots for anything new.
4. **Regenerate the reference** if an action, shortcut, hold term, menu item or setting changed:
   `pnpm --dir apps/desktop docs:reference`.
5. **Check:** `pnpm --dir apps/website check:guide`, then build the site.
6. **Review what you changed as a reader would**, before pushing:
   - Look at every new or re-recorded picture (open the WebP; pull frames from clips).
   - Read every changed page as it renders, in light and dark: `pnpm site dev` in a browser, or
     `node apps/website/scripts/page-shots.mjs /guides/<page>/ ...` and look at the screenshots
     it writes (that's how an agent reads them).
   - Check that the steps work: follow them in the app, or check each one against the code.
7. **Fill in the pull request's User guide section**: pages updated and reviewed, or why the
   change isn't user-visible, or which pages still need updating and why.

In CI, the **User guide** check fails when a page names a label, shortcut, picture or page that
no longer exists, when the generated shortcut data is stale, or when the site doesn't build. A
comment on the pull request lists the guide pages the change may affect; it's advisory, and the
`no-docs-needed` label silences it for changes users can't see. Neither can tell whether a
page's words are still true: steps 1, 2 and 6 are how that happens.

## Pages

- One file per page, `.mdx`, in the chapter's folder (`guides/timeline/split-a-move.mdx`). The
  file name is the URL, so keep it short and lowercase with hyphens, and don't rename pages
  without adding a redirect in `astro.config.mjs`.
- Frontmatter: `title`, `description`, `type`, `covers`, `sidebar.order` (see the conventions).
- A new chapter is a new folder plus an entry in `guideChapters` in `astro.config.mjs`, which
  makes its sidebar group and its plain-text file.
- Link to other pages with absolute paths that end in a slash: `/guides/timeline/moves/`.
- Write each paragraph and each list item on **one line**. In MDX, a line that starts with a
  component (`<Ui …/>`, `<Kbd …/>`) is read as a block of its own and splits the sentence, so
  never hard-wrap prose. Prettier is off for these pages for the same reason.

### Components

Import them at the top of the page:

```mdx
import Media from "@/components/docs/Media.astro";
import Kbd from "@/components/docs/Kbd.astro";
import Ui from "@/components/docs/Ui.astro";
import { Steps, Aside } from "@astrojs/starlight/components";
```

| Component                          | Use                                                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| `<Ui k="i18n.key" />`              | A label exactly as the app shows it, bold. Keys are in `apps/desktop/i18n/en.json`.          |
| `<Kbd action="actionId" />`        | An action's shortcut, in the reader's system's keys. Ids: `src/data/generated/actions.json`. |
| `<Kbd keys="Mod+Shift+Z" />`       | Any keys. `Mod` is ⌘ on a Mac and Ctrl elsewhere. Add `gesture="drag"` for a held key.       |
| `<Media id="shot-id" alt="..." />` | A screenshot or clip recorded from the app (below). `caption` and `maxWidth` optional.       |
| `<ShortcutList />`                 | The full shortcut list (Reference only).                                                     |
| `<MenuList />`                     | Every menu and its items, for macOS and Windows/Linux (Reference only).                      |
| `<Steps>`                          | Wraps a numbered list of steps.                                                              |
| `<Aside type="caution">`           | Rarely: something the reader would regret missing.                                           |

The build also writes the guide as plain text for agents (`starlight-llms-txt`, set up in
`astro.config.mjs`): `dist/llms.txt`, `dist/llms-full.txt` and one file per chapter in
`dist/_llms-txt/`. It reads each page's HTML, so a new component must leave readable text
there; `<Kbd>` writes a `.docs-kbd-text` span for it.

To find a label's key, search `en.json` for the text the app shows
(`grep -n '"Split page"' ../desktop/i18n/en.json`) and take the key path from the nesting.

## Screenshots and clips

Every image and clip in the guide is recorded from the built app by
`apps/desktop/scripts/docs-media/capture.mjs`, never taken by hand. Each one is a **shot** in
`apps/desktop/scripts/docs-media/shots/<chapter>.mjs`: how to set the app up, what part of the
window to keep, and for a clip, what to do while filming. The recorder captures it in light and
dark at 2× and writes `public/docs/media/<chapter>/<id>.<theme>.(webp|mp4)` and its size to
`src/data/docs-media.json`.

```sh
pnpm turbo run build --filter="@openmarch/desktop^..."   # once, from the repo root
pnpm --dir apps/desktop build                            # after app changes
cd apps/desktop
node scripts/docs-media/capture.mjs --list               # every shot
node scripts/docs-media/capture.mjs timeline             # one chapter
node scripts/docs-media/capture.mjs move-resize          # one shot
scripts/media-kit/in-docker.sh scripts/docs-media/capture.mjs move-resize   # headless Linux
```

On a machine without a display (CI, the agents' Linux box), use `in-docker.sh`: it runs the
recorder in a fixed Docker image on a virtual screen, so recordings come out the same every time.
Where the machine has an NVIDIA GPU (the agents' Linux box) it passes it in and the app draws on
it (`--gpu-gl`); CI has none and draws with SwiftShader (`--software-gl`). The two agree on 2D
shots, but 3D View shots differ by about 0.5 % of pixels (edge smoothing), which is over the
refresh threshold: re-record a 3D shot with `MEDIA_GPU=0` if it has to match what CI records. It allows three recordings at once on a machine and queues the
rest. Each run leaves a log and a contact sheet of the clips in
`apps/desktop/scripts/docs-media/runs/<time>/`.

**Always look at what you recorded** before using it: open the WebP, and pull a few frames from
a clip (`ffmpeg -i clip.mp4 -vf "select='not(mod(n\,30))',scale=640:-1,tile=3x3" -frames:v 1 sheet.png`).
A shot that runs without errors can still show the wrong page, a closed menu or a toast over the
field.

### Writing a shot

```js
const shots = [
  {
    id: "move-resize", // unique across all chapters; the page uses it in <Media id>
    kind: "clip", // or "still"
    show: "demo", // a show in capture.mjs SHOWS, or a .dots path from apps/desktop
    mode: "expert", // or "basic"
    async setup({ page, around, union, whole, wait }) {
      // Get the app into the state the picture starts from, then say what to keep:
      // a box in window points (the window is 1600 × 1000). `around(locator, pad)`
      // frames an element; `union(a, b)` frames two.
      await page.keyboard.press("KeyE");
      return { box: await around(page.getByTestId("timeline"), 8) };
    },
    async perform({ page, film, overlay, box }) {
      // Clips only. The clock is frozen: time moves only as frames are filmed.
      await overlay.enable(); // pointer, click rings and keys, drawn into the clip
      await film.moveTo(page, from, to, 0.6); // the pointer glides to a control, filmed
      await film.drag(page, a, b, 1.0); // a drag over 1 second, filmed
      await page.keyboard.down("Shift"); // keys show in a cap at the bottom of the clip
      await film.hold(1.5); // film 1.5 s of whatever happens
    },
  },
];
export default shots;
```

- `film.moveTo`, `film.drag` (`{ button: "right" }` for a right-drag), `film.hold(seconds)`,
  `film.frame()`, `film.skip(seconds)` (time passes, not filmed) and `film.release()` (back to
  real time, to wait on something). Keep clips 3 to 8 seconds.
- For a still that shows the pointer or a held key, call `overlay.enable()` and
  `overlay.place(x, y)` or `overlay.show("Shift")` in `perform`. Leave the overlay off in other
  stills.
- Find elements the way the e2e tests do (`apps/desktop/e2e/browser/app.mts` and `timeline.mts`
  have helpers worth copying): roles and names first, `data-testid` next. `window.fieldTest`
  (`apps/desktop/src/field/fieldTestApi.ts`) gives each marcher's screen point for clicks and crops.
- Pick a state that shows the idea calmly: a page in the middle of the show, a few marchers
  selected, no toasts, no hover tooltips unless the tooltip is the point.

### Scheduled refresh

`.github/workflows/docs-media.yaml` records the shots again every week, so pictures that went
stale without anyone noticing still get caught. It picks the shots whose chapter file, show,
`covers` (a shot's own optional `covers: ["apps/desktop/src/..."]`, plus the `covers` of the
pages that show it), labels or shared styles changed since the shot was last recorded, plus any
the last refresh couldn't finish; once a month it records all of them. A change to `capture.mjs`,
`shot-list.mjs`, `media-kit/` or shared styles records every shot, so the first run after this
workflow lands picks all 80. It compares each recording with the committed one and keeps only the
ones that visibly changed, recorded twice with both recordings agreeing, then opens a pull request
with them, and issues naming the pages for the shots that failed to record (one issue for all of
them when more than five fail). The steps run locally too:

```sh
node scripts/docs-media/refresh.mjs plan                  # which shots it would record, and why
node scripts/docs-media/refresh.mjs pages <shot-id>       # the pages that show a shot
DOCS_MEDIA_WORK=/tmp/run scripts/media-kit/in-docker.sh scripts/docs-media/capture.mjs <shot-id>
scripts/media-kit/in-docker.sh scripts/docs-media/refresh.mjs compare --work /tmp/run --out /tmp/run/out
```

`compare` puts back the recordings that didn't change and writes before | after | diff
pictures of the ones that did to `<out>/diffs/`.

Which runs do what:

- **Only `main` publishes**, from the Monday run or a manual run without chosen shots. Pushes to
  `prerelease/**` and manual runs on other branches only report, in the run summary and
  artifacts: `prerelease/0.2` only ever holds commits from fork `main`
  (`docs/releases/beta.md`), so no pull request can go there. It runs only on the fork.
- **A manual run of chosen shots only reports**, and doesn't count as a refresh. An unknown id
  fails the run.
- **The last refresh** is the last scheduled, push or full manual run, green or red. It leaves a
  `docs-media-state` artifact with its commit and the shots it didn't finish, so a shot that
  fails, comes back unstable or isn't reached is picked again next time.
- **The branch** `docs/media-refresh/main` is rebuilt from `main` each time, keeping what its open
  pull request had for shots this run couldn't record again. If anyone else commits there, the
  refresh stops replacing it and the run goes red until the pull request is merged or closed and
  the branch deleted.

The comparison can't see every change. It misses solid changes smaller than about 12 pixels
square, short labels reworded in pictures 1280 or 1600 pixels wide (a four-letter word at 12–13
pixels went unnoticed every time, and a 12-character label about half the time at 1600), and color
changes averaging under 6 of 255 over 64 × 64 pixels. The monthly full run uses the same comparison, so
it doesn't catch these either: re-record such a shot by hand when you make that kind of change.

## Generated reference data

`pnpm --dir apps/desktop docs:reference` writes `src/data/generated/`: every shortcut the app's
Shortcuts dialog lists (`shortcuts.json`, Expert and Basic), every action with its label and
default keys (`actions.json`), the hold terms (`terms.json`), the application menu as macOS and
as Windows/Linux build it (`menus.json`, from `electron/main/application-menu.ts`), and every
setting in the Settings window by section (`settings.json`, from `ALL_SETTINGS_SECTIONS` in
`src/settings/sections.ts`). Never edit these by hand. `--check` fails if they're out of date.

Settings descriptions stay hand-written: `check:guide` fails on a setting that no guide page
names with `<Ui k>`. A new setting gets its label key in its section's `searchKeys` (which also
makes it searchable) and a row in `guides/reference/settings.mdx`.

## Checks

```sh
pnpm --dir apps/website check:guide                     # one second: labels, shortcuts, media, links, settings, banned words
pnpm --dir apps/website check:media                     # each WebP under 150 KB, each MP4 under 1.5 MB
pnpm --dir apps/website docs:impact                     # the pages your change may affect
pnpm --dir apps/website run build                       # builds every page; fails on bad <Ui>, <Kbd>, <Media>
pnpm --dir apps/desktop docs:reference --check          # generated data is current
pnpm format:check && pnpm spellcheck                    # from the repo root
```

Read the page in the browser too (`pnpm site dev`), in light and dark: the build can't tell
you that a picture shows the wrong thing.
