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
- **UI-9 overrides (2026-10-01).** In timeline mode, UI-9 replaces page selection, Create Track and per-marcher and per-shape tracks. Text elsewhere in this file that describes those (UI-3, UI-6's Create Track, the view-model table, the inspector's "selected page") describes what is built today; the package that builds each part of UI-9 rewrites it. Where they disagree, UI-9 wins. Its open items and TODOs are in U-Q5 and the backlog at the end of this file. **UI-10 (2026-10-03)** replaces parts of UI-9; where they disagree, UI-10 wins.

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
    by page, but is resolved into a step function keyed by each flag's beat
    and sampled at the playhead, or at the live beat while playing, as on the
    `coordinates-v2` branch (`dbToMarcherAppearanceTimeline`,
    `getAppearanceAtTime`), without the dropped per-marcher-page overrides
    (P7.14). Between two flags the field shows the appearance of the last
    flag crossed, playing and paused, as page-mode playback and the video
    export do (project owner, 2026-10-06; VALIDATION.md V-37). This differs
    from page data such as notes, which reads the page containing the
    playhead. Built in `services/appearance/appearanceSteps.ts`; hidden
    marchers can't be selected by the same rule.
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

- **UI-10: the start flag and the playhead; dragging adds (project owner,
  2026-10-03).** Supersedes, in timeline mode, UI-9's **Adding marchers**
  through the menu, **Selection** dimming, **Editing off the end**, **Play**'s
  loop, and the line "anything that goes somewhere ends on a page's flag".
  UI-9's other rules stand, including **One timeline per range** and **One
  transition per marcher**. Built by P8.17 (phases/08-authoring-ui.md). Items
  marked _lead default_ were filled in by the lead; the owner may change them.
  Research and evidence: the "Origin and Arrival" report (P8.17 log).
  - **The edit window.** The editing context is the range from the **start
    flag** S to the paused **playhead** P. S is where movers leave from (their
    origin is wherever they are at S, R-4); P is when they arrive. With P after
    S the window is `[S, P)`. With P on or before S (just after **Stop**), the
    window is the page box ending at or holding P, as if S followed P. At beat
    0 it is home, which edits homes (UI-9 Home).
  - **Dragging adds.** A canvas drag, nudge or alignment at P sets where each
    moved marcher arrives at P, leaving S. In one undoable edit it creates the
    window's timeline if none has that range (one per range still holds), adds
    any moved marcher that isn't in it (UI-9's own transition and layer rules),
    and sets their endings. There is no **Add selected marchers** step; the
    menu item is removed. A window that crosses page flags passes through
    (project owner, 2026-10-04; research/ownership/10-cross-page-windows.md):
    the drag overrides the moved marchers' moves inside the window, which stay
    stored underneath and come back when it is deleted, and a move the window
    runs into partway catches up after it (R-5). An info toast names what was
    passed through and offers **Only change Page N**, which moves them from the
    last flag before P instead, as its own undoable edit.
  - **Arrivals off a flag.** P may rest between flags. A drag there creates a
    timeline ending at P, not a page (project owner, 2026-10-03). Pages stay
    cosmetic flags; **+** still adds one.
  - **The start flag follows navigation** (_lead default_). Unless pinned, S is
    the start of the page box holding P (the previous flag), recomputed when P
    is moved by navigation: clicking the ruler, page boxes, page navigation,
    **+**. Since the UI-12 review it follows when the gesture ends, not during
    it: a scrub or a drag along the page boxes leaves S where it was (without
    pinning it) and S moves once, on release; arrow keys on the playhead move
    it once they settle (300ms after the last tap, or when a held key comes
    up). Play and Stop never move S; pausing a play-on run moves P, and an
    unpinned S follows it (UI-12 review), so the window doesn't silently span
    pages.
  - **Pinning** (_lead default_). Dragging the start handle, or dragging a
    range on empty timeline space, pins S where it is dropped (before P). A
    pinned S stays through navigation until P moves to or before it, which
    unpins it. Clicking a page box unpins it.
  - **Play, Pause, Stop.** Play plays on from P to the end of the show, with no
    loop. Pause leaves P where playback was. **Stop** stops and returns P to S.
    Superseded by UI-11.
  - **Dimming** (_lead default_). Nothing is dimmed and every marcher can be
    selected, since dragging is what adds. Showing who moves comes with the
    ghosts-and-paths work (report H1), not membership.
  - **Clips only off the page boxes** (project owner, 2026-10-03). A page box
    stands for the stored timeline with exactly its range, so that timeline
    gets no clip. Only timelines that start or end off a flag (a mid-page
    arrival, a pinned start flag) are drawn as clips. To change when a page timeline happens, move its flags
    (P7.5). Diagnostics of a hidden page timeline still
    show in the inspector (spec §8.9); a badge on the page box is a follow-up.

  Why: the community's most common complaint about drill tools is the number
  of steps and hidden rules between "I want these marchers there" and the
  edit. In UI-9 that path took 8 actions and two traps (a refused drag, and a
  right-click landing on the wrong timeline after a split). UI-10 keeps the
  model (the spec and C-11/C-12) and removes the membership step: who, where,
  leave when and arrive when are the selection, the drag, S and P.

- **UI-11: Play from the start flag (project owner, 2026-10-05).** Supersedes
  UI-10's **Play, Pause, Stop**. Built on branch `timeline/ui11-preview-playback`.
  The owner asked for Logic-style "play from the start flag" so the move just
  edited plays back, and for Play to behave normally otherwise. A first
  proposal tied this to a pinned S and swapped keys by state; the critiques (a
  drill designer, a DAW user, a state-machine review) rejected that because the
  mode changed without the user asking and wasn't visible where they look. Here
  the mode is an explicit toggle, modeled on Logic's cycle mode, and turning it
  off loses nothing. Items marked _lead default_ were filled in by the lead.
  - **From start** is a mode only the user switches. On: **C**, the flag button
    on the transport, or dragging a range on empty timeline space (as Logic's
    cycle drag does; dragging the start handle or clicking a page box doesn't).
    Off: **C**, the button, the ✕ on the field badge, clicking the range bar,
    or **Esc** (after deselecting marchers and leaving isolation, one step per
    press). Turning it off keeps S, its pin and the window. Opening a show
    turns it off.
  - **No words on the timeline** (project owner, 2026-10-05, after three
    critiques). The start flag is a line with a pennant, a right triangle
    whose top is flat and whose long side faces down, hollow while From start
    is off and filled while it is on, so the state doesn't rely on color. While on, the window is tinted yellow, a 3px bar
    runs along the ruler's top edge (clear of the page numbers) inside a 10px
    click target at least 24px wide that turns the mode off, and the
    transport's flag button is lit in the same color. The words live on the
    field badge, "Space replays Page 3's move ✕", which flashes once when it
    appears. Light mode draws the flag's color as a darker ochre (about 3.6:1
    on the ruler; the theme yellow is about 1.9:1); dark mode keeps the
    yellow. The bar runs straight out of the pennant's top and the pennant's
    left edge is the line, so flag and bar read as one shape. The pennant is
    its own handle above the playhead's, so after **Stop**, when the flag is
    drawn on the playhead, it can still be dragged.
    Follow-ups from the critiques: end caps on the bar while looping, a faint
    bar on hover while off so a click turns it on, and a one-time hint on the
    first drag.
  - **Play (Space), From start on**, previews exactly the window the bar
    marks, S to P, with no roll on either side (project owner, 2026-10-05:
    playing past the bar read as a bug; V-24). At the end the canvas is back at
    P, which shows the arrival. With the loop on, it repeats until stopped.
    With no window (home) it plays on.
  - **Play (Space), From start off**, plays on from where you are (P, or a
    frame a paused preview holds) to the end of the show, as in UI-10. Pausing
    it moves P to the paused beat; an unpinned S follows P, a pinned one stays
    (UI-12 review; it kept S until then).
  - **Loop** (transport button, no shortcut) repeats the preview. It only
    applies while From start is on. An isolated timeline previews its whole
    range with no roll and always loops, as before.
  - **Playing never writes P.** Playback moves a separate cursor
    (`cursorBeat`), which the audio plays from and the paused canvas draws.
    Any write of the window (seeking, ranges, pages, home) clears it.
  - **Pausing a preview holds the frame** (_lead default_, V-25): the canvas
    and ruler show the paused beat and P is unchanged. Play resumes from the
    held frame. Clicking the ruler there makes it the new P. The first press on
    the field only returns to P, so nothing is dragged from held positions,
    and any shortcut other than the transport's does the same before acting.
  - **Stop (Shift+Space)** stops and returns to P. Paused with no held frame,
    it returns P to S as in UI-10.
  - **The playhead line moves smoothly** while playing (it follows the live
    position every frame); everything else, and every edit, stays on whole
    beats.

- **UI-12: a calmer timeline (lead, 2026-10-05).** The owner found the timeline "intimidating
  and clunky" and asked whether a compact and an expanded mode would help, then asked the lead to
  decide from the existing decisions. Four flow walkthroughs (everyday page writing, breakaways
  and clips, music and review, and a critique of the mode itself) found the weight came from
  clutter more than height: a reserved empty clip row, a waveform lane that is always empty in the
  app, a two-row transport of 14 buttons, and page/measure readouts in three places. So the
  default gets calmer first, and compact is a small, explicit extra. Six UX reviews of the first
  build (lanes, transport, zoom, compact, gestures, edit state) then shaped the rules below; the
  owner decided the items marked so. Defaults chosen on reasoning alone are V-27 to V-33 in
  research/ownership/VALIDATION.md. Built on branch `timeline/calmer-timeline`.
  - **Lanes.** Under the ruler are the measure row; the waveform, when audio is loaded; then the
    clip rows, one always kept with no chrome, so the first off-page clip doesn't move the ruler
    right after the drag that made it, and clips coming and going never move the waveform. Beat
    ticks are drawn once, in the measure row.
  - **The waveform** comes from the audio player's decoded, offset audio (`timelineWaveform.ts`):
    the loudest moment in each eighth of a beat, as filled bars, in decibels below the loudest
    moment the show's beats cover (−42 dB is silence), so a quiet ballad stays visible next to a
    loud closer. Its baseline stops where the audio does. The played part is the accent color, as
    page mode's waveform is (project owner, 2026-10-05), and follows the playhead smoothly while
    playing.
  - **Measures stay.** Musicians count by measure and rehearsal letter, as drill writers count by
    page. Measure numbers drop the "M" and start just right of their bar line, so the line doesn't
    cross them. Rehearsal marks are tabs in the measure row, in place of their measure's number;
    they are never thinned away when zoomed out, and numbers near them give way. Page labels hide
    when their box is too narrow to read them.
  - **One readout** (superseded by UI-13), in the transport: "Pg 3 · ct 8 m7.1". The count is counted to the page's flag,
    as page counts are, so the playhead on page 3's flag is count 8 of page 3. Past the last flag it
    reads "Pg 6 · +4". The paused clock shows the time at the playhead.
  - **The transport is the timeline's header row** (project owner, 2026-10-05, after reviewing
    four layouts in mockups and a survey of DAWs, editors, animation and drill tools). A side card
    took 324px of a 935px row at 1280 wide, and 566px with fullscreen's Perspective card. Animation
    tools, whose canvas is what you edit, put the transport in the timeline's one header row (Figma's
    Motion timeline, Rive, Blender, Unity), and no tool spends two rows; so the timeline is now
    edge to edge under a 32px row: Previous, Play, Stop, Next; From start with Loop; **Sound**; the
    clock and the readout; then Fit and Compact at the right. On a panel under 640px wide Sound,
    the clock, Fit and Compact fold into "⋯" (Bitwig's rule); Play, the page buttons, From start
    and the readout never leave. Sound is one popover for the music's mute, the volume and the
    metronome (Ctrl+M stays): in timeline mode mute silences the music only, so the metronome can
    count through it (page mode's mute still silences both).
    Shift+click on Previous or Next goes to the first or last page (Shift+Q/E stay). Tooltips name
    the shortcuts.
  - **The readout is a go-to box.** Click it, or press G, and type a page ("7", "2A", "pg 7"), a
    measure ("m23", or "m23.3" for its count 3) or a rehearsal mark ("C"); Enter goes there (a page
    selects its box), Esc cancels, and a miss is marked rather than guessed.
  - **Fullscreen and Perspective are on the field's zoom widget,** since they change the field's
    view, not the timeline's (video editors keep view controls with the viewer). Perspective is a
    popover with the slider and a reset; its button shows the angle whenever it isn't 0°, and it is
    disabled, not hidden, outside fullscreen, where the field isn't tilted. Page mode keeps its old
    layout until Phase 10.
  - **While playing,** a click on the timeline, and the page buttons, jump playback there and play
    on, as in a DAW; the playhead stays put. A preview jumped outside its window plays on;
    isolation keeps the jump inside the isolated range. A drag (a scrub) suspends playback instead
    (lead, UI-12 review): the audio stops, the field follows the pointer beat by beat, and
    playback resumes once from the release, as the same preview when the window holds that beat
    (V-35). Restarting the audio on every beat of a scrub stuttered. A scrub held past the
    timeline's edge scrolls it, and a scrub reaches the end of the show from anywhere on the
    timeline, as it already did on the ruler.
  - **Zoom is native to trackpads and wheels** (project owner, 2026-10-05: like Logic and Final
    Cut). A pinch, or Ctrl+scroll (Cmd on macOS), zooms smoothly about the pointer: events are
    applied once a frame, and the scroll that keeps the beat under the fingers is set before the
    frame is painted. A vertical scroll or swipe scrolls the timeline sideways. **Fit** (Shift+Z)
    fits the show; again goes back, about the playhead. Zooming out stops at the fitted zoom, so a
    show never shows as a sliver; the zoom is saved once a gesture settles, and a fitted timeline
    opens the next show fitted. The scrollbar's track is always there, so zooming never changes
    the strip's height. The zoom in and out buttons are gone.
  - **Compact** is an explicit button in the transport, lit while on and remembered for every show
    (`timelineCompact`). Nothing turns it on or off by itself, as UI-11 asks of modes, and it never
    moves or hides the transport (every surveyed tool keeps its transport visible however short the
    timeline is): only the rows under the header shrink, to the ruler, a measure row with the
    rehearsal tabs, the window's count and the start flag's pin, a 12px waveform, and clips as 6px
    bars in 12px rows whose hit areas never overlap. It leaves out the measure numbers.
  - **A plain drag scrubs; Ctrl+drag draws a range** (project owner, 2026-10-05: the ruler scrub
    "feels right", and ranges go behind a modifier). A drag anywhere on the timeline moves the
    playhead with the pointer; a press on a page box that doesn't move still selects the box.
    Ctrl+drag (Cmd+drag on macOS, where Ctrl+click is a right-click) draws a range, on page boxes
    and clips too, which still turns From start on (UI-11's cycle drag). A click or scrub lands on
    a downbeat or page line within 6px; Alt turns that off, as it does for dragged flags (Shift is
    the canvas's fine nudge and the transport's first/last page). While the pointer is down the
    playhead line (with **+**, the played waveform and the window's tint) steps beat by beat with
    the playhead, on the beat a release would land on: the nearest beat, or the downbeat or page
    line within 6px (project owner, 2026-10-07: "I like the beat-level drag in the playhead", after
    trying a line that glided under the pointer between beats). Each step is drawn in the pointer
    move that makes it, not after React renders the new beat, so the line never lags the pointer.
    Where the playhead can't follow (isolation holds it inside the isolated range), the line stays
    on it.
  - **A pinned start flag stays pinned until unpinned** (supersedes UI-10's "until P moves to or
    before it"): scrubbing is now the commonest gesture, so moving the playhead never unpins it.
    With P on or before a pinned S the window falls back to the page box holding P, as after Stop.
    Only the pin, **Unpin** on the field line, a page box or home unpin it. A pinned flag has a pin
    beside its stem in the measure row, clear of its handle and of a rehearsal tab on its beat (the
    stem keeps UI-11's widths, so pennant and stem stay one shape). Hidden in isolation.
  - **The field line says what a drag edits,** replacing UI-11's badge: "Editing home positions",
    "Editing Page 3's move", "Editing Page 3, counts 3–6", or "Editing After page 6, counts 1–4".
    It is quiet (no border, subtitle text) for an ordinary page: a whole page box, not pinned, From
    start off. It turns prominent, and flashes once, when anything is unusual: a partial window; a
    pinned start flag, with an **Unpin** button; a window passing page flags, "· passes through
    page 4's set", which never truncates; or From start on, "Space replays it ✕". It notes a held
    preview frame, dims while playing, hides in isolation, takes the pointer only on its buttons,
    and is read to screen readers once the window settles.
  - **Clicking a clip selects its timeline** (answers U-Q5's TODO): the start flag goes to its start
    (pinned when that isn't a flag) and the playhead to its end, as a page box does. A press that
    doesn't move is a click, so it never snaps the clip to a page line, and a drag doesn't also
    select it.
  - Not changed: From start is still off when a show opens. Follow-ups: jumping between rehearsal
    marks, a visible way into the beat
    editor in timeline mode, a hint for double-click isolation, a one-time hint for Ctrl+drag
    (backlog), timeline zoom keys besides Shift+Z (Ctrl+= and Ctrl+- are the app's page zoom),
    viewport-sized canvases for long shows at high zoom, and computing the waveform's envelope in
    the audio worker.

- **UI-13: page, count and measure, told apart (project owner, 2026-10-05).** The owner found the
  page, measure and count display unclear. A review of the running app found page and measure
  numbers both bare digits one row apart (home's "0" over measures "1 2 3 4"), a readout running
  three numbers together ("Pg 2 · ct 7 m6.4"), broken text with no measure ("m–.1" at home,
  "m—.32" in a show without measures), no count numbers on the timeline, a window badge ("7
  counts") repeating the readout's count with another meaning, and a playhead tooltip that covered
  the readout and, while playing, named the next page on a flag. A UX review of the first proposal
  cut it back: no new row, no "16 ct" page lengths, no "m" back on the ruler, and one vocabulary.
  Supersedes UI-12's **One readout** text, and its playhead tooltip.
  - **Page boxes** keep their bare label at the flag (no "Pg": the box and a heavier weight tell it
    from the numbers under it; project owner), sticking to the viewport's edge while the flag is
    scrolled away, so a long page always shows its name. Home is a house, not "0".
  - **The readout** is "Pg 2 · ct 7/16", then a dim "m4 beat 4". The "/16" says whose count it is;
    a measure's beat counts from its downbeat, so on a flag it reads "ct 16/16 m7 beat 1". Home
    reads "Home"; past the last flag, "After pg 4 · +4". The measure part is left out when the show
    has none there, and below 500px (project owner: musicians count by measure, so it stays as long
    as it fits). Screen readers hear "Page 2, count 7 of 16, measure 4 beat 4". It keeps a minimum
    width, so the transport doesn't shift as the count changes.
  - **No playhead tooltip.** The readout is the one place the position is written; the playhead's
    accessible name spells it out. Both read `getPageCountAt`, so they always name the same page.
  - **Counts without measures.** A show with no measures numbers the counts of the playhead's page
    in the measure row, each just left of the beat tick it lands on, so the last count sits on the
    flag. Beat ticks stay on every beat (project owner). Numbers thin by doubling steps from the
    page's start (2, 4, 8…) as zoom drops, always keeping the flag's count. Compact keeps the
    ticks, not the numbers.
  - **The window badge** shows only while a handle is dragged or when the window starts off a page
    line; from a page line its length is the playhead's count, which the readout shows. It uses the
    field line's words: "counts 3–6" inside one page box, or "12 counts" when it passes a flag.
  - Deferred (UX review): counts along the selected page box in shows with measures, a count
    under the pointer while hovering, and thinning to downbeats in odd meters.

- **UI-14: editing, renaming and deleting a move (lead, 2026-10-07).** The owner asked whether a
  custom track can be edited or removed once it's made: "If we can, it's not obvious as a user."
  It couldn't: in timeline mode a clip (a timeline off the page boxes, UI-10) had no menu, no
  name, and no Delete, and the inspector explained at the selected page's end, so a clip ending
  between flags showed another move's transitions. A clip is now called a **move** in all UI text.
  Items marked _lead default_ were filled in by the lead; feel-based ones are V-38 to V-55 in
  research/ownership/VALIDATION.md. Built on branch `timeline/edit-moves`. A review by four persona
  testers (2026-10-08) found Edit move couldn't edit the move, the delete toast's Undo could undo
  a later edit, Enter leaking to the app's shape shortcut, and hit-target problems; the items
  below include that fix round. A second review by four more (round 2, the same day) found keys
  and focus going astray, move numbers shifting, a leftover selection, and dashed clips that
  didn't say why; the items marked _round 2_ are its fixes.
  - **The clip menu.** Right-clicking a clip opens **Edit move**, **Rename move…** and **Delete
    move** (red, last, after a separator). Page boxes keep **Delete page flag**; a dragged range
    still has no menu in timeline mode. While playing, Edit and Delete are disabled with the reason
    ("Pause to edit or delete a move."); Rename stays, since it changes only a label (_lead
    default_, V-42).
  - **The ⋯ button.** The selected clip (a click selects it, UI-12) shows a ⋯ button ("Move
    options", an 18×16px target) at its right end that opens the same menu, so it is found without
    right-clicking. While the clip's end is scrolled past the timeline's right edge the button
    sticks to that edge, inside the visible part of the clip. A clip too narrow for its label and
    the button keeps the button just past its right edge, so the only visible way in never hides.
    With the clip focused, the ContextMenu key or Shift+F10 opens the menu there. Enter on a clip
    that isn't selected selects it, as a click does; Enter on the selected clip, or F2 on any,
    renames (as in a file list; V-48, code review). In compact the button sits on the thin bar.
  - **Clips show their label** (_lead default_, V-39). A clip at least 40px wide shows its name in
    expanded mode, cut with an ellipsis, beside the ⋯ button; narrower clips and compact bars keep
    it in the tooltip. Clips had no visible text before, so a name would have nowhere to show.
  - **"Move 2" for life** (_lead default_, round 2, V-49; reverses numbering by start). A new move
    stores "Move N" as its name when it is made, one more than the highest stored
    (`createRangeTimelineInTransaction`), so nothing renumbers it: deletes, undo, redo and reload
    keep it, and SQLite reusing a deleted id doesn't matter. A page's own timeline stays unnamed.
    A move from before this (unnamed) shows the number after the highest by start, then id, and
    stores it the first time a new move is made, so the new one never takes a number on screen.
    Clearing a typed name gives the next free number; clearing "Move N" keeps it. "Timeline 7"
    read as part of the UI, and as "Timeline" once cut. A move's color goes by its stored id
    (`timelineColor`), on the clip and its isolated paths, so it doesn't change either.
  - **Short clips under the start flag and the playhead** (_lead default_, V-47). Below the ruler
    and measure rows (over the waveform row and the clip rows) the start flag and the playhead are
    drawn but don't take the pointer: they are grabbed in the ruler and measure rows. A clip only
    a few counts long sat almost wholly under their 12px hit areas, so clicks on it missed; and
    (round 2) a Ctrl+drag started on the waveform row just right of the start flag dragged the
    flag, so a range drawn over counts 1–4 selected counts 5–8.
  - **Delete move** deletes the timeline, its transitions and their assignments as one undoable
    edit (`deleteTimeline`). Moves it passed through are stored underneath (UI-10) and come back.
    The window (S, P) stays put and now resolves to no stored timeline; an isolated move that is
    deleted ends isolation through the existing "timeline goes away" path, which puts S and P back
    where they were before isolating (09-isolation.md). A toast says "Deleted Go company front"
    with **Undo**, which runs the app's undo. It closes on the next edit, undo or redo, so its
    Undo can only ever undo that delete (V-44); otherwise it stays 8 seconds. There is no
    confirmation dialog: the edit is undoable (V-38). **Delete** or **Backspace** on a focused clip
    deletes its move; the clip handles the key and stops it, so it never reaches the app's
    shortcuts (Delete deletes a shape there). A Delete repeated while the move is being deleted,
    or on a move already gone, does nothing and says nothing. Focus goes to the next clip, else
    the previous one, else the timeline, never the page (round 2, V-55).
  - **Rename move…** turns the clip into an inline name field with its text selected. Enter or
    leaving the field saves, Esc cancels. Names are trimmed and at most 80 characters, and the
    field says so once a name reaches 80 ("80 characters at most") rather than cutting silently;
    an empty name gives the move its number back (above); an unchanged name writes nothing.
    One undoable edit (`renameTimeline`). Keys typed in the field stay there (G, Space, Shift+Z,
    Delete, Enter). After Enter or Esc, saved or cancelled, focus is back on the clip (round 2).
    Closed any other way (a click, a blur), it leaves focus where it went, the page included: a
    click on a marcher keeps Delete and the arrows for the marchers, and a click on another clip
    keeps them for that clip, so Delete never deletes the renamed move (code review). A name
    being typed is saved when the field goes away before it blurs (a click on the lane selects
    another window first), in the clip's field and the card's (round 2). The inspector's Move card
    has the same field. A name field left open while its move is deleted writes nothing and says
    nothing.
  - **Edit move isolates the move** (09-isolation.md; review, supersedes "doesn't isolate"): the
    window is its range with P on its end, its paths show, other marchers are dimmed, and a canvas
    drag sets where its marchers end up. On a move already isolated it stays isolated. It leaves
    fullscreen if the inspector is hidden and scrolls the Move card into view with a brief
    highlight, with focus on the card's heading, off the ⋯ button (_lead default_, V-40). It
    selects nobody (round 2): isolation already shows who is in the move, **Select them** selects
    them, and one Esc leaves. One Esc now leaves isolation however it was entered, also with
    marchers selected, which the same press deselects; the bar says "Done (Esc)" (round 2, V-51).
  - **The Move card.** While the window is a move with a clip (or that move is isolated, with P
    anywhere inside it), the inspector starts with a **Move** card, above the page and marcher
    editors (round 2, V-53), headed with the move's label: why its clip is dashed, when it is
    (below); the name field, where Enter saves and stays and Esc puts the name back and goes to
    the heading; when it happens, in the field line's words ("Page 3, counts 1–4", or "Page 2 count 5
    to page 3 count 4"; UI-13's one vocabulary); **Path**, for the whole move; "To change where
    they end up, drag marchers on the field at the move's end", with **Go to end** while P isn't
    there; "16 marchers" with **Select them**; and **Delete move**. A page timeline gets no card:
    pages are moved with their flags.
  - **Path, for the whole move** (_lead default_, V-45). A move is one one-slot transition per
    marcher (UI-9), so the transition editor bent one marcher at a time. The card's Path is Direct
    or Arc with one bulge, written to every transition of the move as one undoable edit
    (`setMovePath`); "Mixed" shows when they differ, and choosing a style makes them all the same.
    Follow the leader isn't offered: it needs a shape, which a move's transitions don't usually
    have. A move whose transitions all follow the leader (the shape editor can leave one so) shows
    "Follow the leader", not "Mixed", with neither radio chosen; Direct or Arc still changes them
    all as one edit (code review). The edit reads the paths under the write lock, so a choice sent
    twice is one edit.
    It is a radio group (round 2): the arrows move the choice and apply it.
  - **Per-marcher details** (_lead default_, V-46). With a move, the selected marchers'
    explanations and transition editors are about that move: they explain inside it, at P, or at
    its last beat when P is on its end (where the next move starts). They sit under a closed
    "Per-marcher details (16)" disclosure under the card, and when more marchers are selected than
    are shown it says "Showing the first 10 of 16 marchers".
  - **The inspector explains at the playhead** in timeline mode, not the selected page's end
    (_lead default_, V-41), except inside a move, above. On a flag that is the same beat; between
    flags it is where edits land (UI-10). "Select a page to see why…" is gone, since there is
    always a playhead. While the playhead is scrubbed it holds the last settled beat, and the move
    the window was on with it (the Move card too, so the two never differ), and explains once the
    scrub ends, rather than rebuilding on every beat passed (code review).
  - **Keys on the move controls** (_lead default_, round 2, V-50). On a clip, its ⋯ button, the
    Move card and the isolation bar (`data-timeline-own-keys`), Space always plays and presses
    nothing; Enter activates the focused control; the arrows (and WASD) work the Path radios and
    do nothing on a focused clip. WASD goes by the physical key (`event.code`), as the app's nudge
    does, so another keyboard layout can't slip a nudge past. The app's registered shortcuts skip
    Enter, the arrows and WASD there (`isTimelineOwnKey`), so Enter on the card's Delete move
    deletes the move instead of creating a shape. The app's nudge also takes Ctrl+WASD; on these
    controls it skips them too (`skipsAppNudge`), while Ctrl+S still saves and Ctrl+A still
    selects all. Elsewhere every shortcut works as before. Focused clips show an offset
    outline, apart from the selected clip's ring, and the card's controls a focus ring.
  - **A leftover selection** (_lead default_, round 2, V-52). Going to another move (a clip click,
    a double-click, Edit move) clears the marchers the previous move's **Select them** selected,
    while they are still exactly the selection; a selection changed since is the designer's own
    and stays.
  - **Dashed clips say why** (_lead default_, round 2, V-54). Where every member of a move is
    taken by another (the dashed spans, UI-4), the clip's tooltip, its screen reader description
    and its Move card say "Overridden by Move 4 on Page 3, counts 1–4" (`overriddenBy`,
    `describeMoveClips`).
  - **Words for screen readers** (round 2). A move's clip is named "Company front, move, Page 3,
    counts 1–4", in counts rather than beats, and ends in ", selected" when it is (it was a
    toggle, read as "pressed"); its description says why it is dashed and its keys: "Enter to
    select, F2 to rename, Shift+F10 for options, Delete to delete", or once selected "Enter or F2
    to rename, …". The isolation bar's key reads "Key: dotted gray
    paths show where this move would take marchers who left it". The field line's sentence is
    announced at once when it comes back after isolation, not the one from before isolating, and
    a one-count window is "count 3", not "counts 3–3".
  - **Tabbing through the rotation field** (round 2). The marcher inspector's rotation field saved
    every selected marcher on blur, even unchanged, which in timeline mode made a new move at the
    window (a tester saw a second move appear after pressing Enter in the card's Name field; it
    came from tabbing past the rotation field). It saves only after the group was turned.
  - **The timeline is its own stacking context**, so nothing on it (**+**, the playhead) paints
    over a menu, and a press inside a menu opened from the timeline never reaches the timeline
    (React events bubble out of portals).
  - Not in scope, follow-ups: deleting or renaming a page's moves (a page timeline has no clip),
    moving marchers between moves, a name on page boxes, and a move-wide editor for anything but
    the path (order, destinations as a shape). Seen in the review and left as they were on
    `timeline-try-2`: undo of a delete taking 1.5–2 seconds, the clip lane lagging the field after
    undo and redo, and developer wording in the per-marcher details (D-REBASE, founding span).
- **UI-15: dragging timeline edges (project owner, 2026-10-08).** The owner asked for two edge
  drags: "I should be able to move the start and end of a timeline/track, i.e. changing its
  length" (resizing a move), and "I should be able to MOVE where a page flag is" (UI-16), then asked
  for both as one feature. Design notes:
  [research/timeline-edges/README.md](research/timeline-edges/README.md) (the shared rules),
  [research/resize-move/README.md](research/resize-move/README.md) (edge cases E1–E22) and
  [research/move-page-flag/README.md](research/move-page-flag/README.md). Feel-based defaults are
  V-120 to V-128 (move edges) and V-60 to V-68 (flags).
  - **What stretches.** What you drag, and anything with an edge on it, takes the new counts; what
    you don't touch keeps its counts. The sets keep their coordinates (D-5): a move's set stays at
    its end and its path is re-timed, so the step size changes. Nothing is trimmed: a marcher never
    stops partway along its path.
  - **Snapping, for every edge.** Page lines and the paused playhead pull an edge from 12px,
    downbeats from 6px, else it lands on a whole beat. Alt keeps only the whole beat
    (`timelineEdgeSnap.ts`). A dragged flag skips the page lines: it stops a count short of every
    other flag, so they would only pull it toward beats it can't take (zoomed out, counts next to
    a neighbor became unreachable). Dragging a whole move keeps its own 24px page-line snap.
  - **Beats an edge can't take.** An edge never lands where two timelines would share a range
    (C-12), or where the rows can't follow. With the pointer over such a beat, the edge waits on the
    nearest allowed beat back toward where it started; the readout says why, and a move's clip gets
    a dashed red outline. Release commits where it waits. It never merges into the other timeline
    (owner, 2026-10-08, V-127).
  - **Walls.** An edge stops at what it would collide with or be cut short by, and the readout names
    it: a neighboring flag, a move attached to the flag, another move on the same marchers at the
    same or a higher layer (it never takes over the overlap: owner, 2026-10-08, V-121), a marcher
    joining or leaving partway, or 1 count. It grows over moves it
    already overrides (the page moves under a breakaway), which catch up where it ends (V-20, V-21).
  - **Readouts.** One wording: "Page 3: 8 → 11 counts", "Move 3: 4 → 6 counts", then the reason.
  - **One edit, Esc cancels.** A drag commits once, on release, as one undoable edit. Esc, a lost
    pointer, or a drag brought back writes nothing. Esc during a clip drag never also leaves
    isolation.
  - **Where they're grabbed.** A flag by its page line through the page-box row (owner,
    2026-10-08; UI-16). A move by the handles inside its clip's two ends: up to 6px, at most a quarter of the clip, none on a clip
    under 8px (V-120). The ⋯ button keeps clear of the end handle. Over the clip rows the start flag
    and the playhead are drawn but not grabbed (UI-14), so a selected clip's edges can be reached.
  - **Afterwards.** A selected move's start flag and playhead follow its new start and end; an
    isolated move keeps the playhead unless it was on the end. A playhead or start flag on a moved
    flag goes with it.
  - Not built (both gestures): keyboard resizing of a move's edges, live preview of moves attached
    to a dragged flag, edge scrolling while dragging, and a ripple mode that pushes later material.
- **UI-16: moving a page flag (project owner, 2026-10-08).** The owner: "I should be able to MOVE
  where a page flag is. Currently, once it's made, it's stuck there." Built on branch
  `timeline/move-page-flag`. Design note, edge-case table and prior art:
  [research/move-page-flag/README.md](research/move-page-flag/README.md). Items marked _lead
  default_ are V-60 to V-68. The rules it shares with resizing a move are in UI-15.
  - **A roll edit.** Dragging page N's flag gives page N what page N+1 loses. Every other flag,
    the beats, measures, tempo and music stay put. Timelines track the moving flag (U-Q5): a
    row edge on the flag follows it, and every other edge keeps its beat. So the sets keep their
    coordinates and the two pages' moves take the new counts. One undoable edit.
  - **The grip** is the page line through the whole page-box row (owner, 2026-10-08: the
    lower-half grip was hard to find, and "just the line at the top in the page boxes"; below the
    row the line isn't a grip), 12px wide (narrower on a narrow box), with a bar on hover and a
    horizontal-drag (`ew-resize`) cursor. On a flag it takes the place of the playhead's head and the start
    pennant; those are dragged from the measure row, and clicking a page box puts the playhead on
    its flag. A press that doesn't move selects the box on that side; a plain drag elsewhere on a
    box still scrubs (UI-12). Home's flag has no grip. While playing or isolated, there are no
    grips.
  - **Limits.** Every page keeps one count, so flags never pass or push each other, and the last
    flag stops at the show's end. A move with an edge on the flag can't be left behind: the flag
    stops before its far end. A beat the timeline rows can't take (two moves would share a range,
    C-12, or the ripple would refuse) is a hole the flag passes over but can't land on. A readout
    by the flag shows both pages' counts ("Page 3: 8 → 11 counts") and what stopped it.
  - **Snapping.** UI-15's edge rule without page lines: the playhead within 12px, downbeats within
    6px, else whole beats. Alt turns it off.
  - **Afterwards.** A paused playhead or start flag on the moved flag goes with it, so the selected
    page stays selected and the field shows the same set. Appearance by beat follows by itself.
  - **Keys and cancel.** ← and → move a focused grip one count (one edit each). Esc, a lost
    pointer, or a drag brought back writes nothing.
  - Not built: clips on the flag only move on release, not during the drag; edge scrolling while
    dragging a flag; a ripple variant (Shift-drag, shifting every later flag).

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
end beat, and edits the selected timeline (P8.12, P8.15). It reads the playhead
since UI-14, and starts with a move's Move card. The text below describes what
was built before._

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
  - ~~whether clicking a clip selects its timeline~~ (yes: UI-12);
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
  - Deleting or renaming a page's moves (a page timeline has no clip or Move card). UI-14.
  - A one-time hint for Ctrl+drag (Cmd+drag on macOS) after the first plain scrub on empty
    timeline: "Ctrl+drag to mark a range" (project owner, 2026-10-05: not yet). UI-12.
  - Start flag behavior (project owner, 2026-10-04: "a longer conversation",
    out of scope for now). The flag is the base of every edit; open is when,
    if ever, it moves on its own. Today a pinned flag survives navigation
    (UI-10 _lead default_; since UI-12, until unpinned), so a forgotten pin can turn a drag into a move
    straight through several pages
    (research/ownership/10-cross-page-windows.md §4.3, VALIDATION V-22). An unpinned flag no
    longer chases the playhead page by page: since the UI-12 review it moves once, when a scrub,
    page-box drag or run of arrow keys ends, and when a play-on run is paused (V-36).
