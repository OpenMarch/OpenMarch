# OpenMarch Timeline Widget — Design Spec (Simple / Expanded / Collapsed / Inspector)

Design handoff for implementation. Source: Figma file `Desktop-App`, page
**"Timeline — Simple & Expanded"**.

- File: https://www.figma.com/design/nr61VTKnc5O0fziByvDpho/Desktop-App
- Page: `Timeline — Simple & Expanded` (node `122:2208`)
- Status: **design only — not yet implemented in code.**
- Screenshots for each mode are in `images/` (see manifest at the bottom). Direct
  Figma links to every frame are also listed per-section below, in case a screenshot
  needs to be re-exported at higher fidelity or inspected live.

This single doc merges the original Expanded-mode design brief, a later cleanup
pass on Expanded mode, and the current as-built state of Simple/Collapsed/Inspector
mode as of **Sept 16–17, 2026**. Where the mockups are incomplete or inconsistent,
that's called out explicitly in **Known Issues / Open Items** — don't treat every
pixel in the Figma file as final intent.

---

## 1. Data model this UI is visualizing

A companion doc (`timeline-schema-proposal.md`, Rev 2 — not included in this
package) defines the underlying data model. The rules below are load-bearing for
the UI and should not be violated by whatever component structure the coding agent
builds:

- A `Timeline` is a sparse, self-contained override on the normal page grid — most
  pages never have one. It's an ordered sequence of `timeline_keyframes`, each
  anchored to either a `beat_id` or a `page_id`.
- **A timeline's first and last keyframe must anchor to a page.** Internal
  keyframes can anchor to a plain beat. **This is why clip edges must always snap
  to page-line boundaries in the UI — a clip can never start or end mid-measure.**
- **A "hold" is not a special clip type** — it's a transition whose start and end
  coordinates happen to be identical. Hold and movement legs are two _visual
  textures_ of the same clip, not two different data types. (Movement leg = solid
  fill. Hold leg = low-opacity fill + dashed stroke outline.)
- **Two timelines governing the same marcher (or overlapping shape membership) can
  never have overlapping spans** — enforced at the app level. This is why the UI
  uses **one lane per target**, not auto-packed/stacked clips within a lane: any
  visual overlap inside a single lane is therefore always a bug, never a valid
  state, and could be flagged in red if this becomes interactive.
- A "target" = a marcher or a shape that has a `Timeline`. Most marchers/shapes
  don't have one and shouldn't get a lane in Expanded mode (see §2.4 open item on
  what a lane-less target looks like).

---

## 2. Global design tokens (from the Figma file — use these, not defaults)

| Token                                                | Value                                                                                                                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Body / label font                                    | **DM Sans**                                                                                                                                             |
| Numbers, page/measure labels, timecode text          | **DM Mono**                                                                                                                                             |
| Accent purple (playhead, selection, primary actions) | `#967eff` — `rgb(0.588264, 0.495833, 1)`. **Literal color, not a bound Figma variable** — the file has exactly one real Variable and it isn't this one. |
| Panel background                                     | `#0f0e13` — `rgb(0.0588, 0.0549, 0.0745)`                                                                                                               |
| Hairline stroke — outer frame borders                | white @ 6% opacity                                                                                                                                      |
| Hairline stroke — internal dividers                  | white @ 18% opacity                                                                                                                                     |
| Primary text                                         | ~`#cccccc`                                                                                                                                              |
| Subtitle text                                        | ~`#D0D0D0`                                                                                                                                              |
| Lane color — SH (shape target)                       | amber/orange                                                                                                                                            |
| Lane color — M1                                      | teal                                                                                                                                                    |
| Lane color — M7                                      | rose/pink                                                                                                                                               |
| Lane color — target with no Timeline (e.g. M12)      | dimmed gray, label only, no clip                                                                                                                        |
| Label column width (every row)                       | 50px, + 6px gap before content starts (i.e. content always starts at local x=56 within a row)                                                           |

---

## 3. Simple mode

**Unchanged baseline** — pages + audio only, no gridlines beyond page dividers, no
per-target tracks. This is the existing/legacy behavior and was **not modified** by
this redesign; it's included here only as the reference point Expanded/Collapsed/
Inspector build on top of.

- Figma: instance of component `Timeline - OLD → Property 1=Default` (`176:5522`),
  placed unmodified at node `186:2902`.
  Direct link: https://www.figma.com/design/nr61VTKnc5O0fziByvDpho/Desktop-App?node-id=186-2902
- Structure: `Timeline` transport column (rewind / skip-back / play / skip-forward /
  fast-forward, plus zoom-out / zoom-in / fit-to-screen) on the left, then a
  `Pages` row of boxed page-number chips (`0, 1, 2, 3, 4, +`), then an `Audio`
  row (full waveform + numbered beat/measure ticks underneath).
- **Known leftover cruft, not cleaned up on purpose** (see Known Issues): an
  arbitrary "page 4" chip is shown selected (purple outline), and there's an
  unused "0" pickup-measure slot. Don't treat either as intentional design.

---

## 4. Expanded mode

Reveals one lane per target that has a Timeline, with page/measure/beat gridlines
and clip rendering for hold-vs-movement legs. **Two versions of this exist in the
file** — see 4.1 and 4.2. Treat 4.1 ("draft") as the more fully worked-out one
(it's been through a full geometry/polish pass); 4.2 ("packed") is a later
exploration of a _different lane-packing strategy_ for the same mode and is less
finished.

### 4.1 Expanded mode — unpacked lanes ("draft")

One lane per target, always — no row-sharing even when spans don't overlap.

- Figma: `Expanded mode — Timeline (draft)`, node `184:3394` (1481×246, includes
  the playback column). Main working frame is `timeline` (`184:3421`, 1273×246).
  Direct link: https://www.figma.com/design/nr61VTKnc5O0fziByvDpho/Desktop-App?node-id=184-3394
- Built from `Timeline - OLD → Property 1=editaudio` (`176:5581`), instanced then
  detached and heavily rebuilt.

**Vertical stack, top to bottom** (all x/y below are content-local: relative to
`timeline`'s content area, which itself sits inside `timeline`'s padding of
top 34 / right 8 / bottom 8 / left 8):

1. **Grid-line overlay** — absolutely positioned, sits behind every other row, spans
   the full 204px flow height. Page lines = strong/opaque vertical rule at every
   page boundary. Measure lines = subtle/low-opacity vertical rule at every
   in-between measure, **skipped wherever it would coincide with a page line**
   (page line always wins, never double-draw).
2. **`top edge (ruler + beat ticks)`** — a wrapper frame grouping the ruler and the
   top beat-tick row together with a tight 2px internal gap, so they read as one
   visually-attached unit under the top edge:
   - **ruler**: 50px label gutter + 512px content. Page number labels ("1", "2",
     "2A", "3") at y=1; measure labels ("M1"–"M8") at y=15, directly below.
   - **beat ticks (top)**: tiny 1px dash marks, one every 16px (i.e. 4 ticks per
     64px measure = beat-level resolution), full 512px width. Purely for tracking
     the playhead against a beat — never full row height.
3. **Lane rows**, 26px tall each, tight/minimal internal gap. Current mock has 4:
   - `SH` (amber, shape target) — clip spans page "2"→"3": move leg from page
     "2"→"2A", hold leg from "2A"→"3", diamond keyframe marker at the "2A" join.
   - `M1` (teal) — clip spans page "1"→"2": hold leg "1"→(internal join), move leg
     (internal join)→"2", diamond marker at the join.
   - `M7` (rose) — clip spans "2A"→"3", single move leg, no internal join.
   - `M12` — **no clip**, dimmed label only. This is what a target _without_ a
     Timeline looks like in the lane list (i.e. still gets a row, just empty).
   - A small rotated-square "diamond" keyframe marker sits at every leg boundary:
     start, internal joins, and end.
4. **`bottom edge (audio + beat ticks)`** — mirror of the top wrapper, also 2px
   internal gap, grouping:
   - **audio row**: waveform, now **lined up horizontally with the grid** (fixed in
     the Sept 16 cleanup pass — see §7). Same 512px content width, same x=56
     column start as every row above it.
   - **beat ticks (bottom)**: mirrors the top ticks exactly.
5. **Playhead** — absolutely positioned, rendered last (on top of everything).
   Accent-purple vertical line + downward-pointing flag + a small
   position-readout pill, e.g. **"Pg 2A · M6 · ct 2"**. Pill is horizontally
   centered on the line; pill → flag → line sit flush, no gap, no overlap. The
   line runs the full 204px flow height plus pokes up 6px above the top edge
   (210px total line height) — matches the original design intent of the
   playhead "poking up slightly above the ruler."
   Currently positioned at local x=350 (inside measure M6 / page "2A").

**Exact geometry reference** (content-local px):

| Property                                                   | Value                                                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `timeline` padding                                         | top 34 / right 8 / bottom 8 / left 8                                                             |
| Full flow height (ruler top → bottom of beat-ticks-bottom) | 204px                                                                                            |
| `timeline` frame total height                              | 246px                                                                                            |
| Content width (8 measures × 64px)                          | 512px                                                                                            |
| Page boundaries (local x)                                  | `[0, 128, 256, 384, 512]` → labels `["1","2","2A","3"]` (5 boundary points bracket 4 pages)      |
| Measure width                                              | 64px                                                                                             |
| Beat tick spacing                                          | 16px (4 per measure)                                                                             |
| Row label column                                           | 50px, +6px gap (content starts at x=56)                                                          |
| Lane row height                                            | 26px                                                                                             |
| Audio row content width                                    | 512px (same scale/alignment as everything else — see §7 for why this was a fix, not always true) |

### 4.2 Expanded mode — packed lanes variant

A later, less-finished exploration of an alternative lane-packing rule: **non-
overlapping targets share a row instead of each getting its own.** This directly
matches the "Non-overlapping tracks are packed into shared rows" decision (§8) —
Collapsed mode (§5) already uses this packing rule; this frame appears to be
testing whether Expanded mode should adopt it too, rather than the strict
one-lane-per-target rule in §4.1.

- Figma: `Expanded mode — Timeline (packed)`, node `209:2908` (1273×156).
  Direct link: https://www.figma.com/design/nr61VTKnc5O0fziByvDpho/Desktop-App?node-id=209-2908
- Caption in file: _"M1 + M7 share a row since they never overlap — SH gets its
  own row."_
- Structure: ruler band with page numbers ("1","2","2A","3") + measure labels
  (M1–M8, 64px spacing, matches §4.1's scale) → 2 packed lane rows (22px each,
  vs. 26px in the unpacked version) → audio band → playhead. Row 1 holds both
  `M1` (teal) and `M7` (rose) pills side by side since their spans don't overlap
  in time; row 2 holds `SH` (amber) alone.
- **This is NOT a finished parallel spec to §4.1** — it doesn't reproduce the
  beat-tick rows, the top/bottom-edge wrapper grouping, or the exact clip-span
  values from §4.1. Treat it as a proof-of-concept for the packing behavior only;
  pull row-styling/grid detail from §4.1, and the row-packing _algorithm_ from
  here + Collapsed mode.
- **Which one is canonical for Expanded mode is an open question — flag to Alex
  before building** (see Known Issues, §9).

---

## 5. Collapsed mode

Shows **no individual tracks** — just pages, beats, measures, and audio, but with
a compact "packed hairline" indicator of track activity instead of full lanes.

- Figma: `Collapsed mode — Timeline (packed micro)`, node `207:2908` (1273×82).
  Direct link: https://www.figma.com/design/nr61VTKnc5O0fziByvDpho/Desktop-App?node-id=207-2908
- Structure, top to bottom:
  1. **Page band (flags)** — each page boundary marked with a small upward flag/
     caret icon + page number label (not a full vertical rule like Expanded
     mode's page lines). Labels: "1", "2", "2A", "3".
  2. **Tracks band (packed hairlines)** — very thin (3px) colored bars, one row
     per group of non-overlapping targets, packed exactly like §4.2: row 1 = M1 +
     M7 (they don't overlap), row 2 = SH. This is the "packed" reference
     implementation for the row-sharing algorithm.
  3. **Audio band** — squished waveform. **Currently only a partial/placeholder
     render — see §9, don't treat the narrow width as intentional.**
  4. **Playhead** — same purple line + pill pattern as Expanded mode, shorter
     (spans only this mode's shorter total height).
- Same page/measure/beat conceptual hierarchy as Expanded mode, just compressed:
  page = flag + label, no measure gridlines drawn at all in this mode, tracks
  reduced to 3px hairlines instead of full clip pills.

---

## 6. Inspector mode

Hides all tracks but one focused target, zoomed so that target's clip fills
roughly the full timeline width; pages/measures/audio stay visible at a shorter
height than Expanded mode.

- Figma: `Inspector mode — Timeline (SH, zoom fit)`, node `208:2908` (1273×98).
  Direct link: https://www.figma.com/design/nr61VTKnc5O0fziByvDpho/Desktop-App?node-id=208-2908
- Structure, top to bottom:
  1. **Ruler band (pages + measures, zoomed)** — page flags + numbers, with a few
     measure labels interspersed (M3, M5, M7 shown in the current mock — not a
     full M1–M8 run, consistent with a zoomed-in view where mid-measures are
     dropped for space).
  2. **Inspected track** — single pill for the focused target (`SH` in this mock),
     one row, no other targets shown at all.
  3. **Audio band** — same placeholder-width issue as Collapsed mode, see §9.
  4. **Playhead** — same pattern as the other modes.
- **Open discrepancy to flag**: in the current mock, the `SH` pill only fills
  ~27% of the row width (341px of 1255px), not "roughly the whole timeline width"
  as the design decision states. Either the mock is unfinished, or "zoom to fill"
  needs a definition (e.g. fill available width up to some max zoom level) —
  confirm with Alex before treating either the intent-doc wording or this mock's
  literal proportions as the spec.

---

## 7. The Sept 16 cleanup pass on Expanded mode (draft) — what changed and why

This pass (Sept 16, 2026) touched only §4.1 (`184:3421`), in Figma directly via
the Plugin API. Included here so the coding agent understands _why_ certain things
look the way they do, not just what the end state is.

1. Removed the "Audio" text label from the audio row's label column — it's now an
   empty 50px spacer (kept only for column alignment with the SH/M1/M7/M12 labels
   above it).
2. **Audio became structurally part of the timeline, not a bolted-on row below
   it**: the grid-line overlay now extends down through the audio row (previously
   stopped above it), the playhead now runs through the entire stack including
   the audio row (previously stopped above it), and beat-ticks-bottom moved from
   _above_ the audio row to _directly under_ it.
3. **Audio lined up horizontally with the grid** — previously a real, deliberately
   -unaddressed scale mismatch: the grid represented a fixed 8-measure/512px
   window, but the audio waveform spanned the _entire piece_ at a different
   horizontal scale (1287px). Fixed **for this one frame only** by compressing
   the waveform vector to 512px and dropping a stray 25px left-padding, so audio
   now has the same width/alignment as every other row.
   **Important caveat**: this means the waveform now visually represents "the
   whole piece squeezed into 8 measures," not real 1:1 audio scale. It is not a
   real fix for the underlying problem — it's a visual patch for this static mock.
   **The real fix** (making the grid scrollable/zoomable against the full audio
   length, or vice versa) is still not implemented, and is very likely needed
   before this ships as working software rather than a static mockup. See §9.
4. Grouped ruler + beat-ticks-top into one wrapper frame (2px internal gap) so
   they read as attached to the top edge; symmetrically grouped audio +
   beat-ticks-bottom into another wrapper (2px internal gap) — this pairing is
   also what accomplishes point 2 above.
5. **Playhead redone**: previously the position-readout pill was offset 8px off
   the line's center and visually collided with the flag triangle below it. Now
   the pill is horizontally centered on the line, and pill → flag → line sit
   flush with no gap/overlap. `timeline`'s top padding increased 24→34px to make
   room for the recentered/repositioned pill without clipping. The line now runs
   the full new height, through the merged audio+ticks section at the bottom.

---

## 8. Design decisions locked in (cross-mode)

- Simple mode: pages + audio only, unchanged. No gridlines beyond page dividers.
- Expanded mode gridline hierarchy:
  - **Page** = strong vertical line (not a bar/box — an earlier boxed-page-chip
    exploration was explicitly rejected) with the page number at top.
  - **Measure** = subtle vertical line (low opacity), skipped wherever it
    coincides with a page line.
  - **Beat** = tiny 1px dash ticks, top edge and bottom edge only, never full
    height — purely for tracking the playhead against a beat.
- **Clips**: edges always snap to page-line boundaries, never mid-measure. Movement
  leg = solid fill. Hold leg = low-opacity fill + dashed stroke outline. A small
  rotated-square "diamond" keyframe marker sits at every leg boundary (start,
  internal joins, end).
- **Lanes** (Expanded, unpacked version §4.1): one per target that has a Timeline,
  not auto-packed. Rows are short and tight (~26px, minimal gap) — an earlier
  taller/more-spaced draft was explicitly rejected as unnecessary. Lane labels are
  **plain text only** (e.g. "SH", "M1", "M7") — a colored identity dot was tried
  and explicitly removed per instruction; may be worth revisiting later but
  **don't re-add without asking**.
- **Non-overlapping tracks pack into shared rows** rather than each getting its
  own row — this is the rule §4.2 and §5 (Collapsed mode) both implement, and the
  open question is whether Expanded mode should also adopt it (currently §4.1
  does not).
- **A "track" is a single block representing one transition**, not a traditional
  multi-clip editor lane — vertical row order carries no meaning, and a track
  will never hold multiple blocks.
- **Governing-timeline indicator**: small colored bars under a page number,
  colored to match whichever clip's start/end lands on that page (e.g. a page
  where a hold leg ends and a different marcher's move leg begins shows two
  marks). _(Not yet visible in any current mock — noted as a decision, not yet
  built.)_
- **Playhead**: accent-purple line + downward flag + small position-readout pill
  (e.g. "Pg 2A · M6 · ct 2"). In Expanded mode (draft), it now runs the full
  height including the audio row (post-cleanup-pass). Elsewhere, confirm per-mode
  height against the relevant screenshot.
- **Audio is always pinned to the bottom of the stack, in every mode.**
- Expanded, Collapsed, and Inspector are meant to be built as **three separate
  Figma components, not variants of one component** — they differ too much
  structurally. (This only affects how the Figma file itself is organized; it
  doesn't imply anything about code component boundaries.)

---

## 9. Known Issues / Open Items — read before implementing

Flagged, not yet resolved. Don't silently pick an interpretation for any of
these without checking — several are genuine open questions, not just polish:

1. **Expanded mode has two competing lane-packing specs** (§4.1 one-lane-per-
   target vs §4.2/§5 packed-shared-rows). Confirm with Alex which is canonical
   before building Expanded mode's lane logic.
2. **Audio waveform in Collapsed, Inspector, and packed-Expanded mode currently
   renders only a narrow placeholder cluster** (roughly the middle-right third of
   the band, not full width) — this looks like reused/unfinished vector data
   copy-pasted between mocks, not a deliberate "audio looks different here"
   design choice. The unpacked-Expanded audio row (§4.1, post-cleanup-pass) is
   the only one confirmed to be intentionally full-width/aligned. Don't build to
   match the narrow placeholder.
3. **Grid-vs-audio horizontal scale mismatch is still unresolved at the data/
   interaction level.** The Sept 16 cleanup pass (§7) made the _visual_ alignment
   consistent for one static mock by literally compressing the waveform image,
   but that's not a real fix — a working implementation still needs to decide:
   does the grid become scrollable/zoomable against real 1:1 audio length, or
   does displayed audio always compress to whatever page window is showing? This
   is probably its own, separate, non-trivial task.
4. **M1–M8 measure-number labels may read as cluttered** where they sit directly
   under a page number sharing the same beat (e.g. "1" and "M1" stacked in the
   ruler). Flagged to Alex, no response yet. Options if it comes up: drop measure
   numbers entirely, or only show them past a certain zoom level.
5. **Simple mode has leftover unintentional state**: an arbitrary "page 4"
   selection outline and an unused "0" pickup-measure slot, both inherited from
   the source component and not cleaned up (not asked for; may or may not be
   wanted — confirm before removing OR before assuming they're meaningful).
6. **No playhead exists in Simple mode** — every other mode has one. Not
   explicitly asked about; could go either way.
7. **Inspector mode's "zoom to fill" doesn't currently fill much** — the mock's
   SH pill occupies ~27% of the row width, not "roughly the whole width" as the
   written design intent says (§6). Confirm intended zoom behavior before coding
   it literally off the current mock's proportions.
8. **Governing-timeline page indicator (colored bars under page numbers)** is a
   locked-in decision (§8) with no corresponding mock anywhere in the file yet —
   there's nothing to screenshot or measure for it. Will need original design
   work, not just implementation, unless Alex has since sketched it elsewhere.
9. Lane identity dots (colored dot next to the SH/M1/M7 text label) were tried
   and explicitly removed — don't add them back without asking, even though a
   colored dot is a common enough pattern that it might seem like an obvious
   improvement.

---

## 10. Images — Figma MCP reference exports

This package includes four rendered PNGs pulled from Figma MCP on Sept 16, 2026.
They are reference exports rather than an immutable source of truth; pull fresh
screenshots from Figma when the file changes. Use `fileKey` + `nodeId` below:

- `fileKey`: `nr61VTKnc5O0fziByvDpho`

| Image                  | What it shows                                                                                                | `nodeId`   | Bundled reference                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Simple mode            | Baseline — pages + audio, transport controls, leftover "page 4"/"0" cruft                                    | `186:2902` | [PNG](images/timeline-simple.png) — 1533×170                                                                                    |
| Expanded mode (draft)  | Unpacked lanes (SH/M1/M7/M12), full ruler+beat-tick+playhead treatment — the primary Expanded-mode reference | `184:3394` | [PNG](images/timeline-expanded-draft.png) — 1533×298                                                                            |
| Expanded mode (packed) | Packed-row variant (M1+M7 share a row, SH separate) — less finished, see §4.2                                | `209:2908` | [PNG](images/timeline-expanded-packed.png) — 1273×156                                                                           |
| Collapsed mode         | Page flags, packed hairline tracks, squished audio                                                           | `207:2908` | MCP export unavailable; use the [Figma frame](https://www.figma.com/design/nr61VTKnc5O0fziByvDpho/Desktop-App?node-id=207-2908) |
| Inspector mode         | Single zoomed SH track, pages/measures/audio at shorter height                                               | `208:2908` | [PNG](images/timeline-inspector.png) — 1273×98                                                                                  |

The Collapsed mode export was rate-limited for the authenticated Figma View
seat during this pass, so it remains a direct Figma reference for now. If MCP
access is unavailable, open the direct links given in each mode's section above
and export manually (File → Export, or right-click → Copy/Export as PNG).
