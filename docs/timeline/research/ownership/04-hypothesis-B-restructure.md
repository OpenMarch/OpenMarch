<!-- cspell:disable -->

# Hypothesis B: restructure into intent (moves) + ownership (segments)

Stance: we may change the schema. Sources checked: spec §2–§8 (R-2..R-5, R-13,
D-7, D-12, U-1), ui.md UI-9/UI-10, implementation-plan C-11/C-12, mockups 2.png
(steal-out) and 3.png (join-in).

## 0. What today's model already has (important for honesty)

- `assignments` already carry their own `[start,end)` inside the transition
  (C-11 keeps assignments free to "join late, leave early"). That is option (a)'s
  membership window, minus explicit handoffs.
- R-4 already derives a receiving move's origin from where the marcher actually
  is, and D-7 measures progress against `T.end`. So the steal-out (scenario 1)
  already resolves correctly in the database: green [0,16) L0, yellow [8,24) L1.
  Yellow starts on green's path at 8; green's slot dest is still stored, so the
  remainder exists hypothetically. Today only UI-9's "partial overlap refused"
  rule and the missing ghost rendering block it.
- What does **not** exist: an intended origin for a slot nobody founds (the
  joiner's ghost start), and a link that makes the feeder land on green's path.
  Today a join rebases (D-12): it goes straight from wherever it is to green's
  destination, so there is no ghost start and nothing to bind to.

So the restructure buys two separate things: (1) explicit ownership instead of
layers, and (2) intent for all slots, ghosts included, plus live links. (2)
could be added to the layer model too (section 9).

## 1. Options considered

- (a) Membership windows + handoff edges. Close to today. But layers or edges
  still decide what happens on overlap, and A→B→A needs two windows on A anyway.
- (b) Per-marcher ownership track: ordered, non-overlapping segments, each
  pointing at (move, slot). No layers. **Pick.**
- (c) Moves as constraints/keyframes with derived per-marcher paths. Most
  expressive, but resolution becomes solving, with no clear guarantee that edits
  stay local. Undo, caching and the §8.11 bound all get harder. Rejected.

Why (b): resolving a beat is "find the segment", every handoff is a visible row,
there's no hidden precedence, and partial overlaps stop being errors. It is also
exactly what R-2 already computes (flattened spans), so migration is a
flattening, not a rewrite of meaning.

## 2. Schema

Kept as is: `marchers`, `shapes`, `timelines`, `transitions` (= moves, C-11
still: a move spans its timeline), `slot_destinations`.

```sql
-- Intent: where each slot's path starts, when nobody founds it (a ghost start).
CREATE TABLE slot_origins (
  transition_id INTEGER NOT NULL REFERENCES transitions(id) ON DELETE CASCADE,
  slot_index    INTEGER NOT NULL CHECK (slot_index >= 0),
  x REAL NOT NULL CHECK (abs(x) <= 1e6),
  y REAL NOT NULL CHECK (abs(y) <= 1e6),
  PRIMARY KEY (transition_id, slot_index)
) STRICT;

-- Destination source: 'placed' (x,y used) or 'linked' (derived, see §4).
ALTER TABLE slot_destinations ADD COLUMN source TEXT NOT NULL DEFAULT 'placed'
  CHECK (source IN ('placed','linked'));          -- x,y kept as last-resolved cache for display/export only

-- Ownership: replaces assignments + layer.
CREATE TABLE segments (
  id            INTEGER PRIMARY KEY,
  marcher_id    INTEGER NOT NULL REFERENCES marchers(id)    ON DELETE CASCADE,
  transition_id INTEGER NOT NULL REFERENCES transitions(id) ON DELETE CASCADE,
  slot_index    INTEGER NOT NULL CHECK (slot_index >= 0),
  start_beat    INTEGER NOT NULL, end_beat INTEGER NOT NULL,
  entry         TEXT NOT NULL CHECK (entry IN ('found','on_path','rebase')),
  CHECK (end_beat > start_beat)
) STRICT;
CREATE INDEX idx_seg_marcher ON segments(marcher_id, start_beat);
```

Invariants (checks only, U-1; the overlap and link checks are commit-time rows in
`timeline_commit_violations` like E-T1, because a split is "trim, then insert"):

- S-1 a marcher's segments don't overlap; each lies inside its move's range.
- S-2 a (move, slot) is owned by one marcher over all its segments (keeps D-4
  slots; drops `UNIQUE(transition, marcher)` so A→B→A can be two A segments).
- S-3 `entry='found'` iff `start_beat = T.start`. A slot with no `found` segment
  must have a `slot_origins` row (its ghost start). A founded slot has none.
- S-4 `on_path` is allowed only mid-move (`start > T.start`), and only when the
  marcher's previous segment ends exactly there on a move whose slot destination
  is `linked`. A `linked` destination needs exactly that following segment.
- S-5 no `on_path` into follow-the-leader (FTL joins stay `rebase`, as R-11).

Holds are gaps, not rows (as today).

## 3. Resolving a position

`pos(m, b)`: binary-search m's segments.

- Gap: hold at the previous segment's end position (home before the first).
- `found` or `on_path` segment on (T, i): `intent(T,i,b)`, evaluated
  **on the rails**: `style(origin_i, dest_i, (b−T.start)/(T.end−T.start))`.
- `rebase` segment: today's D-12 formula from the actual position at
  `seg.start` to `dest_i`, over `[seg.start, T.end]`.

`origin_i` = `slot_origins` row if present (ghost start); otherwise the founder's
actual position at `T.start` (R-4). `dest_i` = placed point, or if `linked`,
`intent(U, j, T.end)` where U/j is the move and slot of the marcher's next
(`on_path`) segment.

Acyclicity: bound origins look strictly back in time; links look forward to a
mid-move beat of U, whose origin is a stored ghost (S-3), so never back to the
feeder. S-4's "mid-move only" rule is what breaks the one obvious cycle (feeder
dest linked to a founding origin that is the feeder's own end). The §9.3 proof
and cache tiers have to be redone with a new `linkedDest` cache entry. That's
real spec work, not a footnote.

## 4. Continuity at handoffs: who snaps to whom

- **Exit (peel-off): the receiving move snaps to the marcher.** Yellow's origin
  is derived from green at 8 (R-4, unchanged). Always continuous.
- **Entry (join): the feeder snaps to the receiving move.** Yellow's
  destination is `linked`: live, it is green's intent path for that slot at the
  merge beat. Editing green's destination or ghost start moves the merge point,
  and yellow re-aims. Never a jump.
- **Disagreement after an edit.** A linked destination can't disagree. If the
  user drags yellow's end (the merge point) on the canvas, we keep the link and
  **solve green's ghost start instead** (direct: `o = (P − p·d)/(1−p)`; arc:
  numeric). For p ≥ ~0.9 the solve amplifies, so we refuse with a hint to move
  the ghost start. **Unlink** (inspector) turns the destination `placed` and the
  entry `rebase`: today's D-12 join, flagged `D-OFFPATH` so the gray ghost shows
  the gap.
- **Resume after a steal** (A→B→A): default `rebase` (today's behavior).
  "Rejoin on path" links B's destination and makes A's second segment `on_path`.

## 5. Ghost rendering (selected move T)

For every slot i of T, draw the full intent path `origin_i → dest_i`:

- solid in T's color where the slot's marcher owns it;
- gray where nobody does (peeler's remainder, joiner's approach);
- gray **ghost start** dot when the slot has a `slot_origins` row (joiner);
- gray **ghost end** dot when the slot's last segment ends before `T.end` (peeler);
- normal "previous" dots at founders' origins;
- handoff markers at exit/entry points, colored as the other move (yellow
  arrow heads in the mockups), with a link glyph when linked.
  Ghost dots are draggable: start ghosts edit `slot_origins`, end ghosts edit the
  slot destination (for a peeler this re-aims green and moves yellow's origin).
  Rebase segments show their actual path solid and the intent path gray.

## 6. Strip and canvas UX

Strip: still one clip per timeline (UI-9 Tracks). Membership shows on the clip:

- an **edge notch** at each beat where members leave (`−4`, down tick) or join
  (`+4`, up tick). Hover highlights those marchers; click selects them.
- the clip's fill height steps with member count (thin "membership band"), so a
  clip that loses 4 of 6 visibly narrows after the notch.
- with marchers selected, their own segments draw as a solid band across clips
  (the rest of each clip fades), which replaces per-marcher tracks.

Canvas gestures (UI-10 kept: S = leave, P = arrive, the drag adds):

- **Peel-off:** playhead at 8 inside green, pin S there (drag the start handle
  or "Start here"), set P to 24, select the 4, drag sideways. One edit: create
  yellow [8,24); trim their green segments to [0,8); add yellow `found`
  segments. No refusal: partial overlaps are fine now. A window strictly inside
  a move gives trim + new + `rebase` resume (today's steal, kept).
- **Join:** with the joiners already in green (founding, dragged into the
  formation at its end), put P at the merge beat b and choose **Join here**
  (menu on the selection, or drag the left edge of their band in the clip).
  One edit, with zero visible motion change: their green segments start at b
  (`on_path`); `slot_origins` = their current position at green's start
  (frozen); a new yellow [green.start, b) with `found` segments and `linked`
  destinations. Since yellow then ends exactly where they already were at b,
  nothing moves. Then the user drags the gray ghost starts, or presses
  **Align ghosts to group**: ghost = dest − the founders' mean displacement.
  That gives the left mockup's in-line gray row; free dragging gives the right
  one.
- Answer to "computed or user-placed": **always stored**, seeded by one of two
  computed defaults (freeze or align), then user-editable. They are never
  silently recomputed, so an upstream edit can't move the joiners' paths
  (consistent with D-5's absolute geometry). When the user drags green's start
  set (founders' previous dots and the ghosts together, as one selection), the
  ghosts move with it, the merge points move, and yellow follows the link.

## 7. Scenarios step by step

**1. Steal-out.** Green [0,16): 6 slots, all `found`, dests 16 forward. Peel
gesture above. Data: 2 marchers keep green [0,16); 4 have green [0,8) and
yellow [8,24) `found`. Resolve at 4: all on green rails. At 12: 4 on yellow,
starting at green(8). Select green: 6 paths, 4 gray past count 8, 4 gray end
dots, yellow arrow markers at 8. Edit green's destination (drag all 6 end
dots, ghosts included): green(8) moves, so yellow's origin moves (derived), and
yellow still ends where it was placed. "Acts as if all 6 still go there": yes,
by construction.

**2. Join-in.** Green [0,16) founded by 2. 4 joiners merge at 6. After Join
here: joiners' green segments [6,16) `on_path`; `slot_origins` for 4 slots;
yellow [0,6) `found` with `linked` dests. Select green: 2 solid paths; 4 paths
gray from the ghost starts to 6, solid after; gray ghost start dots; yellow
arrows into 6. Drag a ghost start: the merge point slides along, and yellow
re-aims live. Edit the founders' start (the previous page): founders change;
ghosts stay unless they were part of the dragged start set; the join stays
continuous either way.

## 8. Migration, undo, file format

- **Migration:** run R-2 flattening per marcher (already implemented in
  `resolver.ts`). Each non-hold span becomes a segment: founding → `found`,
  join/resume → `rebase`. Drop `layer`. All destinations `placed`, no
  `slot_origins`. Resolution is bit-identical: a founding span is today's R-7
  on rails, and rebase is D-12 verbatim. The golden vectors become a
  migration-equality suite.
- **Converted page shows:** one move per marcher per page, full range, all
  `found`. Trivial, no ghosts. The P6 converter writes segments directly.
- **Undo:** the generic per-table history triggers are generated for
  `segments` and `slot_origins` (`ref/history.py` pattern). Every edit is still
  explicit statements in a valid order (D-17). Checks stay checks. Old undo
  stacks are cleared on migration.
- **File format:** a schema migration (new tables, `assignments` dropped),
  recorded in ADR 0001 §6. Converted dev files migrate on open. Older builds
  can't open migrated files (already true for converted shows).

## 9. Cost, and comparison with "keep layers + steals"

Rewrite surface:

- spec §2, §5, §6, §8 (R-2/R-3 replaced, R-4/R-13 extended), §9 (caches,
  invalidation, acyclicity), §12 (golden, QA-FL, QA-INV);
- `ref/` (resolver.mjs, schema.sql, history.py, fuzz/props);
- `packages/core/src/timeline/resolver.ts` (~1k lines), `validate.ts`, `types.ts`;
- desktop `timelineAssignments`, `timelineAssignmentEdits`, `timelineMembership`,
  `timelineMoves`, `timelineRipple`, `timelineCommands` (~3k of the ~5k timeline
  db-function lines);
- about 34 desktop files mention layers, plus the history and e2e tests.

My estimate: 4–6 weeks for one developer, of which spec and proof are ~1.5. The
ghost rendering and strip UX cost about the same under either model.

|                       | Keep layers + steals (+ additions)                                                                                       | Segments (this pick)                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| Steal-out             | Works in the DB today; lift UI-9's partial-overlap refusal when the new layer runs past the old end; add ghost rendering | Native                                                    |
| Join with ghost start | Needs the same `slot_origins` + linked dest + "on-path join", added on top of layers                                     | Native                                                    |
| Precedence            | Hidden integer, A→B→A implicit, P8.14 refusals stay                                                                      | Explicit rows, no refusals                                |
| Resolver              | R-2 flattening stays                                                                                                     | Lookup; flattening only in migration                      |
| Risk                  | Low; incremental                                                                                                         | Spec/proof rework, broad churn, new cycle surface (links) |
| Cost                  | ~1.5–2.5 weeks                                                                                                           | ~4–6 weeks                                                |

Honest verdict: the owner's two scenarios are mostly about **intent and links**
(ghost starts, linked destinations, ghost rendering). Those are orthogonal to
layers vs segments, and can be added to today's model. Segments are the cleaner
long-term model (no hidden precedence, no partial-overlap refusals, explicit
handoffs). But the restructure alone doesn't deliver the scenarios, and it
roughly doubles the cost. Recommended sequencing if B is chosen: ship
`slot_origins`, linked destinations, the `entry` mode and ghosts on the current
schema first (they carry over unchanged), then swap `assignments.layer` for
non-overlapping segments as a separate, migration-tested step.
