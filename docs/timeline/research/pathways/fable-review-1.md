<!-- cspell:disable -->

# Pathways draft 1: adversarial review

Status: review 1, 2026-11-02, of [draft-model-1.md](draft-model-1.md) (draft 1) against the
[register](README.md), `docs/timeline/spec.md` v0.8, ADR 0012 and ADR 0006, and the code on fork
main f2f3cce41 (`packages/core/src/timeline/{resolver,geom,types}.ts`,
`apps/desktop/src/db-functions/{timelineSplitAtBeat,timelineSplitMoves,timelineResize,historyTriggers}.ts`,
`electron/database/migrations/schema.ts`).

Owner decisions (Q1–Q6, E-_, S-_, decided O-\*) are taken as fixed. Where one forces something
the owner may not expect, it is marked **[owner]** and collected at the end.

How to read the verdicts: **sound** = keep as written; **needs change** = the idea is right but the
rule as written is wrong, incomplete or unbounded in some case; **wrong** = replace.

## 0. Summary of the verdicts

| #   | Agenda item                            | Verdict      | One line                                                                                                                                                                                                                                                                                                    |
| --- | -------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | O-3 bounded positions (§6)             | needs change | Provable, and better than hoped: with one change to the tangent rule every route position is at most `max(                                                                                                                                                                                                  | A   | , 7/3·β′)`, a constant, not `√(1+a)`. As written (tangent at `P₁`reads`A`) it is still bounded (contraction, fixed point `5β′`), but the proof the draft sketches is the wrong one. |
| 2   | O-4, O-5 entry rule (§3.2, §4.2)       | needs change | Jump-free and cheap, but `R(b)` is undefined for a join (no founding span), the step budget ignores the route's own pace (an on-schedule runner gets kicked off its curve), `E` should be in steps not beats, and the lineup-mode FTL joiner has no stretch. P-5 holds on the trail once entered, as today. |
| 3   | O-2, O-25 storage (§2)                 | needs change | One `routes` table is right. Drop `timeline_id` (split-by-marchers breaks it); fix the E-T6 skip condition; add an arc segment type now (circles, arcs, SVG `A`); keep the `arc` style as is in v1; one invalidation row is missing (per-span caches of T when its route or destination changes).           |
| 4   | FTL on a trail (§4)                    | needs change | `slots` start: the stub rule walks backwards after any split or upstream edit; use the on-trail position when the origin is on the trail. `lineup` with `k < n` makes derived destinations (violates D-5); drop it. `advance` is app data in `slots` mode. O-28: don't mix.                                 |
| 5   | O-6 split and merge, the anchor (§5)   | needs change | The anchor is avoidable: store pins as rational beat offsets from the transition start. Split is right except inside stops; allow leading and trailing holds. The claim that the time split refuses FTL today is wrong (it samples). Merge of two formation moves is undefined.                             |
| 6   | O-10 curves, length, cost (§3.1, §7.1) | needs change | Catmull–Rom to Bézier is fine; the "exact length" must be a declared algorithm so two implementations agree; knots must be (segment, parameter) so pins return their point bit for bit. Cost is fine.                                                                                                       |
| 7   | O-12 formation turn (§3.3)             | needs change | The mitre is unbounded at a hairpin and contradicts the draft's own "rotated offset" definition. Use offset lanes with round joins outside and trimmed joins inside; bounded by `β +                                                                                                                        | o   | `. Re-fit a formation by a rigid fit, not the mean.                                                                                                                                 |
| 8   | O-1 turning on counts (§4.4)           | sound        | No time pins on trails; derive crossing counts; warn. Only `lineup` with an uneven founders' line breaks the whole-count arithmetic, and that is the designer's data.                                                                                                                                       |
| 9   | O-15, O-23, O-24, O-18, O-21           | needs change | The rate belongs on the transition, not the route (direct moves in double time need it for S-4). Sub-beat pins meet three whole-beat assumptions (time split, scrub, dot-book counts). Collision checks need sub-count sampling along routes.                                                               |

Missed entirely (§10 below): the join case of `R(b)`; degenerate geometry rules; the per-span cache
invalidation; the resolver needs the step size as an input; the file-version policy makes O-17 moot;
the `localInputsChanged` and `coalesce` paths; recipe-linked routes edited by hand (O-13 reverse).

---

## 1. O-3: bounded positions (draft §6 vs spec §8.11)

### 1.1 What the draft claims and what is actually true

The draft argues from "Bézier curves lie in the convex hull of their control points" and worries
that `A` can enter the hull "scaled by up to `c`", so chained routes might need the arcs' `√(1+a)`
induction. Both halves are off:

- The convex-hull property is about the **control points**, and Catmull–Rom control points are
  **not** in the convex hull of the authored points. Example (uniform CR): `P₀ = (0,0)`,
  `P₁ = (1,0)`, `P₂ = (1,1)` gives the control point `P₁ + (P₂ − P₀)/6 = (7/6, 1/6)`, outside the
  hull. So the per-segment bound is not "inside the hull of authored points", and the proof needs
  the actual control-point formula.
- The dependence on `A` is a **contraction**, not a scaling. With the derived origin's weight
  below 1, chained routes converge to a constant bound instead of growing. No induction on the
  number of route spans is needed.

### 1.2 Proof

Notation: `β′ = β + max|o|` bounds every placed point (`P_i`, `from`, `to`, `B`). The path of a
span is `A → P₁ → … → P_n → B`. Centripetal Catmull–Rom (α = ½) on a segment `Q₁ → Q₂` with outer
neighbours `Q₀` and `Q₃` gives the Bézier control points (standard conversion, coefficients sum
to 1):

```
d₁ = |Q₁ − Q₀|^½,  d₂ = |Q₂ − Q₁|^½,  d₃ = |Q₃ − Q₂|^½
C₁ = Q₁ + [d₁²(Q₂ − Q₁) + d₂²(Q₁ − Q₀)] / (3 d₁ (d₁ + d₂))
C₂ = Q₂ + [d₃²(Q₁ − Q₂) + d₂²(Q₂ − Q₃)] / (3 d₃ (d₃ + d₂))
```

**Lemma 1 (control-point offset).** With α = ½, `|Q₂ − Q₁| = d₂²` and `|Q₁ − Q₀| = d₁²`, so

```
|C₁ − Q₁| ≤ (d₁²·d₂² + d₂²·d₁²) / (3 d₁ (d₁ + d₂)) = 2 d₁ d₂² / (3 (d₁ + d₂)) ≤ (2/3)·|Q₂ − Q₁|
```

and the same bound holds with `d₁ d₂` in place of `d₂²`: `|C₁ − Q₁| ≤ (2/3)·√(|Q₁−Q₀|·|Q₂−Q₁|)`.
Symmetrically `|C₂ − Q₂| ≤ (2/3)·|Q₂ − Q₁|` and `≤ (2/3)·√(|Q₂−Q₁|·|Q₃−Q₂|)`. (For uniform CR the
offset is `|Q₂ − Q₀|/6`; for chordal it is at most a third of the chord. Any α gives a bounded
offset; the constants below are for α = ½.)

**Lemma 2 (one segment).** A point `Q` on a cubic Bézier is a convex combination of
`Q₁, C₁, C₂, Q₂`, so `|Q| ≤ max(|Q₁|, |C₁|, |C₂|, |Q₂|)`.

**Case A: the draft's rule as written** (tangent at `P₁` reads `A` as the outer neighbour).
On the first leg `A → P₁` the control point near `A` is `A + (P₁ − A)/3`, a convex combination.
The control point near `P₁` has `|C₂ − P₁| ≤ (2/3)|P₁ − A| ≤ (2/3)(|A| + β′)`, so
`|C₂| ≤ (5/3)β′ + (2/3)|A|`. Every other control point involves authored points only and is within
`(7/3)β′`. Hence every position of the span satisfies

```
|Q| ≤ max(|A|, (2/3)|A| + (5/3)β′)
```

If `|A| ≥ 5β′` the second term is at most `|A|`, so the span never increases the norm. If
`|A| < 5β′`, then `|Q| < 5β′`. So **`|Q| ≤ max(|A|, 5β′)`**: a chain of stolen route spans can
never push a marcher past `5β′` however long it is. (Using the `√(|P₁−A|·|P₂−P₁|)` form of
Lemma 1 the fixed point is about `2.85β′`.) The draft's fear of compounding is unfounded, but its
proof is also not the right one; this is.

**Case B: the recommended rule** (tangents at inner points use the authored `from` and `to` as
outer neighbours, never `A` or `B`; `A` and `B` get the chord rule). Then every control point
except `A + (P₁ − A)/3` and `B + (P_n − B)/3` is built from authored points only and is within
`(7/3)β′`; those two are convex combinations. So

```
|Q| ≤ max(|A|, |B|, (7/3)β′) = max(|A|, (7/3)β′)
```

which is `c = 1` in the draft's sense: `A` enters only through convex combinations. The
route's inner curve also stops changing shape when an upstream edit moves `A` (today only the
first Bézier changes, not the tangent shared with the second segment), which is what Q2 and O-7
say the owner wants.

**The other primitives.**

- Entry leg (§3.2): a segment from `X` to a point `R(b₀+E)` on the reference path, convex:
  `|Q| ≤ max(|X|, bound of the reference path)`. The reference path's own origin is an earlier
  node of the same marcher (resume) or an authored point (join, see §2.2 below), so it is already
  bounded by induction.
- FTL on a trail: trail points are authored (`lineup` adds member origins, as R-9 does); stubs are
  convex. `|Q| ≤ max(origins, β′)` as for R-10.
- Formation `turn`: `|place(p, o)| ≤ |p| + |o| ≤ β′` **only if the corner rule keeps the member
  within `|o|` of the reference point**, which the mitre does not (item 7). With offset lanes it
  does.
- Arc segments, if added (item 3): a minor arc from a derived `A` to `P₁` obeys the Thales bound,
  `|Q|² ≤ |A|² + β′²`, so it compounds exactly as today's arcs do and counts toward `a`.

**Theorem (amended §8.11).** With `a` = the number of arc spans and arc first legs on the
dependency path,

```
|P|² ≤ max(β, 7/3·β′)² + a·β′²        (Case B), or   |P|² ≤ (5β′)² + a·β′²   (Case A)
```

Route steps never raise the norm above the constant; arc steps add at most `β′²` to the square;
direct, hold, FTL and entry steps never raise it. Induction along the §9.3 DAG as before.

### 1.3 Verdict and change

**Needs change.** Replace §6 with the proof above and adopt Case B in §3.1: "At a smooth inner
point the Catmull–Rom neighbours are the adjacent inner points, with `place(from, o)` before `P₁`
and `place(to, o)` after `P_n`. `A` and `B` never enter a tangent; the legs that touch them use
the chord rule." Add to §8.10: a zero chord (`d = 0`) in a Catmull–Rom tangent uses the chord
rule on that side (both sides zero: the point is a corner); coincident consecutive points are
one point. Residual risk: none for boundedness. The overshoot of a smooth point is at most
two-thirds of the adjacent chord, which can leave the field by a few steps near a tight smooth
turn; that is ugly, not invalid, and a diagnostic can say so.

---

## 2. O-4, O-5: the entry rule (draft §3.2 "Joins and resumes", §4.2)

### 2.1 Well defined?

**Not for joins.** `R(b)` is "the founding position at `b`", i.e. the founding span's path built
from `A = origin(founding span)`. A **join** is by definition the first span of a row whose first
span is not founding (R-3): a marcher added to a move partway, or overridden at `T.start`. It has
no founding span, so `R(b)` does not exist, and neither does a row whose first span is a join and
a later one a resume. Today R-5's rebase covers these without any reference path; the draft's
rule silently assumes one.

Fix: define the **reference path of (T, marcher)** once: `A_ref = origin(f)` if the row has a
founding span `f`, else `A_ref = place(R.from, o)` (authored). Every non-founding span enters the
reference path. Bounded in both cases (§1.2), and the join case depends on authored data only, so
it needs no new cache node.

**`E` in beats is the wrong unit.** `b₀` is an integer (assignment bounds), but a pin's beat is
`anchor + step·q/p`, so with rate `[3,2]` the horizon `b_k − b₀` is a multiple of ⅓. "Smallest
whole `E ≥ 1`" then has no candidates when the pin is less than a beat away, and the fallback
`E = b_k − b₀` is not whole anyway. Make `E` a whole number of **steps** on the rate grid
(`E_i = i·q/p` beats). The search is then over `i = 1 … ⌊(b_k − b₀)·p/q⌋`.

**The step budget ignores the route's pace.** The test `|X − R(b₀+E)| ≤ E·σ` compares to a normal
step. Counter-case: a running route at pace `1.5σ`, stolen by a move that leaves the marcher
**exactly on schedule** (a zero-motion steal, or a steal that returns it). Then
`|R(b₀) − R(b₀+E)|` is about `1.5σ·E > σ·E` for every `E`, no `E` fits, and the fallback sends the
marcher **straight to the next pin**, cutting the drawn curve, though it was never off it. Fix:
first, if `|X − R(b₀)| < ε` set `E = 0` (follow directly); second, use
`σ_eff(E) = max(σ·rate, chord speed of the reference schedule over [b₀, b₀+E])`, which always
admits an on-schedule marcher at `E = 1 step` because a chord is never longer than its arc.

**"No later pin" generalises Q4 past what was decided. [owner]** Q4 says a route **without inner
pins** goes straight to the end after a steal. The draft applies that whenever there is **no pin
after `b₀`**: a route with a pin at count 4 and a drawn wiggle from 4 to 16, stolen over 6–8,
abandons the wiggle and walks a chord to `B`. Under E-1 ("one rule") the natural rule is: the
horizon is the next pin if any, else `T.end` (where `R(T.end) = B`, so the straight-to-`B` chord is
simply the `E = T.end − b₀` fallback). That keeps the drawn shape when the marcher can reach it at
a normal step and reproduces Q4 when it can't. The owner should confirm whether Q4's "no inner
pins" was meant literally (then also note that one steal of one count turns a nine-point flutter
into a straight line, which the demo page should show).

### 2.2 Jump-free?

In time, yes: the marcher is at `X` at `b₀`, walks a straight leg to `R(b₀+E)`, and `R` is
continuous, so P-1 holds. In **authoring** it is discontinuous by design: a one-count change to the
stealing move's end, or a small drag of the stealing destination, can flip `E` from 3 to 4 and
re-route the whole lead-in. The first-fit search is also non-monotone (a route that doubles back can
satisfy `E = 2` and fail `E = 3`). That is the same class of behaviour as quantize in a DAW; say so
in the register (O-5), and show the entry's `E` in the inspector so the designer sees why it
changed.

### 2.3 Cheap?

Yes. At most `⌊(b_k − b₀)·p/q⌋` evaluations of `R`, each `O(log points)`; a 32-count gap at triplet
rate is 48 evaluations, once per non-founding span, cached. But the cache is wrong as described:
see §10.3 (the per-span cache must be dropped when `T`'s route or destination changes, which W-3
does not do for the span itself).

### 2.4 P-5 for FTL joins

`slots` start: a joiner with end slot `j` has a well-defined hypothetical stretch
`σ_{j−k} → σ_j` on the same schedule as the founders, so once on the trail its distance is ordered
with theirs for all `b` (same `p`, ends and starts ordered by `j`). The straight leg can cross
other marchers, exactly as R-11's chord can; P-5 as stated (trail distances of members) is
unchanged, and the diagnostic should stay (`D-FTL-NONFOUNDING`, info).

`lineup` start: **the joiner has no stretch.** R-9 step 5 queues non-members behind the tail at
`p_{n−m−1−k}`; in the draft's combined slots `c`, their start slot would be `c_{index − k}`, which
for a queued slot is an index below 0 or a founder's origin. Either define it (aim at the target
slot as a fixed point: `E` = smallest with `|X − target| ≤ E·σ`, then stand) or keep R-11 for
lineup joiners in v1. Recommend the latter; it is what the resolver does today and the case is
rare (a marcher added to a block-letter move partway).

Also note in §4.2: "no pins" does **not** mean the §3.2 "no later pin" branch (straight to the
end); the horizon for a trail join is `T.end`. The draft needs to say that or the rule
degenerates to R-11.

### 2.5 Verdict

**Needs change.** Replace §3.2 "Joins and resumes" and §4.2 "Joins and resumes" with: the reference
path definition (§2.1), `E` in steps, the `E = 0` short-circuit, `σ_eff`, the horizon = next pin
else `T.end`, lineup joiners under R-11. Residual risk: authoring discontinuity (accepted), and the
O-5 aim question (first fit vs. "closest to a normal step") is still a product call; first fit is
the cheaper and more predictable of the two.

---

## 3. O-2, O-25: storage (draft §2)

### 3.1 One table, `route_id` on transitions: sound

A route is read by the resolver, so it must be in the change log and in `tablesWithHistory`
(spec §6.1 "every data table MUST have history triggers"); a shared route needs a row several
transitions point at (Q3). One table with a surrogate integer PK (C-2) and `ON DELETE RESTRICT`
from transitions (I-D1 pattern) is right.

### 3.2 `timeline_id` on routes: wrong

Counter-case: **split by marchers** (UI-25, `timelineSplitMoves.ts`): the leaving marchers'
transitions **change timeline** ("its row changes timeline"). A formation route shared by a
marcher who leaves and one who stays then has transitions in two timelines, which the draft's
"a route's transitions are all in its own timeline" invariant forbids, so the split must copy the
route (detaching the leavers into a second formation, a side effect nobody asked for) or be
refused. Routes should be like `timeline_shapes`: no owner column; the resolver never reads
timelines anyway (R-1). Lifetime is the app's: an edit that leaves a route unreferenced deletes
it in the same edit (the draft already needs this for "Make it straight again"), and deleting a
move deletes its transitions and then the routes that became unreferenced. The index on
`transitions.route_id` makes the check cheap.

Replace §2.1's `timeline_id` column and the "all in its own timeline" trigger with that rule.

### 3.3 The CHECK rebuild: sound, with one test

Adding `'route'` to the `path_style` CHECK and adding the `route_id` CHECKs needs a table
rebuild; Drizzle generates it. The invariant triggers come from `createAllTriggers` and the history
triggers from `createAllUndoTriggers`, both run after migration, so O-2's worry is already
covered by practice, but the migration test must assert every trigger named in `triggers.ts` for
`timeline_transitions` exists afterwards, and that the rebuild preserved `rowid`s (history
inverses say `WHERE rowid=`). Also bump the file version: ADR 0012 refuses newer files in older
builds, so **O-17 is moot** (an older fork build never opens a file with routes; it refuses it).

### 3.4 Checks the draft gets wrong or leaves out

| Draft text                                                                                        | Problem                                                                                                                                                                                                     | Fix                                                                                                                                           |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| "the commit check E-T6 skips it" for FTL with a trail                                             | `commit_violations` counts destination rows for every shapeless transition; a `route` transition keeps its one row, so the skip must be exactly `path_style = 'follow_the_leader' AND route_id IS NOT NULL` | Say so in §2.2 and in the amended view                                                                                                        |
| `CHECK (path_style <> 'follow_the_leader' OR dest_shape_id IS NOT NULL OR route_id IS NOT NULL)`  | Allows a shape **and** a trail on one FTL transition                                                                                                                                                        | Add `NOT (dest_shape_id IS NOT NULL AND route_id IS NOT NULL)` for FTL                                                                        |
| "A trigger … enforces that a `route` transition points at a `path` route and an FTL at a `trail`" | Must be checked from both sides (U-3): on transition insert/update of `route_id`/`path_style` **and** on route update of `kind`, as `shape_dest_upd` does for shapes                                        | Two triggers, both pure checks on `NEW`                                                                                                       |
| `tr_dest_*` block checks                                                                          | Unchanged, but a `route` transition into a `block` shape is meaningless                                                                                                                                     | Add `path_style <> 'route' OR dest_shape_id IS NULL` unless shaped routes are wanted (UI-9 makes every move shapeless, so forbidding is free) |
| Row image for `routes`                                                                            | `coalesce` and `localInputsChanged` in `resolver.ts` compare images field by field; `geometry`/`timing` need the same JSON-equality treatment as `params`                                                   | Note in §2.3                                                                                                                                  |

### 3.5 Arcs (O-25) and circles (O-10): add an arc segment now, keep the `arc` style

Three places need an exact circular arc: circles as trails (§4.3 says a quarter-per-smooth-point
is not exact), folding or merging `arc` moves (§5.2 "Arcs are first converted" is lossy: a
Catmull–Rom curve through a midpoint is not a circular arc), and the lossless SVG export (S-4,
`A` command). One addition to geometry v1 covers all three: a point may carry
`"arc": k` meaning the segment **into** it is a minor arc with bulge `k`, `|k| ≤ ½`
(a quarter circle is `k = tan(π/8) ≈ 0.207`). Its bound is the Thales disk (§1.2), its length is
closed-form, and `arcPoint` already exists. A full circle trail is four quarter arcs with
`closed: true`. With that, keep the `arc` **style** exactly as it is in v1 (D-15 is proven and the
UI uses it); converting an arc move to a one-point route with `arc` is then exact and can be done
on demand (merge, "edit as route") rather than by migration.

### 3.6 Verdict

**Needs change**: drop `timeline_id`, fix the three checks, add the arc segment, keep the arc
style, add the missing invalidation row (§10.3). Residual risk: a route left unreferenced by a
bug leaks a row; a `commit_violations` row "route with no transition" catches it at commit.

---

## 4. FTL on a trail (draft §4)

### 4.1 `lineup` start: `k = n` is R-9; `k < n` is wrong for v1

The identity holds: founder `q` ends at `c_{q+n} = p_{n−m+q}`, which is R-9 step 5. But with
`k < n`, founders `q < m − k` end on `c_{q+k}` with `q + k < m`, i.e. **on another founder's
origin**: a derived point. The move's end positions, and the next move's origins, then depend on
upstream geometry, which D-5 forbids in spirit ("no shape or path is positioned relative to
upstream geometry"), the Set-as-shown and defined-coordinates machinery can't store them, and
`slot_count = n` leaves those members with no slot to be `UNIQUE` in (I-A4). Drop `k < n` in
`lineup`; vacancies stay at the entrance end (spec Q-5), as today.

### 4.2 `slots` start: the stub walks backwards

"Its walked path is a straight stub from its real origin to `p_{j−k}` then the trail." Counter-case
1: **time split** (UI-27) of a snake move at count 6 of 16. The second half's members are
mid-stretch at the cut; the rule sends each one **back** to `p_{j−k}` and then forward again, so the
split changes motion, and in the worst direction. Counter-case 2: an upstream edit nudges a member
one step **along** the row; it walks back a step first. Counter-case 3: a trail that revisits a
point (closed outline) makes "on the trail" ambiguous.

Fix: a member's start distance is **its origin's position on the trail when it is on it**: among
trail points within `ε_on` of the origin (say `10⁻⁶`), take the one whose arc length is nearest to
`σ_{j−k}` (this resolves closed and self-crossing trails); if there is none, use the stub to
`p_{j−k}` and raise a diagnostic. P-5 then holds whenever starts came from one schedule (a split)
and can fail after scattered upstream edits, which gets a diagnostic (`D-FTL-ORDER`), as R-11
already accepts.

Also: on an open trail, `j − k < 0` must be refused at write time (`E-ARGS`); on a closed trail
represent the stretch as unwrapped distances `d_start ≤ d_end` and evaluate `trail(d mod L)`, so
"ends increase with `q`" stays true cyclically across the seam.

### 4.3 `advance` is app data in `slots` mode

With §4.2 fixed, the resolver needs only: the trail, its slots, each member's **end slot**
(`slot_index`) and the stub target `p_{j−k}`. `k` is otherwise how the app chose the slot indexes,
like a snake order (S-7). Keep `advance` in `path_params` only as the stub target; the app owns
"advance k" as a gesture. In `lineup` mode `k` has no meaning once `k = n` is fixed. This also
removes the two-orders problem: in `slots` mode trail order **is** slot order, so `order_mode`
must be `'slot'` (write it so and check it), or R-12's inherited order can disagree with the slot
positions and starts stop increasing with `q`.

### 4.4 I-T5 relaxed and no destination rows: sound with §3.4's conditions

"The app still writes the end positions it shows from the resolver, as it does for shapes" is
unclear; say: the app writes **no** `slot_destinations` rows for an FTL-with-trail transition, and
the Set-as-shown / defined-coordinates code reads ends from the resolver, as it does for shaped
transitions today.

### 4.5 O-28 mixed trails: don't mix

Monotone ends need, for adjacent members, `gap + (s − k·spacing) ≥ 0`, so a "by steps" exit of
`s` steps beside a "by slots" box of `k` slots overtakes as soon as `s < k·spacing − gap`. S-8
already gives the one-rule answer: slots continue along the exit at the box's spacing, and
everybody advances `k` slots. "By steps" (S-11) is a whole-move mode in which everyone advances the
same distance; on a shape that means leaving it. Recommend recording that as the O-28 answer and
not allowing a per-member mix.

### 4.6 O-29 source and destination orders

Nothing in the draft defines the map from a founder's place in the start order to a slot in the
end order beyond "R-12 inherits it". That is enough when both have `m` spots. When the destination
has more slots than members, R-9's rule (vacancies at the entrance end) applies; when fewer, the
write must refuse (`m > n` violates I-A4). Say so in §4.3's table.

### 4.7 Verdict

**Needs change**: §4.1 `lineup` loses `k < n`; `slots` start distance from the on-trail position;
`order_mode = 'slot'` in `slots` mode; O-28 and O-29 as above. Residual risk: the `ε_on` test is
a tolerance in the resolver (there is none today except `ε_geom`); pick it once and test it at the
`10⁶` bound.

---

## 5. O-6: split and merge, and the anchor (draft §5)

### 5.1 The anchor (§5.1): avoidable, and its premise is only half right **[owner]**

The draft is right that Q6's "pins as whole step numbers **from the move's start**" cannot survive
a start-edge drag at a non-integer rate: a 1-beat drag at `[3,2]` moves the start by 1.5 steps.
It is wrong that an anchor fixes that. The anchor keeps the stored integer unchanged, but the pin
is still 7.5 steps from the new start; the integer just stops meaning "steps from the start".
Whatever is stored, the honest display after that drag is a fractional step, and the owner should
hear that plainly.

Given that, the absolute anchor is the worse of the exact representations:

|                                                                                 | Absolute integer anchor (draft)                                                                           | Rational beat offset from `T.start` (`[num, den]`)                         |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Plain start-edge drag (Q1: pins keep their count from the end)                  | no route write                                                                                            | rewrite timing (offset −= Δ)                                               |
| Plain end-edge drag                                                             | no write                                                                                                  | no write                                                                   |
| Shift the whole move (`shiftTimeline`, clip drags, flag drags that move a move) | **rewrite every route of the move** (2,000 rows on an all-detached move)                                  | no write                                                                   |
| Alt-drag scale                                                                  | scale and **round** to the step grid; refuse on collisions                                                | exact (`offset × new/old`), no rounding, no refusals                       |
| Split at `c`                                                                    | second half: anchor stays, pins keep steps                                                                | second half: offsets −= (c − start), exact                                 |
| Drift                                                                           | a second copy of "where the move is in time"; nothing in the DB can check it against the transition range | self-contained; a trigger can check `offset < end − start` via `json_each` |
| Whole numbers stored                                                            | yes                                                                                                       | yes (`num`, `den`)                                                         |

Recommend rational offsets from the transition start, `step` shown as `offset·p/q` (whole in the
common case). It also makes the time split exact at any beat. Replace §2.1 `timing` (`anchor`
and `step` go; `at: [num, den]` and `until: [num, den]` come) and §5.1.

Also: where does the **rate** live? Draft: on the route's timing. But S-4 wants "the exact
coordinate on every step" for every move, and a `direct` move in double time has no route row.
The entry rule needs the step size inside the resolver. So the rate is a property of the
**transition** (allow `"rate": [p, q]` in `path_params` for every style, default `[1,1]`, `p, q`
positive integers in a small bound, stored reduced). Pins stay in beats, so a rate change moves no
pin in time, only the step display. **[owner]**: confirm that a rate change should keep pins on
their counts.

### 5.2 Split (§5.2)

- Direct → route halves: the algebra is right and matches `timelineSplitAtBeat.ts`'s shape (the
  first half's destinations are the resolver's positions at the cut). With rational offsets the
  second half's pins are exact. Good.
- "A split inside a stop is refused" is a wall at the playhead for no reason: the first half ends
  standing at `P` (arrive at `until₁`, stand to the end) and the second starts standing (stand to
  `until₂`, then go). The draft can't write either because pins may not touch the bounds. Allow a
  **leading hold** and a **trailing hold** in timing (`"hold_start": [num, den]`,
  `"hold_end": [num, den]`, the marcher stands at `A` or at `B`), which J-14 and the holds research
  want anyway, and the split inside a stop becomes two holds. The "split exactly at a pin drops
  the pin" rule then also covers a pin with `until`.
- "**Split an FTL move: still refused in v1 (`canPeelSlot`), as today**" is wrong about today.
  `canPeelSlot` is the **by-marcher** split (UI-25). The **time** split (UI-27) does not refuse
  FTL: it samples ("Any other path style is sampled") and the second half re-founds from the
  sampled positions. With §4.2's on-trail start distances the time split of a trail move is
  exact; with the draft's stub rule it is wrong (members walk back). Fix the sentence and the
  rule together.
- A **by-marcher** split of a formation route: see §3.2. Define: the leavers keep pointing at the
  shared route (no `timeline_id`, so nothing breaks), and the formation now spans two moves. That
  is fine for the resolver; the UI's "formation drawn once as a band" (O-20) must then draw it
  across both.

### 5.3 Merge

Direct + route and route + route (one marcher each): the pinned corner at the join is right, and
with Case B tangents (§1.3) the inner curves are unchanged by construction, so "motion is
unchanged" holds. Missing: **two formation routes**, or a formation and a detached member.
Merging needs per-member routes (detach everyone: `n` rows) or a refusal. Recommend refusal in
v1 with the message naming the formation; detaching 64 marchers silently on a merge is a trap.
Arc + anything: with the arc segment (§3.5) the arc half becomes one `arc` point, exact; without
it, refuse rather than approximate.

### 5.4 Shrinking past a pin

`timelineResizeLimits` needs a new stop kind (`pin`, with the pin's point and count) so the drag
stops short instead of the write being refused after the fact; the draft says "refused with the
pin named", which is the wrong layer for a drag.

### 5.5 Verdict

**Needs change**: rational offsets instead of the anchor; rate on the transition; holds at the
bounds; correct the FTL-split claim; define formation merges and by-marcher splits; a `pin` resize
stop. Residual risk: Q6 as the owner phrased it ("stored as step numbers") is not met literally;
it is met in substance (whole numbers, exact).

---

## 6. O-10: curves, length and cost (draft §3.1, §7.1)

- **Catmull–Rom to Bézier**: fine, with Case B tangents (§1.3) and the degenerate rules (§1.3).
  `α = ½` is the right default (no cusps or self-intersections between points). Handles later as
  additive `in`/`out` fields: agreed.
- **"Exact length (adaptive Gauss–Legendre to 10⁻⁹ relative)"** is not a definition. §8 says an
  optimised implementation MUST match the oracle within §12.1's tolerance, and two correct
  adaptive quadratures disagree in the last digits, which moves every pin's distance and every
  position between pins. Declare the algorithm as the definition of length: for example, de
  Casteljau subdivision until (control polygon − chord) < `10⁻⁹·chord`, summing chords, or a fixed
  `k`-point Gauss–Legendre on a fixed number of sub-intervals. Either is reproducible; neither is
  "exact", and the spec should stop saying exact for Béziers (arcs and lines are exact).
- **Pins must return their point bit for bit** (P-7's "no interpolation residue"). A knot stored
  as a distance and inverted by bisection and Newton returns `P_i ± 10⁻¹²`. Store knots as
  `(segment index, local parameter 0 or 1)` and make `pointAtDistance` segment-aware, so a knot at
  a vertex returns the vertex. Same for slot points on trails.
- **Cost**: 40,000 segments with a 32-entry length table each is about 10 MB and milliseconds to
  build; per-frame evaluation is a span lookup plus `O(log points)` plus a few Newton steps. Fine.
  The expensive case is **2,000 detached routes rebuilt on one upstream edit**, which only the
  first legs need; cache the inner geometry per route (authored, shared) and only the two end legs
  per transition, as the draft's `routeGeometry[R]` / `pathOf[T]` split intends. Say explicitly
  that `routeGeometry[R]` does not depend on any origin.
- **Circles**: the arc segment (§3.5).

**Verdict: needs change** (declared length algorithm; segment-aware knots). Residual risk: a
declared subdivision depth bounds the error at `10⁶` scale; test it there.

---

## 7. O-12: formation `turn` (draft §3.3)

The draft gives two incompatible definitions in one paragraph: "`point.at + rot(θ(point) − θ₀)·o`"
(the member stays at distance `|o|` from the reference point) and "at a corner each member's point
is the mitre of its two offset legs" (distance `|o|/cos(φ/2)` for a turn of `φ`). The mitre is
**unbounded**: at `φ = 170°` it is `11.5|o|`, at a hairpin it is infinite, and §6's "bounded by
`|o|`" is false under it. It is also the thing that makes the inside member "loop back".

Use **offset lanes**, the standard construction for a rigid body following a path (animation:
orient-to-path with an offset; CAD: offset curves): each member's lane is the reference path
offset by its `o` in the moving frame. At a corner, the **outside** lane gets a **round join** (an
arc of radius `|o_⊥|` around the corner: the outer member sweeps the corner, "like a wheel") and
the **inside** lane is **trimmed** at the intersection of its two offset legs (the inner member cuts
the corner). Both stay within `|o|` of the reference path, so `|place| ≤ β + |o|` and §6 holds.
The inside trim degenerates when `|o_⊥|·tan(φ/2)` exceeds a leg's length (the whole leg is
trimmed): still bounded, but the lane kinks; flag it (`D-FORMATION-INSIDE`) instead of inventing a
loop. The pin on a corner maps to the arc's midpoint (the bisector point) for outside members and
to the trim point for inside ones, so all members share the pin's time.

Smooth reference points need no special case: the lane is the offset of the Bézier, which the
resolver can evaluate as `R(t) + rot(θ(t))·o` with `θ(t)` from the derivative (no need to
construct the offset curve; its length for the member's constant-speed timing is the integral of
`|R′(t) + κ-term|`, which the declared quadrature handles). Where `|o_⊥|` exceeds the radius of
curvature the lane has a cusp: flag, don't forbid.

**Re-fit of a formation**: "reference ends recomputed from the members' actual ends (their mean
minus mean offset)" is wrong under `turn`, because the offsets at the end are rotated by the end
heading. Solve the reference end and end heading by a rigid least-squares fit (Kabsch) of the
members' `o` onto their actual ends; the one-marcher case reduces to the two-point similarity the
draft gives. For a route with `|to − from| < ε` (a loop in place) the similarity is undefined; use
translation by `A − from`.

`θ₀`: when `P₁ = from`, use the first non-degenerate leg.

**Verdict: needs change** (offset lanes; Kabsch re-fit; degenerate headings). Residual risk: the
inside cusp is inherent to rigid formations on tight paths; the owner's "past 120°" flag is the
right instinct, applied to inside lanes only.

---

## 8. O-1: turning on counts in follow the leader (draft §4.4)

**Sound.** With equal spacing `s` and equal advance `k·s`, every member has the same speed, member
`q` reaches a corner `(duration/k)` counts after the one ahead, and all turn on whole counts iff
the leader's distance to the corner is a whole number of slot spacings and `duration/k` is whole.
That is the arithmetic block-letter designers already do, so deriving each member's corner count
and warning in a "military" mode is the right tool. A time pin on a trail would have to re-time
everyone (change `k` or the duration), which is not a pin, it is an edit. One caveat to state:
in `lineup` mode the founders' line is their **origins**, whose spacing is whatever the previous
move left, so per-member distances differ and the whole-count property fails even with even
slots. The warning will fire; that is correct, and the fix is the designer's (space the line
first).

Add **markers** to trails (points the designer cares about, usually corners) so the dot book
can list "turn at the 35: count 9" per member without the designer pinning anything. A marker is
a point id; no new geometry.

---

## 9. O-15, O-23, O-24, O-18, O-21

- **O-15 rate and the tempo map.** The resolver's beat is a count index; ADR 0007's tempo maps
  wall-clock to beats and is out of scope (Q-9). A pin at `2⅔` lands in wall-clock by the
  existing within-beat linear interpolation (C-7), fermatas included. No interaction, provided
  the rate is per transition (§5.1), not per stretch of music; a per-music-region rate would make
  the resolver read the tempo map, which it must not.
- **O-23 whole-beat assumptions.** Three found: the time split (UI-27) accepts whole beats only,
  so a pin at 4.5 can't be split on (fine; say so); scrub steps are per beat (owner wants that),
  so a sub-beat pin is never landed on by scrubbing (the inspector must offer "go to pin");
  dot-book counts (O-16) print `2⅔`, which no performer reads; print the step number on the
  rate's grid instead ("step 8 of 24, triplet time"). `positionAt` already takes real beats. The
  Issues sweep (ADR 0009) should sample on the rate grid, not on beats.
- **O-24 collisions along routes.** Between samples two Béziers can cross and uncross. Sample on
  the finer of the step grid and a fixed subdivision per segment (say 8), and check segment pairs
  of the sampled polylines, not points. That is the existing #226 machinery with a finer grid.
- **O-18 layers.** A ranking change changes founders; with trails a demoted founder becomes a
  joiner and enters by §2.4. Detachment (Q3) is stored (own route row), so layers can't change it.
  Nothing new, but QA-REG-4 needs a trail variant.
- **O-21 stops.** Two knots at one distance, shown as a hold, `travelDirection = null` inside:
  consistent with the holds research. With §5.2's leading and trailing holds the model covers
  "stand, then go" and "arrive, then stand" without pins on the bounds.

---

## 10. What the draft missed

### 10.1 The join case (§2.1)

No reference path for a join or for a join-then-resume row. Fixed by `A_ref`.

### 10.2 Degenerate geometry (spec §8.10 analogue)

Coincident consecutive points; zero chord on one side of a smooth point; `A = P₁` or `P_n = B`;
a closed trail of length 0 (two slots at distance 0); two slots at the same distance; a route
whose `from = to`; `θ₀` undefined. Each needs one sentence and one QA-DG case.

### 10.3 Invalidation of per-span caches (spec §9.4)

`knots[span]`, the entry `E`, and `pathOf[T][m]` are new per-span derived state. The draft says
they are "cached with the span's origin", which handles upstream changes (W-1 evicts the chain).
It does **not** handle a change to `T`'s own route, destination or range: W-3 dirties
`origin(next(s))` for spans in `T`, never `origin(s)`, so a resume span's cached `E` survives a
route edit and the marcher aims at a point of the old route. Add a rule: seeding W-3 for `T` also
drops every per-span cache of every span in `T`. Also add the §9.4 row for `routes` as the draft
has it, plus: a route change seeds W-3 for every `T` with `route_id = R`, **and** W-1 from the
founding origins is not needed (the route is not an origin input).

### 10.4 The resolver needs the step size

`σ` (8-to-5) is a field property, not a constant. `TimelineSnapshot` gains `stepSize` (field
units per step), and a change to field properties is a batch that drops every per-span cache
(rare; fine).

### 10.5 Recipe-linked routes edited by hand (O-13, reverse direction)

`timeline_route_sources` says "editing the recipe rewrites the route". Dragging a point of a
route that a recipe generated must either drop the link (the route becomes hand-drawn, with the
usual "changed" flag) or be refused. Recommend dropping the link in the same edit; undo restores
it.

### 10.6 Undo and history ordering

With `timeline_id` gone, the only FK into routes is from transitions, and deletes are child-first
(C-1): update or delete the transitions, then delete the route; the history log holds them in that
order and undo replays it reversed with foreign keys off. Fine. `timeline_route_sources` keyed by
`route_id` as its integer PK is a rowid alias (C-2). Fine. One trap: "Make it straight again"
must update `route_id = NULL` **before** deleting the route in the same edit, or `RESTRICT` refuses.

### 10.7 Change-log images and names

`tbl = 'routes'`, image `{id, kind, geometry, timing}`; the transition image gains `route`;
`resolver.ts`'s `coalesce`/`localInputsChanged` must treat `geometry`, `timing` and `route` as
local inputs. The shape row's behaviour is the model.

### 10.8 File version and O-17

A schema change bumps the file version and older builds refuse the file (ADR 0012 verification).
O-17's "older builds play straight lines" never happens; close it.

### 10.9 Explain and QA

`explain()` should report the span's entry (`E`, aim point, horizon) and knot; new goldens for a
pinned route, a stolen pinned route (rejoin), a formation turn at a corner, a snake with a time
split; properties: P-13 with the new constant, P-5 on trails (members only), a "pins hit exactly"
property, and the fuzzer's mutation list gains "mitre instead of offset lane" and "tangent from
`A`" as must-fail mutants.

---

## 11. Smaller corrections to the text

- §1: "FTL exists only in the resolver … No UI writes it": true, and the by-marcher split refuses
  it; the time split samples it (§5.2).
- §3.2: "`T.start` is used, not `s.start`, for the same reason as D-7": a founding span has
  `s.start = T.start`, so the sentence says nothing; the point is that the **reference schedule**
  runs over `[T.start, T.end]` for non-founding spans.
- §3.3: "`θ₀` is the heading of the reference path's first leg (`from → P₁`)": consistent with
  Case B, keep it authored.
- §4.2: "Start and end distances both increase with `q`, so nobody overtakes": true only in
  `slots` mode with `order_mode = 'slot'` (§4.3).
- §7.3: "pins diamonds labelled with their count (`4`, `2⅔`)": show the step on the rate grid,
  not a fraction of a count (§9, O-23).
- §8 "Block letter": "with even spacing and corners on whole steps from every slot, everyone
  turns on a count" needs "and `lineup` spacing equal to slot spacing" (§8).

---

## 12. Recommended changes, in priority order

1. **§3.1 tangents never read `A` or `B`** (Case B). Gives the clean bound `max(|A|, 7/3·β′)`, an
   inner curve that upstream edits can't bend, and makes §6 a two-line proof. Replace §6 with §1.2.
2. **§3.2 entry rule**: define the reference path for joins (`A_ref`), `E` in steps, `E = 0` when
   already on schedule, `σ_eff` with the route's own pace, horizon = next pin else `T.end`, lineup
   joiners stay on R-11. Add the per-span cache drop on W-3 (§10.3).
3. **§2.1/§5.1 timing**: rational beat offsets from `T.start` instead of an absolute anchor; rate
   on the transition; leading and trailing holds.
4. **§4.1 trails**: `lineup` is `k = n` only; `slots` start distance from the on-trail position;
   `order_mode = 'slot'` in `slots` mode; `advance` is the stub target only.
5. **§2.1/§3.3 geometry**: an `arc` segment type (circles, arc merges, SVG `A`); drop
   `timeline_id` from routes; formation `turn` as offset lanes with round/trim joins, Kabsch
   re-fit.

## 13. Questions that need the product owner

1. **Q6 after a start-edge drag at triplet rate**: the pin is 7.5 steps from the new start
   whatever is stored. Accept rational beat offsets (whole numbers, exact) with a step display that
   can be fractional, or an absolute anchor that rewrites every route row on every move shift?
2. **Q4's scope**: literal ("no inner pins" only), or "no pin left after the steal"? And is it
   acceptable that one stolen count turns a nine-point flutter into a straight line? (The
   alternative keeps the drawn path with the end as the horizon.)
3. **The rate is per move, not per route**, so direct moves can be in double time for the step
   export; a rate change keeps pins on their counts. Confirm.
4. **Stops at a move's bounds** (stand, then go; arrive, then stand) as route timing, yes or no?
5. **Merging two formation moves**: refuse, or detach every member silently?
6. (Already in the draft's §9) mid-move dot drag = a pinned corner, replacing O-8's short move.
