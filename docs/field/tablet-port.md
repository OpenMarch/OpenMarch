# Tablet layout on the three.js field

Upstream's tablet layout ([`docs/tablet-layout.md`](../tablet-layout.md), upstream
#1060, merged into the fork on 2026-10-26) was built on the Fabric canvas and the old
page timeline. The fork replaced both, so the merge kept every piece that doesn't
depend on them and left out the rest. This page lists what is where, as the
starting point for porting touch input to the three.js field.

To read a removed file, use upstream's merge commit: `git show c9784b34a:<path>`.

## In the fork now

These work as upstream describes, with no changes needed for the new field:

- Layout choice: `src/stores/InputModeStore.ts`, `<html data-input>`, the `touch:`
  Tailwind variant, Settings › Touch & Input.
- Inspector as a side panel or drawer in the tablet layout: `components/layout/InspectorDock.tsx`,
  `utilities/inspectorLayout.ts`, wired in `App.tsx` around both the editor and Visuals
  inspectors. The mouse layout is unchanged ("fixed").
- Move pad (¼, 1 and 4 step nudges): `components/inspector/marcher/MovePad.tsx`, in the
  marcher inspector for one or several marchers (not while playing).
- Touch-sized controls and captions in shared UI: buttons, selects, sliders, long press
  (`packages/ui`), `LongPressGuard`, `InfoTip`, on-screen keyboard handling, audio unlock.
- One undo/redo queue for keys, touch gestures and toast Undo buttons
  (`shortcuts/handlers/historyQueue.ts`). The fork's own press queue (#223) was folded
  into it: the action still decides "nothing to do" in its lock turn, and a held key's
  repeats are still skipped while a press is waiting.
- Web editor: the show library, versions, backups, web video export, settings sheet and
  Home Screen prompt. The fork's lab build and 3D View pop-up still work on top of it.
- The touch pill over the field (`components/canvas/touch/TouchModifierButtons.tsx`,
  rendered by `ThreeField`): upstream's grip, saved spot, `pillPlacement`, long-press
  explanations and help, with its buttons as role toggles (modifier roles, version A):
  Fine, Equal and From center (`TouchModifierStore`, OR'd into every drag through
  `onScreenRoles`), Add (the old Shift, `isShiftHeld`) and a magnet, "Snap off", for the
  Snap toggle (`uiSettings.snap`, pressed while Snap is off). From center reaches the
  shape tool's roles: boxes draw and resize from their center (#510). Each toggle is named by
  its label, with on or off in `aria-pressed`, and latches on a click with no pointer
  (VoiceOver, Voice Control, Switch Control).
  Upstream's field drag-mode menu (Auto / Box / Lasso / Pan) and Clear line were left
  out: they need touch-finger editing, which the field doesn't take yet.
- Renderer-free gesture rules and helpers, kept for the port:
  `components/canvas/touch/touchGestures.ts` (the gesture state machine),
  `penPalmGuard.ts`, `touchHitTest.ts`, `pillPlacement.ts`, `fieldDragMode.ts`,
  `canvasModifiers.ts`, `swallowPress.ts`, with their unit tests; and for the timeline,
  `components/timeline/pinchZoom.ts`, `pageScroll.ts`, `touchTargets.ts`,
  `audio/markerHitWidth.ts`.

## Left out of the merge

| Upstream file (at `c9784b34a`)                                                                                             | Why                                                                   | Port to                                                                           |
| -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `components/canvas/touch/touchGestureAdapter.ts`                                                                           | Feeds Fabric events to `touchGestures.ts`                             | `src/field`: feed `FieldPointer` events (add `kind: "mouse" \| "pen" \| "touch"`) |
| `components/canvas/touch/dragStepReadout.ts`, `touchSelectionHandles.ts`                                                   | Fabric objects; their pure parts were tested in `touchExtras.test.ts` | The field's handles and readouts                                                  |
| Fabric changes in `OpenMarchCanvas.ts`, `Canvas.tsx`, listeners, `GroupUtils.ts` (`snapGroupDelta`), `fabricMemory.ts`     | Fabric is gone from the fork                                          | `src/field/editor`                                                                |
| `components/timeline/CompactTimelineControls.tsx`, `timelineLayoutStore.ts`, `usePinchZoom.ts`, `PageTimeline.tsx` changes | The fork's timeline is a different component                          | The fork's timeline (`Timeline.tsx`, `TimelineContainer.tsx`)                     |
| Touch layout of `Toolbar.tsx` (tabs in the title bar, panel over the field) and `TimelineContainer.tsx`                    | Both files are the fork's own design                                  | The fork's toolbar and timeline container                                         |
| Touch sizes in `CanvasZoomControls.tsx`                                                                                    | The fork's zoom controls drive the three.js view                      | The same file                                                                     |
| `e2e/browser/tests/touch-canvas.spec.mts`, `touch-timeline.spec.mts`, `mouse-canvas.spec.mts`                              | Drive `window.canvas` and the old page timeline                       | Field scenarios on `window.fieldTest`; they describe behavior, not Fabric         |

`toolbarSlot` (the title bar's slot for the toolbar tabs) is merged but nothing fills
it until the toolbar's touch layout is ported.
