<!-- cspell:disable -->

# Pathways draft 3: adversarial review (turns, bound, U-1, S-2)

Date: 2026-11-02. Reviewed: [draft-model.md](draft-model.md) (draft 3) against draft 2, the
[register](README.md) (T-0 to T-2, U-1, S-2), the [UX sheet](ux-sheet.md), spec v0.8 (R-4, R-5,
R-8, §8.11, §9.4), ADR 0006 and `apps/desktop/src/shapes/frame/frame.ts`.

Verdicts: **sound** = keep; **fix needed** = right idea, the text must change; **wrong** = the rule
gives a result nobody wants in a case that will happen.

## 0. Verdicts

| #   | Item                                                   | Verdict        | One line                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------ | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | §3.6.6 angle from recipes across a flip                | **wrong**      | A flipped end shape passes the "same shape" test; the rotation delta is 0 and the turn tears the group in two. Flips also wipe the unwrapped winding                                                                       |
| 2   | §3.4 `slide` offsets in the first-heading frame (U-1)  | **wrong**      | Dragging the first point rotates every member's lane and sets every "changed" flag; `slide` needs field-frame offsets                                                                                                      |
| 3   | §3.6.2 S-2 exception                                   | **fix needed** | The text says rigid turns keep constant speed; false whenever the pivot travels (illustration D swings 0.01 to 2.24 steps per count). The choice is defensible; the justification and the alternative must be written down |
| 4   | §3.6.6 Kabsch fit                                      | **fix needed** | No proper-rotation rule, no tie rule, a seam at 180° that spins every member a full turn on a nudge, no source mode and no re-fit for fitted turns                                                                         |
| 5   | §3.6.3 per-member winding, ends, pivot cases           | **sound**      | Formula and degenerate cases hold; two cheap improvements and a tolerance rule for goldens                                                                                                                                 |
| 6   | §3.6.7 time split proof                                | **sound**      | Checked line by line; say explicitly which pins drop and that the first half rewrites the route in place                                                                                                                   |
| 7   | §6 bound with turns                                    | **sound**      | Proof checked; linear growth per turn is real, not slack; the summary says `2β′`, §6 says `2β`                                                                                                                             |
| 8   | §3.6.4, §3.6.5, §2.3 joins, steals, invalidation, undo | **sound**      | With one commit check and one cache note added                                                                                                                                                                             |
| 9   | Draft 2 applied review 1                               | **sound**      | All of §12's five changes and §10's gaps are in; a short list of what an implementer still has to guess                                                                                                                    |

## 1. Angle from recipes across a flip (§3.6.6): wrong

**The rule.** Same kind, same marcher → spot assignment, end recipe descends from the start one ⇒
`angle = end rotation − start rotation`, pivot = the recipe's pivot point.

**Counter-case.** A 4 × 4 box at rotation 0, spacing 2, centre (0, 0). The user flips it side to
side (`flipFrame(frame, "across", "c")`). `frame.ts` lines 210–224: `opposite = normalizeAngle(0)
= 0`, `half = π`, `near(0) = 0 ≤ near(π)`, so the new frame has `rotation = 0` and `flipX`
toggled. Same kind, same assignment, descends from the start: the test passes with `angle = 0`.
Now per member, with `a = A − centre` and `b = B − centre`: a mirror keeps `r1 = r0` and sends
`φ1 = π − φ0`, so `e = wrap(π − 2φ0)`:

| Member at | φ0     | e     | What it does                                                            |
| --------- | ------ | ----- | ----------------------------------------------------------------------- |
| (3, 0)    | 0°     | −180° | `D-TURN-TIE`; sweeps half a turn one way or the other on a 10⁻¹⁵ change |
| (3, 1)    | 18.4°  | 143°  | sweeps 143° anticlockwise, round the far side                           |
| (3, −1)   | −18.4° | −143° | sweeps 143° clockwise                                                   |
| (0, 3)    | 90°    | 0°    | stands still                                                            |
| (1, 3)    | 71.6°  | 37°   | short hop                                                               |

Half the box goes round one way, half the other, the middle row is a coin toss, and the clip reads
"Turn 0°". A mirror is not a rotation about any pivot, so no turn route can represent it; the
"same shape" test must not claim it can.

**Second defect, same cause.** `flipFrame` _writes_ `normalizeAngle(−θ)` or `normalizeAngle(π −
θ)` into `rotation`, and `snapRotation` returns `normalizeAngle(rad)` ("Kept in [0, 2π)"). The
draft says only that `normalizeAngle` "stays for comparisons and snapping, applied to a copy". As
written, a box wound to 450° and then flipped stores 270° (or 90°): the extra turn is gone, and
`turn_shapes` recomputes `angle` from a wrapped value. The drag code for the rotate handle also
reads the mouse through `atan2`, which is wrapped by nature; counting turns needs the drag to
accumulate deltas across the ±π seam.

**Fix (§3.6.6, first bullet, and a new bullet).**

1. Add to the same-shape test: **and the same handedness** (`flipX XOR flipY` equal at both ends).
   A handedness change falls to the fit rule (item 4), which then raises a new diagnostic
   `D-TURN-MIRROR` ("the end shape is mirrored; a turn can't mirror, members cross") shown on the
   Turn row. Or refuse Turn for a mirrored end; owner's call (Q2 below). My recommendation: refuse,
   with "Use Straight or draw a route": a fitted turn into a mirror is never what anyone meant.
2. Name the three places that wrap today and what each becomes: `snapRotation` snaps the _delta_
   and returns `frame.rotation + snappedDelta` (unwrapped); the rotate-handle drag accumulates
   `wrap(θ_mouse − θ_prev)` per pointer move; `flipFrame` picks the branch (`−θ` or `π − θ`) by the
   existing nearest-angle rule but returns it **plus `2π·round((θ − branch)/2π)`** so the stored
   winding count survives a flip (a box at 450° flipped side to side reads 450° or 630°, never
   90°). `rotationDegrees` and `normalizeAngle` stay as display and comparison helpers.
3. Say how "descends from" is known. ADR 0006 has no lineage column that I can find; if the recipe
   row gains a `parent_recipe_id` (app data, with history), say so; if the test is "the end
   recipe's id equals the start recipe's id carried forward", say that. An implementer cannot
   guess this.
4. Add to the same rule: if the assignment check fails because the Shape tool re-assigned by least
   travel (a box rotated 180° where every marcher was given the nearest spot, so `B = A` for all),
   the recipe says 180° but every member has `e = −180°`, `dφ = 0`, and nobody moves while the clip
   says "Turn 180°". The app must compare assignments by spot id, not by position, and fall to the
   fit (which returns 0°) with a notice "spots were reassigned; no turn to make".

## 2. `slide` offsets in the first-heading frame (§3.4, §2.2 `path_params`, U-1): wrong

**The rule.** `offset` is "in the frame of the route's first heading `θ₀`". `slide` places every
point at `point + rot(θ₀)·o`.

**Counter-case.** Reference `from = (0, 0)`, `P₁ = (5, 0)`, `to = (10, 0)`, so `θ₀ = 0`. One member
has `o = (0, 2)`: it starts at `A = (0, 2)`, its lane point is `(5, 2)`, its end `B = (10, 2)`,
`G = (10, 2)`: not changed. The user drags `P₁` to `(0, 5)`. Now `θ₀ = 90°`, `rot(90°)·(0, 2) =
(−2, 0)`, the member's lane point is `(−2, 5)` instead of `(0, 7)`, and `G = (8, 0)` while `B`
is still `(10, 2)`: `|B − G| = 2.83 > ε`, so the route is flagged **changed for every member**
and Re-fit is offered, after an edit to one inner point. The member's first leg runs from `(0, 2)`
to `(−2, 5)`: the whole formation's lanes turned 90° about the reference while its marchers did not.
In `slide` mode the lane must be the reference path **translated**, and a translation has no
heading.

**Fix (§2.2 table row for `path` routes, §3.4 `slide`, §5.3 "Draw a route").** Store `offset` in
**field axes** (`o = A − F` at drawing time, absolute). `slide`: `place(point, o) = point + o`.
`heading`: the lane is offset by `rot(θ(t) − θ₀)·o`, with `θ₀` the first heading **at the time the
route is placed**, which is the only place the first heading still matters; switching a formation
between `slide` and `heading` changes nothing stored. Re-fit (§3.5) for a `slide` formation is then
just the translation `A_centroid − F`; the Kabsch heading is used by `heading` mode only (say so in
§3.5, which currently fits a heading for both).

The rest of U-1 is sound: the rename to `heading`, the 15° mismatch notice, and the "last legs
twist back" explanation match prototype finding 1.

## 3. The S-2 exception (§3.6.2): fix needed, then an owner call

**What the draft claims.** Shared progress `u(b)` means constant _angular_ speed between pins; "in
a rigid turn that is the same thing for each member (its distance from the pivot is fixed)", so
only spirals break S-2.

**That is false when the pivot travels.** Illustration D: a 3 × 3 block at 2-step spacing moves 18
steps right and makes one full turn in 16 counts. A corner member at radius `r = 2√2 = 2.83`
steps has velocity `v_P + ω × r` with `|v_P| = 18/16 = 1.125` steps per count and `|ω r| =
2π·2.83/16 = 1.11`. Its speed swings between `|1.125 − 1.11| = 0.01` and `2.24` steps per count
within one move, smoothly: it nearly stops once and runs at about 2¼ steps per count once. That is
exactly what S-2 forbids ("no smoothing or easing … an immediate change of effort"), in the rigid
case, with no spiral anywhere. A cycloid cannot be walked at constant speed by a rigid group;
"the box keeps its spacing" (T-2, D) and S-2 are **incompatible** for a travelling pivot, so one
of them loses there whatever rule is chosen.

**The alternative rule, written out.** Keep the knots at the shared `u` values (pins stay exact for
everyone). Between two knots each member moves at **constant speed along its own piece** (arc
length parametrised), as every other piece in this draft does. Consequences:

- Fixed pivot, rigid turn: identical to the draft (constant radius, so arc length is linear in `u`).
- Fixed pivot, uniform scale `k` and rotation `Δ` for all: also identical. Speed is `r0·√((k−1)² +
(1 + u(k−1))²·Δ²)`, proportional to `r0`, so arc length is proportional to `r0` for every member
  and the arc-length map `u(b)` is the **same** for all: the group is still a shape on every count.
  (The draft's "box stays a box" survives this rule.)
- Spiral into a different shape: each member at its own constant speed. The draft's member going
  from `r = 1` to `r = 10` steps over `e = 170°` would otherwise go from 0.6 to 1.9 steps per count
  within the move (speed `√(dr² + r²dφ²)` at `u = 0` and `u = 1`), a threefold smooth acceleration.
- Travelling pivot: the block **shears** mid-move (members at different `u` at the same beat; the
  corner member above would be about 0.5 beat ahead of the centre at its fastest), so D's "keeps
  its spacing" fails. Arc length then has no closed form (the cross term `v_P · (…)` oscillates)
  and needs the declared subdivision algorithm of §3.2.

**Verdict.** The draft's choice (shared `u`, group first) is defensible and I would keep it, for two
reasons: the owner has already chosen rigid spacing for D, which forces shared `u` there, and one
rule beats a hybrid ("constant speed unless the pivot travels"). But §3.6.2 must say the true
scope of the exception: **S-2 is suspended inside every turn span whose members have different
radii or whose pivot travels**, with the D numbers above, and the Q5 step warning must be computed
per step (not per piece) inside turns so the acceleration is visible on the clip. Register S-2
gains the exception explicitly, with the owner's initials. Q1 below asks the owner to confirm.

## 4. The Kabsch fit (§3.6.6 "Otherwise"): fix needed

Four gaps an implementer would fill differently each time:

1. **Proper rotation only.** 2D Kabsch returns a reflection when the best fit is a mirror
   (`det(V Uᵀ) < 0`). Say: use the standard correction (negate the last singular vector), so
   `angle` is always a rotation, and raise `D-TURN-MIRROR` when the correction fired (item 1).
2. **Ties.** When the cross-covariance `H = Σ aᵢ bᵢᵀ` has `|H| < ε` (all starts at one point, or
   a symmetric assignment such as a vertical line sent to a horizontal line with half the members
   going each way), the angle is undefined. Rule: `angle = 0`, `D-TURN-TIE` on the route.
3. **The seam at 180°.** `angle ∈ (−180°, 180°]` has a cliff: a box turned very nearly half a
   turn fits as `+179.9°` one edit and `−179.9°` the next. `dφ = Δ + wrap(φ1 − φ0 − Δ)` changes by
   `2π` for **every** member when `Δ` changes by `2π`, so the whole group reverses direction on a
   nudge and the backwards-spin guard fires on an edit the user never made. Rule: when a fitted
   turn is recomputed and a previous `angle` exists, pick the representative `fit + 360°·n` nearest
   to the previous value (hysteresis); only the first fit uses `(−180°, 180°]`.
4. **Which source mode is a fitted turn, and when does it recompute?** `turn_shapes` is defined
   as "follows the recipes"; a fit over loose dots follows nothing the app can watch (the starts
   are resolver output and move under upstream edits). A turn route also stores no `from`/`to`,
   so §3.5's "changed" flag (`|A − F| > ε`) has no analogue and **Re-fit is undefined for turns**.
   Rule: add `turn_fit` (fitted once, then frozen like `turn_set`); store the fit's start and end
   centroids as `from`/`to` in the turn geometry (authored, never walked), so "changed" is
   `|centroid(A) − from| > ε` or `|centroid(B) − to| > ε` and the existing Re-fit button refits.
   The UX sheet's "Turn: reset to shapes" then applies to `turn_shapes` only.

## 5. Per-member winding and the walked path (§3.6.3): sound

Checked: `e = wrap(φ1 − φ0 − Δ) ∈ [−π, π)`, `dφ = Δ + e`; rigid case gives `e = 0` exactly in
exact arithmetic and about `10⁻¹⁶` in doubles (illustration D: `wrap(2π + 10⁻¹⁶) ≈ 10⁻¹⁶`);
`r(u)` is a convex combination of two positives so never crosses zero; the on-pivot fallback is
the only way to reach `r = 0`; the "exactly opposite" member is deterministic given its bits
(`wrap` maps `±π` to `−π`) and flagged by `D-TURN-TIE`. 170° is fine as a threshold; what the
warning should add is the distance that would flip it (`r·(π − |e|)`, "goes the other way round if
moved 0.7 steps").

Three changes, none structural:

- **Drop `atan2` from the evaluation.** `pos(u) = P(u) + (r(u)/r0) · rot(u·dφ) · a` needs no
  `φ0`, and `e = wrap(atan2(a × b, a · b) − Δ)` is better conditioned than a difference of two
  `atan2`s near the seam. `pos(0)` is then `P(0) + a` (still not bit-exact, keep the "ends as
  stored" clause).
- **Goldens need a tolerance.** `Math.sin`, `Math.cos` and `Math.atan2` are not correctly rounded
  and differ across engines in the last ulp. Lines and arcs can stay bit-exact; turn goldens
  compare at `10⁻⁹` field units, ends bit-exact (P-7). Say so in §9's QA row; the spec's
  "two implementations agree bit for bit" claim must not be extended to turns.
- **Non-uniform scale is not exact**, and the text implies it is ("the same shape at scale `1 +
u(k−1)`"). A 4 × 4 box stretched 1.5× across about its centre: the member at `(3, 3) → (4.5, 3)`
  passes `(3.731, 3.060)` at `u = ½` while `(1, 3) → (1.5, 3)` passes `(1.247, 3.010)`: the back
  row bows 0.05 steps. Invisible, but the claim should read "rotation and _uniform_ scale".

The `ε_geom = 10⁻⁹` fallback is a numeric guard, not a design rule: a member whose end is 0.01
steps from the pivot spirals tightly into it while its neighbour exactly on the pivot walks
straight. Fine in practice (both paths are within 0.01 steps of each other at every beat), and
worth one QA-DG case.

## 6. The time split (§3.6.7): sound

Line by line, with `k ∈ ℤ` such that `φ1 − φ0 − Δ = e + 2πk`:

- Second half: `Δ′ = Δ(1 − u_c)`, `φ0′ = φ0 + u_c·dφ`. `φ1 − φ0′ − Δ′ = (φ1 − φ0 − Δ) − u_c(dφ − Δ) =
e + 2πk − u_c·e`, so `e′ = wrap(e(1 − u_c)) = e(1 − u_c)` because `|e(1 − u_c)| < π` for
  `u_c ∈ (0, 1]` (at `e = −π` exactly the product is in `(−π, 0]`, inside the range). `dφ′ =
dφ(1 − u_c)`. ✓
- New knots: pins map by `u′ = (u − u_c)/(1 − u_c)`, an affine map, and `u` is linear between old
  knots, so `u′(b)` on the segment containing `c` is the restriction of the same line. ✓
- `P′(u′) = P(u_c) + u′(P(1) − P(u_c)) = P(u_c + u′(1 − u_c)) = P(u)`; same for `r`. ✓
- First half with `u_c` in place of `1 − u_c`. ✓
- `c` inside a hold or stop: `u_c` is the hold's value; a split inside `hold_start` gives a first
  half with `angle = 0`, `pivot_to = pivot_from`, no pins: valid under §3.6.1. ✓

Two things to say rather than leave to §5.2 by reference: a cut exactly at a pin's `at` makes
that pin's `turned` equal to the first half's whole angle and `0` in the second, both of which
violate `0 < |turned| < |angle|`, so **the pin is dropped on both sides** (the boundary pins it);
and the first half **rewrites the original route row in place** (keeps its id, as path splits do),
while the second half is a new row, so undo is one inverse per row and the "every route is used"
check holds without a delete.

## 7. The bound (§6): sound, one inconsistency

Turn span: `|pos(u)| ≤ |P(u)| + r(u) ≤ β + max(|A| + β, β′ + β) = max(|A|, β′) + 2β`, using that
`P(u)` is on the segment between two authored pivots (so say in §3.6.1 that `pivot_from` and
`pivot_to` are authored points under I-S1, which §2.1's `[−10⁶, 10⁶]` rule covers only by
implication). Induction: with `S = √(C² + aβ′²)` and `D = 2βτ`, an arc span needs
`√((S + D)² + β′²) ≤ √(S² + β′²) + D`, which squares to `2SD ≤ 2D√(S² + β′²)`. ✓ A turn span adds
`2β` to whatever the bound was, and `M ≥ C ≥ β′` so `max(M, β′) = M`. ✓

The linear term is not slack. A stolen turn can carry a marcher genuinely away: `A = (β, 0)`,
`pivot_from = (−β, 0)`, `pivot_to = (β, 0)`, `B = (−β, 0)`, `Δ = π`; at `u = ½` the marcher is at
`(0, 2β)`. Chain it and each span adds about `β`. So P-13's constant must carry `τ`, and the QA
plan needs a QA-REG analogue of the arc chain: 1,000 stolen turns reach at most `β + 2,000β ≈
2.8 × 10⁹`, where float64 still resolves `10⁻⁶`. Fine, but it should be tested like QA-REG-5.

Inconsistency: summary item 6 says turn spans add at most `2β′`; §6 proves `2β`. Both are true
(`β′ ≥ β`); pick `2β` in both places.

## 8. Joins, steals, invalidation, undo (§3.6.4, §3.6.5, §2.3): sound

- Join reference `A_ref = P(0) + rot(−Δ)(B − P(1))` gives `r0 = r1`, `e = 0`: the rigid turn
  ending at `B`, authored data only. ✓ `B` on the pivot: straight from `P(0)` to `B`. ✓
- A steal at `c` leaves the member at `pos(u(c))` (R-5 with `T.end`, D-7). ✓ The resume's entry
  aims at `R(b_i)` on the member's own spiral; horizon = next pin's beat. ✓
- `pathOf[T][m]` (`r0, r1, dφ`) depends on origin, destination and route geometry: covered by
  W-1 (origin), the destinations row + W-5, and the routes row + W-5. ✓ Add that a turn's **knot
  table is per route, not per span**, so it lives in `routeGeometry[R]` and is dropped by the routes
  row and by the range row; the draft's §7.1 says "the route's own data needs no cache", which is
  wrong for the knots once pins exist.
- Undo: Choose Turn inserts the route, then updates transitions and `route_sources` (parent
  first); Choose Straight the reverse (§2.3). ✓ One thing to test, not assume: a cascaded delete of
  `timeline_route_sources` must appear in the history log for redo to rebuild it. SQLite fires
  the child's delete triggers on `ON DELETE CASCADE`, but the migration test should assert it.
- Missing commit check: for `kind = 'turn'`, every pin's `turned` has `angle`'s sign, is strictly
  inside `(0, |angle|)`, and grows strictly; `angle = 0 ⇒ no pins`; `|angle| ≤ 23040`. §3.6.1
  states the rules; §2.2 lists the checks and doesn't include them. Also say what a recipe
  rotation beyond 64 turns does at Turn time (refuse the write with a notice, I assume).
- Split by marchers keeping one turn route across two moves: fine, and the "same range" commit
  check covers it. ✓

## 9. Draft 2 against review 1: applied

Checked against review 1 §12 (five changes) and §10 (gaps): Case B tangents and the `7/3` bound
(§3.1, §6); the entry rule with `A_ref`, steps, on-schedule shortcut, `σ_eff`, horizon, lineup
joiners on R-11, W-5 (§3.3, §2.3); rational offsets from `T.start`, rate on the transition, holds
(§2.1, §2.2); `lineup` is `k = n`, `slots` start from the on-trail position, `order_mode = 'slot'`,
`advance` as stub target only (§4); `arc` points, no `timeline_id`, offset lanes with round/trim,
Kabsch re-fit (§2.1, §3.4, §3.5); `stepSize` in the snapshot, hand edits drop the recipe link,
child-first deletes, change-log images, file version (§2.3, §2.4). All present and consistent
with the register's F-1 to F-6.

**What an implementer would still have to guess** (draft 3 as a whole):

1. The formation's **reference point** when a route is drawn for several marchers (§5.3 says
   "the reference start" and never says whose: centroid of the selection at the move's start is
   the obvious choice; say it).
2. `timeline_route_sources.mode`: the full value list (`shape`, `snake`, `outline`, … plus
   `turn_shapes`, `turn_set`, and `turn_fit` from item 4) and which edits move between them.
3. The **Bézier fit for spiral SVG export** ("within 0.01 step"): the algorithm is undeclared,
   unlike the length rule in §3.2. The mobile app draws what the export says, so two builds could
   disagree. Declare it (fixed subdivision at the rate grid plus Catmull–Rom through the samples
   is enough and deterministic).
4. The turn pin's wording: "`turned` 180° by count 8" is the **group's** share. In a spiral, a
   member with `e = 60°` on a 270° turn has swept 220° at that pin. The inspector should say
   "group turned 180°", or the owner should accept the ambiguity (Q5).
5. The `wrap` rule when the pivot travels and the member passes **through** the pivot line: not a
   problem for the formula (`r(u) > 0`), but `travelDirection` for the on-pivot straight fallback
   when `A = B` returns `null` for the whole span; say the facing cue then keeps the previous
   facing (the Facing cue's own fallback).
6. The backwards-spin guard fires on **any** sign change, so a shape edit that nudges an angle from
   `+5°` to `−5°` shows "Move 3 now turns ↺ 5° · Undo". Gate it: a sign flip counts only when
   `max(|old|, |new|) ≥ 90°`, or notice on a change of 180° or more.
7. Whether a member may **choose its winding** ("go the other way round"). The draft forbids
   per-member data on turns, so the only fix for an unlucky spiral member is to move its end spot.
   A `path_params: {"wind": ±1}` adding `±2π` to `e` would be one integer per member and keeps the
   split proof (it scales with `1 − u_c` like `e`). Owner's call (Q3).

## 10. Questions only the owner can answer

1. **S-2 inside turns.** A rigid turn whose pivot travels cannot be both rigid and constant speed
   (illustration D: 0.01 to 2.24 steps per count for a corner member). Keep rigid (the draft) and
   record S-2 as suspended inside turn spans, or keep constant speed per member (the box shears
   while the pivot travels)? Item 3 recommends rigid.
2. **A mirrored end shape under Turn.** Refuse Turn ("use Straight or draw a route"), or fit a
   rotation and warn that members cross? Item 1 recommends refuse.
3. **Per-member winding override** (one integer in `path_params`) versus "members carry nothing"?
   Without it the only fix for a member sent the long way round is to move its end spot.
4. **Fitted turns** (different shapes, loose dots): frozen after the first fit with a Re-fit button
   (item 4), or recomputed whenever the start positions move upstream (which means the turn
   changes under the user's feet after an edit elsewhere)?
5. **Pins in spirals** name the group's turned angle, not each member's. Acceptable wording, or
   should the pin show per member in the inspector?
6. **Backwards-spin notice** on sign flips: every flip, or only past 90° (item 9.6)?
