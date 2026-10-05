<!-- cspell:disable -->

# Hypothesis A: evolve layers and steals (minimal structural change)

Checked against `docs/timeline/spec.md` (R-1 to R-13, D-7, D-12, I-A1/I-A3/I-A5, R-E1),
`docs/timeline/ui.md` (UI-1, UI-7 to UI-10), `implementation-plan.md` (C-4, C-11, C-12) and
`apps/desktop/src/db-functions/timelineMembership.ts` (`partlyOverlaps`, `containsRange`, `stealLayer`).
Note: the checkout is on `timeline/p8-17-core-loop`, not `timeline-try-2`.

## 0. The key finding

**The resolver can already express both scenarios. Only the UI rules forbid them.**

- I-A1 lets an assignment row cover **part** of its transition. C-11 says so too: "assignments keep
  their own ranges inside the transition, so marchers still join late [and] leave early". UI-9's
  "adding always spans the whole timeline" and its partial-overlap refusal are app restrictions.
- R-2 flattening doesn't care whether a higher layer runs past the lower row's end. Green L0 [0,16)
  plus yellow L1 [8,24) flattens to green [0,8) then yellow [8,24). Green never resumes, because it
  has no beats left.
- R-4 already derives yellow's origin from green at beat 8. Editing green's destination for a peeled
  marcher moves its beat-8 point (D-7 progress), so yellow re-starts from there **with no stored link**.
- A join is already a span kind (R-3). A row [8,16) in green is a **join**. It rebases from wherever
  the marcher actually is (R-5, D-12), so editing green's start can never break it.

So the proposal is mostly UI, plus one display-only table. The resolver, the change log consumers,
`ref/` and the golden vectors stay unchanged.

## 1. Three relationships, each stored with data we already have

The relationships are between a marcher's row in a **host** timeline H = [hs, he) and a **mover**
timeline M = [ms, me).

| Kind       | Meaning                                          | Storage                                                                                                                            | Resolver result                                                                 |
| ---------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Detour** | Leave H, come back, still end at H's destination | Host row stays [hs,he). Mover row [ms,me) one layer above (today's UI-9 rule)                                                      | Founding, then mover, then **resume** (R-5 rebase)                              |
| **Exit**   | Leave H for good                                 | Host row is **trimmed** to [hs, ms). Mover row [ms, me) sits at the **same** layer, so there is no overlap and layers don't matter | Founding, then mover. H's slot destination stays, as the "unrealised remainder" |
| **Entry**  | Arrive from somewhere and merge into H           | Host row is **trimmed** to [me, he). The mover (the joiner's previous move) is any row ending at `me`                              | Mover, then **join** (rebase)                                                   |

Rule: **layers are only for detours.** Exits and entries are row trims with no overlap. That makes
them immune to layer reordering (§7) and removes the layer explosion that UI-7 would otherwise cause.

You can tell the kind from the rows, so it needs no new column:

- A row that starts after `T.start_beat` is an **entry**, at its start.
- A row that ends before `T.end_beat` is an **exit**, at its end.
- A row overridden by a higher layer that then resumes is a **detour**.
- A row still overridden at `T.end_beat` (a layered steal that crosses the end) is also an exit. That
  shape only appears in converted or legacy data. The write path normalises it to a trim.

**Exit vs detour, the "old move doesn't resume" question.** With a trim, nothing of H remains after
`ms`, so R-5 has nothing to resume. If a detour's mover runs past `he`, it becomes an exit by
definition. The write path converts it: it trims the host row and drops the mover to the host's layer.

**The seam.** In an exit, the host row's end equals the mover row's start. In an entry, the mover
row's end equals the host row's start. This equality is **implicit**: it holds because two beats
are equal, not because a stored link says so. Every range edit has to keep it (§6). This is the
model's main strain.

## 2. What is stored and what is derived

|       | Stored (authored)                                                                                                          | Derived                                                                                         |
| ----- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Green | Its timeline and its six one-slot transitions (UI-9). Its slot destinations, including the 4 peeled marchers' destinations | Founders' origins (R-4)                                                                         |
| Peel  | The trimmed green rows [0,8). Yellow's timeline [8,24), its rows and its destinations                                      | Yellow's origin = green at 8. The ghost remainder and the ghost dot                             |
| Join  | Green rows [8,16) for joiners. Yellow rows [0,8) and yellow's destinations (the landing points)                            | The joiner's green motion from its landing point (rebase). Ghost starts (§3), unless overridden |

**Editing green's destination (scenario 1).** You select green with the playhead at 16 and drag the
group. The two real dots and the four **ghost** dots move together, because they are all green slot
destinations. Yellow's origin at 8 is `lerp(origin, newDest, 0.5)`, so yellow re-derives and the
split keeps working.

**Editing green's start (scenario 2).** Moving the founders, or the previous timeline, moves the
derived ghost starts with the group (§3). Yellow's landing points are authored, so they don't move.
The joiner's green leg rebases from the landing point, so motion stays continuous and the join can't
break. The worst case is that a landing point drifts off the new ghost path. A notch badge then says
"2 joiners off path", and offers **Re-snap** (§4).

## 3. Ghost starts for joiners

**Choice: computed from the group's motion, which the user can override per joiner.**

Let F be the founders, the members of H whose rows start at `hs`. Fit the least-squares
**similarity transform** X (rotation, uniform scale and translation) that maps founders' origins to
their destinations. Then:

`ghostStart(j) = X⁻¹(dest(j))`

- For a translation such as "forward 16", this is exactly "same offset as the group". It reproduces
  the left mockup: the ghost starts sit in the green rank, and the gray paths are parallel.
- For rotations and expansions it follows the group too, unlike a plain translation.
- It is stable. It depends only on founders and on H's destinations, never on the joiner's own
  previous move. So editing yellow can't move green's ghosts, and the dependency graph stays acyclic.

Why the other options lose:

- **Backward extrapolation** from the landing point J at progress p uses `S = (J − p·D)/(1 − p)`.
  It blows up as p → 1. It also makes the ghost a function of yellow, so the ghost moves whenever the
  user edits yellow, which is backwards.
- **User-placed only** is a chore for 20 joiners.
- **"The real position at hs"** is what a detour implies. The mockup explicitly rejects it, because
  the gray starts are not where the joiners are.

Fallbacks, in this order:

1. With 1 founder, use translation only.
2. With 0 founders (everyone joins), use backward extrapolation, but only when p ≤ 0.75.
3. Otherwise, draw no ghost start. The ghost path then starts at the join point.
4. For FTL hosts, draw no ghost start, because R-11 sends joiners to vacant tail points.

**Override (the right mockup).** Dragging a ghost start stores it in a display-only table that the
resolver never reads (R-1 is extended to say so):

```sql
CREATE TABLE timeline_ghost_origins (
  transition_id INTEGER NOT NULL REFERENCES timeline_transitions(id) ON DELETE CASCADE,
  slot_index    INTEGER NOT NULL CHECK (slot_index >= 0),
  x REAL NOT NULL CHECK (abs(x) <= 1e6),
  y REAL NOT NULL CHECK (abs(y) <= 1e6),
  PRIMARY KEY (transition_id, slot_index)
) STRICT;
```

A row is valid only while its slot's row is an entry. A stale row, for example after the host row
is un-trimmed, is ignored, and the next edit of that row deletes it. History triggers cover the
table like any other, so undo works.

**Re-snap** is a command, not a live link. It writes yellow's destination for each joiner as
`lerp(ghostStart, dest, p_join)`, so the joiner lands on the ghost path at the group's speed.
A **live** "land on host" destination source would be a third D-16 source. It is acyclic, but it is
deferred (§8).

## 4. Ghost rendering

The **ghost remainder** of a member's slot in H is the hypothetical eval of its last real span,
continued past that span's end: `lerp(origin(s), dest, p(s, b))`, evaluated for b up to `he`. This is
the same formula as R-5, just evaluated past the end of the span, so no resolver change is needed.

**Timeline selected (green):**

- Real paths are solid green where green wins.
- Exit members get the gray remainder path from the exit point to a **gray ghost dot** at green's
  destination.
- Entry members get a **gray ghost start** and a gray path to the join point.
- Detour members get a thin dashed gray hypothetical path over the stolen beats.
- Previous dots, the positions at `hs`, are drawn as hollow rings.
- Other timelines' movers that touch the seams are drawn in their own colour at 60%.
- Ghost dots can be dragged (they edit green's destinations) and ghost starts can be dragged (they
  write overrides). A real dot whose winner at P belongs to another timeline is not draggable in this
  context. The hint says "In Yellow at 16; drag its ghost to edit Green".

**Hover a clip, a page box or a notch:** ghost dots and ghost starts only, with no paths, plus member
outlines. The hover over a notch also shows the count of marchers leaving or joining.

**Playback:** no ghosts or paths, only real dots, so the field reads like the show. One opt-in toggle,
"Ghosts while playing", shows the selected timeline's ghost dots at 30%.

## 5. Timeline strip UX

**Creation stays UI-10's gesture.** Pin S, put P somewhere, then drag the selected marchers on the
canvas. The window [S,P) is compared with each of the moved marcher's host timelines, and the
relationship is inferred instead of refused:

| Window vs host                       | Default                                                      | Can it be changed?                                                                                         |
| ------------------------------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Strictly inside                      | Detour (as today)                                            | Notch menu: **Leave here instead (exit)**, which trims the host and makes the marcher hold after the mover |
| Starts inside, ends at or after `he` | Exit                                                         | Detour is only possible when it ends inside                                                                |
| Starts at `hs`, ends inside          | **Entry**                                                    | **Return instead (detour)**: the host row is restored and the mover goes one layer up                      |
| Starts before `hs`, ends inside      | Entry (forced)                                               | —                                                                                                          |
| Wholly contains the host             | **Refused**, as today. The hint offers **Remove from Green** | —                                                                                                          |

**Clips.** The stack order is precedence, not layer: detours sit above their host, and exit and
entry movers sit in the lane just above it. Each seam gets a **notch** on the host (a page box or a
clip):

- ▲ with a count, where marchers **leave**. Yellow's clip shows a matching tick.
- ▼ with a count, where marchers **join**.
- ◆ pairs at a detour's two ends.

Yellow crossing green's end is drawn crossing it, as in the mockup.

**Right-click a notch:**

- Exit, Detour or Entry (radio buttons)
- Select these marchers
- Re-snap joiners to path
- Reset ghost starts
- Move seam… (beat field)

**Dragging a notch** moves the seam. That is one edit that moves both rows (§6).

## 6. Schema, migration, undo, refusals

- **Schema:** add `timeline_ghost_origins` only. No column changes, and no resolver or `ref/` change.
- **Migration:** create the table. Existing data is unaffected. Legacy layered steals that cross the
  host's end still resolve the same way, and are normalised lazily on the next edit.
- **Undo:** every procedure is a set of ordered statements with valid intermediate states (D-17):
  - **Exit:** create Y, trim the host row's end to c, then insert the mover row [c,e) at the host's
    layer.
  - **Exit to detour:** raise the mover's layer, then extend the host row. The reverse is shrink,
    then lower. Getting this order wrong triggers E-A3.
  - **Seam move:** the order depends on direction (shrink before you grow), as in R-E1.
  - **Clip move or flag move:** generalise R-E1's anchoring to seams. The partner row in the other
    timeline moves with the edge. Otherwise the edit leaves a hold gap, or is refused by E-A3 or E-A1.
- **UI-9 refusals that change:**
  - A partial overlap is no longer refused. It becomes an exit or an entry.
  - The rule that adding spans the whole timeline is relaxed to allow trimmed ends. One row per
    marcher per timeline still holds (I-A5).
- **UI-9 refusals that stay:** wholly containing a host; more than one row; FTL recast.
- **New refusal:** a seam move that would empty a row (I-A6).

## 7. Edge cases

- **Chained steals** (red over yellow over green): red is a detour on yellow, one layer above
  yellow's row. If yellow is an exit from green, green's trimmed row doesn't interact with it at all.
- **A marcher stolen twice from one host:** two detours at L1 work, and green resumes twice. Exit
  and re-entry into the same host are impossible because of `UNIQUE(transition, marcher)`. The
  write path makes that a detour.
- **A steal of a steal:** a detour on an exit mover works. Ghosts are per selected timeline.
- **Deleting green while yellow depends on it:** yellow's origin falls back to whatever comes before
  beat 8, a hold. That is valid but different (D-5). Show a toast naming the 4 marchers and offer
  undo. Deleting green also cascades away its ghost overrides. Deleting yellow in a join makes the
  joiners hold until 8, then rebase into green.
- **Reordering layers:** this only affects detours. Lowering a detour under its host hides it (UI-1
  dashed). Exits and entries have no overlap, so the order doesn't matter.
- **A host range edit that crosses a trim**, for example moving green's start past 8, is refused
  with E-A1 unless seam anchoring applies.

## 8. Where this model strains

1. **Seams are implicit equal beats.** Keeping two timelines' rows glued needs cross-timeline
   anchoring in every range procedure: clip moves, flag moves, beat insert and delete (P7.5), and
   ripple. A missed path silently opens a hold gap.
2. **A join is not live.** Re-snap is a one-shot command. A true "land on green's path" needs a new
   destination source, so yellow's destination would depend on green's (overridden) ghost start.
   That is acyclic but new.
3. **Ghost starts are a heuristic.** The similarity fit is a guess for non-rigid drill. The override
   table is a second notion of "start" that the resolver ignores. The two can disagree with the
   motion, by design.
4. **Canvas ambiguity.** At P, a peeled marcher has a real dot (in yellow) and a ghost dot (in
   green). Which one a drag edits depends on the context, and needs teaching.
5. **Inference can surprise.** A window that starts at `hs` becomes an entry. The user may have
   meant a detour. The notch menu is the escape hatch.
6. **Layers still exist for detours.** The UI-7 "one above highest" rule and per-marcher layer
   integers remain, and are invisible on the strip.
7. **Hidden page-box timelines (UI-10).** Notches have to live on page boxes, which aren't clips,
   so the clip stack mixes boxes and clips.
8. **FTL hosts.** Exits work (G12). Joins fall back to direct (R-11), so ghosts are omitted.

## 9. Walkthroughs

### Scenario 1, steal-out

1. Click page 1's box. That selects green, the window [0,16), and P=16. Select the 6 marchers and
   drag them forward 16. Green is created with six one-slot transitions and rows [0,16).
2. Pin the start: drag the start handle to beat 8, then move the playhead to 24 (past flag 1). The
   window is [8,24).
3. Select the outer 4 and drag them sideways. The window starts inside green and ends past 16, so
   it is an **exit**, with no refusal. The edit creates Y [8,24), trims those 4 green rows to [0,8),
   and inserts yellow rows [8,24) at L0. A ▲4 notch appears on page 1's box at 8, and the yellow
   clip crosses flag 1.
4. Click page 1's box. Green is selected: 2 solid paths, 4 green-then-gray paths, 4 gray ghost dots
   at the old destinations, and hollow previous dots.
5. Select all 6, including the ghosts, and drag them to move green's destination. The ghosts move,
   yellow's origin at 8 re-derives, and the yellow arrows start from the new mid-point.

### Scenario 2, join-in

1. Green holds the 2 founders over [0,16). The joiners are elsewhere.
2. Pin S at 0 and put P at 8. Drag the 4 joiners to their landing spots. Each lands in **yellow**
   [0,8), a new timeline, because none of them is in green.
3. Click green, set P to 16, select the 4 joiners and drag them to their green destinations. Each
   window [0,16) contains its yellow [0,8) row. Today that is a "wholly contains" refusal. The new
   rule: when the window's host is the marcher's **previous** move ending inside it, add a green
   **entry** row [8,16), whose start is the end of the yellow row. A ▼4 notch appears at 8.
4. Green is selected. Gray ghost starts appear in the green rank (similarity fit), with gray paths to
   the landing points, and the solid green paths run on from there.
5. Optional: drag the ghost starts to arbitrary angles (the right mockup). That writes the override
   table. Then use the notch menu's **Re-snap joiners** so that the yellow arrows land on the gray
   paths.
6. Move the founders' start, for example by editing the previous timeline. The ghost starts follow
   the fit, the joins stay continuous, and the notch shows "off path" if a landing point no longer
   sits on a ghost path.
