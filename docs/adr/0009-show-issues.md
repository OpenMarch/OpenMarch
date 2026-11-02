# 0009: Show issues: pure checks, a worker sweep, and dismissals in the show file

- Status: proposed
- Date: 2026-11-01
- Spec: [docs/show-issues](../show-issues/README.md)
- Related: [ADR 0001](0001-timeline-motion-model.md) (the resolver this reads,
  amended by D-3), [ADR 0002](0002-3d-view.md) (put-downs, D-9),
  [ADR 0005](0005-three-field-renderer.md) (the field that draws the markers)

ADR numbers 0007 and 0008 are taken by open PRs (#550, #373). If another
record merges as 0009 first, the second to merge renumbers.

## Context

Collision detection (fork #226) checks only the selected page, in the
renderer, at about 30 ms per page with 2,000 marchers. Its results show in a
toolbar tab that appears and disappears with the selected page. Step-size
warnings are a separate system with their own badge, field paths and
threshold.

The owner wants one **Issues** panel that collects every problem in the
whole show, like a grammar review, without slowing editing down or adding a
constant cost (spec: [docs/show-issues](../show-issues/README.md)). Three
things need durable decisions:

1. Where checks live and what they read, so more checks can be added later.
2. How the whole show gets checked without a constant cost. A 60-page show
   at 30 ms per page is about 2 s of CPU per full pass. Rerunning that after
   every edit isn't acceptable. Moves, holds and keyframes overlap page
   flags, so "the pages an edit touched" isn't a reliable unit.
3. Where dismissals and rules are kept. They are new data in the show file.

## Decision

### D-1. Checks are pure functions in `packages/core`

A check reads positions through the resolver interface (`positionAt`,
`positionsAt`, `spanInfos`) plus a plain snapshot of the show data it
declares (sections, tags, rules, the field's step size). It returns hits
over the time window it was given. Checks have no React, no database access
and no DOM, so the same code runs on the main thread and in a worker, and
tests pass stand-in resolvers as `CollisionDetection` does today.

Each check declares:

- **its natural incident unit**, `counts` or `move`, used to stitch hits
  into incidents. A move is one performer's assignment to one transition,
  not a resolver span: spans include holds, and a higher layer can split one
  move into several spans;
- **its show inputs** (which tags, sections, rules or field properties it
  reads), used for invalidation (D-3);
- **its rules schema**, with show defaults;
- **its field drawings**, a rest mark and a focus explanation, so the
  framework draws markers and checks don't draw directly.

The framework, not each check, owns stitching, levels, rule resolution, and
identity matching for dismissals and for "new".

### D-2. Two tiers, one check implementation

- **Live tier, main thread**: runs the checks on the selected page's own
  counts once the page and resolver version settle (150 ms), as
  `useCollisionDetection` does today. It costs no more than today and drives
  the soft blink.
- **Sweep tier, a dedicated worker**: runs a **full copy of the timeline
  host**, not just a resolver. It keeps the mirror updated by
  `applyBatchToMirror`, the resolver from `createResolver`, and the
  put-downs layer (`withPutDowns`), as the app does in `timelineHost.ts`. It
  subscribes to the same change stream as the main thread
  (`subscribeTimelineChanges`, both `batch` and `reset`) and receives item
  put-down updates (`setTimelinePutDownItems`), which bump the version
  without a batch. `subscribeTimelineChanges` only covers timeline tables,
  so the main thread also posts a **show-inputs snapshot** (tags, sections,
  rules, the field properties checks read) whenever those queries change,
  and the worker applies D-3's table to it. The 3D View's own resolver plus put-downs
  (`view3d/positions.ts`) is the precedent. The worker never touches the
  database. It checks the rest of the show in chunks, nearest the playhead
  first, and posts issues back.

Results from both tiers go through the same stitching and matching. The live
tier's hits replace the sweep's hits inside its window. Incidents that cross
the window's edge are re-stitched from live hits inside and sweep hits
outside. A `move` incident only partly inside the window is rechecked whole
by the tier that sees the whole move.

### D-3. What's out of date: a resolver report, narrowed by fingerprints

**Resolver addition (amends ADR 0001 §4).** `InvalidationReport.marchersRebuilt`
is not enough. It only lists marchers from assignment rows, transition
start/end changes and `home` changes. Shape geometry, transition
`dest`/`slots`/`style`/`params`, slot destination points, and
follow-the-leader leader or order changes move marchers without listing
them. The core tests confirm this (`resolverInvalidation.test.ts`: a shape
edit and an FTL order toggle both report `[]`). So `notify()` gains a
report of **every marcher whose positions may have changed, with the
earliest such beat**: `positionsChanged: { marcherId, fromBeat }[]`. The
resolver already has what it needs: the per-marcher earliest beat in
`affected`, transition-to-row lookups, and FTL entry members. Put-down items
inherit their holder's entry. Core tests must show that, for random batches,
`positionsChanged` covers every marcher whose sampled positions differ.

**Fingerprints.** The worker keeps a fingerprint per (marcher, bucket),
where a bucket is 4 counts: a 32-bit hash of the marcher's positions sampled
at a fixed rate of 4 samples per beat, so a 1-count move's path style
changes the hash. 200 marchers over 1,000 counts is 50,000 numbers, about
200 KB.

**After a batch:**

1. For each `positionsChanged` entry, re-sample that marcher from `fromBeat`
   to the end of the show.
2. Buckets whose hash changed go on a dirty list as (bucket, changed
   marchers). The fingerprints narrow the resolver's "from this beat onward"
   down to where positions actually changed.
3. Checks rerun only on dirty buckets. Position checks narrow further: a
   collision recheck tests only pairs where at least one marcher changed,
   using a spatial grid. Unchanged pairs keep their cached result. A `move`
   check rechecks every whole move that overlaps a dirty bucket.

**Changes positions can't show:**

| Change                                                         | What reruns                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------------ |
| A check's rules                                                | That check, whole show                                             |
| Tags or sections (membership, names)                           | Every check that declares them, whole show                         |
| The field's step size (`stepSizeInches`)                       | Every check, whole show (thresholds are in steps)                  |
| Move structure (split, merge, assignments) with equal positions | `move` checks, for the moves touched by the batch                  |
| Marchers added or removed                                      | Every check, for those marchers                                    |
| `reset` (file open, host failure, unwrapped writes)            | The worker rebuilds its host from a fresh snapshot; all checks dirty |

**Inserting or deleting counts** ripples every later row
(`withTimelinePageRipple`), so every bucket after the edit is dirty for every
marcher. That's correct, and the spike measures its cost.

**Safeguards.** Debug builds compare fingerprints against a full re-sample
after every batch and fail loudly if `positionsChanged` missed a marcher. A
property test covers the same thing in core. This is deliberately separate
from the timeline model: whatever produces positions, a change shows up as
changed positions, and the resolver's report only has to be a superset.

### D-4. Pacing is driven by out-of-date work, never by a timer

The sweep runs only while the dirty list is non-empty, so an idle show uses
no CPU. It doesn't run during playback, scrubbing or a drag. It pauses while
the window is hidden. It starts about 2 s after the last commit, or about
10 s and in smaller chunks on battery (Electron `powerMonitor`, and the
Battery API in the web build where it exists). A per-user setting chooses
**Automatically**, **When Issues is open** or **Never**. Never leaves only
the live tier running.

### D-5. Dismissals outside undo; rules as ordinary show edits

One migration adds two tables.

**`issue_dismissals`**, with no history triggers (following `view3d_cameras`
and the Library tables). Dismissing is a review judgement, not a drill edit,
so undo never brings warnings back. Columns:

- check id;
- kind: `occurrence`, `performers` or `check`;
- performer ids;
- for occurrences, the span stored as the **id of its first count's beat**
  (`beats.id`) and a length in counts.

Pages reference beats by id (`pages.start_beat`), and beat ids survive
inserting or deleting counts elsewhere, splitting a page (which moves the
existing page id to the later half) and dragging a page flag. So no ripple
has to rewrite the table, and undo can't leave rippled spans behind. Page
ids would not work as anchors, for exactly those last two reasons. The
overlap-or-touch tolerance absorbs small shifts in the issue itself, and a
bigger change correctly brings the issue back. A dismissal whose beat no
longer exists (its counts were deleted) is ignored, like a missing
performer below.

Matching:

- an **occurrence** matches when the check and the exact performer set are
  equal and the resolved span overlaps or touches;
- a **performers** dismissal matches every issue of that check whose
  performers include all the dismissal's performers;
- a **check** dismissal turns the check off.

Deleting a performer or counts doesn't cascade. Dismissals naming a missing
performer or beat are ignored, and pruned when the file is next opened, so
undoing the delete in the same session brings them back.

**`issue_rules`**, **with** history triggers. Rules are show edits like the
field properties they sit beside, so they undo like them, and deleting a
performer and undoing it restores their rules through the normal history.
Columns: check id; target (`show`; `section` by name, because
`marchers.section` is free text; `tag` by id; or `performer` by id); a JSON
value validated by the check's rules schema. Tag and performer rules cascade
on delete through foreign keys, so the history restores them on undo. A
section rule whose name no longer matches any performer (after a rename) is
kept and shown in the Checks section as "Woodwinds · no performers", so it
can be retargeted or deleted. Show defaults live with the check: in field properties
for step size (`stepSizeWarningThresholdInches`, unchanged), or as a
`show`-target row for checks with no existing home.

The step-size default staying in field properties keeps the public
`FieldProperties` type in core unchanged, and lets older app versions keep
reading it.

Scope (Whole show or Here), the seen state behind "new", and the sweep
setting are per user (UI settings), not saved in the show. The seen state is
keyed by the show file's path.

## Consequences

- One framework, one panel and one marker style for every check. New checks
  are a core function plus messages, with no UI or scheduling work.
- The collision toolbar tab, `CollisionStore`, `zoomToCollisions` and the
  separate step-size field paths and toggles are removed or folded in. The
  framing math in `collisionsView` is reused.
- The resolver's public report grows by one field, an ADR 0001 §4
  amendment. Its correctness becomes a dependency of the sweep, guarded by a
  property test and a debug assertion.
- A full timeline host in a worker roughly doubles timeline memory for the
  open show, and adds one message per commit and per put-down update.
- A show-file migration with two tables, one outside history triggers.
  Older app versions ignore both. Field properties don't change.

## Verification

- Before phase 1, a spike on the 2,000-marcher benchmark show measures:
  fingerprint build time and memory; re-sample cost for a 1-marcher drag, a
  200-marcher shape edit and an 8-count insert early in the show; recheck
  cost per dirty bucket; the per-commit cost of keeping the worker host in
  sync. Results go in the spec. Phase 1 starts only if the steady-state
  main-thread cost stays at or below today's.
- Core property test: for random batches, `positionsChanged` covers every
  marcher whose sampled positions differ.
- Core property test: for random edit sequences, the incremental sweep's
  issues equal a full recheck's.
- Unit tests in core: each check against stand-in resolvers; stitching
  across bucket, page and live-window edges; `move` incidents across split
  spans; dismissal matching under span shifts and count inserts; rule
  precedence (performer, then tag, then section, then show, with the more
  lenient tag winning).
- Debug-build assertion: fingerprints equal a full re-sample after every
  batch.
- Migration tests: both tables, history triggers on rules only, undo of a
  performer delete restores their rules.
- Browser scenarios: badge count and dot, scope switch, dismiss and restore,
  soft blink after an edit, click to jump, a dismissal surviving an 8-count
  insert earlier in the show.
