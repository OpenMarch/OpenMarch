---
name: docs-audit
description: Audit the whole OpenMarch user guide as a reader would, finding pages that need a picture, more context, a fixed picture or an update to match the app, and check the guide's plain-text copies for agents. Use when asked to audit, review, vibe-check or validate the docs or the guide, or before a release. For a single change's pages, use the user-docs skill instead.
---

# Audit the user guide

The `user-docs` skill keeps the guide right one change at a time. This skill reads the whole guide again, the way a newcomer would, and finds what per-change upkeep misses: steps that need a picture, terms used before they're explained, pictures that no longer match their text, and pages that drifted from the app.

The result is a ranked list of findings, each checked against the source. Nothing in the guide changes until the owner picks which findings to fix.

## 1. Run the objective checks first

These are cheap and settle what a reader can't:

```sh
pnpm turbo run build --filter="@openmarch/website^..."   # once per checkout
pnpm --dir apps/website check:guide                      # labels, shortcuts, media, links, settings
pnpm --dir apps/website check:media                      # file sizes
pnpm --dir apps/desktop docs:reference --check           # generated shortcut and menu data
pnpm --dir apps/website run build
```

Fix or report anything these fail on before the reading pass; a reviewer shouldn't spend effort on what a script already knows.

## 2. Check the copies for agents

The build writes the guide for agents three ways. Check each:

- `dist/llms.txt` is an index: a short description, then every guide page by chapter, linked to its Markdown copy. Every page in `src/content/docs/guides` and `troubleshooting` should be listed.
- Every docs page has a Markdown copy at its address plus `.md` (`dist/guides/timeline/moves.md`, from `src/pages/[...slug].md.ts`), and its HTML links that copy with `<link rel="alternate" type="text/markdown">` (`src/routeData.ts`). Spot-check two pages. Labels, shortcuts and pictures should read as text, and each picture should appear once.
- `dist/llms-full.txt` and `dist/_llms-txt/<chapter>.txt` hold the whole guide and one chapter each.

## 3. Screenshot every page

```sh
node apps/website/scripts/page-shots.mjs --all --theme light --tiles --out <folder outside the repo>
```

It writes each page as 1280 × 1400 tiles, `<page>.light.<n>.jpg`, where `<page>` is the address with `/` as `_` (`guides_timeline_moves.light.1.jpg`). It exits non-zero when a page doesn't load. Open a tile or two to confirm they show this checkout's pages before handing them on.

## 4. Review with Fable, one reviewer per group of chapters

Judging whether a step needs a picture, or what a newcomer is missing, is a judgment call, so the reviewers run on Fable (`model: "fable"`). Split the guide into about four groups of 12 to 15 pages and run one reviewer per group, in parallel:

| Group | Chapters                                                     |
| ----- | ------------------------------------------------------------ |
| A     | guide front page, Start here, The workspace, Troubleshooting |
| B     | Marchers, Timeline                                           |
| C     | Shapes, Music, Field                                         |
| D     | 3D View and props, Files and export, Reference               |

When a chapter is added, put it in the smallest group. Give each reviewer [reviewer-prompt.md](reviewer-prompt.md) with its placeholders filled in. Reviewers write findings files; they never edit the guide.

## 5. Read the whole guide once, as one reader

The chapter reviewers each see a quarter of the guide, so none of them notices an idea explained on five pages, two pages that disagree, or a chapter that wears a reader out. Run one more Fable reader, in parallel with step 4, over the whole of `dist/llms-full.txt` with [holistic-prompt.md](holistic-prompt.md). It reads as a newcomer start to finish, as someone landing on one page, and as an agent fetching one page's Markdown copy, and reports which page should own each repeated idea, where pages disagree, what to slim or merge, and where a picture is wanted.

Its findings are structural: one fix ("this page owns holds; the others keep a sentence and a link") touches several pages. Report them before the per-page findings they overlap, since slimming a page makes some of its per-page findings moot.

## 6. Test whether people and agents find answers

Run one Fable agent on the questions in [find-it-questions.md](find-it-questions.md), real tasks in a band director's words. It starts from `dist/llms.txt`, opens only the pages' Markdown copies, and for each question records the pages it opened, its answer, its confidence and what slowed it down; then it says whether a person would find the page from the sidebar titles or the front page's "Find what you need" list. Add a question whenever a real user asks something the guide answered badly.

On 2026-11-16 it took about 170k tokens and 4 minutes. It went from 24 to 26 of 30 answered with confidence from the first page after one round of fixes, and the misses pointed straight at titles, descriptions and missing control names.

## 7. Verify, then report

A reviewer's findings are claims. Before reporting:

- Check every `high` finding yourself against the source it cites, or against the page and picture. Drop or downgrade the ones that don't hold up.
- Treat a reviewer's note that a tile didn't match the source as a sign the screenshots are stale; take the screenshots again and recheck those pages.
- Merge duplicates across groups, such as one picture used on two pages.

Report to the owner as a short ranked list: the confirmed high findings first, then the patterns that repeat across pages (one fix often covers many), then the count of medium and low findings and where the files are. Ask which ones to fix or file as issues. Don't file issues or change pages without that answer.

## What it costs

Measured on 2026-11-15, on the 54 guide and troubleshooting pages (about 190 tiles):

| Part                                     | Tokens (as Claude Code reports them) | Wall time         |
| ---------------------------------------- | ------------------------------------ | ----------------- |
| Each Fable reviewer (11 to 15 pages)     | 230k to 300k                         | 4 to 6.5 min      |
| All four reviewers                       | about 1.05M                          | 6.5 min, parallel |
| The whole-guide reader (step 5)          | about 250k                           | 6 min, parallel   |
| The find-it test (step 6)                | about 170k                           | 4 min, parallel   |
| The orchestrating session (steps 1–3, 7) | about 150k                           | 20 to 30 min      |

Plan on about 20k reviewer tokens per page, plus the whole-guide reader. At Fable's API list prices that comes to roughly $6 to $15 for the whole guide, depending on how much of the input was cached; on a subscription, it uses Fable allowance instead. One chapter of five to seven pages is about 130k tokens. The findings are the same size either way: about 200 for the whole guide, of which 15 to 20 are high.
