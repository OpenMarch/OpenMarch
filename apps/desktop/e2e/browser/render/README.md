# Field render comparisons

`field-render.spec.mts` draws the field alone (no marchers) for every built-in
field template, a dark theme, the field variants (no hashes, hidden labels,
other half-line intervals), the grid and half line settings, and the field
image (fit, fill, opacity) (#200, ADR 0005). It isn't a pass/fail suite: it
writes images for a person to review.

Each run saves its captures to `RENDER_OUT/<RENDER_LABEL>/` (default label
`after`). Run it on two checkouts (a detached worktree for the base, with this
harness copied in), the second with `RENDER_BASE` naming the first:

```bash
pnpm run build:browser
RENDER_LABEL=before pnpm exec playwright test --project=render --workers=4 field-render
RENDER_LABEL=after RENDER_BASE=before pnpm exec playwright test --project=render --workers=4 field-render
```

With `RENDER_BASE` set, each capture that the base run has too gets:

- `compare/<case>-<size>.png`: before, after and the diff side by side. The
  diff shows "before" faded, and in red ("after" darker) or blue (lighter)
  the pixels with no match within one pixel in the other image, so a line
  antialiased one pixel over isn't counted;
- a line in `compare/summary.tsv`: how many pixels differ.

Sizes are `fit` (1600 × 1000, the field small) and `large` (3600 × 2200,
lines and labels readable). Output goes to `RENDER_OUT`, default
`$TMPDIR/openmarch-field-render` (not `playwright-report`, which each run
clears). Both runs open at the field's own view, so a change to the view
rules shows up as a difference.

`timeline-render.spec.mts` does the same for the timeline's drawing on a
converted demo show (#201): pathways, warnings, isolation and collision
markers, plus a baseline with none of them:

```bash
RENDER_LABEL=before pnpm exec playwright test --project=render timeline-render
RENDER_LABEL=after RENDER_BASE=before pnpm exec playwright test --project=render timeline-render
```

To compare with the old field, use the pinned pre-switch build's harness
(fork branch `field-renderer-pre-209`): its README there runs these specs once
per field and composes the old field against the new one.

`following-look.spec.mts` checks Set vs Following's look (#300, #301): two
tests assert the dashed edge (at the opening zoom and 3×) and the fill for
every shape and style on white, and
the rest capture a contact sheet (every shape and style, Set beside
Following, on white, dark and, with `TURF_IMAGE` naming a field image, turf,
at the opening zoom and 3×, plus an isolated move) to `RENDER_OUT/<label>/`:

```bash
TURF_IMAGE=~/turf.png pnpm exec playwright test --project=render following-look
```

## Video export comparisons

`video-compare.spec.mts` (#207) exports converted demo shows through the
export dialog at 1080p and 30 fps: part 1 with every dot shape, outlines, a
hidden section and hidden labels; part 1 with a fitted field image; and the
385-marcher Daft Punk show. It only runs with `VIDEO_COMPARE=<folder>`, and
saves each video to `<folder>/<VIDEO_COMPARE_LABEL>/` (default `after`). Run
it on two checkouts (a detached worktree for the base, with this harness
copied in), then pair their frames:

```bash
VIDEO_COMPARE=/tmp/vc VIDEO_COMPARE_LABEL=before pnpm exec playwright test --project=render video-compare
VIDEO_COMPARE=/tmp/vc VIDEO_COMPARE_LABEL=after pnpm exec playwright test --project=render video-compare
e2e/browser/render/video-compare.sh /tmp/vc before after
```

The script writes, to `<folder>/frames`, each pair of frames at 2%, 25%, 50%,
75% and 98% of the video, a before | after | difference (×4) image per pair,
and `summary.tsv` with each pair's PSNR. It needs ffmpeg.

## The parity gate's captures (#208)

- `corpus-render.spec.mts`: the Part 1 demo, Daft Punk pt. 2 and the
  1,925-marcher stress show (`stressShow.mts` writes it to `RENDER_OUT` on
  first use), at three zooms (the opening fit, 2.5× and 6×, pinched in at
  the marchers' center) and four playback times. Run it as above, with
  `corpus-render`.
- `export-compare.spec.mts`: exports drill charts (full and individual)
  through the export dialog and saves each chart's SVG pages, which the
  harness writes instead of a PDF. Only with `EXPORT_COMPARE=<folder>`, into
  `<folder>/<EXPORT_COMPARE_LABEL>/` (default `after`). Run it on two
  checkouts, then pair them:

  ```bash
  node e2e/browser/render/export-diff.mts <folder> before after 3
  ```

  It writes, to `<folder>/diff`, each chart before | after | diff as drawn,
  aligned for a half-pixel offset (exports before #206 drew half a pixel
  off), and (full charts) as a PDF page
  drawn the way the PDF export draws it, plus `summary.tsv`.

- `benchmark.spec.mts`: the in-app field benchmark on the same corpus. Only with `BENCHMARK_OUT=<folder>`; writes each
  report as JSON and a line per scenario to `summary.tsv`. Headless WebGL is
  software here, so its numbers are lower bounds.
