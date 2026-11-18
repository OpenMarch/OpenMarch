# Seat 5: the system — how accessibility stays true going forward

Read-only assessment against fork main (fork main, e1792b9b0), upstream PR #1057 (`docs/accessibility/README.md`), the 0.1.7 VPAT work in the v0.1.7 audit workspace (outside the repo), and the owner's working model. Nothing in the repo was changed and no lint or test was run; counts below come from `grep` and are rough.

## The short version

1. **Accessibility has to be a property CI checks, not a thing agents remember.** Agents follow what fails a build. Today nothing accessibility-related can fail one.
2. **Three pieces make the system:** one preferences module that every renderer reads (DOM, three.js field, timeline canvas), a set of ratcheted checks that can only get stricter, and a conformance ledger that turns the per-release VPAT from a fresh audit into a collection of evidence already produced by CI.
3. **Most of it fits the delegation rule.** Guardrails, token work and mechanical fixes have objective done-checks and are reversible. The owner decisions are few: palette and contrast looks, what the app promises in public, whether to pay testers, and what the drill field offers people who cannot see it.
4. **Automated checks cover a minority of WCAG, and none of the field.** axe sees the DOM; the field is WebGL. A green pipeline means "no known regressions in what we can measure", never "accessible". The plan keeps that sentence visible in the docs and the public statement.

## What the repo has today

| Area                 | State on fork main                                                                                                                                                                                                                                                                                                                                  | Consequence                                                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint                 | One root `.eslintrc.cjs` (ESLint 8.57.1, legacy config). `extends: "react-app"` already loads `eslint-plugin-jsx-a11y` with about 17 rules at **warn**. `lint:check` is `eslint .` with no `--max-warnings`, so warnings never fail.                                                                                                                | The plugin is installed and silent. No new dependency is needed to start.                                                                       |
| Style lint precedent | `no-restricted-syntax` patterns reject `text-[11px]` and `rounded-[..]` as errors, documented in `docs/conventions/ui-styling.md`.                                                                                                                                                                                                                  | The same mechanism can ban raw colors and `outline-none`. Agents already work under it.                                                         |
| Tokens               | `packages/ui/src/tailwind.css`: 12 color tokens per theme, `.dark` class switch, three gradient surfaces. No high-contrast variant, no `prefers-contrast`, no `forced-colors`.                                                                                                                                                                      | Small token set, so a contrast test is cheap. Translucent tokens mean ratios depend on the backdrop.                                            |
| Raw colors           | About 2,000 hex/`rgb()` matches in 43 non-test files under `apps/desktop/src`. Most are 3D venue art (`view3d/core/kits/*/textures.ts`). UI-side offenders are few: `videoTheme.ts`, `timelineViewModel.ts`, `startFlagInk.ts`, `TimelineCanvas.tsx`, `TempoBand.tsx`, `groupDrawing.ts`, `FieldOverlay.tsx`, `FavoritesRing.tsx`, `ThemeStep.tsx`. | A ban needs a scene-art exemption, then the UI baseline is under ten files.                                                                     |
| Field colors         | `packages/core/src/field/FieldTheme.ts`: per-file theme (`previousPath`, `nextPath`, `shape`, `tempPath`, strokes, labels), user-editable.                                                                                                                                                                                                          | Field colors are the author's data. A viewer's need has to override at display time without writing to the file.                                |
| Theme state          | `ThemeContext.tsx`: `light`/`dark` string, synced across windows by `window.electron.setTheme` / `onSettingsChanged`.                                                                                                                                                                                                                               | The IPC path for a preferences store exists; it carries one string today.                                                                       |
| Motion               | `components/timeline/reducedMotion.ts` plus about ten files that call `matchMedia("(prefers-reduced-motion…")` or write their own CSS media query.                                                                                                                                                                                                  | OS-only, no app override, no single switch, no test that covers all of them.                                                                    |
| Actions              | `shortcuts/definitions.ts` + `registry.ts`: every action has an id; `hiddenFromPalette` is the documented exception (#411). Taste rule: "every feature is a command".                                                                                                                                                                               | Keyboard reachability can be proven from data, in a unit test. This is the strongest asset the app has.                                         |
| Browser e2e          | `apps/desktop/e2e/browser`: about 60 specs in headless Chromium, in CI as `desktop-browser-e2e` (about 5 min), with a touch project. No axe.                                                                                                                                                                                                        | The place for axe, keyboard-only tasks and media emulation. Covers an open show; the launch page and first-run dialogs need the Electron suite. |
| Agent docs           | Root `AGENTS.md` is capped at 120 lines by `scripts/validate-agent-guidance.mjs`. `docs/conventions/verification.md` is the matrix agents follow. PR template has a "Tablet:" line. No mention of accessibility anywhere.                                                                                                                           | Add a short pointer in `AGENTS.md` and put the rules in a convention doc; mirror the Tablet line.                                               |
| VPAT                 | 0.1.7: Supports 16, Partially 22, Does Not Support 8, N/A 9. About 60 raw auditor entries in the v0.1.7 audit notes (`*.md`, kept outside the repo), consolidated to 23 findings, none filed. Scenario scripts and an `axe`/`ariaDump` helper exist in the v0.1.7 audit workspace (outside the repo)/scenarios`.                                    | The audit tooling can be reused for a recheck on fork main.                                                                                     |

Token contrast, computed from the CSS values over `bg-1` (the gradient surfaces shift these slightly):

| Pair                                  | Light | Dark         | Needs                                        |
| ------------------------------------- | ----- | ------------ | -------------------------------------------- |
| `text-subtitle` on `bg-1`             | 4.09  | 5.04         | 4.5                                          |
| `accent` on `bg-1`                    | 4.70  | 6.16         | 4.5                                          |
| `text-invert` on `accent`             | 5.58  | 6.73         | 4.5                                          |
| `green` on `bg-1`                     | 2.85  | not computed | 4.5 as text, 3 as a graphic                  |
| `yellow` on `bg-1`                    | 1.92  | not computed | same                                         |
| `stroke` on `bg-1` (control boundary) | 1.25  | 1.14         | 3 where it is the only boundary of a control |

These match VPAT findings F-perceivable-2 and F-perceivable-3. A token test would have caught all of them.

## 1. Architecture

### One preferences module

A single store, `preferences`, owns every setting that changes how the app is perceived or operated. Nothing else reads the OS media queries.

```
stored (per user, per device)        resolved (what code reads)
---------------------------------    ---------------------------------
colorScheme: system | light | dark   scheme: light | dark
contrast:    system | normal | more  contrast: normal | more | forced
motion:      system | full | reduced motion: full | reduced
palette:     default | cvd-safe      palette: default | cvd-safe
textScale:   1 | 1.15 | 1.3 …        textScale: number
(later: target size, sticky modifiers, key remap, announcements verbosity)
```

- **Resolution:** `resolved = override ?? OS`. `system` follows `prefers-color-scheme`, `prefers-contrast`, `prefers-reduced-motion` and `forced-colors` live. An explicit choice wins over the OS, except `forced-colors: active`, which the app never fights: system colors pass through.
- **Three outputs from one resolve step:**
  1. **Attributes** on `<html>`: `data-theme`, `data-contrast`, `data-motion`, `data-palette`. CSS redefines tokens under them. The `.dark` class stays as an alias until callers move.
  2. **A theme object** (`ResolvedTheme`): plain numbers for every semantic token, for code that cannot read CSS: the three.js field, the timeline canvas, SVG and video export, the 3D View. Subscribed, so a change repaints without a reload.
  3. **Motion helpers:** `motion.duration(ms)` and `motion.enabled`, plus one switch for react-spring (`Globals.assign({ skipAnimation })`). Glides in three.js call the helper.
- **Storage:** user settings, synced across windows on the existing settings channel. Never in the `.dots` file.
- **Profiles are presets, not modes.** A profile ("High contrast", "Color-vision safe", "Reduced motion", "Large text") is a named bundle of the values above. Choosing one sets the fields; changing a field afterwards makes it "Custom". There is no code path that asks "which profile".

### Is a separate editing mode the right shape?

From the system's side: **not as a forked UI.** A second editor would have to be kept true by the same agents on every feature, and it would drift within a month. What the codebase can sustain:

- Visual and motion needs → preferences (above). One UI, different tokens.
- Motor and keyboard needs → the action registry. Every feature is already meant to be a command; the palette is the universal fallback.
- Non-visual access to the field → an **alternate view of the same data running the same actions** (for example a marcher table with coordinates, selection and nudges), not a mode with its own logic. Whether to build it, and how far, is an owner decision informed by the other seats.

This matches the taste rule already written down: "same actions, different inputs".

### Tokens as the only color source

Three layers:

| Layer     | Example                                                                                                                                                                                    | Who uses it                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| Primitive | `violet-500`, `gray-900`                                                                                                                                                                   | Only the theme definitions           |
| Semantic  | `text`, `text-subtitle`, `surface-1`, `control-border`, `focus-ring`, `accent`, `danger`, `selection`, `path-previous`, `path-next`, `path-temp`, `playhead`, `start-flag`, `category-1…N` | All UI code, DOM and canvas          |
| Component | `button-primary-bg`                                                                                                                                                                        | Only where a component needs its own |

Rules:

- **UI code names a meaning, never a color.** `selection`, not `accent`; `path-previous`, not black.
- **Categorical meaning never rides on color alone** (WCAG 1.4.1). Every `category-N` token is paired with a second channel in the token definition itself: a shape, pattern, dash or label. The CVD-safe palette then only has to keep neighbors apart.
- **`control-border` and `focus-ring` are their own tokens** with a 3:1 requirement, separate from the decorative `stroke` (1.25:1 today).
- **Scene art is exempt.** 3D venue textures, uniforms and field paint depict real things. They live under an allow-listed path (`view3d/core/kits/**`, `environment/**`) and are not UI.
- **User-authored colors stay the author's.** `FieldTheme`, marcher and section colors are saved in the file. The viewer's contrast or palette preference is applied on top at display time and never written back. Exports use the file's colors unless the person exporting chooses otherwise (owner decision, below).
- **Source of truth:** define tokens in TypeScript (`packages/ui/src/tokens/`) and generate the CSS block from them, with a check that the generated CSS is current. Reason: the canvas code and the contrast test both need the values in Node without a DOM. The alternative (CSS as source, parsed by the test) is less work now and leaves three.js reading computed styles at runtime; it is the fallback if the generator feels heavy.

### Should this be an ADR? Yes.

`docs/conventions/architecture-decisions.md` requires one for IPC contracts, public package APIs and cross-package ownership. This touches all three: the settings channel grows, `@openmarch/ui` exports tokens, and color ownership moves out of `apps/desktop` and `packages/core` defaults. The next free number is 0016.

**Draft: ADR 0016, Accessibility preferences and theme tokens**

Decision bullets:

1. One `preferences` store holds color scheme, contrast, motion, palette and text scale. Each field is `system` or an explicit value. It is the only code that reads `prefers-*` and `forced-colors`.
2. Preferences are per user and per device, stored with app settings and synced across windows on the settings channel. They are never stored in a show file.
3. The store resolves to (a) `data-*` attributes on the root element, (b) a `ResolvedTheme` object, (c) motion helpers. DOM code uses token classes; canvas, WebGL, SVG and export code uses `ResolvedTheme`. No other route to a color or a duration exists for UI.
4. Tokens are defined once in `@openmarch/ui`, in three layers (primitive, semantic, component). UI code may use semantic and component tokens only. Raw color literals in UI code are a lint error; scene art paths are allow-listed.
5. Every theme variant (light, dark, each with normal and more contrast) must pass the token contrast test. Categorical palettes must pass the color-vision distinctness test and declare a non-color channel.
6. `forced-colors: active` is honored: system colors pass through and the app adds borders or outlines where a fill carried meaning.
7. A viewer's preference overrides file-authored colors at display time only. Files and exports keep the author's colors by default.
8. Profiles are presets over the store. No component branches on a profile name.
9. All animation reads the motion helpers. Reduced motion removes glides, springs and auto-scrolling; playback of the show is content and still plays.
10. The guardrails in `docs/conventions/accessibility.md` are part of the decision. Their baselines may only shrink; raising one needs an issue and the owner's sign-off.

Consequences to record: a migration of the existing `theme` setting; `ThemeContext` becomes a thin reader; about ten UI files and ten motion call sites move; `FieldTheme` defaults gain contrast variants; tablet and web editor get the same store for free.

Verification section: the tests in part 2.

## 2. Guardrails agents cannot skip

Principles:

- **Ratchet, never a big-bang.** Each check records today's failures in a committed baseline. CI fails when a number rises. When a number falls, CI fails until the baseline is lowered, so progress locks in.
- **Types before lint before tests.** A missing accessible name that will not compile is better than one a linter catches, which is better than one a scan finds.
- **One command:** `pnpm check:a11y` for the fast layers, added to `check:quick`, to `verification.md`, and to `requiredScripts` in `scripts/agent-guidance.config.json` so the guidance validator keeps the docs honest.

A limit to state plainly: agents run with the owner's credentials, so no gate is tamper-proof. An agent can regenerate a baseline upward. The defense is to make it loud: the update script refuses increases without `--waive <issue>`, CI diffs the baseline against the merge base and fails on any unwaived increase, and waivers are listed in the release report.

### Summary

| #   | Check                            | Layer               | Runs in               | Added CI time | Flake risk    | Catches                                         |
| --- | -------------------------------- | ------------------- | --------------------- | ------------- | ------------- | ----------------------------------------------- |
| G1  | Component types require a name   | TypeScript          | `tsc` (already runs)  | none          | none          | Icon-only buttons without a label               |
| G2  | `jsx-a11y` rules, ratcheted      | ESLint              | `basic-checks`        | seconds       | none          | Bad ARIA, click-only elements, unlabeled inputs |
| G3  | Raw color and `outline-none` ban | ESLint              | `basic-checks`        | none          | none          | Colors outside tokens, removed focus rings      |
| G4  | Token contrast                   | Vitest              | `test`                | under 1 s     | none          | Token pairs below AA in any theme               |
| G5  | Color-vision distinctness        | Vitest              | `test`                | under 1 s     | none          | Categorical colors that merge under CVD         |
| G6  | Action reachability              | Vitest              | `desktop-test`        | under 1 s     | none          | Actions with neither a key nor a palette entry  |
| G7  | axe scan of key screens          | Playwright          | `desktop-browser-e2e` | about 1 min   | low           | Names, roles, ARIA, labels, target size         |
| G8  | Keyboard-only tasks              | Playwright          | `desktop-browser-e2e` | 1–2 min       | medium        | Traps, unreachable controls, lost focus         |
| G9  | Reduced motion                   | Playwright + Vitest | both                  | about 20 s    | low to medium | Animations that ignore the setting              |
| G10 | Primitive component tests        | Vitest + axe        | `test`                | seconds       | none          | Regressions in `packages/ui` primitives         |

### G1. Types: make the mistake unrepresentable

- `Button` / `getButtonClassName` already take `content`. Make `content: "icon"` a discriminated union that requires `aria-label` (or a `tooltip` that also sets the name). Same for `ActionButton` (name comes from the action's label), switches, sliders and inputs in `@openmarch/ui`.
- Cost: one pass over call sites; the compiler lists them. No baseline needed.
- This alone addresses the largest VPAT cluster (F-scan-1, F-scan-2, F-ur-5, F-perceivable-1) for everything built from primitives.

### G2. `eslint-plugin-jsx-a11y`

The plugin is already present through `react-app`. Add it explicitly with `plugin:jsx-a11y/recommended` for `apps/desktop/src` and `packages/ui/src`, and map custom components in `settings["jsx-a11y"].components` (`Button → button`, `Input → input`) so the rules see through them.

| Tier                            | Rules                                                                                                                                                                                                                                                                                                                                   | Level                              |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| A: expected clean or near clean | `alt-text`, `aria-props`, `aria-proptypes`, `aria-role`, `aria-unsupported-elements`, `role-has-required-aria-props`, `role-supports-aria-props`, `no-access-key`, `no-distracting-elements`, `no-redundant-roles`, `tabindex-no-positive`, `no-aria-hidden-on-focusable`, `anchor-is-valid`, `heading-has-content`, `iframe-has-title` | `error` now; fix the handful first |
| B: known violations             | `click-events-have-key-events`, `no-static-element-interactions`, `no-noninteractive-element-interactions`, `interactive-supports-focus`, `label-has-associated-control`, `control-has-associated-label`, `no-noninteractive-tabindex`, `mouse-events-have-key-events`                                                                  | `error` with a baseline            |
| C: judgment                     | `no-autofocus` (Radix dialogs and the palette focus on purpose)                                                                                                                                                                                                                                                                         | `warn`, reviewed by hand           |

Ratchet on ESLint 8: there is no built-in suppression file (that arrived in ESLint 9). Two options:

- **Now:** a small script (`scripts/a11y-lint-ratchet.mjs`, same style as `validate-agent-guidance.mjs`) runs ESLint with the JSON formatter for tier B, counts per file and rule, and compares with `a11y-lint-baseline.json`. New files start at zero, so new code is held to the full standard from day one.
- **Later:** switch to ESLint's native bulk suppressions when the repo moves to ESLint 9.

Also turn on `--max-warnings` for a11y rules only, or the existing warnings stay invisible.

Limits: static lint cannot see names set at runtime, focus order, or anything in a canvas. The Timeline's 47 `div`s with button ARIA (F-scan-5) are the kind of thing tier B catches.

### G3. Color and focus bans

Extend the existing `no-restricted-syntax` block:

- Literal or template strings matching `#rgb`, `#rrggbb`, `rgb(`, `rgba(`, `hsl(` and numeric `0xRRGGBB` passed to three.js colors, in `apps/desktop/src` and `packages/ui/src`, excluding tests, stories, the token files and the scene-art allow-list.
- Tailwind palette classes (`bg-white`, `text-zinc-500`), which `ui-styling.md` already forbids but lint does not check.
- `outline-none` / `focus:outline-none` unless the same class string has a `focus-visible:` ring. The app-wide focus removal (F-operable-2) was this.
- Direct `matchMedia("(prefers-` outside the preferences module.

Existing offenders go in the same baseline file. Risk: the hex pattern can hit non-color strings (ids, hashes); keep the pattern anchored and allow `eslint-disable-next-line` with a reason, as the styling rule already does.

### G4. Token contrast test

A Vitest file in `packages/ui`:

- A **pair manifest** says which foreground sits on which backgrounds and what it needs: 4.5 for text, 3 for large text, control boundaries, focus rings and meaningful graphics. `text-disabled` is exempt by WCAG and listed as such.
- Translucent tokens are composited over each declared backdrop, using the worst-case gradient stop.
- Runs for every theme × contrast variant. "More contrast" variants are held to 7:1 for text.
- Today's failures (table above) go in a `knownFailures` list with issue numbers. The list can only shrink.
- A meta-test fails if a color token exists that appears in no pair, so a new token cannot dodge the test.

What it cannot do: prove contrast of text over the field, over user-picked colors, or over blurred popovers on arbitrary content. PR #1057 notes that axe reports most contrast as "incomplete" because of the gradients; this test replaces axe for contrast, and a pixel-sampling check on rendered screens is a later addition.

For user-picked colors, lint the user instead: the field theme and section color pickers show a live contrast warning. That is a feature, tracked separately.

### G5. Color-vision distinctness test

- For each categorical set (section colors, `path-previous` / `path-next` / `path-temp`, selection vs. accent, status colors), simulate protanopia, deuteranopia and tritanopia (Machado matrices) and compute the pairwise difference in a perceptual space (OKLab or CIEDE2000), on each field background.
- Fail below a threshold. **The threshold is a judgment call**: propose one from a prototype sheet the owner looks at, then freeze it.
- Also assert each set declares its non-color channel.
- Limit: simulation is a model of dichromacy, not of any one person. Real CVD testers (easy to find: about 1 in 12 men) confirm the palette before it ships.

### G6. Action reachability test

Pure data test over `definitions.ts`:

- Every action has a default shortcut or is listed in the palette. `hiddenFromPalette` requires a shortcut and a comment saying why.
- No two actions share a default shortcut in the same context (VPAT found Alt+T used twice).
- Single-character shortcuts are remappable or can be turned off (WCAG 2.1.4, F-field-9). Fails today; baseline it against the remap feature.
- Every action label and every palette entry has an i18n key (ties into `check:i18n`).

This proves "reachable in principle". The inverse, "every control runs a registered action", is the taste rule and is harder to prove statically. Approach: a ratcheted lint that flags `onClick` on button elements outside `ActionButton` in toolbars and menus, reviewed as a count rather than a hard gate.

### G7. axe in the browser harness

- Add `@axe-core/playwright` and one helper in `e2e/browser/app.mts`: `scanA11y(page, "screen-id")`. Port the logic from the v0.1.7 audit scenario `a` (kept outside the repo)11y.mjs`.
- One spec visits the key screens: editor with a show open, each sidebar panel, Inspector with a selection, command palette, an open menu, a dialog, settings, timeline edit mode, the shape editor. Each in light and dark, plus the touch project. More-contrast variants join when they exist.
- Tags: `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa` (this includes `target-size`). `color-contrast` is switched off here and owned by G4.
- **Baseline:** `e2e/browser/a11y-baseline.json`, keyed by screen → rule → node count. Counts, not selectors, because selectors churn.
- **Growing with the app:** tag actions that open a surface, and have the spec walk the registry: run the action, scan, Escape. New dialogs are then scanned without anyone remembering to add them. Do this second, after the hand-listed version works.
- Cost: axe takes roughly 0.5–2 s per screen; about 15 screens × 2 themes adds about a minute to a 5-minute job.
- Flake: axe is deterministic. The risk is page state: toasts, async panels, animations mid-flight. Scan after the harness's settle signal, with reduced motion emulated and toasts cleared.
- Gaps: the WebGL field is one opaque element to axe. The launch page, welcome flow and analytics dialog are outside this harness; add a small scan to the Electron e2e or a launch-page fixture (F-checks-1 lives there).
- Coverage reality: automated scans find roughly a third to a half of WCAG issues by common industry estimates. Say so wherever the result is quoted.

### G8. Keyboard-only tasks

- A Playwright fixture that exposes `page.keyboard` only and throws on `page.mouse` or `locator.click`.
- Specs mirror the nine keyboard tasks in the #1057 README (create a show, open each panel, add and select marchers, move by nudge and typed coordinates, add/edit/delete a page, set audio and tempo, play and stop, export, switch language). Each asserts on data, not pixels.
- A generic **tab walk** per screen: press Tab until focus returns; assert no trap, every stop has an accessible name, and the focused element's computed outline or ring differs from its unfocused state.
- Tasks that fail today are written as `test.fail` with the issue number. When someone fixes one, the test flips and must be un-marked. That is the ratchet for behavior.
- Flake: medium. Focus timing after dialogs and Radix portals is where these wobble. Keep waits on state, not time. The tab-walk "visible focus" assertion is the most fragile part; start it as a report, promote it to a gate once stable.
- Playwright key presses go through the browser's input pipeline, so they are closer to real keys than `dispatchEvent`. The README's caution about synthetic events still applies to the final manual pass.

### G9. Reduced motion

- Unit: `motion.duration()` returns 0 when reduced; the spring wrapper skips. The existing `CommandPaletteMotion.test.ts` is the pattern.
- E2E: `page.emulateMedia({ reducedMotion: "reduce" })`, then open the palette, a popover, change page, zoom to fit, follow the playhead; after each, assert `document.getAnimations()` holds nothing running longer than a short threshold, and that the view position lands in one frame.
- Also test the app override both ways: OS full + app reduced, OS reduced + app full.
- Flake: low for CSS, medium for three.js glides, which need a test hook to report "animating". `threeFieldTestApi.ts` exists for that.

### G10. Primitive component tests

`vitest-axe` on each `packages/ui` primitive in jsdom: name, role, state, label association, keyboard activation (Enter and Space on buttons, arrows on sliders). jsdom has no layout, so no contrast or target size here. Cheap, stable, and protects the pieces everything else is built from.

### Later checks, not gates yet

- `forced-colors` emulation screenshots (Chromium supports it) for a visual review; real Windows High Contrast and NVDA on a Windows machine.
- Screen reader automation (Guidepup drives NVDA and VoiceOver). Useful for a smoke test, too flaky to gate on.
- 200% zoom and 320 px reflow checks on the panels (the field and timeline are exempt per the standing decision).
- Pixel-sampled contrast on rendered screens.

## 3. Process

### Agent instructions

- **`docs/conventions/accessibility.md`** (new): the rules, the checks and how to update a baseline. Linked from `docs/conventions/README.md` and added to the validator's `linkFiles`.
- **Root `AGENTS.md`** (120-line cap): three lines under "Repo Shape" or "Verification":
  > Read [accessibility](docs/conventions/accessibility.md) before any UI change. Colors, motion and control names come from tokens, the preferences module and the action registry. `pnpm check:a11y` must pass; its baselines only go down.
- **`apps/desktop/AGENTS.md`**: one pointer.
- **`verification.md`**: a row "Any UI change → `pnpm check:a11y`; the a11y scan and keyboard specs for the touched screen".
- The validate skill and ux-sim harness get the same axe helper so local runs print the same numbers CI does.

### Definition of done for a UI change

Each item is objective:

1. Every new control is a primitive from `@openmarch/ui` or passes G1/G2 on its own.
2. Every new feature is a registered action with a palette entry (G6).
3. No raw colors, no new motion outside the helpers (G3, G9).
4. A new screen, dialog or panel is in the axe scan and tab walk (G7, G8).
5. No baseline number went up. If one must, there is an issue, a waiver and the owner's OK.
6. State changes a sighted user sees (errors, progress, playback, toasts) are also exposed as text or a live region.

### PR template

One line, in the style of the existing "Tablet:" line, rather than a checkbox that gets ticked by reflex:

```
Accessibility: <!-- keyboard path and accessible name for each new control; baselines unchanged or lowered; or "no UI change" -->
```

CI does the enforcing; the line makes the author say it.

### Labels and triage

- Add one cross-cutting label, **`a11y`**. It sits beside the single `area:` label every fork issue has; it is not an area.
- The WCAG criterion and the VPAT finding id go in the issue body, not in labels.
- No priority labels (decided 2026-11-14), so severity maps to milestone:
  - **Blocker** (a core task is impossible for a group that could otherwise use the app, such as a keyboard trap): treated as a bug in the current release.
  - **Major:** next minor.
  - **Minor:** batched.
  - **Regression of anything a check covers:** cannot merge.
- `ready-for-agent` when the issue names its done-check (an axe rule count reaching zero on a screen, a `test.fail` flipping, a contrast pair passing). `ready-for-human` or owner-pick when it needs a design (field alternative, palette look, remapping UI).
- Add an **Accessibility** issue template next to bug and feature (what you were doing, what assistive technology, what happened), auto-labelled `a11y` and `needs-triage`.

### Turning the 23 VPAT findings into issues

1. **Recheck first (unsupervised).** The findings describe upstream 0.1.7. Fork main has changed a great deal (focus ring fix, command palette, three.js field, tablet layout). Rerun the the v0.1.7 audit workspace (outside the repo)/scenarios` scripts against fork main and mark each finding fixed, still present, or changed. This run also produces the first axe baseline for G7.
2. **File on the fork** as an epic "Accessibility: 0.1.7 report findings" with one sub-issue per finding still present, using the shape the auditors already wrote (criterion, where, what happens, repro, evidence, severity, suggested fix) plus a done-check line.
3. **Batch by fix type**, because that is how agents will work them:
   - Names and labels (icon buttons, switches, inputs, sliders, links): mechanical, mostly solved by G1.
   - Keyboard activation and focus (Enter/Space on buttons, focus loss after dialogs, skipped Tab stops, edit-mode trap).
   - Semantics (lists, menus, tabs, timeline markers, nested controls).
   - Contrast and boundaries: token changes, need an owner look because they change the visual design.
   - Status and errors (live regions, form errors, color-only states).
   - Language (page `lang`, stale names after a language switch).
   - Drag-only operations (tag priority order, page counts): each needs a non-drag path, which is a small design.
   - The field (no name, role, focus or marcher exposure; read-only coordinates): a design question for the owner.
4. **Upstream.** The #1057 README says findings are filed as GitHub issues, and the brief says the orchestrator files only after the owner approves. Filing publicly on upstream is the owner's call. Fork tracking does not have to wait for it.

### The conformance ledger and the per-release refresh

Add `docs/accessibility/criteria.json` (or YAML): one row per WCAG 2.2 A/AA criterion.

```
{ "sc": "2.1.1", "level": "A", "status": "Partially Supports",
  "evidence": ["e2e:keyboard-tasks", "manual:2026-10-24"],
  "issues": [1234, 1240], "lastChecked": "0.1.7",
  "standingDecision": null }
```

- A PR that closes an `a11y` issue updates the row. A script checks every open `a11y` issue appears in a row and every row's test ids exist.
- The VPAT tables and the counts in `docs/accessibility/README.md` are generated from it.
- The eight release steps in the README stay. Steps 3 (scan), 4 (keyboard tasks) and 6 (contrast) become "download the CI artifacts for the release commit". Step 2 (what changed) becomes a query over merged PRs with the `a11y` label or a changed baseline.
- What stays human every release: the screen reader pass (step 5), reading every row, and the sign-off (step 8). The principles in the README (lead with what does not work, disclose AI authorship, err toward the worse result) are unchanged, and waivers are listed in the report.
- Add the refresh to the release checklist in `docs/releases` so a release cannot be cut without either a new report or a dated note that the old one still stands.
- Scope note: the report covers the desktop app. The web editor and tablet layout now exist; say whether each is in scope per release.

### People with disabilities in lab testing

The lab already collects answers and screen recordings. What to add:

- **Recruit from where the users are.** Ask the existing community (Discord, newsletter, Patreon) one optional question: do you use a screen reader, magnification, high contrast, voice control, a switch, or have a color vision deficiency? Color-vision testers will turn up in any group of band directors.
- **The school that asked for the VPAT** has a disability services or IT accessibility office. That is the best-motivated partner available, and it reaches students who read drill, not only people who write it.
- **Paid panels** when the user base cannot supply a group, mainly screen reader and switch users: Fable, Knowbility's AccessWorks, or general panels with assistive-technology filters. These are priced for companies; get a quote before planning around them.
- **Communities** for specific questions: AppleVis and the NVDA users list (screen readers), music-education disability groups, Deaf and hard-of-hearing musicians for the metronome and audio cues.
- **Pay people.** Disabled testers are asked to work for free constantly. A flat fee per session at a professional rate, paid promptly, is the norm; the amount and budget are the owner's decision.
- **Adjust the lab.** Screen recordings do not capture screen reader speech, so ask for system audio or run a live call. The lab's own pages and the feedback form have to pass the same checks, or the test filters out the people it is for.
- **Ask about tasks, not compliance.** "Could you set up a show and move a section?" A person who writes drill with a screen magnifier will find things no criterion names.
- Be straightforward in recruiting about what does not work yet, particularly the field for screen reader users, so nobody's time is wasted.

### Public accessibility statement and feedback channel

- A page on openmarch.com: the target (WCAG 2.2 AA), what works, **what does not work first**, which platforms and assistive technologies were tested, how to get the ACR, the date and the version it describes.
- A contact route: the Accessibility issue template, plus an email address for people who do not use GitHub. An in-app "Accessibility feedback" command that opens it.
- Generated from the ledger where possible, so it cannot drift from the report.
- Wording, any response-time promise and the email address are the owner's. Agents draft; they do not publish copy.

### ux-sim personas

Worth adding, with the limits written into the harness README:

| Persona       | Constraint given to the sim                                        | Objective output                                         |
| ------------- | ------------------------------------------------------------------ | -------------------------------------------------------- |
| Keyboard only | No pointer tool                                                    | Task done or not, key presses, dead ends                 |
| Screen reader | Sees only the accessibility tree text (`ariaDump`), no screenshots | Task done or not, unnamed controls it could not identify |
| Voice control | Can only activate a control by its visible text                    | Controls whose name does not contain the label           |
| Switch        | Tab, Shift+Tab, Enter, Space only                                  | Step counts per task                                     |
| Low vision    | Screenshots cropped to a magnified viewport                        | Lost context, things that scrolled away                  |
| Color vision  | Screenshots passed through a CVD filter                            | Places it could not tell states apart                    |

Limits:

- Sims report behavior only. They are a smoke test, never evidence in the VPAT and never a stand-in for people.
- Every persona is the same model. It reads a whole accessibility tree at once, where a screen reader user hears it linearly. It does not tire, has no muscle memory from other apps, and reads colors from pixels in ways no human does.
- Keep the outputs to countable things (completed, steps, dead ends). Opinions from a sim persona about how something feels for a disabled user are not data.

## 4. Roadmap

Legend: **U** = unsupervised-OK (objective done-check, reversible). **O** = needs an owner decision first. **U after O** = build is unsupervised once the pick is made.

### Now (foundation; nothing here changes how the app looks)

| #   | Item                                                                                                      | Done when                                                           | Who                                            |
| --- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------- |
| N1  | Recheck the VPAT findings on fork main with the existing scenarios                                        | Table of fixed / still present / changed, with run folders          | U                                              |
| N2  | `a11y` label, Accessibility issue template, epic and sub-issues on the fork                               | Issues exist with done-checks                                       | U (fork). Filing upstream: O                   |
| N3  | `docs/conventions/accessibility.md`, AGENTS.md pointer, verification row, PR template line                | `pnpm check:agent-guidance` passes                                  | U to draft; O to accept the definition of done |
| N4  | G2 + G3: jsx-a11y tiers, color and outline bans, ratchet script and baseline                              | `pnpm check:a11y` in `check:quick`; CI fails on a planted violation | U                                              |
| N5  | G4 token contrast test with `knownFailures`                                                               | Test in CI; today's failures listed with issue numbers              | U                                              |
| N6  | G6 action reachability test                                                                               | Test in CI; duplicates and single-key gaps baselined                | U                                              |
| N7  | G7 axe scan on the hand-listed screens with a baseline                                                    | Runs in `desktop-browser-e2e`; planted unnamed button fails it      | U                                              |
| N8  | G1 typed names on `@openmarch/ui` primitives                                                              | `tsc` fails on an icon button without a label; call sites fixed     | U                                              |
| N9  | Mechanical fix batch: names, labels, `lang`, document title                                               | Baseline counts drop; ledger rows updated                           | U                                              |
| N10 | Merge or port #1057's `docs/accessibility/README.md` and add `criteria.json` seeded from the 0.1.7 report | Counts in the README generate from the ledger                       | U                                              |
| N11 | ADR 0016 written as **proposed**                                                                          | Reviewable document                                                 | U to draft; **O to accept**                    |

### Next (the preferences system and the behavior checks)

| #   | Item                                                                                                                         | Who                                                                |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| X1  | Preferences store with OS sync and override; motion consolidation; `ThemeContext` becomes a reader                           | U after O (ADR accepted)                                           |
| X2  | Semantic token layer and migration of the roughly ten UI files and the canvas/three.js readers to `ResolvedTheme`            | U (parity check: screenshots before and after match)               |
| X3  | Fix the failing contrast pairs in the default themes (`text-subtitle` light, control borders, status colors)                 | **O**: changes the look; show options side by side                 |
| X4  | More-contrast theme and CVD-safe palette, with G5                                                                            | **O**: research and prototypes, owner picks, then U                |
| X5  | Settings UI for the preferences and profiles                                                                                 | **O** for layout and wording; U to build                           |
| X6  | G8 keyboard-only task specs and tab walk; failing tasks as `test.fail`                                                       | U                                                                  |
| X7  | Keyboard and focus fix batch (Enter/Space, focus return, traps, non-drag paths)                                              | U where the fix is standard; O where a new interaction is designed |
| X8  | G9 reduced-motion tests, G10 primitive tests                                                                                 | U                                                                  |
| X9  | axe scan walks the action registry; launch page and first-run covered                                                        | U                                                                  |
| X10 | Public accessibility statement and feedback route                                                                            | **O**: wording, promises, address                                  |
| X11 | First recruited sessions: color-vision and keyboard-only users from the community; contact the school's accessibility office | **O**: budget, outreach                                            |
| X12 | ux-sim disability personas with the limits documented                                                                        | U                                                                  |
| X13 | VPAT refresh for the next release using CI artifacts                                                                         | U to prepare; **O** signs                                          |

### Later

| #   | Item                                                                                  | Who                                                               |
| --- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| L1  | Non-visual access to the field (text alternative, marcher table view, announcements)  | **O**: the largest design question; research and prototypes first |
| L2  | Shortcut remapping and turning off single-key shortcuts                               | **O** for the design; U to build                                  |
| L3  | `forced-colors` support verified on Windows; NVDA pass in the Windows VM              | U to run; findings triaged as usual                               |
| L4  | Screen reader smoke automation                                                        | U, as a report, not a gate                                        |
| L5  | Contrast warnings in the field theme and color pickers                                | **O** for the look; U to build                                    |
| L6  | Text scale, larger targets, sticky modifiers                                          | **O** per feature                                                 |
| L7  | Paid assistive-technology panel sessions                                              | **O**                                                             |
| L8  | ESLint 9 move and native suppressions; pixel-sampled contrast; reflow and zoom checks | U                                                                 |
| L9  | Bring the web editor and tablet layout into the report's scope                        | **O**: scope of the public claim                                  |

## Decisions for the owner, in one list

1. Accept ADR 0016 (preferences store, tokens as the only color source, viewer preference overrides file colors at display time only).
2. Accept the definition of done and the rule that baselines only go down, with waivers needing your OK.
3. File the VPAT findings publicly on upstream, or keep them on the fork for now.
4. The look of the contrast fixes, the more-contrast theme and the CVD-safe palette (prototypes first).
5. The public statement's wording and what it promises.
6. Budget and outreach for testers with disabilities.
7. How far to go on non-visual access to the field.
8. Whether exports follow the viewer's palette or the file's.

## Risks

- **False comfort.** Green checks will be read as "accessible". Counter: the ledger and the statement lead with what is not covered, and the field stays "Does Not Support" until a person using a screen reader completes the core task.
- **Baseline gaming.** Covered above; the waiver path is loud rather than locked.
- **Ratchet fatigue.** A PR that touches a file with old violations is not forced to fix them, only not to add more. Keep it that way, or agents will route around the files.
- **E2E time and flake.** G7–G9 add an estimated 2–4 minutes to the fast job. If the keyboard specs flake, move them to their own job rather than weakening them.
- **Two repos.** The fork and upstream differ. Baselines live with the code they describe; the ledger records which version each row was checked on.
- **Token migration touching visuals.** X2 must be a no-visual-change refactor proved by screenshot parity, separate from X3, which changes colors on purpose.
