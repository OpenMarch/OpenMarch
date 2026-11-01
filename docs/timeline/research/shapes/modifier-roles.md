<!-- cspell:words Cubase Ableton Inkscape keyup -->

# Modifier roles: one map from keys to what they mean

Status: accepted 2026-10-29 (version A), after review with the owner, for the shape host (built on `shapes/host`, merged to fork `main` as #363). The implementation ticket is linked from the pull request.

## Why

The team can't settle Shift or Alt for fine control, and a tester asked for Shift. Today every
gesture reads `event.altKey` and friends itself, so changing the key for "fine" means editing a
dozen files, and the keys already mean different things in different parts of the app (below). The
proposal: gestures ask for a **role** (`fine`, `constrain`, `fromCenter`), and one module maps the
physical keys to roles. No snapping becomes a UI toggle instead of a held key. The owner picked
version A: Shift = fine, $mod = constrain, Alt = from center (section 5).

Prior research on what other tools do (sources in the shape-host research notes,
`modifier-conventions.md`):

- Shift = constrain (equal sides, 15°/45° steps) is close to universal in 2D design tools: Figma,
  Sketch, Illustrator, Photoshop, Affinity, Keynote, SketchUp. Inkscape uses Ctrl.
- Alt = from center in Figma, Sketch, Illustrator and Photoshop.
- No snapping = Cmd/Ctrl in Figma, Sketch and Photoshop.
- Fine control has no standard. Shift in Blender (1/10) and the DAWs (Logic, Ableton 12, Cubase);
  Cmd/Ctrl in After Effects and Maya. 2D design tools mostly have none. "Alt = fine" is
  OpenMarch's own choice.

## 1. Audit: where the app reads modifiers today

Searched `timeline/shapes/host` at 69285ea97 for `altKey|shiftKey|metaKey|ctrlKey|getModifierState|
isMacPlatform|keysOf` and for the normalized fields they feed (`pointer.shift/alt/ctrl/meta`,
`keys.*`, `env.shift/fine/mod/snap/pull`, `isShiftHeld`, `isRangeModifier`). Tests excluded.
**167 raw hits in 54 files, about 70 distinct reads.** No code uses `getModifierState`.

Paths are under `apps/desktop/src/` unless they start with `packages/`.

### Pointer gestures: these become roles

The Role column is from the first draft. In the revised model (section 2), `noSnap` becomes the
Snap toggle (the timeline keeps Alt), and `pivot` becomes the `reachInside` press choice.

Shape tool, frame and placed boxes. All of them go through `keysOf` → `toolEnvFor`, which is
already a small role layer (`snap`, `pull`, `fine`, `shift`, `mod`):

| Where                                                                             | Key                                           | What it does                                                                             | Role                                                                |
| --------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `shapes/field/fieldModeBase.ts:24` `keysOf`                                       | Shift, Alt, $mod (Cmd on Mac, Ctrl elsewhere) | Reads the keys off a `FieldPointer` for every shape gesture                              | **Becomes `rolesOf`**                                               |
| `shapes/tool/toolEnv.ts:50-56`                                                    | Alt                                           | `fine`: off the half-step ladder; guides still pull; `gridSnap` returns the point as is  | `fine`                                                              |
| `shapes/tool/toolEnv.ts:50-51`                                                    | $mod                                          | `snap` and `pull` both off: nothing snaps (owner on #453)                                | `noSnap`                                                            |
| `shapes/box/boxGeometry.ts:777, 1025`                                             | Shift                                         | Equal across and deep spacings while drawing or dragging a corner                        | `constrain`                                                         |
| `shapes/box/edgePull.ts:76`                                                       | Shift                                         | No edge pull while equalizing                                                            | `constrain` (side effect)                                           |
| `shapes/kinds/line.ts:131-133`, `arc.ts:322-323`, `curve.ts:199`, `circle.ts:152` | Shift                                         | Endpoint or rim snaps to 45°                                                             | `constrain`                                                         |
| `shapes/kinds/block.ts:352`                                                       | Shift                                         | Block rotation handle snaps to 15°                                                       | `constrain`                                                         |
| `shapes/frame/frame.ts:264-265`, `shapes/frame/gestures.ts:386`                   | Shift                                         | Rotation in whole degrees instead of 15° steps; Alt or $mod frees it                     | `constrain` today. Note that 1° is _finer_ than the default, see Q3 |
| `shapes/frame/gestures.ts:120`                                                    | $mod                                          | Pressing the center grabs the pivot instead of the shape                                 | `pivot` (another target, not a drag modifier)                       |
| `shapes/frame/gestures.ts:186`, `shapes/frame/pivot.ts:60`                        | Alt                                           | Pivot drag doesn't snap to marchers                                                      | `fine`                                                              |
| `shapes/placed/liveBoxMode.ts:159, 192, 239`, `shapes/tool/shapeToolMode.ts:336`  | via `keysOf`                                  | Same env as the tool                                                                     | (all roles)                                                         |
| `shapes/editor/ScrubNumber.tsx:161-163`, `shapes/editor/scrub.ts:15-18, 30-39`    | Alt, Shift, $mod                              | Number scrub: Alt = hundredths of a step (#411); $mod = no snap; Shift is passed through | `fine`, `noSnap`, `constrain`                                       |
| `shapes/tool/ShapeToolKeys.tsx:51`, `shapes/placed/PlacedBoxKeys.tsx:78`          | none: `alt: !nudge.snap`                      | Keyboard nudge maps a no-snap nudge onto the Alt env                                     | Should ask for `fine` by role, not fake Alt                         |

Field editor (the three.js field, #193 to #198), through `field/three/fieldPointerInput.ts:31-34`,
which copies `shift/alt/ctrl/meta` onto `FieldPointer`:

| Where                                                                                       | Key               | What it does                                                                               | Role                                                                       |
| ------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `field/editor/moveGesture.ts:98-107`, `field/editor/moveRules.ts:117`                       | Alt               | Precision drag at quarter speed; pressing Alt mid-drag re-anchors on the drawn spot (#197) | `fine`                                                                     |
| `field/editor/moveRules.ts:44`                                                              | Shift or Alt      | Marcher drag doesn't snap to the grid                                                      | `noSnap` (Shift); Alt via `fine`                                           |
| `field/editor/transformGestures.ts:91, 137-146`, `field/editor/itemTransform.ts:144`        | Alt; Shift or Alt | Precision on handle drags; rotation free of 15° steps                                      | `fine`; `noSnap`                                                           |
| `field/editor/transformGestures.ts:96`, `field/editor/groupTransform.ts:161`                | Shift             | Corner scale stops being proportional (`free`)                                             | `constrain`, inverted: here proportional is the default and Shift frees it |
| `field/editor/fieldEditor.ts:595, 996-1007`                                                 | Shift             | Click adds or removes; a Shift press on a group member toggles the group and doesn't drag  | **Selection**, not a drag modifier                                         |
| `field/editor/areaGestures.ts:81, 123`                                                      | Shift             | Marquee and lasso add to the selection                                                     | **Selection**                                                              |
| `field/editor/fieldEditor.ts:420`                                                           | Ctrl or Meta      | The prop tool ignores the press                                                            | Selection/other                                                            |
| `field/editor/view.ts:250-254`, `field/three/fieldNavigation.ts:311`, `fieldEditor.ts:1185` | Mac Ctrl+left     | Pans (it is a right-click on a Mac)                                                        | **Navigation**, never assignable                                           |
| `field/editor/view.ts:208`, `fieldNavigation.ts:398`                                        | Ctrl/Meta + wheel | Pinch zoom                                                                                 | Navigation                                                                 |

Timeline drags:

| Where                                                                                                                                                              | Key      | What it does                                                                      | Role                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | --------------------------------------------------------------------------------- | ------------------------- |
| `components/timeline/TimelineGeometry.ts:549` `isPageSnapDisabled`                                                                                                 | Alt      | Page and beat snapping off                                                        | `noSnap`                  |
| `TimelinePageFlagGrips.tsx:276-288, 383, 400`                                                                                                                      | Alt      | Page flag drag without snapping                                                   | `noSnap`                  |
| `TimelinePrimitives.tsx:574-584, 667-669, 3166, 3234-3238`                                                                                                         | Alt      | Playhead scrub and seek without snapping                                          | `noSnap`                  |
| `TimelineLoopBar.tsx:77-80, 129, 145`                                                                                                                              | Alt      | Loop ends without snapping                                                        | `noSnap`                  |
| `visuals/VisualsCueBand.tsx:262, 292, 324`                                                                                                                         | Alt      | Cue drag without snapping                                                         | `noSnap`                  |
| `TimelinePrimitives.tsx:3094` `isRangeModifier`, `:630, 1731, 1791, 3254`, `TimelineClipResize.tsx:488`, `TimelinePageFlagGrips.tsx:315`, `VisualsCueBand.tsx:210` | $mod     | A drag draws a range instead of scrubbing (UI-12); clips and grips let it through | `range` (press-time mode) |
| `TimelinePrimitives.tsx:637, 3258`                                                                                                                                 | Mac Ctrl | Context menu, not a seek                                                          | Navigation/other          |

### Not gesture modifiers: stay as they are

| Where                                                                                                                                                                                                        | Key                        | What it does                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `TimelinePrimitives.tsx:1107, 1734`, `VisualsCueBand.tsx:305`                                                                                                                                                | Shift                      | Page box and cue selection extend or add                                                                                |
| `toolbar/tabs/ChipSelector.tsx:188, 219, 313`, `SelectTab.tsx:66-292`                                                                                                                                        | Shift (or on-screen Shift) | Select tab adds to the selection                                                                                        |
| `TransportButtons.tsx:146-150, 187, 214-227`                                                                                                                                                                 | Shift, Alt, $mod           | Previous/Next: beat, edge; Play variants                                                                                |
| `view3d/window/overlay/playback.ts:23-49`, `View3dOverlay.tsx:140`                                                                                                                                           | Shift, Alt, $mod           | 3D transport keys (mirror of the shortcuts)                                                                             |
| `timelineHotkeys.ts:54-90`                                                                                                                                                                                   | Ctrl, Meta                 | Nudge and Space filtering                                                                                               |
| `TimelineVariants.tsx:229, 318-327`, `useTimelineFollow.ts:416`                                                                                                                                              | Ctrl/Meta wheel, Shift+Z   | Zoom, fit                                                                                                               |
| `TimelineAppendAtPlayhead.tsx:101, 127`                                                                                                                                                                      | Shift                      | Append a subset page (the pill shows it live)                                                                           |
| `TimelineSplitter.tsx:135`                                                                                                                                                                                   | Shift                      | Splitter key step × 4 (coarser)                                                                                         |
| `visuals/FacingWheel.tsx:36, 70`                                                                                                                                                                             | Shift                      | Facing steps of 45° (coarser)                                                                                           |
| `PlaybackSpeedButton.tsx:87`                                                                                                                                                                                 | Shift                      | Speed steps down instead of up                                                                                          |
| `TimelineKeyframes.tsx:257`, `TimelinePrimitives.tsx:1769`                                                                                                                                                   | Shift+F10                  | Context menu                                                                                                            |
| `view3d/window/camera/CameraRig.tsx:325, 350, 410, 441`, `inputMath.ts:26`                                                                                                                                   | Shift, Alt, Ctrl           | 3D camera: pan instead of orbit, pinch                                                                                  |
| `ScrubNumber.tsx:123`, `DockedCommandBar.tsx:113-128`                                                                                                                                                        | Shift+Tab                  | Focus order                                                                                                             |
| `shortcuts/bindings.ts:124-127`, `keymap.ts`, `labels.ts`, `ShortcutSettings.tsx:81-84, 237`, `SettingsWindow.tsx:21`, `CommandPalette.tsx:295`, `ShortcutsDialog.tsx:94`, `ShortcutOverridesStore.ts:63-73` | all                        | The shortcuts registry itself                                                                                           |
| `packages/ui/src/components/base/DragInput.tsx:213-308`                                                                                                                                                      | Shift                      | Inspector number drag: `dragSensitivityWithShift` and rounding. A "fine" in effect, in a shared package; see the ticket |
| `shapes/distribute/layouts.ts:226`                                                                                                                                                                           | none                       | An unrelated `keysOf` (layout keys)                                                                                     |
| `components/canvas/touch/canvasModifiers.ts:13` `isSnapOff`                                                                                                                                                  | Shift / on-screen          | Old Fabric-era rule, no callers left: delete                                                                            |

### What the audit shows

1. **The meanings already disagree.** "No snap" is $mod in shapes, Shift (or Alt) on the field,
   and Alt on the timeline. Keyboard nudges (`shortcuts/definitions.ts:93-136`) say Shift+arrow
   = **fine** (quarter step) and Alt+arrow = free, while pointer drags say Alt = fine. So a
   tester asking for Shift = fine is asking for what the arrow keys already do.
2. **Shift is three things:** constrain while drawing shapes, no-snap and free-ratio on the field,
   and add-to-selection on clicks.
3. **Mid-drag changes only land on the next pointer move.** Nothing listens for `keydown`/`keyup`
   during a gesture, so pressing Alt with the mouse still does nothing until it moves.
4. **Touch:** `stores/TouchModifierStore.ts` holds on-screen Shift and Alt (held or latched), but
   only `ChipSelector` reads it; the field editor ignores touch presses entirely
   (`fieldPointerInput.ts`, `pointerType === "touch"`).
5. **"From center" doesn't exist yet.** No gesture draws from the center today; the revised model
   adds it.
6. **Selection can only add.** Shift adds on click, marquee and lasso; nothing subtracts, and
   nothing reaches inside a placed box.

## 2. The model: three held roles, press choices, and toggles

The first draft had five roles (`fine`, `constrain`, `noSnap`, `fromCenter`, `pivot`). Review with
the owner (2026-10-28) cut that down. There are only three keys a role can take (Shift, Alt/Option,
and Cmd on a Mac or Ctrl elsewhere: Mac Ctrl is a right-click and the Windows key belongs to the
system), so the model is built around that limit:

| Kind                      | Members                                   | When it's read                   |
| ------------------------- | ----------------------------------------- | -------------------------------- |
| **Held roles**            | `fine`, `constrain`, `fromCenter`         | Live, for the whole drag         |
| **Press choices**         | `add`, `subtract`, `reachInside`          | Once, when the pointer goes down |
| **Toggles** (UI, no keys) | Snap, Lock X / Lock Y, later Mirror       | Always; on until switched off    |
| **Timeline only**         | Alt = no snap (held), $mod = draw a range | Its own row; unchanged           |

### Held roles

One role per key, so every key has exactly one meaning while dragging.

- **`fine`**: slower or finer. Off the half-step ladder (guides still pull), hundredths when
  scrubbing a number, quarter speed on the field, whole degrees when rotating.
- **`constrain`**: the shape's natural constraint. It is one idea with a meaning per gesture:
  - **moving** (marchers, a placed box, a whole shape): stay on one axis, horizontal or vertical,
    picked by which way the drag has gone further. This is new; today it's only reachable through
    the Lock X / Lock Y toggles, and a Shift-drag on the field turns snapping off instead;
  - **drawing or resizing a box**: equal across and deep spacings;
  - **lines, arcs, curves, circles**: 45° steps;
  - **rotating**: 15° steps (the default; see "one meaning per role");
  - **scaling**: flips proportional scaling. The box editor's ratio lock (`ratioLocked` in
    `shapeEditorStore`) is the always-on form: holding the key flips the lock for one drag, so
    there is one concept, not two.
- **`fromCenter`**: draw or resize about the center. A box draws corner to corner today and a
  handle keeps the opposite side fixed (#439); with the role held, the box grows both ways. Circles
  already draw from the center, so for circles the role changes nothing.

Two rules hold for every held role:

1. **Keys add up.** Holding two keys always gives both effects; no chord has a meaning of its
   own. With three roles there are three pairs, and each is useful: fine + constrain, fine + from
   center, constrain + from center (the "square from its center" of every design tool). A chord
   such as $mod+Alt = "fine with no snap" was considered and rejected because it takes one of
   these pairs away.
2. **One meaning per role across the field and the shape tool.** Today scaling marchers on the
   field is proportional unless Shift is held, while the shape tool frees spacings unless Shift is
   held. Rule: the constrain key flips whatever the gesture's default is (what Photoshop does now),
   and each gesture states its default. Rotation then reads cleanly: default 15° steps, `fine` =
   whole degrees, Snap off = free.

   Update (owner on #545, 2026-11-01): scaling now has one default everywhere. A marcher
   selection's corners scale freely, as a box shape's do, and constrain keeps the ratio (on a box's
   corner it gives equal spacings instead); the box's ratio lock is the selection's too, so on
   side handles, and for a selection's corners, the lock and the key are one concept.

### No snap is a toggle, not a key

`noSnap` stops being a held role. The **Snap toggle** sits with Lock X / Lock Y and turns off the
half-step ladder plus the pull of the field's lines and other marchers. Reasons:

- With `fine` already off the ladder, the only thing no-snap adds is "nothing pulls". That's a
  setting for a section of work, not something you flip mid-drag.
- It frees a key, which is what lets each key carry one held role.
- It works on a tablet as is.
- Precedent: Ableton's grid toggle (Cmd+4), the snap buttons in Logic and Premiere, Blender's
  magnet, Figma's snapping options.

Details:

- Visible: a pressed button on the shape editor bar, and "Snap off" in the on-drag chip.
- **Not kept across a restart or opening a file**, so a forgotten toggle doesn't leave a show off
  the half steps an hour later.
- A shortcut (to pick; Blender uses Shift+Tab, which we use for focus order, so likely a letter
  combination checked against `keymap.ts`).
- Covers shape and marcher drags on the field, and arrow nudges on marchers: with Snap off, no
  nudge snaps to the grid (owner, 2026-10-30).
- A held override (hold a key to flip snap for one drag, like Blender's Ctrl) is left out until
  someone asks, because it brings back the key shortage.
- The timeline keeps its held Alt = no snap: scrubbing past a flag is a single moment, not a
  section of work. The toggle doesn't cover the timeline for now.

### Press choices

These are decided once when the pointer goes down, then stop mattering. They are not held roles,
so they can share a key with one.

- **`add`**: Shift-click and Shift-marquee/lasso add to the selection. Exists today.
- **`subtract`**: a marquee or lasso removes what it covers. New. Today you can only add; trimming
  a lasso of a whole section down to "all but the snares" is a real drill task, and Photoshop and
  Illustrator both have it. Default key: Alt (Photoshop, Illustrator).
- **`reachInside`**: a press on a placed box picks the marcher under it instead of the box, like
  Figma's Cmd-click into a group. Placed boxes now keep their members, so this will come up. The
  pivot grab (a $mod press on a shape's center takes the pivot, `frame/gestures.ts:120`) is the
  same kind of choice and moves here. Default key: $mod.

The rule that keeps press choices and held roles apart:

> A key the **press** used (to add, subtract, reach inside or grab the pivot) is not read as a
> held role until it is released. Pressing it again mid-drag turns the role on.

So a Shift-press on a marcher adds it and drags at normal speed even when Shift is `fine`.

### Not modifiers

- **Mirror** (the partner across the 50 follows): very drill-specific and common, but it needs
  pairing data and stays on for a whole section of work, so it's a toggle like Snap. Open
  question, not in the ticket.
- **Ripple on the timeline** (do later pages shift when a flag or move edge is dragged): the
  resize and page-flag decisions set the default. If it ever gets a key, it's timeline-only. Open
  question.
- **Skipped:** duplicate on drag (marchers are people; maybe shapes later), coarse steps (the
  ladder already gives half steps), hold-to-switch-tool (Space is Play, right-drag pans).

## 3. The role module

A new pure module, `apps/desktop/src/input/modifierRoles.ts`, plus a small store for the chosen
mapping. Everything that reads a modifier for a gesture asks it.

```ts
/** What a held key means during a drag */
export type HeldRole = "fine" | "constrain" | "fromCenter";

/** What a key means at the press; decided once */
export type PressChoice = "add" | "subtract" | "reachInside";

/** Where the gesture happens; each context lists what it honors */
export type GestureContext =
  | "shape" // shape tool, frame, placed boxes, ScrubNumber
  | "field" // marcher move, handles, rotate, scale, marquee and lasso
  | "timeline"; // playhead, flags, loop, cues, clip edges (own row, see below)

/** The keys a role can take: never Mac Ctrl (a right-click), never Meta on Windows/Linux */
export type RoleKey = "Shift" | "Alt" | "$mod";

export interface HeldKeys {
  readonly shift: boolean;
  readonly alt: boolean;
  readonly ctrl: boolean;
  readonly meta: boolean;
}

export type Roles = Readonly<Record<HeldRole, boolean>>;

export function heldKeysOf(event: {
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}): HeldKeys;

/** Pure: which held roles are on, for this context, under this map */
export function rolesOf(
  keys: HeldKeys,
  context: GestureContext,
  options?: {
    map?: RoleMap; // default: the current preset
    isMac?: boolean; // default: isMacPlatform(); resolves $mod
    onScreen?: ReadonlySet<HeldRole>; // touch and Pencil toggles, OR'd in
    usedByPress?: ReadonlySet<RoleKey>; // keys the press consumed, ignored until released
  },
): Roles;

/** Pure: the press choice for a pointer down, or null */
export function pressChoiceOf(
  keys: HeldKeys,
  context: GestureContext,
  options?: { map?: RoleMap; isMac?: boolean },
): PressChoice | null;

/** The key for a role or choice here, for hints ("⇧ fine"), tooltips and docs */
export function keyFor(
  role: HeldRole | PressChoice,
  context: GestureContext,
): RoleKey | null;

/** React: live roles while a gesture runs, for the on-drag chip */
export function useGestureRoles(context: GestureContext): Roles;
```

The map is data: per context, a key for each held role and press choice. A preset is valid only if
no two held roles share a key (press choices may share a key with a held role; that's what the
press rule is for).

```ts
type RoleMap = Readonly<
  Record<GestureContext, Partial<Record<HeldRole | PressChoice, RoleKey>>>
>;
```

`toolEnvFor(field, keys)` becomes `toolEnvFor(field, roles, snapOn)`; `env.shift` becomes
`env.constrain`, `env.mod` goes away (no-snap comes from the toggle), and `keysOf` is removed. The
field editor's `FieldPointer` keeps raw keys (it's shared with the timeline-mode field and tests)
and gains `roles` and `pressChoice`, computed once in `fieldPointerInput`.

### Platform and $mod

`$mod` resolves the same way as the shortcuts registry (`shortcuts/bindings.ts`, `platform.ts`):
Cmd on a Mac, Ctrl elsewhere. Mac Ctrl+left pans the field and opens menus, and Windows/Linux Meta
is the OS key, so `RoleKey` has three values.

Alt has platform risks the ticket must check on real machines: on Windows and Linux a lone Alt
press can show Electron's auto-hidden menu bar, and on some Linux desktops Alt+drag moves the
window. Version A puts Alt on `fromCenter`, the least important role, so it absorbs those
risks; today Alt carries `fine`, the most important.

### Live changes mid-drag

A gesture samples roles on press and on every move, like today, **and** a `RoleTracker` listens to
`keydown`/`keyup` on the window while a gesture is active and re-runs the gesture's last move when
a role flips. `blur` clears every key. The field's #197 rule (Alt pressed mid-drag re-anchors on
the drawn spot) becomes "`fine` turning on re-anchors", so it follows the key.

### Touch and Apple Pencil

No modifier keys on a tablet. `TouchModifierStore` becomes role toggles: the floating button
offers **Fine**, **Equal** (constrain) and **From center**, held or latched, OR'd in through
`onScreen`. A tablet user never sees a key name, so a key remap doesn't move the buttons. Snap is
already a toggle. The old `isShiftHeld`/`isAltHeld` stay for the Select tab's add-to-selection.

### The timeline keeps its own row

The timeline reads Alt = no snap (held) and $mod = draw a range (a press choice, `isRangeModifier`).
Both stay. It goes through the module only so the keys are named in one place:
`timeline: { noSnap: "Alt", range: "$mod" }` in a small timeline-specific type, not mixed into the
field's roles. The constrain key meaning "range" a few inches away from "equal spacings" is one
accepted cost of version A (section 5).

### The shortcuts registry

Roles are not actions: nothing fires on a keypress. They don't go into `ACTIONS`, but share:

1. **Platform resolution** (`$mod`) and **labels** (`shortcuts/labels.ts`: ⌥ on a Mac, Alt
   elsewhere).
2. **Conflict detection.** Within a context, two held roles can't share a key. A modifier plus a
   letter is a shortcut and a modifier alone is a role, so they can't collide. The Snap toggle's
   shortcut is an ordinary action and goes through `keymap.ts` like any other.
3. **Keyboard nudges** (`NUDGE_VARIANTS` in `definitions.ts`) already use Shift = fine, so they agree with version A. On marchers they follow the Snap toggle too: with Snap off, no nudge snaps.

**Settings › Shortcuts later: yes**, as a short "While dragging" section above the actions: one row
per held role with a three-way key picker (Shift / Alt / ⌘ or Ctrl). Picking a key another role
uses swaps them, so the map stays valid. Ship presets first, per-role picking after.

## 4. Conflicts if fine became Shift

| Conflict                                                                      | What happens with Shift = fine                                        | How the design handles it                                                                                                   |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Constrain is Shift today** (equal spacings, 45°, block 15°, rotation steps) | Both can't be Shift                                                   | Constrain moves to $mod (version A). The real cost: it breaks the near-universal Shift = constrain of 2D design tools       |
| Shift-click adds to the selection; marquee and lasso with Shift add           | A Shift-press-drag would add and go fine                              | The press rule: Shift used by the press isn't `fine` until released. Selection code is untouched                            |
| Field marcher drag: Shift = no snap; corner scale: Shift = free ratio         | Shift would mean fine _and_ no snap                                   | No snap moves to the Snap toggle; free ratio follows `constrain`. `fine` already drops the grid snap on the field           |
| $mod draws a range on the timeline                                            | With version A, $mod = constrain on the field, range on the timeline  | Separate contexts, so nothing breaks; but the same key means unrelated things close together. An accepted cost of version A |
| Shift+arrow nudge                                                             | Already fine (quarter step)                                           | No conflict; it becomes consistent                                                                                          |
| Shift+R, Shift+E/Q, Shift+F, Shift+Space, Shift+Z, Shift+P/N/V/H              | None: these fire on a letter keydown; roles matter only during a drag | No change                                                                                                                   |
| Timeline: Shift on Previous/Next = beat, Shift on a page box = extend         | Clicks, not drags                                                     | Not roles; untouched                                                                                                        |
| 3D camera: Shift-drag pans                                                    | Camera navigation                                                     | Not roles; untouched                                                                                                        |
| Inspector `DragInput` (packages/ui): Shift = slower                           | Already Shift = fine                                                  | Later it takes a `fine` callback from the app, so it follows the map                                                        |
| Designers press Shift by reflex to constrain                                  | They get a slower drag, which can feel like lag                       | The on-drag chip names what's held                                                                                          |

## 5. Decision: version A

The owner picked version A on 2026-10-29, after trying a prototype of both versions
(`~/shape-host-orch/proto/modifier-roles/index.html`, outside the repo). There is no lab A/B
test.

| Input    | Meaning                                            |
| -------- | -------------------------------------------------- |
| Shift    | fine                                               |
| $mod     | constrain                                          |
| Alt      | from center                                        |
| Snap     | toggle                                             |
| At press | Shift add, Alt subtract, $mod reach inside / pivot |

Things the decision settles:

- **Rotation:** default 15° steps, Shift (fine) = whole degrees, Snap off = free. Whole degrees
  stay on Shift, as today.
- **Arrow nudges:** Shift+arrow is already the fine nudge, so the arrow keys already agree with
  version A. On marchers they follow the Snap toggle: with Snap off, no nudge snaps.
- **Snap toggle:** resets on restart and on opening a file; covers shape and marcher drags on the
  field; the timeline keeps its held Alt. The shortcut is picked from the free keys in the
  shortcuts registry when it's built.
- **Axis lock, subtract and reach inside** are in scope.
- **The map stays data** (one `RoleMap`), so a user setting or another preset can come later
  without touching the gestures. Only the version A map ships.

What the prototype found:

- A press uses a key only when its choice actually applies. A $mod press on a loose marcher, not
  inside a box, isn't "reach inside", so $mod stays free for constrain (the axis lock).
- The on-drag chip earns its place: it's the only way to tell which keys a drag is reading.

Still to check during the build: whether a lone Alt press shows Electron's menu bar on
Windows/Linux, and whether a Linux window manager takes Alt+drag. Alt now carries only from center,
the least important role.

## Open questions

1. Mirror and timeline ripple: design them as toggles, or leave them for now?
