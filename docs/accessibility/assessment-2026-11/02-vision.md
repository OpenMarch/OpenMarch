# Council seat 2: Vision (low vision, color vision deficiency, contrast, light sensitivity, magnification)

Code read: fork main `e1792b9b0` in fork main (read only).
Numbers: `scripts/cvd.py` (run `python3 -I cvd.py`, output saved as
`scratch/cvd-results.md`) and `scratch/search.py` (best five-color state set). The CVD simulation
uses Machado et al. 2009 at full severity (dichromacy) in linear sRGB. Distance is CIEDE2000 (ΔE00).
Rule of thumb used here: ΔE00 under 10 means two small marks on a field are easy to confuse, and
under 5 means they look the same.

Earlier VPAT findings (the v0.1.7 audit notes (`perceivable.md`, kept outside the repo), `field.md`) were made on upstream 0.1.7 with
the Fabric canvas. The field theme values are unchanged, but the renderer is now three.js, previous
paths were replaced by start flag positions, and the timeline is new. So the field and timeline
rows below are re-measured from the current code.

---

## 1. Inventory of colors that carry meaning

### 1.1 Where the colors live today

| Source                                                 | What it holds                                                                                                                                                                                                                                                                                                                                                                          | Who controls it                                                        |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `packages/core/src/field/FieldTheme.ts` (`FieldTheme`) | field background, grid strokes, yard numbers, next path, shape, temp path, default marcher fill/outline/label, default marker shape                                                                                                                                                                                                                                                    | **saved in the show file** (FieldProperties), edited in Field settings |
| `section_appearances` / marcher appearances (DB)       | per-section fill, outline, **shape** (circle/square/triangle/X), visibility                                                                                                                                                                                                                                                                                                            | show file, per section                                                 |
| `packages/ui/src/tailwind.css` tokens                  | app chrome: bg, text, subtitle, stroke, accent, red, yellow, green; light + `.dark`                                                                                                                                                                                                                                                                                                    | app theme (light/dark only)                                            |
| Hard-coded constants, field                            | selection `#0d6efd` (`field/three/selectionRing.ts`), collision red `[1,0,0]` (`field/timelineOverlays.ts:330`), step-size warning `(220,38,38)` (`timeline/stepSizeWarning.ts`), guide ink `#ea580c`, pivot `#facc15`, group seam `#4b5563` (`FieldOverlay.tsx`), ghost gray `#6f6f6f`/`#c4c4c4` (`useTimelineFocusScene.ts`), line groups Okabe-Ito (`shapes/field/groupDrawing.ts`) | nobody (code)                                                          |
| Hard-coded constants, timeline                         | 8 track colors (`timeline/timelineViewModel.ts:107`), start flag ochre `(150,120,0)` (`components/timeline/startFlagInk.ts`), waveform `(180,180,180)` + progress = accent (`audio/AudioPlayer.tsx:40`), canvas fallbacks in `TimelineCanvas.tsx`                                                                                                                                      | nobody (code)                                                          |
| 3D View                                                | section colors from section appearances, accent read at runtime (`performerData.ts`)                                                                                                                                                                                                                                                                                                   | follows the file                                                       |

**Architectural fact that shapes everything below:** the field theme is _document_ data, not a
_viewer_ preference. A color-blind staff member who opens the director's file sees the director's
colors, and if they change them they change the file for everyone. Any CVD or high-contrast
option for the field therefore has to be a **per-viewer display layer** applied on top of the file's
theme at render time, never written into the file.

### 1.2 Field (default theme, white field)

| Meaning                          | Color                                            | Contrast on white               | Color the only carrier?                                                                         | Notes                                                                                                                           |
| -------------------------------- | ------------------------------------------------ | ------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Marcher (default)                | red 255,0,0                                      | 4.00                            | n/a                                                                                             | fine                                                                                                                            |
| Section identity                 | user's choice per section                        | depends                         | **No** if the user sets shapes; sections also have labels (drill numbers with a section prefix) | shapes per section exist already but default to circle for everyone                                                             |
| Selected marcher                 | blue `#0d6efd` ring                              | 4.50                            | **No** (ring around the shape)                                                                  | good; ring is 2 CSS px with a 1.5 px gap                                                                                        |
| Next path                        | green 0,175,13                                   | **2.94** (fails 3:1, SC 1.4.11) | No (it is a line, with midpoint and endpoint dots)                                              | **deuteranopia: red marcher vs green path ΔE 2.6 (the same color)**                                                             |
| Step-size warning path           | red 220,38,38, dashed, 3 px                      | 4.83                            | **No** (dash + width)                                                                           | good redundant encoding. But warning vs next-path green is ΔE 6.5 under deuteranopia, so the dash is doing all the work         |
| Collision                        | red disc `[1,0,0,0.5]` + red outline + red label | 4.00                            | Partly (disc + text label)                                                                      | **identical color to the default marcher (ΔE 0)**. A collision ring on a field of red dots is low salience for everyone         |
| Not defined marcher              | marcher's own color, dashed edge                 | as marcher                      | **No** (dash)                                                                                   | good: done by shape, not fade                                                                                                   |
| Dimmed (isolation / not focused) | opacity 0.25 / 0.4                               | drops to ~1.2–1.6:1             | No (it's emphasis)                                                                              | intentional, but at 0.25 dimmed marchers fall below 3:1 for low vision; a high-contrast mode should raise the floor (e.g. 0.45) |
| Shape outline / spots            | purple 126,34,206                                | 6.98                            | n/a                                                                                             |                                                                                                                                 |
| Temp path (drawing)              | 192,132,252                                      | **2.64**                        | No                                                                                              | fails 3:1                                                                                                                       |
| Shape guide (snap line)          | orange `#ea580c` + dark casing + text name tag   | 3.56                            | **No** (labelled)                                                                               | vs default marcher red: ΔE 1.3 under deuteranopia, but it's a full-canvas line with a name tag, so fine                         |
| Pivot                            | yellow `#facc15`                                 | **1.53**                        | No (crosshair shape)                                                                            | yellow on white is near-invisible for low vision; needs a dark casing like the guide has                                        |
| Isolation ghost                  | gray `#6f6f6f`, dashed                           | 5.02                            | No (dash)                                                                                       | good, and it adapts to light/dark field                                                                                         |
| Isolated move color              | track color (see 1.3)                            | 2.2–3.1 on white                | No (paths + rings)                                                                              | same set as timeline tracks                                                                                                     |
| Grid: secondary / tertiary       | `#aaa` / `#ddd`                                  | **2.32 / 1.36**                 | n/a                                                                                             | the 4-step and 1-step grid; a low-vision user who relies on them can't see them. User-adjustable, but no preset                 |
| Yard numbers                     | `#888`                                           | 3.54                            | n/a                                                                                             | passes only as large text                                                                                                       |
| Marcher labels                   | black                                            | 21                              | n/a                                                                                             | label size setting: small 0.7 / normal 1 / large 1.4 (`UiSettingsStore.ts:112`); Auto only shrinks                              |

### 1.3 Timeline

| Meaning                     | Color                                                             | Contrast (light / dark)          | Color the only carrier?                                                               | Notes                                                                                                                                                         |
| --------------------------- | ----------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Playhead                    | accent 100,66,255 / 150,126,255, 2 px line + pentagon head        | 4.70 / 6.16                      | **No**                                                                                |                                                                                                                                                               |
| Start flag                  | ochre 150,120,0 / yellow 236,211,71, flag shape + "S"             | 3.55 / 12.79                     | **No** (shape)                                                                        | ΔE vs playhead ≥ 36 in every vision type. Good, and already designed for contrast (`startFlagInk.ts` comment)                                                 |
| Return marker               | accent pennant, dashed line                                       | as accent                        | No (dash, shape)                                                                      |                                                                                                                                                               |
| Track / move colors (8)     | `#2fc4b2 #e79b00 #e56a82 #7c8cf8 #62b851 #c27be0 #e0784a #4aa3e0` | 1.8–2.6 on light bg, 6–9 on dark | **Mostly yes**: the color is what links a clip on the strip to its paths on the field | **deuteranopia: 5 pairs under ΔE 10, worst `#c27be0`/`#4aa3e0` ΔE 1.7; protan 4 pairs (3.5); tritan 7 pairs (3.5)**. On the light theme, all 8 fall below 3:1 |
| Waveform                    | 180,180,180; played part = accent                                 | **1.75** light / 9.27 dark       | n/a                                                                                   | light-theme waveform fails 3:1                                                                                                                                |
| Errors / blocked (red text) | 176,51,51 / 227,74,74                                             | 5.26 / 4.89                      | Mostly no: readouts carry words ("blocked")                                           | red vs green tokens ΔE 12.4 (deutan), ok-ish                                                                                                                  |
| Green token (success)       | 72,158,51 light                                                   | **2.85** light                   |                                                                                       | fails as text on light                                                                                                                                        |
| Yellow token                | 200,170,0 light                                                   | **1.92** light                   |                                                                                       | must never be text/icon on light                                                                                                                              |
| Selected page (page bar)    | border-accent only (VPAT 1.4.1)                                   |                                  | **Yes**                                                                               | still an open 1.4.1 item unless changed since                                                                                                                 |
| Metronome toggle on         | accent dot                                                        |                                  | **Yes** (VPAT)                                                                        |                                                                                                                                                               |
| Hold preview pulse          | accent fill pulsing every 600 ms                                  |                                  | n/a                                                                                   | slow pulse, under the 3 flashes/s limit; but not gated by reduced motion                                                                                      |
| Line groups (shapes)        | Okabe-Ito 5                                                       |                                  | No (rings + labels)                                                                   | **min ΔE 11.1 in every vision type: already CVD-safe**, the one place this was designed for                                                                   |

### 1.4 App chrome (from the VPAT, still current in `tailwind.css`)

- Light subtitle text 4.09:1 (fails 4.5:1 for normal text), used about 86 times.
- Input/checkbox borders 1.25:1 light, 1.14:1 dark (fail 3:1).
- Focus: `index.css` now has `focus-visible` that skips click focus (`data-click-focus`), and many controls use `focus-visible:ring-2 ring-accent`, but the VPAT found `outline-hidden` and `-translate-y` as the only cue on several buttons. Ring width is 2 px with no offset or contrasting halo.

### 1.5 Summary of what's wrong

1. **Red marchers vs green next paths** (the most common thing on screen) look the same to about 5% of men (deutan, ΔE 2.6). The path is a line and the marcher a dot, so they're still told apart by shape, but "which line belongs to which dot" gets hard on a dense field.
2. **Collisions are drawn in the same red as default marchers** (ΔE 0 for everyone). This is the one alarm on the field, and it is camouflaged.
3. **Timeline move colors** fail CVD (5 confusable pairs for deutans) and contrast on the light theme, and the color is the only link between a clip and its paths on the field.
4. **Low-contrast field inks:** next path 2.94, temp path 2.64, pivot 1.53, grid 2.32/1.36; light waveform 1.75.
5. **No viewer-level display preferences** at all: no high-contrast, no CVD mode, no dim/low-glare field, no UI scale apart from Electron's View › Zoom.
6. Good news: the codebase already uses non-color encodings in many places (dashed warnings, dashed not-defined, dashed ghosts, flag vs line shapes, per-section marker shapes, Okabe-Ito groups, `prefersReducedMotion` for glides). The work is mostly _closing gaps and adding a viewer layer_, not a redesign.

---

## 2. Options

### (a) CVD-safe palettes

**Search result:** I searched every 5-color set from 21 candidates (Okabe-Ito, Tol bright/muted, IBM, the existing purple) with ≥3:1 contrast on white. The best possible set separates by **ΔE00 ~18–20 at worst across normal/protan/deutan/tritan**. Example: black, indigo `#332288`, blue `#4477AA`, rose `#EE6677`, brown `#994F00`. Conclusion: you can get **five** field state colors that every common CVD type can tell apart; you **cannot** make them also distinct from arbitrary user-chosen section colors. So color fixes have to come with non-color encodings (b, c), not instead of them.

Concrete palette changes:

1. **Timeline move colors → Okabe-Ito-based set** (in code, no file impact): `#E69F00 #56B4E9 #009E73 #D55E00 #CC79A7 #4477AA #DDCC77 #BBBBBB`. Worst pair: ΔE 9.2 (protan, pink/blue), all others ≥10.5. vs today's 1.7. On the dark theme all are ≥4:1. On the light theme light hues still fall under 3:1 as thin lines, so on light, draw clip strips with a 1 px darker edge (`color-mix` with text at 30%) rather than relying on fill.
   _Effort: S._ `TIMELINE_TRACK_COLORS` is one array; colors are by timeline id, so changing it re-colors existing moves (acceptable; it's display only).
2. **Collision ink**: move collisions off red to a color no section default uses and draw as a **dashed ring + "!" glyph + the existing text label**. With the default marcher red, a magenta/wine `#882255` or black-and-yellow "hazard" casing works for all CVD types. _Effort: S_ (`timelineOverlays.ts` constants, plus a glyph in the overlay plan).
3. **Default theme defaults** (new shows only, never rewriting existing files): next path `#009E73` (bluish green, 3.42:1, deutan ΔE vs `#D55E00` 20.5) instead of `0,175,13`; default marcher vermilion `#D55E00` (3.87:1) instead of pure red; temp path darkened to ≥3:1. _Effort: S_, but it's a durable default for new files, so an ADR-lite note per AGENTS.md ("persistent data").
4. **Section palette picker**: when choosing a section color, offer an 8-swatch "Distinct for everyone" row (Okabe-Ito / Tol muted) first, ahead of the free picker, and default new sections round-robin through it plus a different shape per section. Precedent: Figma and Logic offer fixed swatch rows before a full picker; Logic Pro's track colors are a fixed palette. _Effort: M_ (picker UI + section creation default).

### (b) High-contrast theme (viewer-level)

Precedent: VS Code ships "High Contrast Dark" and "High Contrast Light" themes that add 1 px borders around every panel, input and focused element, use a solid contrasting focus outline (`contrastActiveBorder`, orange by default in HC dark), and respect Windows forced-colors. Figma has no HC theme (as far as I know). Ableton Live has theme files plus a "Hi-Contrast" variant, if I remember right. Logic exposes increased contrast via macOS Accessibility settings. I'm not certain of MuseScore 4's details beyond "High contrast light/dark" themes in Preferences › Appearance, which I believe exist.

Proposal: a third and fourth app theme, **High contrast dark / High contrast light**, plus following `prefers-contrast: more` and Windows `forced-colors: active` when the user picks "System".

- Chrome: subtitle → 100% text (no alpha), stroke → 40–50% text, inputs get real borders, focus = 2 px solid + 2 px offset halo in a color that isn't the accent.
- Field (as a display layer over the file's theme): grid strokes darkened to ≥3:1 (`#767676` / `#949494` on white), yard numbers ≥4.5:1, every marcher gets a 1 px contrasting outline (black on light field, white on dark), dim floor 0.45 instead of 0.25, selection ring 3 px with a white casing, collision ring hazard-cased.
- Timeline: waveform ≥3:1 (e.g. 110,110,110 on light), track clips edged.

**Precondition:** today the chrome is easy (CSS tokens on `:root`/`.dark`; add `.hc` / `.hc.dark` blocks), but the field and timeline read colors from three places (file theme, hard-coded constants, CSS variables read at runtime in `TimelineCanvas.tsx`). Needs a **`DisplayTheme` object** = `resolve(fileFieldTheme, viewerPrefs)` that every layer reads, and all hard-coded field/timeline inks moved into it.
_Effort: M for chrome-only HC; L including field + timeline_ (most of the L is the refactor to one display theme; the HC values themselves are S).

### (c) Redundant non-color encodings on the field

1. **Per-section marker shapes by default.** The data model and renderer already support circle/square/triangle/X per section (`markerShape.ts`, `section_appearances.shape_type`), and markers, rings, ghosts and start-flag dots already follow the marcher's shape. Today everything defaults to circle. Offer "Give each section its own shape" in the section setup and a viewer-level "Shapes by section" toggle that overrides shapes on display only. Four shapes isn't enough for 8–12 sections, so pair shape + color (4 shapes × 5 colors = 20 distinct combos). Precedent: scatter plots in data tools (Tableau's shape palettes); from DAWs, Ableton's clip icons are weaker here. _Effort: S for the toggle (render-time override of `shape`), M if adding shapes (diamond, hollow variants) since the SDF/WebGL batch and the SVG export both need them._
2. **Line styles per path role.** Current: warning = dashed + thick, ghost = dotted gray, next path = solid. Add a **direction cue** on the next path (small chevron at midpoint instead of a plain white dot) so "this line goes from this dot" doesn't depend on hue. Start-flag routes already use a dashed tail. _Effort: S–M_ (overlay plan has `dash`; chevrons need a new mark type).
3. **Collisions as shape + text**: ring, "!" glyph, label already present. _Effort: S._
4. **Timeline clip ↔ field link without color**: when a clip is hovered/selected, label its isolated paths with the move name on the field (a small pill like the guide's name tag), and draw the clip strip with its move number. _Effort: M._
5. **Selected page in page bar**: add a fill or underline + `aria-current`, not border color only (open VPAT 1.4.1 item). _Effort: S._

### (d) Size: UI scale, font size, field labels, focus rings

- **UI scale**: Electron View › Zoom (resetZoom/zoomIn/zoomOut roles) works, but it's per-session and the VPAT found the sidebar spills over the transport at 200%. Add a persisted **Interface size** setting (90/100/115/130/150%) using `webContents.setZoomFactor`, and fix the 200% overlap. Precedent: VS Code `window.zoomLevel`, Figma's UI scale, Discord's "Chat font scaling" + "Zoom level" (both in Accessibility settings). _Effort: S for the setting; M to fix layouts at 150–200%._
- **Text size**: the type ramp is rem-based (`--text-sub 0.6875rem` = 11 px, `--text-micro 0.625rem` = 10 px for lane labels). A "Text size" setting that changes root font size would scale text without scaling the field. 10–11 px lane labels are the low-vision pain point; at "Large" text the timeline rows need to grow too. _Effort: M_ (rows have fixed px heights).
- **Field label size**: `small 0.7 / normal 1 / large 1.4`. Add **Extra large 2.0** and make Auto's max equal to the chosen size (today Auto only shrinks to avoid overlap). Also a "label halo" (white/black outline behind label text) so labels read over paths and turf images. _Effort: S_ (SDF text supports outlines cheaply; check `sdfText.ts`).
- **Minimum dot size**: `MIN_SCREEN_RADIUS = 1.5` CSS px when zoomed out. Offer a viewer "Larger marchers" scale (1.5×) for magnification users. _Effort: S_ (`dotSizes`).
- **Focus rings**: one app-wide token `--focus-ring` (2 px solid, 2 px offset, plus 1 px contrasting halo), a "Thick focus ring" option (3–4 px), and remove `outline-hidden`/translate-only cues. Precedent: VS Code `focusBorder` + HC `contrastActiveBorder`; macOS "Increase contrast" thickens focus rings. _Effort: M_ (many call sites use `focus-visible:ring-2 ring-accent`; a lint rule or shared class keeps it fixed).
- **Field cursor/selection size**: selection ring 2 px; in HC or "Larger marchers", 3 px with casing.

### (e) Light sensitivity

- **Dim / low-glare field**: the default field is pure white (255,255,255) with black lines, beside a dark app chrome for dark-mode users. That's the worst glare case: a 21:1 white rectangle in a dark room. Offer viewer presets that don't touch the file: **Field: As saved / Dimmed / Dark**. "Dimmed" = background ~`#d9d9d9`-ish with inks re-checked; "Dark" = slate field (`#1e2228`) with light grid and the file's section colors kept (each checked for ≥3:1, with an auto outline when they aren't). The welcome flow deliberately keeps a white field in the dark preview (fork #326), so this must be opt-in, not a dark-mode follow. Precedent: video editors (DaVinci Resolve, Premiere) keep a neutral gray UI precisely to avoid glare; Figma's canvas background follows the theme; MuseScore lets you set paper and background colors in Preferences. _Effort: M_ (display-theme layer from (b) plus color remapping for user section colors).
- **Reduced flashing/motion during playback**: no flashing above 3 Hz found. Motion candidates to gate behind `prefers-reduced-motion` (already used for follow glides and clip drops): hold preview pulse (`TimelineHoldBars.tsx`, 600 ms half-pulse), isolation bar flash (`TimelineIsolationBar.tsx:437`), caret blink, any playhead "follow" glides (already gated). Also add an in-app "Reduce motion" setting, since Linux/Electron users may not have an OS switch. _Effort: S._
- **Playback follow**: page-aware glide at 8% is gentle; "cut" mode under reduced motion already exists. Good.

---

## 3. System going forward

1. **One `DisplayTheme`** (renderer-side) resolved from _file field theme_ + _app theme_ + _viewer accessibility prefs_. All field overlay inks, timeline inks and waveform colors come from it; no hex literals in `field/` or `components/timeline/` outside it. Enforce with an ESLint `no-restricted-syntax` rule on color literals in those folders (allowlist the theme file).
2. **Viewer prefs live in the user's settings, never the show file**: `colorVision: "default" | "deutan-protan" | "tritan"`, `contrast: "default" | "high"`, `field: "asSaved" | "dimmed" | "dark"`, `shapesBySection`, `labelSize`, `markerScale`, `focusRing`, `reduceMotion`, `uiScale`. One "Accessibility" settings section (Discord and VS Code both group these in one place; Discord's is a good model for plain naming).
3. **Contrast + CVD tests in CI**: a Vitest test that imports the display theme(s) and asserts (i) every state ink ≥3:1 on its background, every text ink ≥4.5:1, and (ii) every pair in the "must be told apart" list (marcher default / next path / warning / collision / selection / shape, timeline tracks, playhead / start flag) has ΔE00 ≥10 under protan, deutan and tritan simulation. `scratch/cvd.py` is the reference; port to TS (~120 lines, no deps). This turns the palette into a contract. _Effort: S._
4. **Design rule** (for `docs/conventions/ui-styling.md` and the taste doc): "Color never carries meaning alone: each state also has a shape, line style, icon or word." Add a row to the PR template: "New color meaning? Name its non-color cue."
5. **Visual checks**: the om-capture/validate toolkit can render each new field feature under the CVD matrices (apply via a CSS/WebGL post filter or by remapping the screenshot) for review; cheap once the script exists.

---

## 4. Effort and preconditions

| #   | Change                                                                   | Effort     | Precondition                                                                  |
| --- | ------------------------------------------------------------------------ | ---------- | ----------------------------------------------------------------------------- |
| 1   | Okabe-Ito timeline move colors                                           | S          | none (one array)                                                              |
| 2   | Collision: off-red ink + dashed/hazard ring + "!"                        | S          | none                                                                          |
| 3   | Non-color selected page in page bar; metronome toggle state              | S          | none                                                                          |
| 4   | Darker defaults for new shows (next path, temp path, pivot casing, grid) | S          | ADR-lite note (persistent default); never rewrite existing files              |
| 5   | "Shapes by section" viewer toggle + per-section shape default            | S / M      | render-time shape override in marchers layer + overlays (already shape-aware) |
| 6   | Field label XL + halo, larger-marcher scale                              | S          | none                                                                          |
| 7   | Reduced-motion gating for pulses/flashes + in-app switch                 | S          | none                                                                          |
| 8   | Contrast/CVD palette test in CI                                          | S          | palette constants importable                                                  |
| 9   | Interface size setting (persisted zoom) + fix 200% overlaps              | S + M      | none                                                                          |
| 10  | Focus ring token + thick option                                          | M          | shared class/lint rule                                                        |
| 11  | Light-theme fixes: subtitle 4.5:1, input borders 3:1, waveform 3:1       | S          | token edits; check visual taste                                               |
| 12  | Section color picker with "distinct for everyone" swatches               | M          | picker UI                                                                     |
| 13  | High-contrast app theme (chrome)                                         | M          | tokens on `.hc`                                                               |
| 14  | `DisplayTheme` refactor (all field/timeline inks from one object)        | L          | none; unlocks 15–16                                                           |
| 15  | High contrast for field + timeline                                       | M after 14 | 14                                                                            |
| 16  | Dimmed / dark field viewer preset with section color remap               | M after 14 | 14                                                                            |
| 17  | Text size setting that grows timeline rows                               | M          | row heights from tokens                                                       |

## 5. Unsure / to verify

- I simulated at full severity; anomalous trichromats (most CVD) see more than this, so the numbers are worst-case.
- I didn't render screenshots; contrast numbers come from code values. Translucent overlays (collision disc at 0.5, dimmed marchers) depend on what's beneath.
- Precedent details from memory: VS Code HC themes and `contrastActiveBorder` (confident); Discord accessibility settings (confident); MuseScore 4 high-contrast themes and Ableton "Hi-Contrast" theme (fairly sure, not verified); Logic relying on macOS settings (fairly sure).
- Whether field labels are in field units (scale with zoom) or screen px affects how useful "XL labels" is at low zoom; check `LabelsLayer.tsx`.
- The page-bar 1.4.1 and metronome findings came from 0.1.7; re-check on the fork timeline.
