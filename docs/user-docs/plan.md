<!-- cspell:words llms Diátaxis diataxis -->

# User docs plan: 0.2 and after

Status: approved 2026-11-05 and built in fork #735 (2026-11-06). Tracking issue: fork #691.
This file records the plan as it was approved. Some details changed while building it: the
guide uses the Part 1 demo show rather than a new one, and one `<Media>` component replaced
`<Shot>`, `<Clip>` and `<RefBox>`. Where this plan and the following differ, the following
win: [the style guide](../conventions/user-docs.md), `apps/website/AGENTS.md` and the
`user-docs` skill.

The guides on openmarch.com (`apps/website/src/content/docs`, 23 pages) describe the
v0.1.7 page-based app. Most were last changed in mid-2025. 0.2 changes how drill is
written: the timeline, shapes, tempo mode, the 3D View, props, MusicXML import, Basic and
Expert, the web editor and tablets. Discord testers arrive with the first 0.2 beta and
need to know what they're testing and how it works.

This plan covers the first two pages (a tester guide and What's new in 0.2), and the
system that keeps the docs correct after that: how they're organized, how they're
written, how screenshots and reference pages are generated from the app, and how agents
help write and check them.

## Decisions

Taken by the owner on 2026-11-05 unless noted.

- **Where 0.2 docs are written.** In the fork's `apps/website`, as the real 0.2 pages. Fork
  `main` deploys them to an unlisted preview site with `noindex`. They go upstream with
  convergence. Nothing is written twice.
- **Tester feedback.** Testers report in a Discord tester channel. The owner or an agent
  turns reports into fork issues.
- **Tester build.** A `v0.2.0-beta.N` pre-release built by upstream's signed release
  workflow from `prerelease/0.2` (setup: fork #694, upstream #1069).
- **Media.** Screenshots and clips are committed to the repo, in light and dark versions,
  with a size budget checked in CI.
- **Docs check.** When a PR changes what users see and doesn't touch the docs, CI posts an
  advisory comment. It never blocks. A `no-docs-needed` label silences it.
- **Example show.** A new show built by a script in the repo. Docs use only shows that
  OpenMarch owns: `part1-demo.dots` is ours, `lhb-daft-punk-pt2.dots` is not (its removal
  is #696).
- **Versions.** No version switcher. When 0.2 ships, the 0.1.7 guides move to an unlisted
  archive (lean from #691).
- **Who writes.** The owner's voice, with a human edit pass on every page. Agents capture
  media and draft at most (#677).

## What strong manuals do

These lessons come from reading the manuals themselves. Photoshop's help pages couldn't be
fetched, so its notes come from search results and URL structure.

- **Dorico** ([manual](https://www.steinberg.help/r/dorico-pro/5.1/en/)) puts concepts
  (projects, flows, players, layouts) first. After that, its chapters follow the app's
  modes, so the manual has the same shape as the screen. Concept and task pages are kept
  apart. Every task page has the same parts: a one-line purpose, **Prerequisite**,
  **Procedure** (numbered, one action per step), **Result**, and related links, each with a
  one-line description. UI labels are bold. It has almost no screenshots, only small
  inline icons next to the label they belong to.
- **MuseScore 4** ([handbook](https://handbook.musescore.org/)) ships every screenshot in
  a light and a dark version. It writes keys as `<kbd>`, with the Mac version in
  parentheses. When a page has a special case (tablature, percussion), it says so in one
  callout at the top instead of inside the steps. It publishes an `llms.txt` that links to
  a Markdown copy of each page.
- **Blender** opens each tool page with a fixed reference box: Mode, Menu, Shortcut. Each
  editor page is split by screen region (main view, header, each menu), with one figure
  per region.
- **Figma** ([help](https://help.figma.com/)) phrases sections as tasks ("How to add
  auto layout"), uses short silent loops instead of narrated video, and ends pages with a
  shortcut table that has Mac and Windows columns.
- **Logic Pro and Ableton Live** put What's new first. Then they have a Concepts chapter,
  then one chapter per view (Arrangement, Session, Piano Roll).
- **Adobe** keeps a "Known and fixed issues" page per release and separate key-concept
  pages for terms.
- **Diátaxis** ([diataxis.fr](https://diataxis.fr/)): each page is one of four types:
  tutorial, how-to, explanation or reference. A how-to's title says exactly what it shows.
  A how-to doesn't stop to teach; it links to the concept page instead.
- **Google and Microsoft style guides:** bold the exact on-screen label, with no trailing
  ellipsis and no "button". Write menu paths as **File > Import**. Use the verbs select,
  enter, drag and press. Never write "click on", "toggle" (as a verb), or directions like
  "the button on the left".

### What reads as generated

#677 records the owner's rule: people notice docs that look generated and stop trusting
them. These are banned:

- Openers ("In this guide you'll learn", "OpenMarch makes it easy to") and summary sections
  on short tasks.
- The words simply, just, easy, seamless, powerful, intuitive, effortless, robust,
  leverage and unlock.
- Emoji. Bold on things that aren't UI labels. Bolding the first words of every bullet.
- A callout for an ordinary sentence. More than one callout per screen.
- A step with no action ("Now you're ready to…"), or one step that does three things.
- Decorative full-window screenshots, and images without alt text.
- A "Why this matters" section on a how-to page.
- Feature tours that list everything the app does but don't finish any task.
- Made-up precision ("in just three clicks") that breaks as soon as the UI changes.

## Information architecture

The site keeps `/guides` as the root, because Help › Docs and the What's new walkthrough
link to `https://openmarch.com/guides`.

1. **What's new in 0.2.** First in the sidebar. One section per feature, each linked to the
   page that covers it. It reuses the What's new walkthrough's text and clips
   (`apps/desktop/src/components/welcome/whatsNewSlides.ts`).
2. **Testing 0.2.** The tester guide: how to install the beta, what to test, known
   issues, how to report in Discord, and what conversion does to a 0.1.7 show. Removed
   from the sidebar at release.
3. **Get started.**
   - Install: desktop, web editor, tablet.
   - Write your first show: the one tutorial, built on the example show.
   - Basic and Expert.
   - Coming from 0.1.7: the conversion dialog, the `.pre-conversion.dots` copy that older
     versions can still open, and what conversion loses (per-page rotation, notes,
     appearance overrides). The web editor converts a copy in the browser and never
     changes the file on disk.
4. **Concepts.** The show (field, marchers, sections). Counts, pages and moves on the
   timeline. Defined, Held and Not defined. Keyframes. Shapes. Music and tempo. Editor and
   Preview. The 3D View.
5. **Tasks,** grouped the way the app is: Marchers, Timeline, Shapes, Music and tempo, 3D
   View, Props, Files and export. Titles name the goal: "Split a move at the playhead",
   "Import a MusicXML score", "Place marchers on an arc".
6. **Reference.**
   - Shortcuts and Menus: generated.
   - Settings: a generated outline with written descriptions.
   - One page per panel and tool, each opening with a reference box.
   - Glossary.
7. **Troubleshooting,** plus a **Known issues** page for each release.

On The Move and Developers stay as they are.

The docs cover only features marked Ship in `docs/convergence/inventory.md` that are
switched on in `SHIPPED_FEATURES`. Hidden, parked and cut features never appear.

## Style guide

A new `docs/conventions/user-docs.md`, linked from `AGENTS.md`, holds the rules. In short:

- **Page types.** Frontmatter has `type: tutorial | how-to | concept | reference`. It also
  has `covers` (the source paths, action ids and i18n key prefixes the page describes) and
  `verifiedWith` (the app version the page was last checked against). Each type has a
  template.
- **How-to layout.** A one-line purpose, then **Before you start** (only when there's a
  real prerequisite), numbered steps with one action each, **Result**, then **Related**,
  with one line per link.
- **Voice.** Second person, present tense, plain words, no marketing. The banned list
  above applies.
- **Words.** UI names exactly as the app shows them, glossary terms, box sizes written as
  "8 × 4", and shortcuts in the same one-key-cap style the app uses on each OS.
  Vocabulary comes from `CONTEXT.md`, `docs/timeline/spec.md` and `timeline.terms.*` in
  `apps/desktop/i18n/en.json`. The older Set and Following words in the defined-coordinates
  GLOSSARY.md are stale.
- **Media.**
  - Crop to the part of the screen the step is about. Capture at one window size
    (1600 × 1000), in light and dark.
  - Alt text says what the image shows.
  - Clips are 3 to 8 seconds long, silent, and loop.
  - Full-window shots only on overview pages.
  - No arrows drawn into the image; use a caption.

## Website components

These live in `apps/website/src/components/docs/`. Each one fails the build when its
input no longer exists, so a renamed label or removed shortcut can't go unnoticed.

| Component                        | What it does                                                                |
| -------------------------------- | --------------------------------------------------------------------------- |
| `<Ui k="…">`                     | The exact label for an i18n key, read from `en.json`                        |
| `<Kbd action="…">`               | An action's shortcut on each OS, styled like the app's `Shortcut` cap       |
| `<Shot id="…">`, `<Clip id="…">` | Light and dark media from the shot manifest                                 |
| `<RefBox>`                       | The reference box at the top of a panel or tool page: where, shortcut, mode |
| `<Since v="…">`                  | Marks things added after 0.2                                                |

## Generated reference

A script, `apps/desktop/scripts/docs-reference/`, reads the app's registries and writes
JSON to `apps/website/src/data/generated/`:

| Output          | Source                                                                                |
| --------------- | ------------------------------------------------------------------------------------- |
| `actions.json`  | `ACTIONS` in `src/shortcuts/definitions.ts`, formatted with `src/shortcuts/labels.ts` |
| `menus.json`    | `electron/main/application-menu.ts` and `src/global/menuActions.ts`                   |
| `settings.json` | `ALL_SETTINGS_SECTIONS` in `src/settings/sections.ts`                                 |
| `terms.json`    | `timeline.terms.*` and the other glossary keys in `en.json`                           |

The registries store i18n keys, so every label resolves through `en.json`. The notes in
`i18n-meta/context.json` are a starting point for written descriptions. CI reruns the
script and fails if the committed output is out of date.

## Generated media

**Recorder.** `apps/desktop/scripts/whats-new-media/` already records clips from the
built app:

- Playwright drives Electron with a virtual clock.
- Frames are stepped at 60 fps.
- Output is MP4 with WebP posters, plus a contact sheet.

It grows into a shared recorder at `scripts/docs-media/`, with the What's new clips as
one of its manifests.

**Shot manifest.** Each shot is one entry:

- An id.
- The show it opens.
- Setup steps, reusing the helpers in `e2e/browser/app.mts` and `timeline.mts`.
- A crop, set by a locator or by screen points from `window.fieldTest`.
- Whether it's a still or a clip, and which themes to capture.

**Output.**

- Stills: WebP, at most 1600 px wide, about 150 KB each.
- Clips: H.264, 1280 px, at most 8 seconds, about 1.5 MB each, with a poster.
- Both themes for each, saved to `apps/website/src/assets/docs/`.
- CI enforces the size budget.

**Same machine every time.** Every capture runs in one Docker and Xvfb Linux image with
pinned fonts. It's the om-capture image, moved into the repo. Then a diff means the UI
changed, not the machine.

**Stale shots.** A scheduled workflow (weekly, and on release branches) recaptures every
shot and compares it with the committed one, using `e2e/browser/render/compare.mts`. When
something changed, it opens a PR with the new media and a contact sheet. When a shot's
setup fails because the UI moved, it opens an issue naming the pages that use the shot.

**Example show.** A script builds `docs-demo.dots`. It has:

- About 40 marchers in real sections.
- Music, with audio that OpenMarch may publish.
- Several moves, including nested and cross-page ones.
- A box, a line and an arc.
- A prop.

Every guide and every capture uses it. It's built from code, so it changes along with the
file format. The generator can also replace the large third-party show the render
benchmarks use today (#696).

## Agents

- **A `user-docs` skill in `.claude/skills/`.** It has two jobs:
  - Write and update pages: read the style guide, inventory and glossary; draft from the
    templates; add shots to the manifest; capture them; build the site.
  - Check a change's impact: given a diff, list the pages whose `covers` match and the
    `<Ui>` and `<Kbd>` uses that changed, then propose the edits or flag the gap.

  Drafts always go to the owner for an edit pass. Agents don't publish pages nobody has
  reviewed.

- **One line in `AGENTS.md`.** If your change is user-visible, run the user-docs skill or
  say why the docs don't need to change.
- **Readable by agents.** Add `starlight-llms-txt`: `llms.txt`, `llms-full.txt` and one set
  per chapter, with concepts and the glossary promoted and release notes demoted.
  `AGENTS.md` points agents to the guides, so they learn how a feature is meant to behave
  from the same pages people read.

## CI

On fork PRs:

- **Docs-impact comment** (advisory, no LLM). It runs when a PR changes
  `apps/desktop/src/**` or `en.json`, changes no docs, and has no `no-docs-needed` label.
  The comment names the pages whose `covers` match.
- **When the website changes:**
  - The site build, which catches bad `<Ui>`, `<Kbd>` and shot ids.
  - Link checks with `starlight-links-validator`.
  - Vale, with the banned list and an emoji rule.
  - The existing cspell check.
  - Generated-reference freshness.
  - The media budget.

## Hosting and upstream

Fork `main` deploys `apps/website` to the preview site through Cloudflare Workers Builds,
the same way as the web editor, with a `noindex` header and a blocking `robots.txt`. The
pages go upstream with the convergence PR, or in a docs PR straight after it. The preview
site is shut down after release.

At release, the 0.1.7 guides move to `/guides/0.1/`. They stay unlisted, get a banner and
`noindex`, and old URLs redirect to their 0.2 equivalents.

## Order

1. Style guide and templates.
2. Preview deploy.
3. What's new in 0.2: the text and clips already exist.
4. Testing 0.2: needs the first beta tag.
5. Example show, then the media recorder and the website components.
6. Generated reference.
7. Chapter rewrites, one at a time, each with an owner edit pass.
8. Skill, CI checks, `llms.txt` and the media refresh job.
9. Archive the 0.1.7 guides at release.

## Open questions

- The preview site's address (for example `docs-preview.openmarch.com`), and who sets up
  the Cloudflare project.
- The example show's music: whose audio, and under what license.
- What testers should focus on first.
- How testers get the web editor on the beta. `web-editor.yaml` skips pre-releases, so
  `editor.openmarch.com` stays on 0.1.7 until 0.2 is final.
- Should the conversion dialog name what's lost (per-page rotation, notes, appearance
  overrides)? Today only the docs would say so.
- Who besides the owner does the edit pass.
