<!-- cspell:disable -->

# Pathways draft 5: review of the turn-editing rules, P-1 and G-1

Date: 2026-11-03. Reviewed: [draft-model.md](draft-model.md) (draft 5) against draft 4, the
[register](README.md) (T-3, T-4, P-1, P-2, G-1), the [UX sheet](ux-sheet.md) (draft 3),
[proto-round-2.md](proto-round-2.md), [proto-round-3.md](proto-round-3.md), the
[implementation plan](implementation-plan.md), spec v0.8 (R-4, R-5, §8.11, §9.4), ADR 0006 with its
amendments, and the shape code the rules lean on: `apps/desktop/src/shapes/frame/frame.ts`,
`frame/gestures.ts`, `editor/boxEdits.ts`, `placed/liveBox.ts`, `placed/placedBox.ts`,
`assign.ts`.

Notation as in the draft: `S`, `E` the start and end recipes; `M` the start → end motion; `θ` its
rotation; `Δ = angle` in radians; `a = A − P(0)`, `b = B − P(1)`; `e` a member's share; `u` the shared
progress; `R_p(α)` the rotation by `α` about point `p`; `T_t` the translation by `t`.

## 0. Verdict

**Fix needed before this becomes spec text.** The three new rules themselves are right: I checked
that typing an angle (`R_{pivot_to}(Δ′ − θ) ∘ M`), dragging the pivot (`T_{p − M(p)} ∘ M`) and the
Alt variant each keep I-1 and I-2, keep every member's share `e` unchanged (so spirals survive a
typed angle), and compose with a travelling pivot. The problems are around them:

| #        | Finding                                                                                                                                                                                                                                                                                                         | Severity                                                           |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1        | Whole turns live in the end recipe's unwrapped rotation, which the next move reads as its start: "+1 turn" on move 3 makes move 4 spin a turn backwards, and a freshly drawn end shape after a wound start reads as a whole turn                                                                                | **wrong** (gives a result nobody wants in a case that will happen) |
| 2        | `θ` and `M` are defined only for `turn_shapes` (and for `turn_fit` at fit time). The typing and drag rules are applied to `turn_set` routes too (every second half of a time split is `turn_set`), where neither exists. "Same shape" is also under-defined (sizes, layout, kinds without a frame, `ungrouped`) | **fix needed** (undefined cases on the main path)                  |
| 3        | The on-pivot straight fallback is not preserved by the time split: a member on the pivot at one end with more than 180° left after the cut goes from a straight walk to a full orbit                                                                                                                            | **wrong** (breaks the "exact up to rounding" claim)                |
| 4        | `pivot_from` is frozen in field coordinates under `turn_shapes`; a start-shape edit leaves the hinge behind and the gate slides                                                                                                                                                                                 | **fix needed**                                                     |
| 5        | Pins under angle edits and direction flips are undefined (a flip breaks the commit check); the ↻ ↺ rule in §3.6.7 contradicts the UX sheet and round 3                                                                                                                                                          | **fix needed**                                                     |
| 6        | Edits that make the shapes stop qualifying under `turn_shapes` (a flip, a member added, split by marchers, a carried recipe) have no rule                                                                                                                                                                       | **fix needed**                                                     |
| 7        | Fitted turns: a pivot drag leaves `to` stale (the changed flag fires at once) and Re-fit discards the dragged pivot; `turn_set` has no changed flag at all                                                                                                                                                      | **fix needed**                                                     |
| 8        | A plain pivot drag on a full turn while travelling (illustration D, `θ ≡ 0`) collapses the travel                                                                                                                                                                                                               | **fix needed** (owner call)                                        |
| 9        | "Restore when leaving Turn" (plan step 21, round 3 finding 5) has no model: the pre-Turn end is not stored anywhere                                                                                                                                                                                             | gap                                                                |
| 10       | P-1: §8's J-2 example still drags the dot; detaching a turn member and opening an `arc` move are undefined                                                                                                                                                                                                      | fix needed                                                         |
| 11       | G-1 leftovers: §2.1 dangling comment, §6 "offset lanes" and the mitre mutant, §7.1 per-offset cache, register U-1 / O-12 / J-8                                                                                                                                                                                  | tidy                                                               |
| 12 to 16 | Overrides under a Turn edit, the wrapping-site list, precision claims, the start recipe's definition, small wording                                                                                                                                                                                             | tidy                                                               |

Items 1 to 4 change rule text that every turn ticket (plan steps 20 to 23) builds against; 5 to 9
are rules the implementer would otherwise invent. Nothing here touches the resolver formula of
§3.6.3 except finding 3's fallback, and nothing touches R-14 to R-18.

## 1. Whole turns in the recipe's unwrapped rotation leak into the next move (§3.6.6, T-0): wrong

**The rule.** Under `turn_shapes`, `angle = (rotation_E − rotation_S) × 180/π`, both unwrapped; ↻ ↺
and "typing `θ + 360°`" add `±2π` to the **end recipe's** rotation; "whole turns never move the end
spots".

**Counter-case A (the leak).** Move 3: box from 0° to 90°, Turn, `turn_shapes`. Move 4: the same
box turns back, 90° → 0°, Turn, `turn_shapes` (`angle_4 = −90°`). The user presses ↻ "+1 turn" on
move 3: `rotation_E3 += 2π`. Move 3 now reads 450° ✓. But `E3` **is `S4`** (ADR 0006: the recipe of
the move ending at move 4's start), so `angle_4 = 0° − 450° = −450°`: move 4 now spins 1¼ turns
backwards although no spot of move 4 changed. The guard notices ("Move 4 now turns ↺ 450° · Undo")
but Undo also undoes the change the user wanted; there is no way to add a turn to move 3 alone.
The same leak runs down every chain of `turn_shapes` moves on the same members.

**Counter-case B (the fresh end).** Move 3 ends at 450° (wound). On move 4 the user draws a new box
with the Shape tool rather than editing the carried copy. The drawing code stores `snapRotation(atan2(…))`
(`block.ts:268`, `frame.ts:260`: "Kept in [0, 2π)"), say 10°. Choose Turn: `angle_4 = 10° − 450° =
−440°` = "↺ 1 turn + 80°". Nobody wound anything in move 4. Draft 5's own fix list (§3.6.6 "the
three places that wrap") does not cover placement, and cannot: a fresh shape has no winding to keep.

**Why.** A whole turn is a property of the **move** (how far the group goes between two placements),
not of a placement. Storing it on the placement makes every later move inherit it.

**Fix.** Put the whole turns on the route and leave recipe rotations wrapped. Replace the I-1 bullet
and the "Whole turns" and "Unwrapped recipe rotation" bullets of §3.6.6 with:

> **I-1:** `angle = θ_w + 360°·n`, where `θ_w ∈ (−180°, 180°]` is the start → end motion's rotation
> reduced to one turn (the recipe difference under `turn_shapes`, the fit otherwise) and `n ∈ ℤ` is
> the route's whole-turn count. `n` is stored only through `angle` (the route is the record); the
> recipes keep wrapped rotations as today and no recipe column changes.
>
> **Recompute (I-1 kept under recipe edits).** When `θ_w` is recomputed from the recipes, the new
> `angle` is the representative `θ_w′ + 360°·k` **nearest the previous `angle`** (the same hysteresis
> the fit uses, §3.6.6 step 5). A continuous rotate-handle drag therefore winds the angle through 360°
> and beyond without a seam; the drag already accumulates `wrap(θ_mouse − θ_prev)` per pointer move.
> Only ↻ ↺, a typed angle, or a change of 180° or more in one recompute can change `n`.
>
> **Whole turns never move the end spots.** ↻ ↺ and typing `angle ± 360°` change `angle` only, under
> every source; the source does not change.

Consequences, all simplifications: the "three wrapping sites" paragraph is deleted (only the
rotate drag's per-move accumulation is still needed, and it is needed for the _turn angle_, not the
recipe); `flipFrame`'s `2π·round(…)` term is unnecessary (a flip changes handedness, so it is never a
turn); the Shape panel shows "1 turn + 90°" by reading `rotation_S + angle` **while Turn is chosen**
(the UX sheet already says so) and `rotationDegrees` everywhere else; plan step 20 ("Shapes keep
counting turns") becomes "the rotate drag accumulates past 360° and chooses Turn" and loses its
schema-free-but-wide code change. T-0's observable behaviour (wind the end box 180° → 450°, get a 270°
turn) is unchanged: the drag passes through `θ_w = 180°, 90°, …` and hysteresis keeps `angle`
continuous at 270°. Counter-case A gives `angle_4 = −90°` still; counter-case B gives `−80°`.

If the owner keeps the unwrapped recipe (Q1 below), the draft at least needs: (a) placement stores
the drawn rotation as the representative nearest the start recipe's rotation for those members, and
(b) a stated rule for the leak (accept it, or cascade `+2π` to every downstream recipe of the same
members, which breaks on the first membership change). I don't recommend either.

## 2. `θ`, `M` and "the same shape" are not defined on the paths the rules run on (§3.6.6): fix needed

Three gaps, each with a concrete case.

**2a. `turn_set` routes have no `θ` and no `M`, but the typing and drag rules apply to them.** Every
time split produces two `turn_set` halves (§3.6.7). The second half's end is the original recipe,
which holds exactly the members, so "the end can move". The user types 90° on it. The rule rotates
the end recipe by `Δ′ − θ`, where `θ` is "the recipe difference or the fit": the start is loose
dots (the split's `pos(c)`), so there is no recipe difference and no fit was ever made. An
implementer will pick one of: the stored angle, a fresh fit, or refuse. The same applies to "drag
the pivot to `p`" (`p − M(p)` needs `M`) on any `turn_set` route, including one that became
`turn_set` by an Alt-drag.

Fix: define both for every source, once, at the top of §3.6.6:

> **The motion `M` and its rotation `θ`.** Under `turn_shapes`, `M` is the start frame → end frame
> map of the recipes (2c below) and `θ` its rotation. Under `turn_fit` and `turn_set`, `M` is the
> rigid motion the route itself stores, `M(x) = pivot_to + R(angle)·(x − pivot_from)`, and `θ =
angle`. In every rule below "rotate by `Δ′ − θ`" means rotate the end's positions by the angle
> `Δ′ − angle` (reduced to one turn for the geometry) and set `angle = Δ′`.

With that, `M′(pivot_from) = pivot_to` and `θ′ = Δ′` hold for every source by the same algebra as
the draft's. Note the typing rule must subtract the stored **`angle`**, not a one-turn `θ`: with
`angle = 450°` (`θ_w = 90°`) and a typed 460°, rotating the end by `460° − 90° = 370°` and by `10°` are
the same geometry only because the geometry is reduced; the text should say which number is
subtracted so the two readings cannot diverge.

**2b. Uniform and non-uniform scale.** "The same shape" is "same kind, same assignment by spot
index, same handedness"; size is not mentioned, so a 4 × 4 at 2-step spacing into a 4 × 4 at 3 × 2
passes. Then `M` is affine, not rigid, and `pivot_to = M(pivot_from)` needs the affine `M` (the
draft's "rotation `θ` plus the translation" is not enough: with the rigid `M` the pivot pair is wrong
and every member gets `e ≠ 0`, a visible spiral on a shape that was only resized). Fix (2c) defines `M`
through the frames so the scale comes for free; §3.6.3 already says uniform scale is exact and a
non-uniform stretch bows by about 0.05 steps, which stays true.

**2c. Layout, kinds without a frame, `ungrouped`.** Today's recipes are the box tool (`files`,
`outline`, `spread` modes) and the circle tool, both with `frameOf`/`withFrame`; the older kinds
(`curve`, `arc`, `line`, `block`, `fill` in `registry.ts`) store points or have no rotation; and the
`ungrouped` mark (ADR 0006, 2026-11-01) **is a recipe** with empty params. Cases: two `ungrouped`
recipes pass "same kind" and the assignment test is vacuous, so Turn would read a rotation from
params that have none; a box in `files` mode into the same box in `outline` mode with the same slot
numbers passes the test while spot `k` is a different place in each. And "the end can move"
accepts an `ungrouped` end: typing 270° "rotates" a recipe with no frame, nothing moves, I-1 is
broken on the first edit.

Fix, replacing the "same shape at both ends" bullet's first sentence:

> **The same shape at both ends.** `S` and `E` are frame kinds (`frameOf` is defined), have the same
> kind and the same lattice (`sameLattice` in `liveBox.ts`: spot `k` has the same row and file, or
> the same place round the outline, in both), the same marcher → spot assignment by `slot`, and the
> same handedness (`flipX XOR flipY`). `M` is then the frame map `x ↦ c_E + R(ρ_E)·D·R(−ρ_S)·(x −
c_S)` with `D = diag(halfWidth_E / halfWidth_S, halfDepth_E / halfDepth_S)` (a zero half size maps
> to scale 1): rigid when the frames have equal half sizes, a uniform scale when they are
> proportional, affine otherwise (not exact, §3.6.3). `θ = ρ_E − ρ_S`. Any other pair of ends
> falls to the fit. **The end can move** only when the end recipe is a frame kind; an `ungrouped`
> or point-list end counts as loose dots.

`turnShape` in `gestures.ts` (`withFrame(rotateFrame(frameOf(E), ρ, pivot))`) is the existing
primitive for "rotate the end recipe about `pivot_to`", so the rule costs no new kind code; say so,
and that it is called with `carryPivot` so the recipe's own pivot setting stays.

**2d. Which recipe is `S`, and which `E`.** Not said. Say: `S` is the recipe of a move ending at
`T.start` (UI-25 shares count) or the home recipe when `T.start` is the show's start, and `E` the
recipe with `timeline_id = T`'s move; both must hold **every** turn member (they may hold others
for the same-shape test, but not for "the end can move"). Members drawn from two start recipes fall
to the fit. If `E` is a recipe carried from an earlier move (ADR 0006, revision 2026-10-29 rule 4),
the first Turn edit that moves it saves the copy on this move and the turn links to the copy.

## 3. The on-pivot fallback is not split-exact (§3.6.3, §3.6.7): wrong

**The rule.** `r0 < ε_geom` or `r1 < ε_geom` ⇒ the member walks the straight line `A → B` at the
shared progress. §3.6.7 then says the time split "is exact up to rounding" for every member.

**Counter-case.** A 3 × 3 block spirals into a circle (`turn_fit`), centre member exactly at `c_A`,
so `r0 = 0`, `r1 = 5` steps, `angle = 300°`. Split at `u_c = 0.2`. First half: `r0 = 0`, still
straight ✓. Second half: `A′ = pos(0.2) = A + 0.2·(B − A)`, `P′(0) = P(0.2)`, so `a′ = 0.2·b` (one
step long, far above `ε_geom`), and the generic rule applies: `e′ = wrap(atan2(a′ × b, a′ · b) −
240°) = wrap(−240°) = +120°`, `dφ′ = 240° + 120° = 360°`. The member, who was walking a straight
line out of the centre, now orbits the pivot once while growing from 1 to 5 steps. The failure is
general: the fallback expresses `dφ = 0` where the generic rule can only express `dφ = Δ + e` with
`|e| < 180°`, so the second half cannot represent it whenever `|angle|·(1 − u_c) ≥ 180°`.

The same discontinuity exists without a split: a member starting `10⁻⁸` from the pivot (above
`ε_geom`) with the same `b` sweeps between `120°` and `480°` depending on the direction of its tiny
`a`, while its neighbour exactly on the pivot walks straight. Review 2 §5 called this "fine in
practice (both paths within 0.01 steps)"; that is true only when **both** radii are small. With one
radius large the two paths are nowhere near each other. I was wrong there.

**Fix (recommended).** Make the degenerate end take the group's sweep, which is what the generic
rule does for everyone else and what the split preserves:

> **On the pivot.** If `r0 < ε_geom` and `r1 < ε_geom`: `pos(u) = P(u)`. If exactly one radius is
> below `ε_geom`, the member has no direction at that end, so it takes the group's: `e = 0`, `dφ =
Δ`, and the direction at the degenerate end is the other end's turned back by `Δ` (start on the
> pivot: `pos(u) = P(u) + u·r1·rot(−(1 − u)·Δ)·b̂`; end on the pivot: `pos(u) = P(u) + (1 − u)·r0·
rot(u·Δ)·â`). A member starting on the pivot spirals out with the group rather than walking a
> chord.

Check: second half after a split, `a′ = r(u_c)·rot(−(1 − u_c)Δ)·b̂`, so `atan2(a′ × b, a′ · b) =
wrap((1 − u_c)Δ)` and `e′ = wrap(wrap((1 − u_c)Δ) − (1 − u_c)Δ) = 0` ✓ for every `Δ` and `u_c`. The
first half is symmetric. §6 is unaffected (`|pos − P| ≤ max(r0, r1)` still). `travelDirection` is
defined except at the instant `r = 0`. The gate's hinge marcher (both radii 0) is unchanged.

**Alternative** if the owner prefers the straight chord for a member leaving the pivot: keep the
chord and state that the time split is exact except for such members, which are refused ("split
before count N: T5 starts on the pivot") or re-timed with a notice. Q4 below.

## 4. `pivot_from` frozen in field coordinates under `turn_shapes` (§3.6.6, change table row 3): fix needed

**The rule.** "`pivot_from` is stored; `pivot_to = M(pivot_from)`", so that a dragged pivot survives
recipe edits. `pivot_from` is "kept as stored" under every later recipe edit.

**Counter-case.** Gate (illustration C): line of 8, pivot `"w"` at the hinge marcher's start, `angle
= −90°`, `turn_shapes`. The user then drags the **previous move's end line** (which is `S`) 4 steps
up-field so the gate starts further back. `M` gains a translation; `pivot_to = M(pivot_from)` moves
4 steps; `pivot_from` stays where the old hinge was. The gate now has its start pivot 4 steps off
the line and a pivot that travels 4 steps: a rigid turn (I-2 holds), but the line slides while it
swings and the hinge marcher walks 4 steps instead of standing. Every start-shape edit (a nudge, a
re-centre, a resize) has the same effect, and the start shape is edited often because it is the
previous move's end.

**Fix.** Keep the dragged pivot in the start frame's terms, as ADR 0006 keeps a free pivot in the
frame's terms, so both pivot ends follow their shapes:

> Under `turn_shapes` the app stores the pivot as a point of `S`'s frame (`pivotLocal`, app data in
> `timeline_route_sources`: `{"pivot": {"x", "y"}}` in the frame's units, or a `PivotKey`). On every
> recompute `pivot_from = frameToField(frame_S, pivot)` and `pivot_to = M(pivot_from)`. Choose Turn
> writes `S`'s own pivot setting; a plain pivot drag to `p` writes `fieldToFrame(frame_S, p)` and
> translates `E` as in the drag rule; Alt-drag writes the same and leaves `E` alone. The route's
> `pivot_from` and `pivot_to` are the resolver's copies, rewritten in the same edit.

This also answers "pins when the pivot setting differs at the two ends": the turn never reads `E`'s
pivot setting, so nothing differs. One more consequence worth a sentence: while a `turn_shapes` route
exists, the end shape's own rotate and scale gestures should use the turn's `pivot_to` as their pivot
(set `E.params.pivot` to it as a free pivot when the turn's pivot is dragged), or a user who rotates
the end box by its handle after placing the hinge will see the hinge move (`pivot_to = M″(p) ≠ p`).
Q6 below.

## 5. Pins under angle edits and direction flips (§3.6.7 rows 3 and 4): fix needed

**The rule.** "Either way pins keep their `turned` values if still inside, else the edit stops short
at the first pin, as resize stops at pins."

**Counter-cases.** (a) `angle = 270°`, pin `turned = 180°` at count 8. ↺ with round 3's "keep the
amount" gives `angle = −270°`: every pin now has the wrong sign and fails the commit check (`turned`
has `angle`'s sign); "stops short" has no meaning for a sign change. (b) Typing 120° with the same
pin: "stops short at the first pin" means `angle = 180°`, which is refused too (`|turned| < |angle|`
is strict). (c) Typing 0° (a circle that grows) with any pin: `angle = 0` must have no pins.

**Fix.** Replace the sentence with:

> Pins keep their `turned` values. An edit that reverses the sign of `angle` negates every pin's
> `turned` (a pin "180° by count 8" of ↻ 270° becomes "↺ 180° by count 8" of ↺ 270°). An edit
> that would leave a pin with `|turned| ≥ |angle|` is refused with the pin named ("Count 8 is
> pinned at 180°; remove the pin or turn further"); the drag handle stops at the largest
> `|turned|` plus one degree.

**The ↻ ↺ rule itself is not settled.** §3.6.7 row 4: "the angle becomes the nearest `θ + 360°·n`
**in that direction** … no spot moves" (draft 4's semantics). The UX sheet draft 3 and round 3
proposal 1 (4 of 4 users): ↻ ↺ **keep the amount** and the end shape turns to match when it can.
Under the second rule ↺ on ↻ 270° rotates `E` by `−540° ≡ 180°`: spots move. The two cannot both be
spec text; the plan lists this as an open owner call for step 21. Recommendation in Q2.

## 6. Edits that make the shapes stop qualifying under `turn_shapes` (§3.6.6, §3.6.7 row 5): fix needed

"Move a destination, or edit a shape at either end: with `turn_shapes` the pivot and angle are
recomputed" assumes the recompute succeeds. Cases with no rule:

- The user **flips** the end box (`flipFrame`). Handedness differs; "Turn is refused" applies to
  Choose Turn, not to an existing turn. Refuse the flip? Silently keep the old angle? Fit?
- A marcher is **added to or removed from** the end recipe (Close up, a new member placed into
  the box): "exactly the turn's members" and the slot assignment both change.
- **Split by marchers** (ADR 0006 revision 3): the end recipe is split into two; no single recipe
  holds the members; the turn route is shared by two moves (§3.6.7 row 10).
- The end recipe is **re-laid out** with a new count across or a new mode (`liveBox.ts` reassigns
  by `nearest`): the assignment test fails and the "spots reassigned" fit returns about 0°.

**Fix.** One rule for all of them:

> A recipe edit after which `S` and `E` no longer qualify leaves the route as it is and switches
> its source to `turn_set` in the same edit, with a notice and Undo ("Move 3's turn no longer
> follows its shapes: ↻ 270° kept"). The end can no longer move until the shapes qualify again
> (Reset turn re-tests them). Shape edits are never refused because of a downstream turn.

`turn_set` rather than `turn_fit` because the user chose those numbers; a fit would change them
under their feet, which Q4 of review 2 decided against.

## 7. Fitted turns after a pivot drag; Re-fit; no changed flag on `turn_set` (§3.6.6): fix needed

- **Stale `to`.** Box → circle, `turn_fit`: `pivot_to = to = c_B`. The user drags the pivot to `p`
  (the end can move): `E` is translated by `t = p − M(p)`, so the end centroid is now `c_B + t`,
  but the drag rule does not touch `to`. `|centroid(B) − to| = |t| > ε` the moment the drag ends:
  the Move card offers Re-fit on a turn the user just set.
- **Re-fit discards the pivot.** Step 6 of the fit sets `pivot_from = c_A, pivot_to = c_B`, so a
  Re-fit after an upstream change throws away a dragged pivot. Under `turn_shapes` the draft went to
  some trouble to keep it.
- **`turn_set` has nothing to compare against.** After a snap-to-whole-turn on loose dots, the user
  later places a shape at the end; the turn is frozen and now a spiral, and no flag says so.

**Fix.** In the fit bullet and the Source bullet:

> Every turn route stores `from` and `to` (the start and end centroids when the pivot and angle
> were last set), not only fitted ones; the changed flag `|centroid(A) − from| > ε` or `|centroid(B)
− to| > ε` applies to `turn_fit` and `turn_set` alike (`turn_shapes` follows its recipes and is
> never "changed"). A Turn edit that moves the end rewrites `to`. **Re-fit** keeps `pivot_from` as
> stored and recomputes `angle` (with hysteresis) and `pivot_to = M_fit(pivot_from)`, where `M_fit(x)
= c_B + R(θ_fit)·(x − c_A)`; only the first fit sets `pivot_from = c_A`.

## 8. A plain pivot drag on a full turn while travelling collapses the travel (§3.6.6 drag rule): owner call

Illustration D: `angle = −360°`, `pivot_from` and `pivot_to` 18 steps apart, so `M` is a pure
translation by 18 steps and has no fixed point. The user drags the ✛ (either one) a little to adjust
it. The rule makes `p` "the point that stays put": `pivot_from = pivot_to = p` and `E` is translated
by `p − M(p) = −18` steps. The block now spins in place; the 18-step travel the owner asked for in
T-2 is gone, from a small drag. The same happens on any travelling turn with `θ_w = 0` (a `±360°·n`
angle).

**Fix.** Add to the drag rule: "When `θ_w = 0` (the motion is a translation) there is no point that
can stay put, so a plain drag behaves as Alt: the dragged end moves, the other follows through `M`,
and the end spots stay. The chip says 'Full turn: the pivot travels with the group'." Q5 below
confirms.

## 9. "Restore when leaving Turn" has no model (§3.6.7 "Choose Straight", plan step 21): gap

Round 3 finding 5: after typing an angle moved the end, Choose Straight kept the end turned (88
collisions). Proposal 5 and plan step 21 promise "End shape stays turned 81° · Restore". After the
Turn edit, the end recipe **is** the rotated one and nothing records what it was. Undo is the whole
Turn session and may be many steps back.

**Fix.** App data: when a Turn edit first moves the end (typing, winding, or a plain pivot drag),
`timeline_route_sources` stores `restore`: the end recipe's params and its members' `x, y` before the
edit (one JSON, written once, kept until the route is deleted). Choose Straight offers Restore while
`restore` exists and the end recipe still holds exactly the same members; Restore reapplies it (an
ordinary recipe edit: positions, destinations, next move's origins) and deletes the route in the
same edit. Say also that Reset turn does **not** restore the end: it re-reads the shapes as they are.

## 10. P-1 remnants and gaps (§8, §5.3, §3.4): fix needed

- §8 "Collision fix (J-2)": "playhead on count 6, drag its dot aside. It detaches with a pinned
  corner at beat 6" is F-6, the superseded behaviour. Under P-1 dragging the dot opens the edit
  window and makes a new move. Rewrite: "open its path (double-click), playhead on count 6, drag its
  playhead marker aside: a corner pinned at beat 6, and it detaches from the formation."
- **Detaching a member of a turn** is undefined. §3.4's Detach writes "its placed lane points"; a
  turn member has none. Dragging the playhead marker on a turn member's path (§5.3 row 5) therefore
  has no result. Rule: "A member of a turn has no path of its own to open (members carry nothing).
  Opening its path offers 'Leave the turn': its transition becomes `direct` (or `route` with the
  dragged corner), and the turn keeps the others. Its start and end spots don't change."
- **Opening an `arc` move** (O-25 keeps `arc` beside routes). "On a straight move, opening its
  path and dragging the marker makes it Drawn" says nothing about an arc move. A route cannot carry
  a single arc from `A` to `B` (an `arc` is "the piece into a point"). Rule: the arc is cut at the
  marker into two `arc` points whose bulges give the same circle (exact: both sub-arcs are minor
  because the original was), the first pinned.
- The entry rule and the edit window: a dot drag mid-move (UI-10) makes a new move ending at the
  playhead; the original route's remainder is then a resume on a higher layer's release and §3.3
  applies. Worth one sentence in §5.3 so nobody expects the old F-6 pin.

Nothing else in the draft assumes F-6; §3.4 Detach, §5.3 rows 4 and 5, the UX sheet and the plan
(steps 3, 5, 8) are consistent with P-1.

## 11. G-1 leftovers: tidy

- §2.1 `geometry` comment: "Paths walked by formations only … formations always slide (G-1); no mode
  is stored" introduces nothing. Delete the two comment lines.
- §6 "Formation lane (offset lanes): within `|o|` of the reference path" and the theorem's mutant
  "mitre instead of offset lane": with slide only there are no offset lanes and no corners to round
  or mitre; a lane is `reference + o`, so `|lane| ≤ |reference| + |o| ≤ (7/3)β + |o| ≤ (7/3)β′`. Write
  that, and drop the mitre mutant (the draft-2 change-table row can stay as history).
- §7.1 `routeGeometry[R, o]` "for each distinct offset": a translated copy has the same pieces,
  lengths and distance tables. One `routeGeometry[R]` and `+ o` at evaluation; the "40,000 pieces,
  about 10 MB" estimate shrinks to 20 points per formation.
- §3.5 re-fit "a formation: translation only" ✓; §3.4 ✓; §5.3 row 1 "(`slide`)" can lose the
  parenthesis since there is no other mode.
- Register: U-1 still reads "turning with the path is the option" (strike it as O-12a was); O-12's
  "does the formation turn with the path (like a car)" and J-8's "with or without turning" are
  decided by G-1 and should say so.

## 12. Overrides under a Turn edit (§3.6.6 typing and drag rules): tidy

ADR 0006 decision 3: a member's position is its spot **plus its override**, and editing the recipe
"moves each member to its new spot plus its override" (the override vector unrotated, in field
axes). A typed angle that rotates `E` by `Δ′ − θ` therefore moves a nudged member to `R(spot) +
override`, not `R(spot + override)`: the group turns by what was typed, the nudged member's share
`e` changes, and a rigid-looking end becomes a slight spiral for that member. State which it is. I
recommend the Turn edit applies the same rigid map to every member's **position** (so overrides turn
with the shape, and `e` is unchanged for everyone, as the draft's proof assumes), and says that this
differs from the Shape tool's own override rule on purpose.

## 13. The wrapping-site list is incomplete (§3.6.6 "Unwrapped recipe rotation"): tidy, moot under finding 1

If the unwrapped recipe stays: `turnShape` (`gestures.ts:331`, `normalizeAngle(rotation)` on every
turn), `scrubTurn` (`gestures.ts:415`, starts from `rotationDegrees`, wrapped) and `reoriented`
(`boxEdits.ts:271`) also wrap; `block.ts:268` wraps at drawing. Five sites plus placement, not three.

## 14. Precision and wording: tidy

- §3.6.7 "motion is unchanged to within rounding (about 10⁻¹² field units)": the split writes
  products of doubles at field scale, so relative `10⁻¹⁵`, i.e. about `10⁻¹³` at 100 steps and `10⁻⁹`
  at the `10⁶` bound. Say "relative 10⁻¹⁵" or quote the bound.
- §3.6.6 I-2 "a same-shape turn stays rigid wherever the pivot is" holds when every member stands
  on its recipe spot at both ends; overrides, a stolen start or a start on another layer give that
  member `e ≠ 0`. Add "for members on their recipe spots".
- "its anchor is carried by the same rotation": the frame has a `center`, not an anchor (`anchor` is
  the spacing lock's word). Say center.
- §3.6.1 `from`/`to` "fitted turns only" → every turn (finding 7).
- §2.2 the `kind = 'turn'` commit check should also say `pivot_from`, `pivot_to` finite and within
  the bound (§3.6.1 says they are authored; the check list doesn't include them).
- §3.6.6 "rounded to 10⁻⁹ degrees": fine; add that the typed value is stored as typed (an integer or
  the typed decimal), and only recipe-derived angles are rounded.
- §3.6.7 time split "Both `turn_set`": the first half keeps its id, so its `timeline_route_sources`
  row is **updated** (mode and `recipe_id = NULL`); the second half gets a new row. A cut at `u_c =
0` or `1` (inside the start or end hold) makes a zero-angle half; simpler to write that half as
  `direct` with destination `A` (the same motion, no turn route to maintain).
- UI-27's split writes `pos(c)` as destinations; a turn position may lie up to `2β` beyond the
  authored bound (§6), and the write path checks `[−10⁶, 10⁶]`. At realistic sizes it never
  matters; at the bound the split must be refused rather than write an out-of-range point. One line
  in §5.2, since arcs (`√2`) had the same latent case.

## 15. What the start recipe is, and what "the start" is (§3.6.6): tidy

Said nowhere: `S` is found by beat (2d above); `A` is the **origin** (R-4), which is the recipe spot
only when the previous move delivered the marcher there. Say that `M` is built from recipe spots
while the resolver uses real origins, and that any difference shows as that member's `e`.

## 16. Sanity checks that passed

So the owner knows what was checked and need not re-check: the typing rule keeps `e` for every
member (rotating all `b_i` by `α` adds `α` to `atan2(C, S)` and to `Δ`, so `wrap(· − Δ′)` is
unchanged), including fitted spirals; the drag rule's `M′(p) = p` and unchanged rotation; Alt-drag
and the fixed point (`θ_w ≠ 0`); whole turns don't change `u` knots (`turned / angle` with `turned`
kept); the join reference `A_ref` with `Δ` including whole turns; the §6 bound with a dragged pivot
(`p` is authored, within bounds); undo as one group across routes, destinations, recipes and
`route_sources`; the rotate gesture on a placed box **keeps** slot assignments (`sameLattice` holds
under rotation, `liveBox.ts:146`), so T-0's rotating box reaches `turn_shapes` as intended, while a
fresh placement (`placeOn`, `nearest`) correctly falls to the "spots reassigned" fit; and the
remaining P-1 and G-1 text (§3.4, §3.5, §5.3, UX sheet, plan) is consistent.

## 17. Questions for the owner

1. **Where whole turns live** (finding 1). Keep T-0's "rotation is never wrapped" on the recipe, or
   move the turn count onto the route and leave shapes wrapped? _Recommendation: on the route._ The
   visible behaviour you approved (wind 180° → 450°, get a 270° turn) is identical; what changes is
   that "+1 turn" on move 3 no longer makes move 4 spin backwards, and a freshly drawn end shape never
   reads as a whole turn. T-0's text would read "the move stores how far the group turns, whole turns
   included; shapes keep their rotation as today".
2. **↻ ↺** (finding 5). Keep the amount and turn the end shape to match (round 3, 4 of 4), or nearest
   whole turn in that direction with no spot moved (draft 5 §3.6.7)? _Recommendation: keep the amount
   when the end can move; nearest-in-direction with the toast when it can't_ (the same split as
   typing). Note this moves spots: ↺ on a ↻ 270° gate puts the line on the other side of the hinge.
3. **A Turn edit changes the next turn.** Typing 270° on move 3 (previously 90°) rotates move 4's
   start by 180°, and if move 4 is a `turn_shapes` turn its angle changes by −180° with no change to
   move 4's end. That is physical (the spots moved) and the guard fires only past 90° or 360°. Accept,
   or always name a downstream turn whose angle changed in the notice? _Recommendation: name it
   whenever a downstream Turn's angle changes at all; it is cheap and the user is already looking at
   turns._
4. **A member starting (or ending) on the pivot** (finding 3). Spiral out with the group's sweep
   (split-exact, consistent with neighbours) or walk a straight chord (nicer to march, breaks the
   split and jumps against near neighbours)? _Recommendation: the group's sweep._
5. **Plain pivot drag on a full turn while travelling** (finding 8). Behave as Alt (keep the travel)
   or collapse to a spin in place? _Recommendation: as Alt, with the chip saying why._
6. **The end shape's own handles while Turn is chosen** (finding 4). Should rotating or scaling the
   end box by its handle turn about the turn's pivot, so the hinge stays put? _Recommendation: yes;
   set the end recipe's pivot setting to the turn's pivot whenever the turn's pivot is dragged._
7. **Restore when leaving Turn** (finding 9). Store the pre-Turn end on the route's source row and
   offer it on Choose Straight, or rely on Undo? _Recommendation: store it; round 3's 88-collision
   case came from exactly this._
