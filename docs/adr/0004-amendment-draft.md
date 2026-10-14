# 0004 amendment (draft): Carry, Silk and Uniform channels, and item tables beside cues

> **Draft, not on ADR 0004's branch.** ADR 0004 (`docs/adr/0004-performer-cues.md`)
> and its spec (`docs/3d/performer-behavior.md`) live on the 3D cue branches
> (worktree `OpenMarch-3d-planner`, branch `3d/cue-planner`), not on this
> branch. This file holds the amendment text so the owner can approve it
> beside the ADR 0002 amendment. Once approved, it moves into ADR 0004 as a
> dated section, and this file is deleted.

- Status: approved by the owner on 2026-10-11; lands on ADR 0004's branch
  with the cue work
- Date: 2026-10-11
- Amends: ADR 0004 D-1, D-5, D-6 and D-7; spec sections 2.3, 3, 7.1, 7.6,
  8.5, 10 and 11
- Companion: [ADR 0002](0002-3d-view.md), amendment of 2026-10-11 (D-9 to
  D-11); design spec [docs/3d/props-spec.md](../3d/props-spec.md)

## Context

The 3D customization map resolved, after the 2D editing prototype was
rejected, that what performers carry, their silk and their uniform are state
cues on new channels, and that item Placement lives in its own beat-keyed
table edited in Visuals mode [07 revision, 22]. Bracketed numbers cite the
map's resolved tickets, compiled in `docs/3d/props-spec.md`; [26.n] cites item
n of the owner's review notes on ticket 26.

## Decision

### Three new channels

`cues.channel` gains `carry`, `silk` and `uniform`, beside `feet`,
`horn_equipment`, `facing` and `body` [07 revision]. If ADR 0004's migration
hasn't shipped, the CHECK is widened in that migration; otherwise in a new
one after it [26.20].

- All three are **states only**: a `phrase` cue on them is rejected, like
  Facing [07 revision].
- All three are **hard cuts** at the start of the cue's beat (its instant);
  `transition_length` is ignored on them. A visible trade between performers
  is an item Placement change, not a cue [10, 26.12].
- They use ADR 0004's targets (band, section, tag, hand-picked set),
  `beat_id` keys, resolution rules and ripples. A per-performer uniform
  override is a hand-picked set [07 revision, 09].
- **Ripples are allowed** on all three. A silk swap with no ripple changes the
  whole group at once [10].
- **Items are never targets.** Band and section targets never reach
  `marchers` rows of type `prop` or `equipment`, and the Who list leaves them
  out [24].

| Channel | Says                                                    | Default                                                                                                 | Source              |
| ------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------- |
| Carry   | What is held: flag, rifle, sabre, horn, none            | The section's usual equipment; `carryForSection` (`view3d/core/instruments/catalog.ts`) as the fallback | 07 revision         |
| Silk    | Which Artwork a carried flag's Silk shows (not its Cut) | A built-in plain silk in the section's 2D color                                                         | 07 revision, 26.11  |
| Uniform | Which uniform a performer wears                         | Band default, or Guard default when `isGuard`; nothing stored                                           | 09                  |

### Carry decides what is held

Carry says **what** is held; Horn/Equipment says **how**. A rifle line can
switch to sabres without touching its equipment work [07 revision]. This
changes the spec:

- Section 3, Horn / Equipment: its default "horn up, or the section's carry"
  reads "horn up, or the set position of whatever Carry gives".
- Section 2.3 rule 7 now reads: "A cue applies only to the performers it
  **fits**. A horn state skips the guard. Carry decides what is held: a
  Horn/Equipment state that doesn't match what Carry gives a performer (a
  rifle state on a performer carrying a flag) is ignored for that performer,
  with a quiet note; it never changes what is held. A cue that fits none of
  its targets is flagged." [26.2]

### Silk and Uniform

- A Silk cue changes Artwork only. A different Cut is a different flag,
  which is a Carry change [08].
- A Silk cue applies only to performers carrying a flag; others are skipped
  silently. A flag of another Cut gets the Artwork fitted per the sizing
  contract, with a note when the aspect differs [26.13].
- A **Uniform** cue holds one uniform reference, never per-part overrides.
  Hats off is "Trumpets → _Band, hats off_ from count N" [09].

### Cue values that name Library items

Carry, Silk and Uniform values name Library items (a model, an Artwork, a
Uniform) at an exact Version, embedded in the show (ADR 0002 D-12), as
`library:<uuid>@<version hash>`; Carry also takes `none` [06, 26.10, 26.14].

- Save never prunes a Library item a cue names [06].
- While a cue uses a Library item, the show's copy can't be deleted. Deleting it
  offers "Replace with…" and lists the cues that use it [26.10].

### Making an item from an implicit flag

When an item row is made from a performer's implicit flag, the editor writes
a Carry `none` cue for that performer at the item's first count, linked to
the item so undo and delete remove both together. Compile needs no special
case [26.14].

### Item tables beside cues

ADR 0002 D-10 adds three tables keyed by `beat_id`, **beside** the cues, not
cues [07 revision, 24]:

- Placement: held (performers and hands), placed (optional Crew) or Off
  field; rows of one item ripple share a group id [07, 21].
- Outline geometry: width, depth, height, rotation, outline type, custom
  outline, transition length; Floor props add "rolls out" [21, 24].
- Artwork slot assignments: item, slot, beat → Artwork Version, with fill or
  fit, pan and pad color [07, 08].

They borrow cue-state semantics: the latest change at or before a count
wins; a change takes effect at the start of its beat; geometry eases in over
its transition; deleting a beat deletes its rows (ON DELETE CASCADE) [21,
24]. They **join D-5's history and repair lists** like the cue tables; the
show's Library tables stay outside undo [26.15]. Their migration follows the
cue migration [26.20].

### Visuals mode (spec section 7.1)

The tabs gain **Carry**, **Silk** and **Uniform**, and an **Items** tab where
Placement, Outline geometry and artwork slots are edited [07 revision, 22,
24]. Item ripple groups edit like a cue ripple, with the same orders [21].
Also in Visuals mode [26.16]:

- the uniform editor, in the inspector on the Uniform tab;
- the Library side panel;
- the show's notes list (the 3D View shows a small note count).

Slot pickers write count-keyed data: a Silk cue for performers, a beat-keyed
artwork slot row for items [26.1].

### Held items render as prop bones (D-7)

A held item renders as D-7's prop bone: the holder's hand times the grip
offset from the model's `OM_grip_*` nodes [07 revision, 01]. The per-look
uniform texture (`aLook`) is built in the repo's renderer, not upstream in
om-pose [26.3].

### Step 6 and the integrated-GPU run (spec sections 8.5 and 10)

One integrated-GPU run serves section 8.5 and ADR 0002's budget (base M1,
Intel Iris Xe, `pro`, the compose pass's own GPU time, plus silk layers,
Garments and hidden-part skinning). Build step 6 waits to merge until the
per-look texture and the silk wave (phase packages C4.3 and C4.4) are built
on it, so the run measures them together [26.23].

### The 2D appearance cascade (spec section 7.6)

Carry, Silk and Uniform don't read the cascade or its `equipment_name` column
[07 revision]. The dormant `equipment_state` column is **dropped**: equipment
pose is the Horn/Equipment channel [26.4].

### Out of scope (spec section 11)

Printing cues stays out of scope, with one exception: page-grained exports
(coordinate sheets, mobile exports) may optionally list Carry, Silk, Uniform
and item Placement changes under their page with their count. Behavior cues
(Feet, Horn/Equipment, Facing, Body) are still never printed [21, 26.5].

### Storage decisions (owner, 2026-10-12)

- **Q70:** ADR 0004's storage migration (0020 on the local branch
  `3d/cue-storage`) stays tables-only. The dormant `equipment_state` column
  is dropped in C3's own migration, not in ADR 0004's. To be confirmed with
  Alex in review.
- **Q71:** `cue_marchers` has a surrogate `id` primary key plus a unique
  (`cue_id`, `marcher_id`) constraint, not a two-column primary key, because
  undo replays by rowid (as `marcher_tags` does).

## Consequences

- The `channel` CHECK widens (in ADR 0004's migration if unshipped) and
  `equipment_state` is dropped in C3's migration (Q70).
- `compileCues` and `traceCue` carry three more channels and compute the
  Carry, Silk and Uniform defaults, so the why readout explains a default
  where it explains a cue (owner, 2026-10-11 [26.26]). Their input also
  carries each section's usual equipment and 2D color and each marcher's
  `isGuard`, a public package API change under D-6.
- Item Placement, geometry and artwork slot rows are not cues, so
  `compileCues` doesn't read them; the 3D View and the notes list resolve
  them on their own.
- Step 6 merges later than drafted: after the combined integrated-GPU run.

## Verification

- Compile unit tests: Carry, Silk and Uniform defaults; latest wins and
  specificity on each; ripples; hard cuts with `transition_length` ignored;
  phrases rejected on the three channels; a mismatched Horn/Equipment state
  ignored with a note; Silk skipping non-flag carriers; items never reached by
  band or section targets.
- Schema tests: the widened CHECK; the `library:` value; delete restricted
  while cues use an item; beat delete cascades on the item tables; item tables
  in history and repair.
- E2E: a Silk cue in Visuals mode swaps the silk in the 3D window at its
  count without reopening.
