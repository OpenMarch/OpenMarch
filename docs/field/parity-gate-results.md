# Parity gate results (#208)

The automated half of the [parity gate](implementation-plan.md#parity-gate),
run on the fork branch `field/208-parity-gate` (`field-renderer` at 92ce5c033
plus #208's tooling and test fixes), and what the owner still has to do: the
[hands-on checklist](parity-checklist.md) and the
[benchmark on real hardware](#benchmark-on-real-hardware).

Every number here comes from the agent machine: a 6-core AMD desktop CPU
(12 threads) with no GPU. **Headless Chromium draws WebGL in software
(SwiftShader), and Electron in its container uses software GL too**, so
frame rates here are lower bounds and say nothing about how the two fields
compare on real hardware.

## Summary

| Gate item                                           | Result                                                                                                                                                                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Scenario suite, browser, new field               | Quiet: 412 passed, 2 failed (playback, #250), 27 skipped. Under load: 414 passed, 0 failed                                                                                                                    |
| 1. Scenario suite, browser, Fabric                  | Quiet: 384 passed, 0 failed, 57 skipped. Under load: 383 passed, 1 failed (playback, #250)                                                                                                                    |
| 1. Scenario suite, Electron, new field              | 272 passed, 0 failed, 22 skipped (×2, one window per display)                                                                                                                                                 |
| 1. Scenario suite, Electron, Fabric                 | 250 passed (42 of them expected failures), 0 failed, 44 skipped (×2, one window per display)                                                                                                                  |
| 2. Render comparisons (3 shows × 3 zooms × 4 times) | Every difference explained. One unlisted difference found (drill numbers over neighboring dots), fixed in #245 by owner decision. Prerelease `field-render-208`.                                              |
| 3. Export diffs: drill charts and PDFs              | Same content; what's left once aligned is #206's approved list. Prerelease `export-diff-208`.                                                                                                                 |
| 3. Export diffs: video                              | Same content: frames match #207's reviewed run (PSNR within 0.04 dB; the change is the labels now under the dots). Export takes 2.8–3.7× Fabric's time on software GL.                                        |
| 4. Owner's hands-on checklist                       | To do: [parity-checklist.md](parity-checklist.md), in the lab build                                                                                                                                           |
| 5. Benchmark, software GL here                      | Runs on both fields. With no GPU the new field is fill-bound (main thread under 1.2 ms a frame); Fabric wins play and scrub on 385+ marchers here, as in the prototype. Not the gate: [details](#5-benchmark) |
| 5. Benchmark, real hardware                         | To do: [steps](#benchmark-on-real-hardware)                                                                                                                                                                   |
| Issues filed or updated                             | #236 (findings), #246 (opening view under heavy load), #247 (benchmark drag), #250 (playback scenario races the audio clock)                                                                                  |

## 1. The scenario suite

147 scenarios in 32 files (`e2e/browser/tests/`), on both fields, in the
browser three times each (`--repeat-each=3`) and in Electron twice. On
Fabric, 22 scenarios are expected to fail (`test.fail`): the 19 `change:`
scenarios (the rules table's decided changes) and 3 Fabric bugs the new field
fixes; they count as passed. Skips are opt-in captures and scenarios for one
field or target. All counts are on `field-renderer` 92ce5c033 with #208's
fixes.

```sh
# apps/desktop, after pnpm run build:browser (browser) or pnpm run build (Electron)
FIELD=three  pnpm exec playwright test --project=browser --workers=4 --repeat-each=3
FIELD=fabric pnpm exec playwright test --project=browser --workers=4 --repeat-each=3
FIELD=three  ~/om-capture/e2e --repo <worktree> --no-build --project=electron-scenarios --workers=1 --repeat-each=2
FIELD=fabric ~/om-capture/e2e --repo <worktree> --no-build --project=electron-scenarios --workers=1 --repeat-each=2
```

| Target, field       | Quiet machine                                     | Under load                                        |
| ------------------- | ------------------------------------------------- | ------------------------------------------------- |
| Browser, new field  | 412 passed, 2 failed (playback, #250), 27 skipped | 414 passed, 0 failed, 27 skipped                  |
| Browser, Fabric     | 384 passed, 0 failed, 57 skipped                  | 383 passed, 1 failed (playback, #250), 57 skipped |
| Electron, new field | 272 passed, 0 failed, 22 skipped                  | see #236 below                                    |
| Electron, Fabric    | 250 passed, 0 failed, 44 skipped                  | see #236 below                                    |

"Under load" is both browser passes at once (8 workers on 12 threads).
Under the heavier load of earlier runs (load average around 80, while other
workers built and tested), the failures were app-start timeouts, not
scenario results.
Electron counts are with one worker per om-capture container, so each
Electron window has its own X display. Electron under load means several
workers on one display: an earlier run with 3 workers ×2 (146 scenarios
then, 292 runs, before #245 added one and before the settle fix) failed 10
on the new field, all the #236 kind below. The browser counts were run just
before the settle wait got its 20 s limit for big shows; nothing in the
suite needed it.

### Fixed test races

Each was a test reading the app before it had caught up; none needed a
retry or a longer timeout.

| Scenario(s)                                                                                         | Cause                                                                                                                                                                                                                                     | Fix                                                                                                                     |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Kept-mark tooltip scenarios, "a kept marcher's mark shows its tooltip" (Fabric, under load)         | K was pressed once the field showed the selection; K acts on the app's selection and the stored moves, which can settle a render later. K did nothing and the 91 kept marchers never appeared.                                            | `pressKeep` (`timeline.mts`) waits for the timeline's chain marked "(K)", which shows exactly when K will act.          |
| "Escape in isolation with the line tool on only cancels the tool" (new field, under load)           | The same race for L: the line tool started with nothing selected.                                                                                                                                                                         | The timeline scenarios' `selectAll` waits until the inspector shows the selection too.                                  |
| "A WebGL context that doesn't come back is replaced" (new field, Electron and browser, once each)   | It read `contextLost` once, right after the new canvas mounted, before the store caught up.                                                                                                                                               | Polls it.                                                                                                               |
| "Alt scales at a quarter of the pointer's speed" (new field, Electron, 3 in 5), first-action misses | Scenarios read the zoom or a marcher's place on screen before the field's opening view settled (it centers again once the panels settle, 250 ms after ready, later in Electron: one run read zoom 0.760, then the view settled at 0.722). | The show fixture waits until the view and the field's element hold still (`waitForSettledField`) before every scenario. |

### Known flakes, explained, not fixed

| Flake                                                                        | Where                                                                    | Cause                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #236: a click, drag, lasso or hover on the new field that never takes effect | Electron, new field, only with several Electron windows on one X display | Not CPU load: one worker under a heavy CPU load passed 50/50; four workers on a quiet machine failed 5 in 126. The traces show the whole gesture sent and ignored. Each test opens its own window on the shared display, and a new window takes activation; the new field cancels a press when it loses pointer capture, and Fabric uses no capture. Likely cause, not proven. Real users can lose capture too (Alt+Tab mid-drag): unit-tested (nothing left behind), and the owner decided the drag is cancelled (2026-10-15; checklist item 70). Details on #236. |
| Opening view a panel-row off the fit (navigation scenarios)                  | Browser, new field, only under heavy CPU load (10 busy loops)            | The view re-centers on resizes only within 250 ms of opening; under heavy load the panels settle later. Same 250 ms rule as Fabric. #246.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| "Playback draws the marchers where the show puts them"                       | Browser, both fields, with parallel workers (1–3 in 12)                  | The clock and the field each read the stepping audio clock (`getLivePlaybackPosition`) at a different moment. Headless Chromium's fake audio output steps every 43 ms; failures are about 87 ms (2.1–2.2 units) apart, over the 2-unit tolerance. Equal on both fields, so not a parity difference. A race-free version needs a test API reading of the time each field drew: #250.                                                                                                                                                                                 |
| Fabric "undo and redo a move", edit-positions undo steps                     | (earlier reports)                                                        | Fixed by #223 (presses were dropped); not seen in these runs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| #196's "quick 19 px flick" in Electron, weak-machines Electron context loss  | (earlier reports)                                                        | Not reproduced: no failures in the 566 Electron runs above. No separate root cause found; the opening-view and context-state fixes are the likeliest, but that's unproven.                                                                                                                                                                                                                                                                                                                                                                                          |

## 2. Render comparisons

`e2e/browser/render/corpus-render.spec.mts` (project `render`): the Part 1
demo (95 marchers), Daft Punk pt. 2 (385) and the stress show (1,925, built
by `render/stressShow.mts`, the prototype's script), at three zooms (`fit`,
the opening view; `near`, 2.5×; `close`, 6×, pinched in at the marchers'
center) and four times (the first page, page 4, four beats into the next
move, and two beats past page 8): 36 cases. The new field picks the view and
Fabric is pointed at the same one, so the pairs line up in field units. They
run in the browser only: Electron draws with the same renderer code, and the
Electron scenarios check what it draws through the test API. Side
by sides, diffs and `summary.tsv` are in the fork prerelease
[`field-render-208`](https://github.com/AlexDumo/OpenMarch-timeline/releases/tag/field-render-208).

```sh
FIELD=three pnpm exec playwright test --project=render corpus-render
FIELD=fabric pnpm exec playwright test --project=render corpus-render
```

Changed pixels (no match within one pixel; most of it is the half-line shift
of every grid line):

| Show      | fit        | near       | close     |
| --------- | ---------- | ---------- | --------- |
| Part 1    | 36.2–36.3% | 11.6–11.7% | 8.5–9.4%  |
| Daft Punk | 9.1–9.3%   | 6.6–9.4%   | 3.3–8.0%  |
| Stress    | 14.8–18.7% | 18.5–24.2% | 7.6–25.8% |

Part 1's demo copy uses a dark theme with a white line every step, so at fit
nearly every pixel is next to a grid line that moved. Marchers stand in the
same places at every time in every case, mid-move included. The stress cases
were captured again after #245 (drill numbers under the dots).

Every difference, and where it's decided:

| Difference                                                                   | Where it's decided                                                                                     |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Grid, dots and labels half a grid line up and left of Fabric's               | Rules table, Dot position (#199, #200)                                                                 |
| Lines pixel-snapped where Fabric smooths them over two pixels                | #200                                                                                                   |
| Yard numbers centered on their yard line, not 22 units left of it            | Export improvements (#206), #200                                                                       |
| Marcher labels in SDF glyphs (Courier New bold): about a pixel different     | #192, #199                                                                                             |
| Labels fade out below a readable size (on Fabric they shrink to a smear)     | Rules table, Labels                                                                                    |
| Dots at least 1.5 CSS px in radius at very low zooms                         | #192                                                                                                   |
| Drill numbers drew over neighboring dots (Fabric and the export: under them) | Found here; owner decision 2026-10-15: match Fabric. Fixed in #245; `label-stacking.spec.mts` pins it. |

The timeline drawing (pathways, isolation, kept marks, collisions) and every
theme, variant and field image were compared in #201 and #200 (prereleases
`field-render-201`, `field-render-200`; marcher shapes in `render-diff-199`),
and their drawing hasn't changed since. Collision detection is back since
#226 (#242); its markers are drawn where the marchers meet, where Fabric drew
them at the field's corner (checklist item 34).

## 3. Export diffs

Fork prerelease
[`export-diff-208`](https://github.com/AlexDumo/OpenMarch-timeline/releases/tag/export-diff-208)
(README inside).

**Drill charts and PDFs.** `render/export-compare.spec.mts` exports drill
charts through the export dialog (full and individual); the browser harness
writes each chart's SVG pages, the PDF's input. Before: `field-renderer` at
04ce48876 (Fabric draws the charts, just before #206) with the current
harness copied in. After: this branch before #245 (drill charts are drawn
from show data and don't use the field's layers, so #245 doesn't change
them). `render/export-diff.mts` pairs them as drawn, aligned for Fabric's
half-pixel offset, and as PDF pages (pdfkit and svg-to-pdfkit as the PDF
export draws them, read back with pdf.js).

```sh
EXPORT_COMPARE=/tmp/ec EXPORT_COMPARE_LABEL=after pnpm exec playwright test --project=render export-compare
# the same with EXPORT_COMPARE_LABEL=before in a base worktree, then:
node e2e/browser/render/export-diff.mts /tmp/ec before after 3
```

| Show                                   | as drawn  | aligned    | PDF      |
| -------------------------------------- | --------- | ---------- | -------- |
| Part 1, 23 full + 69 individual charts | 21.9%     | 0.54–0.58% | 22.3%    |
| Part 1 with a field image              | 22.0%     | 0.68–0.78% | 21.6%    |
| Daft Punk, 18 full charts              | 9.9–10.5% | 1.12–1.39% | 8.2–8.9% |

Same content. Aligned, what's left is #206's approved list (centered drill
numbers and yard numbers, side labels, the closed border); Daft Punk has four
times as many labels. The demo copies here have a dark theme with a line
every step, which is why the unaligned and PDF shares are higher than #206's
(9–12% and 3.6–6.8% on the default theme). Fabric didn't finish Daft Punk's
385 individual charts in 28 minutes, so individual charts are compared on
Part 1 only.

**Video.** #207's `video-compare` rerun on a quiet machine (before: af5b9b441,
Fabric's video canvas; after: this branch, with #245). Every frame's PSNR
matches #207's reviewed run (`field-video-207`) within 0.04 dB; what moved is
the drill numbers, now under the dots. Same content. 1080p export times
here (software GL): Part 1 45 → 135 s, Part 1 with image 46 → 170 s, Daft
Punk 94 → 260 s, so 2.8–3.7× Fabric's. To time on real hardware (benchmark
step 5).

## 4. The owner's hands-on checklist

[parity-checklist.md](parity-checklist.md): 116 one-line items, by area,
in the lab build (since #209 the new field, no query string; Fabric is the pinned `field-renderer-pre-209` build). It covers every user
story in #189, every decided change (marked **(change)**), every "for #208"
item from the phase notes, and the owner decisions. All settled on
2026-10-15: drill numbers under the dots (#245), the app-wide
`ignore-gpu-blocklist`, filled-square handles, and a drag cancelled when the
window loses the pointer (Alt+Tab mid-drag).

## 5. Benchmark

### On this machine (software GL)

`e2e/browser/render/benchmark.spec.mts` runs the in-app benchmark
(`window.fieldBenchmark.run()`) on the corpus, on a production browser build
in headless Chromium, 1600 × 1000 window (field 1206 × 699 CSS px at 1×), on
a quiet machine. **WebGL here is SwiftShader (software)**, so the new field
runs in low-quality mode, and Fabric's Canvas2D is software too.

```sh
BENCHMARK_OUT=/tmp/bench FIELD=fabric pnpm exec playwright test --project=render benchmark
BENCHMARK_OUT=/tmp/bench FIELD=three pnpm exec playwright test --project=render benchmark
```

fps, Fabric / new field (p95 frame interval in ms in brackets):

| Show            | play                   | scrub                 | zoom                  | pan                   |
| --------------- | ---------------------- | --------------------- | --------------------- | --------------------- |
| Part 1 (95)     | 60.0 / 58.2 (17 / 20)  | 59.7 / 50.0 (17 / 25) | 54.1 / 59.8 (25 / 18) | 4.3 / 59.8 (238 / 18) |
| Daft Punk (385) | 60.0 / 28.0 (17 / 38)  | 60.1 / 26.8 (18 / 40) | 27.9 / 37.8 (54 / 35) | 4.1 / 30.8 (248 / 35) |
| Stress (1,925)  | 19.1 / 5.6 (127 / 332) | 15.9 / 5.7 (69 / 204) | 5.5 / 7.5 (325 / 165) | 3.3 / 5.5 (318 / 213) |

The new field's main thread spends 0.2–2.0 ms a frame.

Compare the fields by fps and frame intervals only: the benchmark's CPU
columns measure different spans (the new field's frame hooks, uploads and
render; Fabric's `renderAll`). Drag isn't measured yet (#247).

What it shows: with no GPU, the new field is limited by single-threaded
SwiftShader filling pixels (its main thread spends about a millisecond a
frame), while Fabric plays and scrubs from cached sprites and so wins on
mid-size shows, as the prototype found (385 marchers on SwiftShader: Fabric
60, prototype 29). Fabric's pan is about 4 fps here because every pan frame
redraws its grid (its real trackpad pan measures the same). The prototype
measured the opposite with a working GPU (WebGL 60 fps at 1,925 marchers,
Fabric about 1), so the real-hardware rows decide the gate.

How each field is measured: the frames each field draws (R3F's render on the
new field; Fabric's `before:render` to `after:render`) during the same
scenarios. Play and scrub drive the app's playhead; zoom is a pinch
(Ctrl+wheel) through each field's own input, so Fabric draws its grid from
the cache it keeps while zooming; pan moves each field's view as its
trackpad pan does.

### Benchmark on real hardware

Gate item 5: the in-app benchmark on a real low-end Chromebook (the lab web
build) and an integrated-GPU laptop (the desktop app), on both fields, with
no regression on the new field. The benchmark plays the show from the top,
scrubs back and forth across it, pinch-zooms in to 8× and out, and pans in a
circle, 4 s each, then shows a table. Since #209 the field-renderer build has
only the new field; Fabric runs use the pinned pre-switch build (fork branch
`field-renderer-pre-209`, at 6ee1ee99c), where the benchmark runs on both
fields (#245).

#### Shows

Download the three show files from the fork prerelease `field-render-208`
and open each with the app's Open file, so both builds open the same files:

- `part1-demo.dots` (95 marchers) and `lhb-daft-punk-pt2.dots` (385): the
  demo shows, already converted to timelines;
- `stress-1925.dots` (1,925): every Daft Punk marcher cloned four times.

#### Before each run

1. Plug the machine in, close other apps and tabs, and leave it a minute to
   settle.
2. Make the window full size (not fullscreen), and leave the panels as they
   open.
3. Open the show and wait until the timeline has loaded (about 10 s for the
   stress show).
4. Don't touch the mouse or keyboard while it runs.

#### Chromebook: the lab web build

1. Open `chrome://gpu` and note the first lines of "Graphics Feature Status"
   (WebGL: "Hardware accelerated" or not) and the GL renderer. If WebGL is
   software only, say so with the results: the new field runs in low-quality
   mode there.
2. Fabric: open the pinned pre-switch build,
   <https://field-renderer-pre-209-openmarch-fork-preview-build.alexdumo.workers.dev/>
   (no query string: Fabric), open the show, press Ctrl+K, type "field
   benchmark", press Enter, then **Run**.
3. When the table shows, press **Copy as Markdown** and paste it into the
   results table below (or a comment on #208).
4. New field: open <https://lab.openmarch.com/x/field-renderer/> (or the
   same build without the lab's sign-in:
   <https://field-renderer-openmarch-fork-preview-build.alexdumo.workers.dev/>),
   no query string, and repeat steps 2–3 on the same show.
5. Repeat for the three shows. Run each one twice if the numbers look odd.

#### Laptop with integrated graphics

The quickest way needs no setup: the lab build in Chrome or Edge on the
laptop, exactly as on the Chromebook above (steps 1–5: the pinned build for
Fabric, then <https://lab.openmarch.com/x/field-renderer/> for the new field;
Ctrl/Cmd+K, "Run field benchmark", **Run**, **Copy as Markdown**). That measures the
field in the browser, which is the same drawing code as the desktop app.

To measure the desktop app itself (developer setup):

1. For Fabric, `git fetch timeline field-renderer-pre-209 && git switch --detach timeline/field-renderer-pre-209`;
   for the new field, the same with `field-renderer`. Build and run steps
   2–4 once in each checkout.
2. `pnpm install && CSC_IDENTITY_AUTO_DISCOVERY=false pnpm --filter @openmarch/desktop build:electron`
   (an unpacked build with no code signing, as the nightly workflow builds
   without a certificate).
3. Start the app from `apps/desktop/release/<version>/`: `win-unpacked/OpenMarch.exe`
   on Windows, `mac-arm64/OpenMarch.app` on an Apple Silicon Mac,
   `mac/OpenMarch.app` on an Intel Mac, the app in `linux-unpacked/` on Linux.
4. Open the show, Ctrl/Cmd+K, "field benchmark", **Run**, then
   **Copy as Markdown**. The pre-switch checkout opens on Fabric; the
   `field-renderer` checkout has only the new field.
5. Also time a video export of the Daft Punk show (Export › Video, 1080p,
   30 fps) on each field, from pressing Export to "Export completed!" (the
   lab build exports video too). Here (software GL) the new field took
   2.8–3.7× as long as Fabric; the question is whether that holds with a
   real GPU.

#### Results to fill in

fps per scenario (higher is better); "p95" is the 95th-percentile time
between frames in ms (lower is better).

| Machine    | GPU / GL renderer | Show            | Field  | play fps | scrub fps | zoom fps | pan fps | play p95 ms | Video export |
| ---------- | ----------------- | --------------- | ------ | -------- | --------- | -------- | ------- | ----------- | ------------ |
| Chromebook |                   | Part 1 (95)     | Fabric |          |           |          |         |             | –            |
| Chromebook |                   | Part 1 (95)     | new    |          |           |          |         |             | –            |
| Chromebook |                   | Daft Punk (385) | Fabric |          |           |          |         |             | optional     |
| Chromebook |                   | Daft Punk (385) | new    |          |           |          |         |             | optional     |
| Chromebook |                   | Stress (1,925)  | Fabric |          |           |          |         |             | –            |
| Chromebook |                   | Stress (1,925)  | new    |          |           |          |         |             | –            |
| Laptop     |                   | Part 1 (95)     | Fabric |          |           |          |         |             |              |
| Laptop     |                   | Part 1 (95)     | new    |          |           |          |         |             |              |
| Laptop     |                   | Daft Punk (385) | Fabric |          |           |          |         |             |              |
| Laptop     |                   | Daft Punk (385) | new    |          |           |          |         |             |              |
| Laptop     |                   | Stress (1,925)  | Fabric |          |           |          |         |             |              |
| Laptop     |                   | Stress (1,925)  | new    |          |           |          |         |             |              |

The gate passes when no new-field row is slower than its Fabric row, and the
new field holds about 60 fps on play and scrub where the GPU is real.
