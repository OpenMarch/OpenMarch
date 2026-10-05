<!-- cspell:disable -->

# 07: Ghost rendering and handle spec

Status: design proposal, not decided. Scope: what the canvas draws when a move is in focus, the visual tokens, which ghost objects are handles and what they edit, the data the renderer needs, how it fits the existing canvas code, and the delivery phases. It relies on the owner decisions in README "Confirmed (2026-10-04, second round)": live enter links, stored per-slot ghost starts that follow the group, and exit plus automatic return as the default.

Code citations refer to `timeline/ownership-transfer-design` unless they say `p8-17`. The canvas and path code is identical on both branches. UI-10 and the P8.17 store exist only on `timeline/p8-17-core-loop`.

## 0. Terms

- **Move F**: a stored timeline, which under UI-9 is N one-slot transitions sharing a range (01 §1). A **slot** is (transition, slot_index), and each slot has one marcher.
- **Intent path** `intent(F,i,b)`: slot i's planned path `style(origin_i, dest_i, (b−F.start)/(F.end−F.start))` for b in [F.start, F.end].
  - `origin_i` is the founder's actual position at F.start, or the slot's stored ghost start.
  - `dest_i` is the placed destination, or the linked one.
- **Performed**: beats where the marcher's winning span (R-2) is in F and on the rails, meaning founding or an on-path entry.
- **Ghost span**: beats of [F.start, F.end] where slot i's marcher is not performing F. There are three kinds:
  - **remainder**: after an exit at k, over [k, F.end];
  - **approach**: before an entry at j, over [F.start, j];
  - **detour**: between an exit at k and a return at j, which is Scenario 3's gray stretch.
- **Rebase span**: a legacy D-12 join or resume. Its actual path differs from the intent path, so both are drawn: the actual path solid, the intent path as a ghost segment (04 §5).

## 1. What is drawn

### 1.1 Focused move F (selected and paused)

For every slot of F, draw these in z-order from bottom to top:

1. **Context moves.** These are the other moves that touch F's seams for F's members:
   - the move a marcher exits into at k (yellow in Scenario 1);
   - the feeder that enters F at j (yellow in Scenario 2);
   - the return move (pink in Scenario 3).

   Each is drawn over that marcher's whole span in the other move, solid, in the other move's color (§2), so yellow running past green's end shows as it does in mockup 1. This goes one hop only. When a context move itself ends in a live link to a third move (overrun: exit green, enter blue), only a handoff marker is drawn at its end, in blue.

2. **Ghost segments.** The intent path over each ghost span: gray, dashed, thin (§2).
3. **Performed segments.** The intent path over performed beats, solid, in F's color. That is the actual path, because on the rails the two are equal.
4. **Count ticks** on both performed and ghost segments: one perpendicular tick per beat (Blender motion paths, 02 §2). Ghost ticks are gray.
5. **Direction chevron** at the end of each performed and each context path, as in the mockups. The ghost remainder gets a gray chevron.
6. **Previous dots.** Each founder's origin at F.start, drawn as a hollow ring in F's color (Pyware's "reference dots vs editable symbols", 02 §1). These replace today's black previous endpoint.
7. **Destination dots.** Solid dots in F's color at `dest_i` for slots performed at F.end.
8. **Ghost start dots** (slots with a stored ghost start) and **ghost end dots** (slots whose marcher has left F before F.end), both gray (§2). These are handles (§3).
9. **Handoff markers** on F's path, in the other move's color:
   - **exit k**: a fork tick where the context path leaves;
   - **join j / return j**: the feeder's arrowhead plus a **link glyph** (two interlocked 5 px rings) when the destination is a live link;
   - **broken link** (host shortened past j, or deleted): a red ring with a slash, plus a tooltip.
10. **Marchers** (CanvasMarcher) at the playhead, then the handles on top (§3.4).

Mockup check:

- Mockup 1: 2 solid paths, 4 paths that turn gray after count 8, 4 gray end dots, yellow forks at 8 and yellow context arrows.
- Mockup 2: gray start dots, gray approach paths, yellow arrowheads plus links at j, then solid green.
- Mockup 3: green, then gray over [k, j], with yellow and pink context and a pink link at j.

### 1.2 Moves that touch the seams but aren't focused

These are drawn only as context (§1.1 item 1). Their own ghosts, ticks and handles are never drawn. If a context move is itself the host of other joiners, that shows only when the user focuses it.

### 1.3 Marchers outside F

Their paths are not drawn. Their dots are drawn at 55% opacity with "focus fade", which is visual only. UI-10 Dimming keeps them selectable (`isMarcherDimmed` returns false, p8-17 `TimelineSelectionStore.ts:211-222`; ui.md p8-17 315-317). This is not `CanvasMarcher.DIMMED_OPACITY` (0.25, `CanvasMarcher.ts:789`), because `setTimelineDimmed` also makes the marcher unselectable (`CanvasMarcher.ts:802-818`). Fading is what delivers UI-10's deferred "who moves" (H1).

### 1.4 States

| State                                                              | Drawn                                                                                                                                                                       |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Selected (paused)**                                              | Everything in §1.1. Handles are live.                                                                                                                                       |
| **Hover** over a clip, page box or seam notch (120 ms debounce)    | Performed and ghost paths plus ghost dots of the hovered move at 40% opacity. No ticks, context or handles. Marchers aren't faded. Drawn over the selected move's layer.    |
| **Dragging a handle**                                              | Phase G2: the dragged dots move and the scene redraws after the commit, matching today's timeline paths (`canvasListeners.movement.ts:45-48`). G3 adds a live preview (§6). |
| **Playing**                                                        | Nothing, as today: path rendering stops while playing (`useTimelinePathRender.ts:70`). See the toggle below.                                                                |
| **Playing with "Ghosts while playing" on**                         | Only **moving ghost marchers**: a gray dashed-outline circle at `intent(F,i,b)` for each slot in a ghost span at beat b, inside F's range. No paths, ticks or handles.      |
| **No stored timeline for the window** (UI-10 range not stored yet) | No focus. Today's page-pair previous and next paths are drawn.                                                                                                              |

While F is focused, the page-pair previous and next paths (`renderTimelinePathVisuals`, `OpenMarchCanvas.ts:1562-1619`) are hidden for all marchers. They would double-draw F's members, and the `nextPath` theme green (`FieldTheme.ts:41`) collides with move colors. The Previous paths toggle then controls the previous dots and context moves. The Next paths toggle stays on and isn't consulted.

## 2. Visual tokens

**Move color C.** Ghosts and the strip must use the same color function. Today's color is the timeline's **index by start order** (`TIMELINE_TRACK_COLORS[index % 8]`, `timelineViewModel.ts:114-124`, `:324-326`). Inserting an earlier timeline therefore recolors every later one, which makes "the yellow handoff" unstable (see Q2). Page-box timelines have no clip (UI-10) but do get an index, because the loop runs over all `tables.timelines`.

**Ghost gray G(C).** Work in OKLCH: hue from C, chroma = 0.15 × chroma(C), so the gray keeps a hint of C's hue and two moves' ghosts stay distinguishable. Lightness depends on the **field** background (`fieldProperties.theme.background`, `FieldTheme.ts:15-28`). That background is a per-field theme, not the app's dark mode:

- light field (background luminance > 0.5): L 0.55, darker than the grid's secondaryStroke rgb(170,170,170);
- dark field: L 0.75.

Target at least 3:1 contrast against the background. The dash pattern, not the gray, is the main cue, so the field still reads in grayscale print (02 §3).

| Token                           | Value                                                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Performed path                  | C, alpha 1, 2 px (`DEFAULT_PATHWAY_STROKE_WIDTH`, `Pathway.ts:8`), solid                                    |
| Ghost path                      | G, alpha 0.9, 1.5 px, dash **[2, 4]** (screen px)                                                           |
| Context path                    | its own C', alpha 0.6, 1.5 px, solid, with chevron                                                          |
| Count tick                      | 1 px × 4 px screen; every 4th count 7 px; in C or G                                                         |
| Previous dot                    | hollow ring, C, r 3, 1.5 px stroke                                                                          |
| Destination dot                 | solid C, r 3 (as `Endpoint`, `Endpoint.ts:25`)                                                              |
| Ghost start and end dot         | fill G at alpha 0.45, stroke G 1.5 px, r 4. Selected: 2 px stroke in C plus the selection halo marchers use |
| Handoff fork and arrowhead      | C' of the other move, 5 px                                                                                  |
| Link glyph                      | two 2.5 px rings, C', offset 6 px from the point. Broken: red (`STEP_SIZE_WARNING_COLOR`) ring with a slash |
| Hover tier                      | the whole layer at alpha 0.4                                                                                |
| Moving ghost marcher (playback) | marcher radius, stroke G, dash [2, 3], no fill                                                              |

**Dash conflict.** `[5,3]` is already used by `Pathway` dashed (`Pathway.ts:43`) and by the step-size warning (`WARNING_PATHWAY_DASH`, `stepSizeWarning.ts:17`), so ghosts must not use it. Step-size warnings apply only to performed and context paths, never to ghosts.

**Zoom.** Stroke widths, dash lengths, tick lengths and glyphs are in screen px: divide by the viewport zoom when rendering. Hide ticks when adjacent ticks are under 5 screen px apart.

**Dimming.** UI-10 dims nothing. Focus fade (§1.3) is the only fade, and it never changes selectability.

## 3. Handles

### 3.1 What is draggable

| Object                                 | Phase | A drag edits                                                                                                                                                                                       |
| -------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ghost **end** dot (exited slot)        | G2    | F's `slot_destinations` for that slot. The remainder, the exit point `intent(F,i,k)`, and the next move's origin (R-4) re-derive. Any live link into a later move re-aims.                         |
| Ghost **start** dot (joiner slot)      | G2    | The slot's stored ghost start. The approach path and the join point `intent(F,i,j)` move, and the feeder re-aims through the live link.                                                            |
| Join or return marker (link glyph)     | G3    | The link beat j: the marker is constrained to F's intent path and snaps to whole counts. One edit moves the feeder's end beat and F's entry beat. The owner already wants a draggable rejoin beat. |
| Exit marker                            | G3?   | The exit beat k, the same way (Q4).                                                                                                                                                                |
| Previous dots, destination dots, paths | never | Not handles. Real destinations are edited by dragging the marchers with P at F.end, as UI-10 does today.                                                                                           |

Ghost starts that follow the group when the group's start is edited is a **write-path rule** (the two-primitive model doc), not a handle behavior. The renderer just re-reads the stored ghost starts.

### 3.2 Multi-select with real dots

The mockup 1 case is dragging all 6 green end dots: 2 real marchers plus 4 ghost ends. It is allowed when every selected real marcher's edit target is F, meaning UI-10's window [S,P) resolves to F (P = F.end and S = F.start). Then one `transactionWithHistory` sets 6 destinations of F.

If the window isn't F (for example P mid-move), the real dots would create or edit a different move. The drag is then refused before any write, with this hint:

> "Ghost dots edit Green's ending. Move the playhead to Green's end (count 16) to drag them together with marchers."

Box and lasso selection include ghost handles only while focus is active. Select all (Ctrl+A) selects marchers only. Ghost handles are deselected when focus changes.

### 3.3 Snapping and constraints

- Ghost dots use the same rounding as marchers (`getRoundedCoordinate`) and honor Lock X and Lock Y. `setActiveObject` already applies `lockMovementX/Y` to any object (`OpenMarchCanvas.ts:1069-1073`).
- Link and exit markers slide along F's polyline: project the pointer onto the cached per-beat samples and snap to the nearest whole count inside (F.start, F.end).
- A drag that would put j at or before k, or j at F.start, is refused (E-ARGS wording from `timelineErrorMessages.ts`).

### 3.4 Overlap and ambiguity

- **Z-order:** paths < previous and destination dots < ghost dots < marchers < selected handles. A real marcher wins the click where it overlaps a ghost.
- **Selecting behind.** A second click on the same spot, under `DISTANCE_THRESHOLD` and with no drag, cycles to the next selectable object underneath (Q3). The hover tooltip names both objects.
- **Same marcher, real dot and ghost.** At P = F.end, an exited marcher is drawn by its winning move (yellow) and also has F's ghost end dot. The ghost dot carries the marcher's drill number as a small gray label (shown when zoomed in or hovered) so the user can tell they are the same performer. Drags follow UI-10 for the real dot and §3.1 for the ghost. Hint texts:
  - Hover a ghost end dot: "F3's ending in Green (F3 leaves Green at count 8 for Yellow). Drag to change Green; Yellow starts from the new count-8 point."
  - Hover a ghost start dot: "Where F5 would start in Green. Drag to change its path; Yellow re-aims to meet it at count 6."
  - Hover a link marker: "Yellow ends on Green's path at count 6 (linked). Drag along the path to change the count."
  - Hover a broken link: "Green no longer reaches count 20. Yellow holds its last point." The fallback wording comes from the model doc.
  - Drag a real dot that has a ghost in F: "F3 is in Yellow at count 16. Drag its gray dot to edit Green." This is a status-bar hint, not a refusal.

## 4. Data source

### 4.1 What the renderer needs per focused F

For each slot i:

- the marcher;
- `origin_i` and its source (founder or ghost);
- `dest_i` and its source (placed or linked);
- the intent polyline over [F.start, F.end] plus per-count samples;
- the span classification over F's range (performed, remainder, approach, detour, rebase) with seam beats k and j;
- for each seam: the other move's (timelineId, transitionId) and the link status (live, broken or none).

Context moves need each touching span's actual polyline. Colors come from the timeline ids.

### 4.2 What the app can compute today (phase G0, no core change)

- **Classification** comes from `spanInfos(m)` (`types.ts:113-118`), clipped to [F.start, F.end): a span whose `transitionId` is in F is performed, and everything else is a ghost span. The neighbors give k, j and the other move. A `join` or `resume` kind marks rebase.
- **Intent paths for founders** use a throwaway resolver, the `sampleShape` pattern (p8-17 `timelineMoves.ts:85-117`). Build a snapshot from `getTimelineHost().snapshot` (`timelineStore.ts:130`, `timelineHost.ts:30-37`) containing only F's transitions. Each member gets `home = origin_i` (taken from the real resolver at F.start) and one row [F.start, F.end) at layer 0. Every span is then founding, and `positionAt` is the intent path for direct and arc, with no core change.
  - Limits: FTL with `order: inherit` loses its source and falls back (D-ORDER-FALLBACK). Joiners have no `origin_i` until ghost starts are stored. Linked destinations need the core.
- **Actual and context polylines** come from `sampleTimelinePath` (`timelinePaths.ts:74-102`) over the real resolver.

### 4.3 Minimal core API additions (G1; ADR 0001 §4 amendment required)

The resolver must compute intent and links for motion anyway (live links), so the renderer should read them rather than re-derive them. The precedent is `spanInfos`, which was added by ADR amendment 2026-09-30 (`types.ts:113-117`). Proposed additions to `Resolver`:

```ts
intentAt(transitionId: number, slot: number, beat: Beat): XY;            // planned path, ignores ownership
slotEnds(transitionId: number, slot: number): {
  origin: XY; originSource: "founder" | "ghost" | "none";
  dest: XY;   destSource: "placed" | "shape" | "linked";
};
links(transitionId: number): LinkInfo[];  // feeder slot -> host (transition, slot, beat), status "ok" | "broken"
```

`SpanInfo` gains an optional `entry: "found" | "on_path" | "rebase"`, which is enough to tell on-rails spans from rebase.

These are read-only and computed from caches the resolver already needs for linked destinations. They also need oracle and `ref/` parity and golden vectors for `intentAt` at link beats. Destinations are not exported today (01 §1). `slotEnds` fixes that too.

### 4.4 Sampling and performance

- **Resolution:**
  - polylines: adaptive at `PATH_DRAW_TOLERANCE` 0.25 via `sampleMarcherPath` (`timelineKeyframes.ts:210`);
  - ticks and marker snapping: `intentAt` at every whole beat in range;
  - moving ghost marchers: interpolated from the per-beat samples, so nothing is resolved per frame.
- **Budget** (SC-11 fixture, `scenarioFixtures.ts:188`; 200 marchers in focus, up to 10 moves touching the seams):
  - building the focus scene: ≤ 8 ms;
  - redraw from cache: ≤ 4 ms;
  - hover scene: ≤ 4 ms from a warm cache.

  The arithmetic: 200 slots × (≈16 ticks + ≈10 adaptive points), plus about 200 context spans, is about 6k `positionAt` calls. QA-PF-01 gives 250 positions in ≤ 1 ms, so that is a few ms.

- **Cache:** key = (resolver `version`, F's timeline id, hovered id). Keep the selected scene plus an LRU of 4 hover scenes. `version` already increments whenever answers may change (`timelineStore.ts:50`), including ghost-start and link edits once they are in the change log. The throwaway resolver is built once per (version, F).
- **Fabric object count:** do not add per-marcher objects to `MarcherVisualGroup` (`MarcherVisualGroup.ts:20-30`). 200 × (paths + ticks) would mean thousands of objects. See §5.

## 5. Integration in the canvas code

**Pure scene builder** in `src/timeline/timelineFocusScene.ts`. Per AGENTS.md it uses readonly interfaces and functions, not classes:

```ts
buildFocusScene({ resolver, snapshot, timelineId, colors, intent? }): FocusScene
// FocusScene: { slots: SlotScene[]; context: ContextPath[]; markers: Marker[]; handles: HandleSpec[] }
```

G0 passes the throwaway-resolver intent and G1 passes the core one. The builder is unit-testable with no canvas.

New Fabric objects in `src/global/classes/canvasObjects/`:

- **`TimelineFocusLayer extends fabric.Object`**: one non-evented, non-selectable object per tier (selected and hover). Its custom `_render(ctx)` draws every segment, dash, tick, chevron, previous and destination dot, and marker from the `FocusScene`, in zoom-corrected screen units. That is one object instead of thousands, it has no hit-testing cost, and theme changes need only a re-render. Set `objectCaching: false`, because the dash and tick sizes depend on zoom.
- **`GhostHandle extends fabric.Circle implements ISelectable`**: one per ghost start or end dot. Add `SelectableClasses.GHOST_START` and `GHOST_END` (`Selectable.ts:46-49`), and carry `{transitionId, slot, marcherId, kind}`. `objectToGloballySelect` points to a new ghost-selection slice, not to `SelectedMarchersContext`.
- **`SeamHandle`** (G3): constrained drag along the cached per-beat samples.

`OpenMarchCanvas` gets new methods in the style of `removeTimelinePathways` (`:2382-2387`):

- `renderTimelineFocus(scene, tier)`: inserts the layer just above the grid and below marcher shapes, and adds handles after the marchers. Then `sendCanvasMarchersToFront` (`:1263-1269`) followed by handles to the front.
- `clearTimelineFocus()`.

**Hook `useTimelineFocusRender`** sits beside `useTimelinePathRender` (called at `Canvas.tsx:657-669`):

- It derives F from `useSelectedStoredTimeline()` (p8-17 `TimelineSelectionStore.ts`: the UI-10 window resolves to the stored timeline with exactly [S,P)), not from `selectedPage`. Today's paths are keyed to `selectedPage` (`useTimelinePathRender.ts:72-77`).
- When F is non-null, `useTimelinePathRender` gets `enabled=false`. That already calls `removeTimelinePathways` (`useTimelinePathRender.ts:130-133`). The page-mode straight pathways must also stay hidden, so add a flag rather than reuse `enabled`, because `enabled=false` hands paths back to page mode.
- Hover focus comes from a small store written by the strip's clip, page-box and notch hover handlers.
- It applies focus fade through a new `CanvasMarcher.setFocusFaded(bool)`, which changes opacity only.

**Edits:**

- Extend `DefaultListeners.handleObjectModified` (`DefaultListeners.ts:139-158`, which handles only `CanvasMarcher` today) to collect active `GhostHandle`s with the marchers.
- Route them to a new `moveGhostHandlesInTarget` in `timelineMoves.ts`: one transaction, refusals decided first (§3.2). The ghost-end path bypasses the stolen-marcher refusal (`timelineMoves.ts:432-436` per 01 §3) because it targets F's slot directly.
- Ghost starts write the stored-origin table defined by the model doc.

**Test hooks:**

- Unit (Vitest): `timelineFocusScene.test.ts` over golden G2 (steal) and G5 (join) and the scenario fixtures. It asserts classification, k and j, and intent points at ticks, and covers the throwaway intent against `intentAt` once G1 lands.
- Canvas: a test like `useTimelinePathRender.test.tsx` asserts one `TimelineFocusLayer` and N `GhostHandle`s, and none while playing.
- E2E: a development-only `window.__openmarch.focusScene()`, gated like P5's fixture console API, returns the scene JSON with handle screen coordinates so Playwright can drag a ghost dot. A spec `e2e/tests/timeline-ghosts.spec.mts` covers that drag.
- Visual: the `/validate` scenario `~/om-capture/scenarios/ghosts.mjs` uses a `make-fixture` variant with Scenarios 1–3. It shoots selected, hover, mixed drag, playing with the toggle, and a dark field theme into a contact sheet.

## 6. Phases

- **G0, read-only ghosts with no core change** (about 3–4 days). Focus plumbing, the scene builder with throwaway intent, `TimelineFocusLayer`, exit remainders, detour ghosts, context moves, forks, ticks, focus fade and tokens. Behind the timeline flag. Needs UI-9's partial-overlap refusal lifted so Scenario 1 data exists.
- **G1, core intent and links** (depends on the model doc's resolver work). Switch to `intentAt`, `slotEnds` and `links`. Adds joiner ghost starts and approach paths, link glyphs and broken links. Remove the throwaway path except as a test oracle.
- **G2, handles** (about 3–4 days). `GhostHandle`, ghost-end and ghost-start edits, mixed multi-select, snapping, the cycle-select-behind click, hints, and undo coverage (`test:history`).
- **G3, polish.** Seam handles (j, and k if Q4 says yes), live drag preview (closed form for direct and arc, a throwaway resolver otherwise), hover tier, "Ghosts while playing".

## 7. Open questions for the owner

1. **Hover preview:** paths and dots at 40% (proposed), or dots only?
2. **Move colors:** today they are by start order, so they shift when a move is inserted earlier. Should we make them stable per timeline (stored, or hashed from the id)?
3. **Selecting behind a marcher:** a repeated click cycles (proposed), or a modifier-click?
4. **Exit beat k:** should it also be draggable on the canvas, or only the rejoin and join beat j?
5. **Mixed drag** of real and ghost dots with P off F's end: refuse with a hint (proposed), or snap P to F.end?
6. **Ghosts while playing:** off by default with a toggle (proposed). Should the toggle live in View settings or on the transport?

## Critical files for implementation

- `apps/desktop/src/global/classes/canvasObjects/OpenMarchCanvas.ts`
- `apps/desktop/src/timeline/useTimelinePathRender.ts`
- `apps/desktop/src/timeline/timelinePaths.ts`
- `apps/desktop/src/components/canvas/listeners/DefaultListeners.ts`
- `packages/core/src/timeline/types.ts`
