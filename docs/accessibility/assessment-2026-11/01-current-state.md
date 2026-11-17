# 01 — Current state (code facts)

Seat: current-state auditor. Read-only audit of the fork's `main` at `e1792b9b0`
(fork main), 2026-11-16. Paths below are relative to that
checkout; `S/` = `apps/desktop/src/`. Counts come from grep and are approximate. Nothing was run in a
browser, so "fixed" means "fixed in the code as read", not "verified with a scan or screen reader".

## TL;DR (decision-relevant facts)

1. **UI chrome is token-themed and a new theme is mostly a token swap.** About 1,640 token class uses
   against about 160 Tailwind palette classes and 5 arbitrary color classes. Light/dark is a `.dark`
   class on `<html>` that overrides about 12 CSS variables (`packages/ui/src/tailwind.css:77-145`).
   The timeline canvas already reads those variables at draw time and redraws when `class` or
   `data-theme` changes on `<html>` (`S/components/timeline/TimelineCanvas.tsx:40-57,110-132`).
2. **The drill field is not app-themed at all.** Its colors come from a per-show `FieldTheme` stored
   in the .dots file (`packages/core/src/field/FieldTheme.ts:31-50`, `FieldProperties.ts:23,125`), plus
   per-show section and tag appearances, plus a handful of hardcoded constants (selection blue, guide
   orange, pivot yellow, start-flag black/grey, and white/black SVG strokes in `FieldOverlay.tsx`). A
   high-contrast or color-blind field is therefore a **user-level override layer in front of the file
   theme**, not a token swap. There is one clean choke point: `theme: () => latest.current.theme ??
DEFAULT_FIELD_THEME` (`S/field/three/ThreeField.tsx:568`). The hardcoded field constants would need
   to move behind it.
3. **Settings live in three places.** electron-store over IPC holds theme, language, Basic/Expert and
   3D auto-open (`settings:get/set`, `apps/desktop/electron/main/index.ts:132,152`). localStorage holds
   `UiSettings`, input mode and shortcut overrides (`S/stores/UiSettingsStore.ts`,
   `InputModeStore.ts`, `ShortcutOverridesStore.ts`), synced across windows by `syncFromStorage`. The
   show file holds the field theme and appearances. **No accessibility setting exists today**: no UI
   scale, text size, reduced motion, contrast, color-vision or toast-duration option. The only zoom
   is Electron's menu-role zoom, which is not persisted.
4. **Reduced motion is respected piecemeal** (in 18 files), mainly where motion was built recently:
   timeline follow/glide, field zoom glide, overlays, 3D camera, the command palette and the shape
   editor. Global CSS (`styles/index.css`), Radix dialog/popover scale-ins (`--animate-scale-in`), the
   40 s infinite mobile-export marquee, toasts and most of the about 130 `animate-*`/`transition`
   uses are not gated. There is no app-level override; every guard reads `matchMedia` directly.
5. **There is a real central command registry.** It has 139 actions (`S/shortcuts/definitions.ts`), one
   keydown dispatcher (`S/shortcuts/ShortcutDispatcher.tsx`), user rebinding and unbinding
   (`ShortcutOverridesStore`), an accessible combobox command palette with a parameter-asking command
   bar (`S/shortcuts/palette/`), and an `expertOnly` flag that already gates actions by mode. This
   is the strongest existing foundation.
6. **The VPAT's top blocker is half-fixed.** Enter now reaches buttons. **Space on a keyboard-focused
   button in the editor still plays the show**, except inside shape-tool UI (`[data-shape-ui]`) and
   timeline move controls. The global `outline: none` rule is still there (`styles/index.css:240-245`),
   and the shared `Button`'s only focus cue is a 2 px lift (`packages/ui/.../Button.tsx:11-12`).
7. **The field (three.js) and the field canvas expose nothing to assistive tech.** They have no role,
   name, tabIndex or text alternative (`S/field/three/ThreeField.tsx:620-700`). There are also no
   actions to select one marcher or step through marchers. There are only 2 `aria-live` regions and
   13 `role="status"` regions in the app.
8. **There is no a11y tooling.** axe-core is in the lockfile only as a dependency of
   `eslint-plugin-jsx-a11y`, which runs only through `eslint-config-react-app`'s small default
   rule set. There are no axe tests, no a11y e2e and no `docs/accessibility` on fork main (it exists
   only on the unmerged branch `docs/accessibility-report`). There is one contrast unit test
   (`S/field/three/__test__/guideInk.test.ts`).
9. **Of the 23 VPAT findings:** 3 fixed or probably fixed, 9 partly fixed or changed, 8 still
   present, 3 not checkable from code (table in section 7). Separately, the field audit's
   "shortcuts can't be remapped" (2.1.4) is fixed.
10. **The best precedent for an "accessibility mode" is touch mode, not Basic/Expert.** Touch mode
    writes `<html data-input="touch">`, drives a custom Tailwind `touch:` variant used in about 69
    files and is set in Settings › Input (`InputModeStore.ts`, `tailwind.css:6-7`). Basic/Expert is
    the precedent for gating actions and features (`expertOnly`, `useIsBasicMode` in 23 files). It is
    a skill-level axis and is orthogonal to accessibility.

---

## 1. Theming and colors

### 1.1 Token system (UI chrome)

- Tokens live in Tailwind v4 `@theme` in `packages/ui/src/tailwind.css:38-115`. The light values are
  at 77-105 and the `.dark` overrides at 118-145. The names are `--color-bg-1`, `--color-stroke`,
  `--color-text`, `--color-text-subtitle` (60% alpha), `--color-text-disabled` (30%),
  `--color-accent`, `--color-red`, `--color-yellow`, `--color-green` and `--color-modal-*`, plus the
  surface gradients `--background-image-fg-1/fg-2/modal`.
- Dark mode is `@custom-variant dark (&:where(.dark, .dark *))` (`tailwind.css:5`). The theme is
  applied by toggling the `.dark` class (`S/context/ThemeContext.tsx:35-38`). It is stored in
  electron-store and follows the system on first run (`ThemeContext.tsx:27-55`). `index.html:2`
  ships `class="dark"`.
- There are only two themes. There is no `data-theme`, `forced-colors` or `prefers-contrast` handling
  anywhere (grep returned nothing).
- The desktop app adds keycap variables and a second legacy palette (`--foreground`, `--background`,
  `--accent-background`, ...) in `S/styles/index.css:9-19,250-294`. These are used by Sentry
  feedback and older bits.
- ESLint already enforces token **font sizes and radii** through `no-restricted-syntax`
  (`.eslintrc.cjs:7-25`). It does **not** enforce colors. A "token colors only" rule would slot
  into the same function.
- Usage: about 1,639 token class uses (`bg-fg-1`, `text-text`, `border-stroke`, `bg-accent`, ...),
  about 163 Tailwind palette classes (`red-500` and the like; worst are
  `ExportCoordinatesModal.tsx` 18, `ui/ColorPicker.tsx` 10, `TimelineClipPeel.tsx` 6,
  `MarcherCsvImportForm.tsx` 6 and `AnalyticsMessage.tsx` 6), 5 arbitrary `bg-[rgb(...)]` classes
  (mostly `startFlagInk.ts`), and 14 `dark:` overrides.

### 1.2 Hardcoded colors outside tokens

The strict count (quoted hex strings, `#rrggbb`, `0xrrggbb`, `rgb()`/`rgba()`/`hsl()`, excluding tests)
is **about 874** in `apps/desktop/src`. By area:

| Area                                 | Count                                                                                                                          | Nature                                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `view3d/`                            | ~726                                                                                                                           | Stadium kits, textures, lighting and uniforms. This is **scene art**, not UI, and is out of scope for a theme. |
| `components/`                        | ~76                                                                                                                            | Welcome ThemeStep preview, video export theme, coordinate sheet, pit preset pictures.                          |
| `styles/index.css`                   | ~32                                                                                                                            | Keycaps and the legacy palette.                                                                                |
| `components/timeline/` + `timeline/` | ~30                                                                                                                            | Track colors, waveform, start-flag ochre.                                                                      |
| `field/` + `shapes/`                 | ~13 strict, plus about 25 named constants and RGB tuples, plus about 25 `"white"`/`"black"` SVG literals in `FieldOverlay.tsx` | Selection, guides, pivot, start flag, overlay strokes.                                                         |
| `packages/core`                      | 8                                                                                                                              | `createFieldTheme` defaults.                                                                                   |
| `packages/ui`                        | 0                                                                                                                              | Fully tokenized.                                                                                               |

(The looser first count of about 2,070 mostly picked up issue numbers such as `#403` in comments.)

### 1.3 How each drawing color is chosen

| Element                                                                                                              | Source                                                                                                                                                                                                                                                                                                                                                                                   | Theme-swappable?                                                  |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------ |
| Field background, grid lines, yard numbers, previous/next path, shape, temp path, default marcher fill/outline/label | Per-show `FieldTheme` (`packages/core/src/field/FieldTheme.ts:31-50`; defaults: white background, grid `rgb(170)` and `rgb(221)` (about 2.3:1 and 1.3:1 on white), previous path black, **next path green `rgb(0,175,13)`**, **default marcher red**). Edited in Field › Customize (`S/field/editMode/panel/FieldSettings.tsx:524-538`).                                                 | No. It is data in the file. It needs an override layer.           |
| Marcher color/shape per section or tag                                                                               | Per-show `section_appearances` / tag appearances (`electron/database/migrations/schema.ts` ~222 `color_hex`, `S/db-functions/sectionAppearance.ts`), resolved in `S/hooks/queries/useMarcherAppearances.ts:114` and drawn by `S/field/three/marcherLooks.ts`. Shapes (circle, square, triangle, x) already exist (`FieldTheme.ts:12`), so a **non-color cue exists** but it is per file. | No (data).                                                        |
| Selection ring and box                                                                                               | Hardcoded `#0d6efd` (`S/field/three/selectionRing.ts:14-18`), reused for items (`itemsPlan.ts:96`) and route squares (`S/field/startFlagOverlay.ts:55`).                                                                                                                                                                                                                                 | Constant; easy to move behind a resolver.                         |
| Snap guide                                                                                                           | `GUIDE_INK = "#ea580c"` with white text (`S/field/three/guideInk.ts:8-11`). Contrast is documented and unit-tested.                                                                                                                                                                                                                                                                      | Constant.                                                         |
| Pivot, group seams, guide casing                                                                                     | `#facc15`, `#4b5563`, `rgba(0,0,0,.35)` (`FieldOverlay.tsx:95,112,123`), plus many `fill="white"`/`stroke="black"` (`FieldOverlay.tsx:305-1389`).                                                                                                                                                                                                                                        | Constants.                                                        |
| Start-flag dots and paths on the field                                                                               | `START_FLAG_DOT_COLOR` black, path grey, route tail grey (`S/field/startFlagOverlay.ts:39-67`).                                                                                                                                                                                                                                                                                          | Constants.                                                        |
| Line interval groups                                                                                                 | **Okabe-Ito color-blind-safe palette** (`S/shapes/field/groupDrawing.ts:7-19`). This is an existing precedent.                                                                                                                                                                                                                                                                           | Constant.                                                         |
| Timeline playhead, flags, selection                                                                                  | DOM with `bg-accent`/`border-accent` (`TimelinePrimitives.tsx:2776,3256,3299,3708`).                                                                                                                                                                                                                                                                                                     | **Yes, token.**                                                   |
| Timeline canvas (ruler, ticks, waveform areas)                                                                       | Reads `--color-stroke`, `--color-text`, `--color-accent` and `--color-text-subtitle` from computed style, cached per theme, re-read on `<html class                                                                                                                                                                                                                                      | data-theme>` change (`TimelineCanvas.tsx:40-57,110-132,318-429`). | **Yes, token.** A `data-theme` attribute is already watched. |
| Start flag (timeline, transport, badge)                                                                              | `START_INK` arbitrary ochre `rgb(150,120,0)` in light mode, `yellow` token in dark (`S/components/timeline/startFlagInk.ts:6-20`).                                                                                                                                                                                                                                                       | Half: needs a token.                                              |
| Move/clip track colors                                                                                               | 8 fixed hex values (`S/timeline/timelineViewModel.ts:107-116`).                                                                                                                                                                                                                                                                                                                          | Constant list; would need a CVD-safe alternative.                 |
| Waveform                                                                                                             | `rgb(180,180,180)` plus the accent copied as literals (`S/components/timeline/audio/AudioPlayer.tsx:40-42`).                                                                                                                                                                                                                                                                             | Constants that duplicate tokens.                                  |
| Tempo lanes                                                                                                          | Read CSS variables (`S/tempo/tempoLanesLayout.tsx:131`), with 7 literals in `TempoBand.tsx`.                                                                                                                                                                                                                                                                                             | Mostly yes.                                                       |
| 3D View                                                                                                              | Scene art and uniform presets (`S/view3d/core/...`).                                                                                                                                                                                                                                                                                                                                     | Out of scope, except that performers use section appearances.     |

**Verdict.** A high-contrast or CVD **app theme** for chrome, timeline and tempo is a token swap.
It needs a third variant (for example `<html data-theme="hc">` or `data-contrast="more"`), about 12
variables and cleanup of about 160 palette classes. The **field** needs a small refactor: a
"display theme" resolver that layers user overrides (contrast, color-vision palette, forced shapes,
thicker strokes) over the file's `FieldTheme` at `ThreeField.tsx:568`, with about 25 hardcoded
field constants moved into it. That refactor is medium, not big. The file format does not need to
change.

## 2. Settings infrastructure

| Store                                                                                                                    | Persistence           | A11y-relevant contents today                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| electron-store via `settings:get/set` IPC (`electron/main/index.ts:132-160`), broadcast to windows (`onSettingsChanged`) | App-wide, per machine | `theme`, `language`, `editorMode` (Basic/Expert, `S/stores/EditorModeStore.ts:10`), `view3dAutoOpen`, Tolgee dev keys                                                                                                                                                                                                                                                                 |
| `UiSettingsStore` (`S/stores/UiSettingsStore.ts`, key `openmarch:uiSettings`, `syncFromStorage` cross-window)            | localStorage          | `marcherLabels` / `marcherLabelSize` (small 0.7, normal 1, large 1.4; `:117-121`), `marcherLabelPosition`, `gridLines`/`halfLines`, `fieldPerformanceMode` (low-quality field, which also cuts motion), `timelineWaveformStyle`, `timelineCompact`, `mouseSettings.zoomSensitivity`/`trackpadPanSensitivity`, `stepSizeWarnings`, `showCollisions`, `nextPaths`, `startFlagPositions` |
| `InputModeStore` (`openmarch:inputMode`)                                                                                 | localStorage          | auto / touch / mouse. Writes `<html data-input>` (`InputModeStore.ts:104`). Touch gives 44 px targets (`tailwind.css:31-36`).                                                                                                                                                                                                                                                         |
| `ShortcutOverridesStore` (`openmarch:shortcutOverrides`)                                                                 | localStorage          | Add, remove or reset bindings for any action (`ShortcutSettings.tsx:247`)                                                                                                                                                                                                                                                                                                             |
| Show file (SQLite)                                                                                                       | Per show              | Field theme, section and tag appearances                                                                                                                                                                                                                                                                                                                                              |

The Settings window is a section registry (`S/settings/sections.ts`, `ALL_SETTINGS_SECTIONS`): General,
Appearance, Input, Mouse, Timeline, Field, 3D View, Shortcuts, Privacy, Developer and Database. Each
section has `searchKeys`, and a user-guide generator checks each setting against the docs
(`sections.ts:62-66`). Appearance currently holds Light/Dark, full file path and performance mode
(`S/components/launchpage/settings/AppearanceSettings.tsx`). The welcome flow has Language, Theme, Mode
and Analytics steps (`S/components/welcome/steps/`).

**Missing:** UI scale or text size (only Electron `zoomIn`/`zoomOut` menu roles, which are not
persisted: `electron/main/application-menu.ts:209-211`, `TitleBar.tsx:36-44`), reduced-motion
override, contrast, color-vision, focus-ring strength, toast duration, "Space never plays while a
control is focused", and screen-reader announcement verbosity.

## 3. Motion

- Respecting `prefers-reduced-motion` (18 files): `S/components/timeline/reducedMotion.ts` (helper),
  `useTimelineFollow.ts:357` and `timelineFollow.ts:226-233` (follow-playhead glide becomes a cut),
  `TimelinePrimitives.tsx:22`, `TimelineHoldBars.tsx:202`, `S/field/three/fieldNavigation.ts:144`
  (zoom-fit glide), `FieldOverlay.tsx:728`, `useTimelineVisuals.ts`, `S/view3d/window/camera/CameraRig.tsx:92`
  and `rigController.ts:40` (jump instead of fly), `Scene.tsx`, `S/shortcuts/palette/CommandPalette.css:345`,
  `S/shapes/editor/ShapeEditorSurface.css` (unit-tested), `ShapeEditorBar.tsx`, `RecalculateButton.tsx`,
  `shapeToolMode.ts`, `S/components/welcome/CyclingText.tsx:9`, `WhatsNewTour.tsx`. E2E emulates
  reduced motion in `e2e/browser/tests/box-tool.spec.mts:551,3441,4144`.
- Not respecting it: global CSS keyframes in `packages/ui/src/tailwind.css` (`scale-in/out`,
  `fade`, `scroll-x/y`, `spin-slow`), which are used by Radix dialogs and popovers; the
  **mobile-export marquee, 40 s infinite** (`S/styles/index.css:111-122`, used at
  `MobileExportModal.tsx:454`); react-spring in `MobileExportView.tsx`; tempo-mode fades
  (`App.tsx:249-253`); and most of about 52 `animate-*` and about 77 `transition` class uses. There are
  only 4 `motion-safe:`/`motion-reduce:` class uses.
- There is no app-level override. Every guard calls `matchMedia` itself, so an in-app "Reduce
  motion" switch would need to replace those reads with one helper or store. The timeline already has
  one helper (`reducedMotion.ts`), which could become that single source.

## 4. Keyboard and command system

- **Registry.** `S/shortcuts/definitions.ts` defines 139 actions. Each has a `labelKey`, a `category`,
  a `scope` (`global`, `canvas` or `fieldEdit`), `defaultBindings`, `allowInInputs`, `allowInModals`,
  `hiddenFromPalette`, `expertOnly` (`:42-80`) and an optional `params` list that the command bar asks
  for. Handlers register through `useActionHandler` (`S/shortcuts/handlers/*`). Buttons use
  `ActionButton`, whose label is live-translated through `useTranslate` (`ActionButton.tsx:97,195,218`).
- **Dispatcher.** There is a single window keydown listener (`ShortcutDispatcher.tsx:29-140`), mounted
  app-wide including on the launch page (`App.tsx:281`). It skips text inputs (`context.ts:3-10`),
  defers to open modal layers unless an action sets `allowInModals` (`context.ts:13-41`,
  `keymap.ts:284-296`), and only calls `preventDefault` when an action resolves and runs.
- **Palette.** ⌘K / `/` opens the command palette (`palette/CommandPalette.tsx`). It is an ARIA
  combobox with `aria-activedescendant` (`:396-401`). The only extra palette sources are actions and
  shapes; there is **no marcher, page or section source**, so the taste doc's typed `m5` selection
  (`taste.md` "Typed names favor selection") is not in the palette.
- **Keyboard coverage gaps for the core task.** There is no action to select a single marcher,
  step to the next or previous marcher, or select by section/drill number from the keyboard. Only
  `selectAllMarchers` and `toggleLassoSelect` exist. Select › Select by is a toolbar popover. Moving
  works by nudge (arrow keys, 5 step sizes, `definitions.ts:82-160`). Typed coordinates in the
  Inspector are still `disabled` (`S/components/inspector/MarcherEditor.tsx:838-846,950`).
  Timeline: page-flag grips are focusable buttons that move with ←/→
  (`TimelinePageFlagGrips.tsx:466-545`), and hold edges, clip resize, loop bar and keyframes all have
  `tabIndex` plus `onKeyDown`.
- **Enter/Space.** Enter is free unless the shape tool is active (`applyShape`,
  `definitions.ts:798-803`) or field edit mode is on (`fieldEditEditLine`, `:1202-1207`). **Space =
  `playPause` in `canvas` scope** (`definitions.ts:334-341`). The dispatcher returns early only for a
  `:focus-visible` control inside `[data-shape-ui]` (`ShortcutDispatcher.tsx:64-75`) and for timeline
  move controls (`timelineHotkeys.ts:109-116`). So a Tab-focused toolbar, sidebar or inspector button
  plus Space starts playback instead of pressing the button. Inside Radix dialogs, menus and listboxes,
  Space and Enter work, because `modalOpen` filters out `playPause`.
- **Focus.** `index.css:240-245` still sets `input, button, textarea, :focus { outline: none }`. A
  custom `focus-visible` variant hides rings after mouse clicks (`index.css:7`,
  `S/utilities/clickFocus.ts`, installed in `main.tsx:21`). There are about 147
  `focus-visible:ring|outline` uses, so many controls now have rings, but the base `Button` only lifts
  2 px (`packages/ui/src/components/base/Button.tsx:11-12`), and 29 other places use the
  `focus-visible:-translate` lift alone. `DialogTitle`'s close X is an `XIcon` passed to `Radix.Close
asChild`, so it is an SVG, not a focusable button (`packages/ui/src/components/base/Dialog.tsx:38-43`).

## 5. Screen-reader surface

- Counts (src plus packages/ui, excluding tests): `aria-label` 317, `aria-hidden` 166,
  `aria-pressed` 35, `aria-describedby` 22, `role="status"` 13, `aria-checked` 12, `sr-only` 11,
  `role="alert"` 8, `aria-invalid` 6, `aria-valuenow` 3, **`aria-live` 2**
  (`TimelineClipPeel.tsx:268,283`), `role="application"` 0. Of the base primitives, `Slider` now
  _requires_ `aria-label` (`packages/ui/.../Slider.tsx:7-16`). The transport buttons have
  `aria-pressed` and `aria-keyshortcuts` (`TransportButtons.tsx:122-127`).
- **Field.** The R3F `<Canvas>` (`ThreeField.tsx:654`) and its wrapper (`:620-629`, only
  `data-testid`) have no role, name, description or tabIndex. The SVG overlay (`FieldOverlay.tsx`)
  is decorative. There is no text alternative, no live announcement of selection or page, and no
  marcher list with coordinates. A useful raw seam does exist: `window.fieldTest`
  (`S/field/fieldTestApi.ts`, `three/threeFieldTestApi.ts`) already computes per-marcher looks and
  positions for tests, and an accessible "field table" could be built from the same editor state
  (`S/field/editor/`).
- **Timeline.** It is DOM, mostly named controls (15 `aria-label` in `TimelinePrimitives.tsx`, plus
  status regions in `TimelineIsolationBar.tsx:486,583`, `TimelineHoldEdges.tsx:431` and
  `TimelinePageFlagGrips.tsx:608`). The playback position and clock (`Clock.tsx`) have no role or
  live region.
- **Document.** `index.html:2` has a fixed `lang="en"`, and `main.tsx:77-100` changes the Tolgee
  language without updating `document.documentElement.lang`. The main window has no `<title>`. Only
  Settings and 3D set `document.title` (`SettingsWindow.tsx:19`, `View3dRoot.tsx:116`).

## 6. Tooling and docs

- **Lint.** `.eslintrc.cjs` extends `react-app`, which brings `eslint-plugin-jsx-a11y@6.10.2`
  (`pnpm-lock.yaml:8191`) with CRA's small warn-level rule set (alt-text, aria-props, aria-role and
  similar). `plugin:jsx-a11y/recommended` is not enabled, and nothing enforces color tokens.
- **axe.** `axe-core@4.11.2` is in the lockfile only as a dependency of jsx-a11y. There is no use in
  `e2e/` or `src/`.
- **Tests.** About 118 test files query by role or accessible name (`getByRole`), which gives implicit
  coverage of names. There is one contrast test (`S/field/three/__test__/guideInk.test.ts:14-22`), and
  the shape editor has a reduced-motion CSS test. Browser e2e (`apps/desktop/e2e/browser/`, run in CI
  as `desktop-browser-e2e`) is a natural place for an axe pass. The VPAT harness
  (the v0.1.7 audit scenario `a` (kept outside the repo)11y.mjs`, `scan-lib.mjs` with its gradient-flattening contrast pass) exists
  outside the repo.
- **Docs.** `docs/accessibility/README.md` is **not on fork main**. It is on branch
  `docs/accessibility-report` (commits 575052529, c808e5ffa, 90f931051; upstream PR #1057, not
  merged). The conventions mention a11y only in passing: icon-only buttons need a name
  (`docs/conventions/tablet-parity.md:64-65`) and aria text must be translated
  (`docs/conventions/localization.md:19-25`). `verification.md` has no a11y step.

## 7. The 23 VPAT findings, rechecked on fork main

These were checked by reading code only. A rescan is needed before any public claim. The numbers
follow the report doc's "Findings and evidence" table.

| #   | Finding (0.1.7)                                                                                       | Fork main status                                                                                                                                                                                                                       | Evidence                                                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | Enter/Space never press buttons                                                                       | **Partly fixed.** Enter passes, except with the shape tool active or in field edit mode. Space still plays from a focused editor control outside shape UI and timeline move controls. The launch page and dialogs are fine.            | `ShortcutDispatcher.tsx:64-75`, `definitions.ts:334-341,798-803`, `timelineHotkeys.ts:109-116`                              |
| 2   | Icon-only buttons/links unnamed                                                                       | **Largely fixed** in spot checks (title bar, file controls, sidebar launchers, panel close, launch social links). Needs a rescan.                                                                                                      | `TitleBar.tsx:199-294`, `FileControls.tsx:76,122`, `SidebarModal.tsx:94`, `LaunchPage.tsx:254-287`, `MetronomeModal.tsx:68` |
| 3   | Field has no name, role or focus; marchers not exposed or keyboard-pickable                           | **Still present (changed).** Fabric was replaced by three.js, but the same gaps remain, and there is no select-one or next-marcher action.                                                                                             | `ThreeField.tsx:620-700`, action list in `definitions.ts`                                                                   |
| 4   | Page counts drag-only; page boxes unfocusable                                                         | **Partly fixed (changed).** The page era was removed. Page-flag grips are focusable and move with the arrow keys. Inspector counts are display-only. The "+" menus are keyboard reachable. Selected-page exposure is unknown.          | `TimelinePageFlagGrips.tsx:466-545`, `PageEditor.tsx:72-81`                                                                 |
| 5   | Focus outline removed app-wide                                                                        | **Partly fixed.** About 147 components add rings, but the global `outline:none` and the 2 px-lift-only `Button` remain.                                                                                                                | `styles/index.css:240-245`, `Button.tsx:11-12`                                                                              |
| 6   | Inspector coordinates read-only                                                                       | **Still present.** The inputs are `disabled`. Nudge keys are the workaround.                                                                                                                                                           | `MarcherEditor.tsx:838-846,950`                                                                                             |
| 7   | Unlabelled inputs and switches; "Slider"; "[object Object]"                                           | **Partly fixed.** `Slider` requires a label. The three metronome `Switch`es still have no label association.                                                                                                                           | `MetronomeModal.tsx:86-108`, `Slider.tsx:7-16`                                                                              |
| 8   | Clickable non-buttons; dialog close X                                                                 | **Partly fixed.** The feedback control is now a `<button>` (`BugReport.tsx:25-30`). The timeline marker divs are gone with the old beat editor. The dialog close X is still an SVG. `AudioSelector.tsx:92` has a clickable `div`.      | `Dialog.tsx:38-43`                                                                                                          |
| 9   | Form errors not identified                                                                            | **Probably still present.** Only 6 `aria-invalid` in the app, none in `MarcherForm.tsx`. Can't confirm without a run.                                                                                                                  | grep                                                                                                                        |
| 10  | Launch Tab order, wizard focus, focus lost after dialogs and playback                                 | **Can't tell from code.** The launch page `Tabs.List` still wraps the New/Open buttons. The wizard was reworked (`NewShowDialog.tsx`).                                                                                                 | `LaunchPage.tsx:186-322`                                                                                                    |
| 11  | Timeline edit mode blocks Tab                                                                         | **Fixed by removal.** The old timeline focus and beat editor were deleted (`7a05ec05a`), and `EditableAudioPlayer.tsx` is gone.                                                                                                        | git log                                                                                                                     |
| 12  | Tag priority drag-only                                                                                | **Still present.** `PointerSensor` only, no `KeyboardSensor`.                                                                                                                                                                          | `TagAppearanceList.tsx:31,231`                                                                                              |
| 13  | No reflow at 320 px; 200% overlap                                                                     | **Changed, still fails reflow.** The minimum window is 768×600 (was 1000) and a notice appears below 744×500. 320 px reflow is not attempted.                                                                                          | `electron/main/index.ts:228-232`, `WindowTooSmallNotice`                                                                    |
| 14  | `lang` stays English; English names                                                                   | **Still present** for `lang`. Translated names are improved (i18n audit `5265ffb86`).                                                                                                                                                  | `index.html:2`, `main.tsx:77-100`                                                                                           |
| 15  | Menus from plain buttons, invalid lists, launch tab list                                              | **Partly fixed.** Radix `DropdownMenu` now powers Alignment and other menus (14 `role=menu*`). `MarcherList` is still built from `<p>`, and the launch `Tabs.List` still holds non-tabs.                                               | `AlignmentTab.tsx:14,89`, `MarcherList.tsx:169-384`, `LaunchPage.tsx:186`                                                   |
| 16  | Input/checkbox borders about 1.2:1; field grid below 3:1                                              | **Still present.** `border-stroke` is `rgba(0,0,0,.1)`, and the default grid is `rgb(170)`/`rgb(221)`.                                                                                                                                 | `tailwind.css:81`, `Checkbox.tsx:10`, `FieldTheme.ts:35-36`                                                                 |
| 17  | Light secondary text about 4.0:1, version 3.1:1, white swatch labels                                  | **Still present** for the token (`text-subtitle` at 60% alpha). The others can't be told without a scan.                                                                                                                               | `tailwind.css:83`                                                                                                           |
| 18  | State by color only                                                                                   | **Can't tell from code.** The default next path (green) next to the default red marcher is still a red/green pairing.                                                                                                                  | `FieldTheme.ts:41,46`                                                                                                       |
| 19  | Status not announced; toasts 4 s; Alt+T clash                                                         | **Partly fixed.** The Alt+T clash is gone (old timeline focus removed). Transport toggles expose `aria-pressed`. Toasts are still sonner's default 4 s (2.5 s in touch mode). There is no live region for playback, page or selection. | `Toaster.tsx:175-195`, `toastDurations.ts:2,9`, `TransportButtons.tsx:127`                                                  |
| 20  | No document title; "OpenMarch - undefined"                                                            | **Still present.** `createWindow("OpenMarch - " + store.get("databasePath"))`.                                                                                                                                                         | `electron/main/index.ts:579-580`                                                                                            |
| 21  | Smaller items (auto-scroll, label-in-name, selects on change, Ctrl+= zoom, undo/confirm, describedby) | **Mostly still present.** The marquee is still infinite and unpausable. Zoom is still menu roles only. The rest are unchecked.                                                                                                         | `index.css:111-122`, `application-menu.ts:209-211`                                                                          |
| 22  | Analytics consent dialog keyboard trap                                                                | **Changed.** `AnalyticsOptInModal.tsx` is gone, and consent is now a welcome-flow step (`welcome/steps/AnalyticsStep.tsx`). Needs a keyboard re-test.                                                                                  | file tree                                                                                                                   |
| 23  | Action names keep the old language                                                                    | **Probably fixed.** `RegisteredActionButton` was replaced by `ActionButton`, whose label is computed from `useTranslate` on each render.                                                                                               | `ActionButton.tsx:97,195,218`                                                                                               |

Tally: fixed or probably fixed 3 (#11, #23, and most of #2); partly fixed or changed 9 (#1, 4, 5, 7,
8, 13, 15, 19, 22); still present 8 (#3, 6, 12, 14, 16, 17, 20, 21); can't tell 3 (#9, 10, 18).
Also from the field audit: F-field-9, "single-letter shortcuts can't be turned off or remapped"
(WCAG 2.1.4), is **fixed** by `ShortcutOverridesStore` and Settings › Shortcuts.

## 8. Seams

### 8.1 An "Accessibility" settings module

- **Section.** Add `{ id: "accessibility", ... }` to `ALL_SETTINGS_SECTIONS` (`S/settings/sections.ts`).
  It picks up search, the sidebar and the user-guide generator check for free.
- **Store.** Use a new `AccessibilitySettingsStore` modelled on `InputModeStore` (localStorage plus
  `syncFromStorage`), or electron-store keys like `theme` and `editorMode` if it must reach the
  Settings and 3D windows through `onSettingsChanged`. **Write the result to `<html>` data
  attributes** (`data-contrast`, `data-motion`, `data-cvd`, `data-focus="strong"`) the way
  `InputModeStore.ts:104` writes `data-input`, and add Tailwind custom variants beside `touch:`
  (`tailwind.css:5-7`). The timeline canvas already re-reads tokens when `data-theme` changes
  (`TimelineCanvas.tsx:57`).
- **Motion.** Turn `S/components/timeline/reducedMotion.ts` into the single
  `prefersReducedMotion()` (system OR in-app setting), replace the 18 direct `matchMedia` reads, and
  add one CSS rule under `[data-motion="reduce"]` for the keyframe tokens and the marquee.
- **UI scale.** Persist an Electron `webFrame.setZoomFactor` (the preload already exposes
  `getZoomFactor`, `electron/preload/index.ts:265`). The type ramp is all `rem`-based
  (`tailwind.css:52-60`), and `--spacing: 0.0625rem` makes Tailwind spacing scale too, so a root
  font-size scale is also viable.
- **Field display theme.** Use a resolver at `ThreeField.tsx:568` (and `useMarcherShapeOf` at
  `:340`) that merges user overrides into the file theme. Move `selectionRing.ts`, `guideInk.ts`,
  `startFlagOverlay.ts:39-67` and the `FieldOverlay.tsx:95-123` constants behind it. A "forced
  shapes per section" or "Okabe-Ito sections" override reuses the existing shape support and
  `groupDrawing.ts`'s palette.
- **First run.** Add an Accessibility (or "Display") step in the welcome flow beside
  Theme/Mode (`S/components/welcome/steps/`, `welcomeFlowSteps.ts`).

### 8.2 A keyboard-only or precision editing mode

- **Basic/Expert is the wrong axis but the right mechanism.** `EditorModeStore` (electron-store,
  `isBasicMode()`/`useIsBasicMode()` in 23 files) and `ActionDefinition.expertOnly`
  (`definitions.ts:68-72`, also honoured by the palette, the Shortcuts dialog and `global/menuActions.ts`)
  show how a mode can gate actions and UI. A keyboard or precision mode would add a parallel flag
  (for example `keyboardFirst`) or a per-action `requiresPointer` marker, not a third value of
  `EditorMode`.
- **Space conflict.** The fix belongs in `ShortcutDispatcher.tsx:64-75`. Generalize the
  `[data-shape-ui]` exemption to any `:focus-visible` button, link, `role=button/switch/tab/menuitem`
  or `[data-timeline-own-keys]`, or offer a setting that removes `playPause`'s bare-Space binding (the
  overrides store already supports this).
- **Field keyboard model.** New registry actions (`selectNextMarcher`, `selectPreviousMarcher`,
  `selectBySection`, `goToMarcher`, `setCoordinates` with `params` that the command bar asks for)
  plus a palette source for marchers, pages and sections (`usePaletteSource`,
  `S/shortcuts/palette/sources.ts:52-75`). This matches the taste rules "every feature is a command"
  and "typed names favor selection". Typed coordinates could reuse the command bar's `ActionParam`
  (`definitions.ts:24-40`) rather than reviving the disabled Inspector inputs.
- **Screen-reader text alternative.** A focusable field region (`role="application"` or a grid)
  backed by an off-screen table built from the field editor state, with a polite live region
  announcing selection, page and count changes. The editor is renderer-free (`S/field/editor/`,
  ADR 0005), so this does not touch three.js.
- **Precedent to copy.** Touch mode: one store, one `<html>` attribute, one Tailwind variant, a
  Settings › Input choice and a parity doc (`docs/conventions/tablet-parity.md`). An
  `docs/conventions/accessibility.md` plus a CI axe pass in `e2e/browser` would be the "system going
  forward".
