# Timeline UI

The spec (`spec.md`) deliberately leaves out the editor UI (§14). This file is
the UI's source of truth: it adopts the timeline built on the `0.2` branch as
the reference presentation, and maps it onto the spec's model. Phase 8 builds
from it. The spec still wins on the model; this file decides presentation.

- Reference: `origin/0.2` at `568056aa`, in
  `apps/desktop/src/components/timeline/` (`Timeline.tsx`, `TimelineVariants.tsx`,
  `TimelinePrimitives.tsx`, `TimelineViewModel.ts`, `TimelineGeometry.ts`,
  `TimelineCanvas.tsx`, `TimelineStoryFixtures.ts`, `Timeline.stories.tsx`).
- Run the stories to see it: they cover the expanded and collapsed densities,
  page and track selection, range selection with Create Track, inactive spans
  and a 512-beat show.
- Status: accepted by the project owner on 2026-09-30 (P8.0). Open questions U-Q1 to U-Q4 are deferred to the Phase 8 work that meets them, decided from the spec where it can, and recorded here when decided.
- **UI-9 overrides (2026-10-01).** In timeline mode, UI-9 replaces page selection, Create Track and per-marcher and per-shape tracks. Text elsewhere in this file that describes those (UI-3, UI-6's Create Track, the view-model table, the inspector's "selected page") describes what is built today; the package that builds each part of UI-9 rewrites it. Where they disagree, UI-9 wins. Its open items and TODOs are in U-Q5 and the backlog at the end of this file.

## What the reference UI is

- A page ruler (page buttons, measure labels, rehearsal marks), a beat grid, a
  waveform lane, a draggable playback cursor, a transport, and zoom.
- Tracks drawn as one clip each, packed into rows automatically. Two densities:
  expanded (22 px rows) and collapsed (5 px micro-pills).
- Selection: a page, a track or a free range, shown as one overlay with
  draggable start and end flags and an "N counts" badge. **Create Track**
  appears for a range when a target is selected.
- Moving a clip snaps to whole beats and commits once, on pointer-up.
- Units are beat indexes with half-open `[start, end)` ranges, the same as
  spec §7 and ADR 0001.

## Decisions

- **UI-1: dashed "inactive" spans mean "stolen".** Inside a clip, a span is
  inactive where the target has an assignment in that timeline but a
  higher-layer assignment wins (spec R-2), or where the target has no
  assignment in that timeline. This is derived from the resolver; nothing
  extra is stored. (0.2's draft `transition_assignment.is_active` column is not
  adopted.)
- **UI-2: timelines start and end on any beat.** The spec allows motion to begin
  mid-page, which breakaways need (golden vector G2 steals at beat 8 of a
  16-beat move). The UI snaps to page lines by default as an aid, and a
  modifier key turns snapping off. The reference validator's page-boundary
  rule is removed when the components are ported.
- **UI-3: the default tracks (answers U-Q1, P8.8).** _Superseded in timeline
  mode by UI-9 (one track per timeline)._ The timeline shows every
  shape track, plus a marcher's track in a timeline when the marcher moves
  individually there (it has an assignment to a one-slot transition without a
  shape, which is what Create Track makes for a marcher) or is selected.
  Group moves without a shape, such as a converted page show's page moves,
  show only for the selected marchers. Why: the number of default tracks
  follows what was authored (shapes and individual moves), not the band's
  size, so a 250-marcher show doesn't open with hundreds of tracks; a shape
  track already stands for its members; an individual move has nothing else
  to stand for it, and is how a breakaway steal (G2) shows; and the selection
  brings up any other marcher on demand.
- **UI-4: shape track activity (answers U-Q4, P8.8).** The provisional rule
  stands: a shape track is active where at least one member's winning span
  is in its transitions, and inactive where every member is stolen or none is
  assigned. A partial steal (G12's leader) shows on the stolen marcher's own
  track, not on the shape's.
- **UI-5: the zero-length beat 0 isn't drawn (P8.8).** Every show starts with a
  fixed beat 0 that has no time (`timeMap.ts`). The timeline's x axis starts
  at beat 1: view beat `v` is spec beat `v + 1`, and spec positions in
  `[0, 1)` draw at view 0, so the first timed page starts right after the
  initial page's inset. `Timeline` converts at its boundary: its props
  (tracks, playback position) and its commands (seek, clip move, Create
  Track) stay in spec beats, and a clip move sends the clip's spec range
  shifted by the dragged beats. A Create Track range from view 0 sends spec
  beat 1, which is the same show time as beat 0.
- **UI-6: the timeline's commands (P8.9).** _Create Track is superseded by
  UI-9's **Add selected marchers**; clip moves stand._ A clip move shifts its whole spec
  timeline, every transition and assignment in it, by the dragged beats
  (`shiftTimeline`); shapes and destinations stay put, so every position moves
  in time only. A shift that would leave beat 0 or overlap the same marcher's
  row at the same layer in another timeline is refused (E-ARGS, E-A3), and a
  clip dropped where it started writes nothing. Create Track's target is a
  shape picked by selecting its track, which takes the selected marchers, or
  else the one selected marcher. Its assignments go one layer above the
  highest layer the marchers already have in the range (0 where they have
  none), so the new track steals the range (R-2) the way a breakaway does
  (G2). Why: at layer 0 it would overlap a converted show's page moves and
  always be refused (E-A3). A block with fewer cells than marchers is refused
  (E-T4). A marcher's new track starts at its position at the range start, so
  it doesn't jump there, but it holds still over the range. If the track steals
  a move in progress, the marcher stops for the range and the stolen move then
  resumes with a catch-up, a visible change of speed, because progress is
  measured against that transition's own end (D-7).
- **UI-7: casting and layers (P8.4).** For direct and arc, casting gives each
  marcher a slot by nearest slot: the cast that makes the total distance from
  where the marchers stand to their slots' destinations as small as it can be.
  A new marcher stands where it is at the transition's start; for a recast, a
  member stands where it is when its row first wins (R-2), which is later than
  the row's start when a breakaway steals that, and a row that never wins can
  take any slot. Create Track into a shape casts this way too, instead of
  filling slots in id order (by id past 500 marchers, where the solve gets
  slow). Follow the leader isn't cast by nearest slot: its founders go to
  `p_{n-m+q}` by trail order (R-9, R-12), so under `inherit` their slots don't
  matter and one more founder shifts every target. New marchers take its
  lowest vacant slots, and recasting it is refused. A marcher cast into an
  existing transition gets an assignment over the whole transition, one layer
  above the highest layer it already has over those beats (0 where it has
  none), so it steals them like Create Track does (UI-6); the inspector then
  names the moves it steals from. The layer is chosen per marcher, since layers
  only rank one marcher's own moves (R-2). A recast that wouldn't shorten the
  total distance is refused, so ties never reshuffle anybody. Recasting a
  direct or arc move changes the slot order that a later follow-the-leader
  move under `inherit` takes its trail order from (R-12), so it can reorder
  that trail (the FTL → box → FTL case that QA-SC-07 judges); the recast help
  says so. Why: nearest-slot casting keeps paths short and avoids crossings
  without the designer placing everyone by hand; casting reads the positions
  from the rows inside the edit's own transaction, so it can't plan from a
  resolver that hasn't caught up with an earlier edit.
- **UI-8: a clip is a timeline (C-11, P8.10).** Every transition starts and
  ends with its timeline, so the timeline is the unit the user sees split up:
  a marcher track's clip spans its whole timeline, and the marcher's own
  assignments show as active spans inside it (dashed where it isn't in the
  move, UI-1). Several transitions can share a timeline (several groups moving
  over the same counts); they share its clip range. Changing a range always
  moves the timeline with all of its transitions. Why: with transitions
  starting and stopping anywhere inside a timeline, it was unclear what a
  timeline meant; now it is the container for one start and one stop.
- **UI-9: pages are flags; the selected timeline is the editing context (C-12,
  project owner, 2026-10-01).** Supersedes page selection, Create Track
  (UI-6) and the page-scoped drag of P7.2 in timeline mode. Built by P8.11,
  P8.13, P8.14 and P8.15, then P8.12 (phases/08-authoring-ui.md). Items
  marked _lead default_ were filled in by the lead so the work can start; the
  owner may change them.
  - **Pages.** A page is a cosmetic flag; it owns no motion. A page is named
    by its **end** flag, where marchers arrive, as page counts already are
    ("counts to get to this page", `Page.ts`): page N's box is the range from
    the previous flag to N's flag. Anything that goes somewhere ends on a
    page's flag. Clicking page N's box selects the stored timeline with
    exactly that range (its page timeline), or, if there is none, an empty
    one that isn't stored yet. It is stored the first time marchers are added
    to it. Timelines track the page: a timeline edge on a flag follows the
    flag when it moves (P7.5's edge rule stands), but the motion belongs to
    the timeline.
  - **Home (page 0).** Clicking the initial page box seeks to beat 0 and
    selects no timeline. Nothing is dimmed, every marcher can be moved, and
    moves edit homes.
  - **One timeline per range.** At most one timeline has a given range, so a
    page box always means one timeline. Several groups moving over the same
    counts are several transitions in that timeline (UI-8).
  - **One transition per marcher per timeline.** Adding marchers always spans
    the whole timeline, and adding a marcher already in it does nothing. So
    "the marcher's transition in the selected timeline" is always one row.
  - **Playhead.** The paused playhead rests on any whole beat and the canvas
    shows positions there. Selecting a timeline seeks it to the timeline's end
    beat.
  - **Play.** Play resumes from the playhead. With a timeline selected, it
    loops that timeline: at its end it jumps back to its start, and play from
    at or past its end starts at its start. With none selected, it plays on.
    Pausing keeps the selection.
  - **No selected page.** Nothing in timeline mode reads a selected page:
    editing uses the selected timeline, and rendering, playback and the
    inspector use the playhead. Data that still belongs to a page reads the
    page containing the playhead (or ending at it). Marcher appearance stays
    by page, but is resolved into a step function of time keyed by each
    flag's timestamp and sampled at the playhead, as on the `coordinates-v2`
    branch (`dbToMarcherAppearanceTimeline`, `getAppearanceAtTime`), without
    the dropped per-marcher-page overrides (P7.14).
  - **Page-relative tools (project owner, 2026-10-02).** Features built on
    "the selected page" keep working, relative to flags and the selection:
    - Next, previous, first and last page (shortcuts and transport) move the
      playhead to that flag and select that page's timeline (home for the
      first flag).
    - Set all or selected marchers to the previous page sets each marcher's
      ending in the selected timeline to its position at the timeline's
      start (a hold); to the next page, to its position at the next flag.
      Refused with no timeline selected.
    - Previous and next page paths show positions at the selected timeline's
      start and at the next flag; with no timeline selected, nothing.
    - Opening a show selects home.
    - Undo and redo move the playhead but leave the selection alone, until
      the backlog item on undo's selection is decided.
  - **Deprecating page selection.** Page selection stays in page mode until
    the flip; `SelectedPageContext` goes with page mode in Phase 10. In
    timeline mode nothing reads it, and a dev-mode warning when
    `useSelectedPage` is read in timeline mode keeps new code from bringing
    it back. Coordinate sheets and drill-chart exports loop over every page
    and don't read the selection, so they stay.
  - **+.** When the paused playhead isn't on a flag (and there is a beat
    there), a **+** shows just after it. It adds a page whose flag is at the
    playhead in one edit. The page that was split keeps its flag, id and
    per-page data (notes, appearance); the new page comes before it, and
    later pages renumber (no subset letter). Only page rows change, plus
    `last_page_counts` when the last page is split; no timeline is written,
    so motion is unchanged. The new page is selected. Pages store their
    start beat, so this inserts a row at the split page's old start and moves
    that page's `start_beat` to the playhead. Past the last flag, nothing is
    split: **+** appends a page ending at the playhead (_lead default_).
  - **Selection.** With a stored timeline selected, marchers without a
    transition in it are dimmed, and a dimmed marcher can't be selected or
    interacted with at all: clicks and box selection pass over it, and
    selecting a timeline deselects any selected marcher that isn't in it. So
    a selection never mixes dimmed and undimmed marchers. With none selected,
    or with a range that has no stored timeline yet (a new page's box, or a
    dragged range), nobody is dimmed: that range is where a timeline is
    created, not edited, so marchers stay selectable for **Add selected
    marchers**, and canvas moves there are refused (project owner,
    2026-10-02).
  - **Editing.** With a timeline selected, a canvas drag, nudge or alignment
    sets the **ending** coordinate of each moved marcher's transition in that
    timeline. Its start is already defined: wherever the marcher is at the
    timeline's start (R-4). With no timeline selected and the playhead off
    beat 0, canvas moves are refused with a hint to select one.
  - **Editing off the end (temporary).** While the playhead isn't on the
    selected timeline's end beat, canvas moves are refused with a hint to go
    to its end, because the canvas would show a mid-move position while the
    edit sets the ending. TEMPORARY: editing anywhere in the timeline will be
    supported later.
  - **Adding marchers.** Right-click a timeline or page box and choose **Add
    selected marchers**. The right-click doesn't change the timeline
    selection, so the marchers to add are picked first where they can be
    selected: at home, with no timeline or a range not stored yet selected,
    or in a timeline they're already in. To create a timeline that isn't a
    page, drag a range, select marchers, then right-click the range. Each marcher
    gets its own transition, because each moves individually: a one-slot
    shapeless `direct` transition spanning the timeline (C-11), whose
    destination is the marcher's position at the timeline's end, so adding
    changes no motion on a linear path. (A context menu for now; the gesture
    gets a UX pass later.)
  - **New marchers.** A marcher created in timeline mode joins every stored
    timeline automatically, with its own one-slot transition whose
    destination is its home, so it stands at home and nothing else moves.
    Layers follow the rule below. This keeps P7.3's join, one transition per
    marcher instead of a slot in a shared group transition.
  - **Removing marchers.** Removing a marcher from a timeline deletes its
    assignment and its own one-slot transition. It never deletes the
    timeline, which stays stored, and selectable, even with nobody in it.
  - **Layers.** A marcher can be added to a timeline that lies wholly inside
    the range of a timeline it's already in. The new transition goes one layer
    above its highest layer there and steals those beats (R-2). Once its
    ending coordinate is edited, the old move resumes after it from that new
    point and still ends where it ended (R-5, D-12, D-7), so its path after
    the steal changes. Adding to a timeline that only partly overlaps one of
    the marcher's timelines is refused (E-ARGS); the database wouldn't refuse
    it, since the new row is a layer up. Adding to a range that strictly
    contains one of the marcher's timelines is refused too, since the new
    layer would steal that whole move (P8.14, lead, 2026-10-02). Ctrl+click
    on the timeline is ignored (it opens the context menu on macOS).
  - **Creating a timeline.** Click and drag on empty timeline space selects a
    range (snapping as in UI-2), which acts as an empty timeline that isn't
    stored yet; **Add selected marchers** on it creates the timeline. It
    replaces Create Track.
  - **Tracks.** The timeline draws one track per stored timeline, however
    many transitions it holds, so a group of one-slot transitions is one clip.
    This supersedes UI-3's marcher and shape tracks in timeline mode.
  - **What the selection holds** (_lead default_). The selection is home, a
    range, or nothing. A selected range resolves to the stored timeline with
    that range when there is one (one per range), so it survives the first
    **Add selected marchers** storing it, and undo deleting it. A clip move
    of the selected timeline moves the selection with it.
  - **The end of the show** (_lead default_). The paused playhead may rest on
    the last flag (the show's end beat), so the last page's timeline can be
    selected and edited there.
  - **More than one row** (_lead default_). If a marcher has more than one
    assignment in the selected timeline (a converted or shape-cast show), a
    canvas edit of it is refused with a hint to use the inspector. UI-9's own
    flows never make a second row.
  - **New marchers and overlaps** (_lead default_). A new marcher joins
    stored timelines in start order and skips one that only partly overlaps a
    timeline it has already joined.
  - **Deleting a flag.** Deleting page N's flag deletes N's row and moves
    page N+1's start back to N's start, the exact inverse of **+**: N+1 keeps
    its flag, id and data (per-page data follows the page that keeps its
    flag). Deleting the last page's flag makes the previous page last. If the deleted flag was the selected page's, the merged page is selected (the previous page's box, or home, when it was the last page).
    Timelines are unchanged, so motion is unchanged (P8.13, lead,
    2026-10-02).

  Why: pages mark checkpoints without owning motion, and the timeline is the
  container for its transitions (C-11). Editing the selected timeline's ending
  coordinates, with starts taken from where marchers already are, keeps every
  edit local to one container. The steal-and-resume rules already let a short
  timeline sit inside a longer move without breaking it. Empty timelines
  aren't created, but a timeline that loses its marchers is kept: P8.10's rule
  that a timeline goes with its last transition doesn't apply to removing
  marchers.

## Mapping the spec onto the view model

The reference `TimelineViewModel` becomes a derived view: an adapter builds it
from the stored tables and the resolver, and nothing in it is stored.

| View model                                   | Built from                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `beatCount`, `pages`, `measures`             | beats, pages and measures, as today                                                                                                                                                                                                                                                                        |
| Marcher track                                | one per spec timeline in which the marcher has an assignment. Clip range: the timeline's range (C-11); beats where the marcher has no assignment there are inactive (UI-1)                                                                                                                                 |
| Marcher track `legs`                         | the marcher's resolver spans (R-2) inside the clip: a hold span is `hold`; any other span is `move`                                                                                                                                                                                                        |
| Marcher track `activitySpans`                | active where the marcher's winning span belongs to an assignment in this timeline; inactive otherwise (UI-1)                                                                                                                                                                                               |
| Shape track                                  | one per spec timeline and shape used as a destination in it: the transitions whose `dest_shape_id` is that shape (a group move). Spec shapes have no time; the track shows the moves into them. Its clip is the timeline's range (C-11); converted legacy timelines can still split it at gaps until P9.10 |
| Shape track `activitySpans`                  | active where at least one member's winning span is in those transitions; inactive where all are stolen (UI-4)                                                                                                                                                                                              |
| `TimelineRangeChange {timelineId, range}`    | moves the whole spec timeline. Clips from the same timeline move together, so the UI highlights linked clips                                                                                                                                                                                               |
| `TimelineCreateTrackRequest {target, range}` | one edit: a new timeline over the range with one transition. For a marcher, a shapeless one-slot `direct` transition whose destination starts at the marcher's position at the range start; for a shape, a transition into it with the selected marchers assigned to slots                                 |

## What the timeline doesn't show

_Under UI-9, the inspector reads the playhead instead of the selected page's
end beat, and edits the selected timeline (P8.12, P8.15). The text below
describes what is built today._

These belong in the inspector (P8.5), not the timeline:

- path style, bulge, waypoints, destination shape, `slot_count`, `order_mode`
  and slot casting;
- the layer of each assignment (spec Q-8 stays open for anything richer);
- diagnostics (§8.9 requires them). The timeline adds a warning badge on any
  clip whose range has a diagnostic; the inspector lists them. A shape track's
  badge counts all of its transitions' diagnostics; a marcher track's counts
  the ones about that marcher. A transition-wide one (such as `D-VACANT`) of a
  transition without a shape shows once, on the first shown marcher track
  assigned to it. The badge's tooltip lists them.

**Where they are (P8.5).** The inspector's Timeline section
(`TimelineInspectorSection`, timeline mode only) explains each selected marcher
(up to 10) at the selected page's end beat from `explain`: span kind with a
plain-language note, its beats, the transition and the spec timeline it belongs
to, the assignment's layer, slot, progress, origin (home, or the end of the
previous span), path style, bulge, waypoints, destination, and for
follow-the-leader spans the member order place, order source and target. It
then lists that marcher's diagnostics, and below it every diagnostic of the
show by transition. Errors are worded by `timelineErrorMessages.ts` (P8.6).

**Editing a transition (P8.3).** Below the explanations, the section has an
editor (`TimelineTransitionEditor`) for the move that brought each selected
marcher to the page: the transition of the span that ends at the beat, or the
one the beat falls inside. Spans are half-open, so a move that starts at the
beat (the next page's) isn't offered, and a marcher that held through the page
offers nothing. It edits:

- the path style. Follow the leader is disabled, with the reason, without a
  destination shape (I-T5) or with a block (I-T3). A new arc starts at bulge
  0.25, and a new follow-the-leader with no waypoints;
- the bulge, by slider or number, clamped to ±½ with a note that larger arcs
  aren't supported (D-15);
- the follow-the-leader waypoints: add (at the last one), remove, reorder, and
  numeric x and y. Picking them on the canvas is a follow-up;
- the order mode, with a one-line note on what each does (R-12);
- the destination: a shape from the list, or individual points. Switching to
  points copies the shape's slot samples (R-13), so nobody moves until a point
  is changed (D-16, Q-14). Individual points are disabled for follow the leader.
  The picker disables, with the reason, a block for follow the leader (E-T3)
  and a block with fewer cells than slots (E-T4);
- the slot count, from the highest assigned slot + 1 (the note names the slot)
  to 10000 (I-N2). A shapeless transition's new slots start at its last point.

Each change is one undoable edit through the transition db-functions, a change
that writes nothing is skipped (a number field commits only changed text), and
a refusal is a toast with its P8.6 message. After an edit, the controls stay
disabled until the inspector shows the edited transition, so a quick second
edit is never planned from the old one.
Clip and track selections in the timeline don't drive the editor yet.

**Casting and layers (P8.4).** Below each transition's editor,
`TimelineAssignmentsEditor` lists its slots: every member by drill number, and
the first 16 vacant slots (the rest are counted), with a warning line that
sums up the vacant slots as ranges, such as "0–9, 12, … (+N)" (D-13,
`D-VACANT`). For each member it edits:

- the slot, typed as a number: a vacant slot is taken, and an occupied one is
  traded with its marcher (both rows are deleted and inserted again, so no
  moment has two marchers in one slot);
- the layer (a whole number from -1000 to 1000), with a note that the higher
  layer wins where a marcher's moves overlap. The same layer over the same
  beats as another of its moves is refused (E-A3);
- the first and end beats, inside the transition (E-A1);
- removal, which leaves the slot vacant.

Each member says where it's stolen: the beats where a higher layer wins, and
by which transition (R-2), the inspector's counterpart of UI-1's dashed spans.
Two actions cast (UI-7): **Cast selected marchers** puts the selected marchers
who aren't in the transition into its vacant slots (nearest, or lowest for
follow the leader), and a note names the moves the cast steals beats from;
**Recast by nearest slot** re-picks every member's slot. Each is disabled, with
the reason, when nothing is selected, everyone selected is in already, there
are too few vacant slots (raise the slot count first), the transition is
empty, it is follow the leader (recast only), or nearest-slot casting would
solve more than 500 slots (the solve is cubic; 500 take about 30 ms). Edits
follow the transition editor's rules: one undoable edit each, and refusals as
toasts. After an edit, the controls stay disabled until the inspector shows a
target built from a newer store version than the edit was planned from; a
target rebuilt from the same rows (scrubbing, playback) doesn't count.

**Shapes (P8.2).** Below the transitions, `TimelineShapesEditor` draws and
edits the show's spec shapes (`line`, `freehand`, `circle`, `box`, `block`,
spec 5.2) in absolute field coordinates (D-5). It shows whether a page is
selected or not.

- **New shape:** pick a kind, then **New shape**. It is drawn through the
  selected marchers where they stand at the selected page's end beat (homes
  with no page): a line between the two farthest apart, a freehand path
  through all of them in selection order, a circle about their middle through
  the first (its radius is the first marcher's distance from the middle), a
  box around them, or a block with a cell for each of them over the box
  around them. With nobody selected it is 16 steps across at the field's
  middle; marchers on one spot get a shape that size around them. If marchers
  are selected but none of them is in the timeline, it is refused with a
  message rather than drawn somewhere else. The new
  shape is picked for editing.
- **Editing:** pick a shape (by name, or "Shape N", and kind). It edits the
  name (empty clears it); the kind; and the geometry for that kind: a line's
  two ends, a freehand path's points (add, remove, reorder, at least two), a
  circle's center, radius, start angle in degrees and direction (field
  coordinates, from +x toward +y), a box's origin, width and height, and a
  block's origin, rows, columns and spacing. It names the transitions that use
  the shape, since a change moves every marcher heading to it.
- **Changing the kind** redraws the shape in the area the old one covered: a
  line becomes a freehand path through its two ends, a freehand path becomes
  a line between its two points farthest apart, a box or circle becomes an
  open freehand path along its outline, and anything else fills the old
  shape's bounds. The path is open because freehand slots run from the first
  point to the last (R-13): a path that ended where it started would put the
  first and last slots on one spot. A new block gets a cell for every slot of
  every transition using the shape (I-T4), and at least 4 × 4. The slots of
  the transitions using the shape are spread over the new one, so their
  marchers end in new places, and the editor says so when the shape is in
  use.
- **Keeping transitions valid:** what the editor picks keeps them valid (the
  new block's cells). What the database would refuse is disabled with the
  reason: becoming a block while a follow-the-leader move ends in the shape
  (I-T3), and deleting a shape a transition uses (I-D1; the delete itself refuses
  it with a message that names the transitions, with the foreign key as the
  backstop). The block's rows and
  columns show the places it must hold and for which transition, but a smaller
  grid is sent as typed, and the database refuses it (E-T3/E-T4) with the
  P8.6 message. Bad geometry (E-S1) is refused before anything is written.

Each change is one undoable edit through `createTimelineShape`,
`updateTimelineShape` or `deleteTimelineShape`, a change that writes nothing
is skipped, and the controls wait for shapes read at a newer store version
after an edit (P8.4's guard).

**Shapes on the canvas (P7.11).** The shape picked in the editor is drawn on
the field: its outline, a block's cells, and handles. Round handles reshape
it: a line's or freehand path's points, a circle's rim (its radius and start
angle), a box's origin and far corner (the other corner stays put), and a
block's last cell (its spacing). The square handle moves the whole shape (a
circle's center, a block's origin). A drag redraws the shape on every mouse
move and writes nothing; letting go commits one geometry edit through the
editor, with the same guard, refusals and undo as a typed change. Until that
edit settles the shape stays as dragged and takes no drags; then it is drawn
from the editor's rows, so a refused drag snaps back. A release that saves
nothing snaps back at once: a press too short and small to be a drag (the
canvas's own click threshold), a drag cancelled with Escape, a drag that
leaves the shape as stored, and a drag released while another shape change
is still being saved (which says so). While a shape is picked its handles
sit above the marchers, so a marcher under a handle can't be pressed there;
pick no shape to reach it. Move handles sit above the other handles, so a
shape whose handles meet can still be moved. Pressing a handle doesn't
change which marchers are selected, and a selection box never picks up a
handle. The picker waits while an edit is being saved. Nothing is drawn in
page mode, before the resolver is ready, or while playing.

Page mode's own shape tools stay page mode's. In timeline mode page shapes
(`shape_pages`) aren't drawn or read, and their writers (create, edit, delete,
copy to another page) refuse with a message, because they write page
positions the timeline doesn't use. The line tool's **Create Shape** is
disabled with the reason; **Apply coordinates** still moves the marchers
onto the line (P7.2). There are no shape locks: moving a marcher whose slot
is in a shape-backed transition switches that transition to individual
points (P7.2).

## Porting notes

- The components depend on 0.2's frame-clock store
  (`apps/desktop/src/services/clock/frame-clock.ts`), React, a 2D canvas for
  the grid and waveform, `clsx`, `@phosphor-icons/react` and Tailwind tokens.
  The frame clock comes over in Phase 5 (P5.9).
- The waveform comes from a context that only Storybook sets today; wire it to
  the audio player.
- `legs` keep their `move`/`hold` texture but aren't drawn.
- Not in the reference and not needed for the first port: clip edge resizing
  (a timeline range edit, U-Q2), wheel zoom and multi-select.

## Open UI questions

- **U-Q1:** which tracks show by default. Decided: UI-3.
- **U-Q2:** what resizing a clip edge means. Decided (C-11, P8.10): a range
  edit of the clip's whole timeline. The timeline and every transition in it
  move together, and assignments anchored at the moved edge follow (R-E1).
- **U-Q3:** how layers show on the timeline, if at all (spec Q-8). Since
  P8.4 the inspector shows and edits each assignment's layer and where it's
  stolen (UI-7); the timeline itself still shows steals only as dashed spans
  (UI-1).
- **U-Q4:** the shape track's activity rule. Decided: UI-4.
- **U-Q5:** the rest of UI-9. Decided (2026-10-01): per-page data follows the
  page that keeps its flag (UI-9 **+**); timelines track flags that move;
  removing marchers never deletes a timeline; new marchers join every stored
  timeline; editing off the timeline's end is refused for now. Open:
  - where removing a marcher from a timeline lives (inspector, right-click,
    or both).

  TODO (project owner, 2026-10-01; not now):
  - how a selected marcher's spans (UI-1) show inside a timeline's one track;
  - appending pages past the last flag (today's `defaultNewPageCounts`);
  - whether clicking a clip selects its timeline;
  - editing anywhere in the selected timeline, not only at its end (the
    temporary refusal in UI-9).

- **Backlog (project owner, 2026-10-01).** Not in the current phase:
  - Beat editing under UI-9: beat insert and delete (P7.5), clip shifts and
    range edits can make two timelines share a range or partly overlap,
    which UI-9 refuses only when adding marchers.
  - Adding marchers over a range that already holds a non-linear move (arc,
    follow the leader) or one of the marcher's steals: the new `direct` row
    is a chord, so it changes the path there.
  - Moving marchers between timelines ("Move to timeline", or add then
    remove, where order matters).
  - Undo's selection (replacing P7.13's page jump; until then undo moves only
    the playhead, UI-9 Page-relative tools). Undoing a clip move leaves the
    selection on the moved range, which then resolves to nothing, so everyone
    is dimmed until the user selects again.
  - The ripple's holds (`timelineRipple.ts` `addHoldingMoves`) group by layer
    into one timeline, so a marcher with moves on two layers ending at a new
    page can get two transitions in one timeline.
  - Clearing a marcher's dimming while the line or lasso tool has every marcher
    switched off makes it selectable mid-tool (`CanvasMarcher.setTimelineDimmed`).
  - Ctrl+click is ignored on the timeline on every platform, not only macOS.
