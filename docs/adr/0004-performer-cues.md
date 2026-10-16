# 0004: Performer cues in the show file

- Status: Accepted by the owner on 2026-10-15 for D-1 to D-6, and for D-7's
  Sync, Positions and Performers motion and facing (the planner, #119). D-7's
  per-channel bake, GPU compose pass, prop bones and in-repo renderer are
  pending the layered renderer (#120) and its integrated-GPU run.
- Date: 2026-10-10
- Amended: 2026-10-11, approved by the owner: Carry, Silk and Uniform
  channels, and item tables beside cues; 2026-10-15: timelines only, and
  cues when beats, tags or marchers go (see the amendments at the end)

## Context

The 3D View plays every marcher with the same behavior: horns always up, the
section's carry, the upper body facing the front, mark time while the band
moves. Its horn state, guard equipment and step-off foot are window toggles
that aren't saved. Designers need the show to say what performers do, count
by count: step style, horn state and angle, equipment work, facing and
choreography. Both a coarse layer ("guard: rifle work, counts 1-16") and
count-level detail are wanted.

The owner settled the behavior model on 2026-10-09 and 2026-10-10; the full
specification is [docs/3d/performer-behavior.md](../3d/performer-behavior.md).
It adds persistent tables (a file-format change), a public module in
`@openmarch/core`, and changes to the 3D View's sync contract (ADR 0002 D-4,
D-6, D-7), so `docs/conventions/architecture-decisions.md` requires this
record.

This builds on ADR 0001 (the timeline motion model, on `timeline-try-2`):
beats stay the time grid with stable ids, pages become flags, and motion lives
in timeline tables addressed by beat ordinals. The 3D branch rebases onto the
merged timeline first; this record's migration and number come after the
timeline's (ADR 0003 is the timeline's menu-actions record).

Alternatives considered:

- **Per-page columns on `marcher_pages`**: can't express count-level cues,
  targeting or phrases, and `marcher_pages` is frozen in timeline mode.
- **Per-marcher tracks** (a video-editor model): no targeting; a section
  change means editing every marcher.
- **Cues anchored to timeline moves or beat ordinals**: moves are created,
  resized and overridden, and ordinals are rewritten on every beat edit. A
  beat id needs no ripple.
- **Reusing the 2D appearance cascade** (`tag_appearances` and its dormant
  equipment columns): appearances are per page with first-non-empty
  precedence; cues need the latest cue to win over time. Two models with
  shared targets is clearer than one model with two rules.

## Decision

### D-1 Cues

A new table, `cues`:

- `id` integer primary key.
- `channel` text: `feet`, `horn_equipment`, `facing` or `body`.
- `kind` text: `state` or `phrase`.
- `target_kind` text: `band`, `section`, `tag` or `set`.
- `target_section` text, set only for `section` (marcher sections are text).
- `target_tag_id` integer, references `tags(id)` ON DELETE CASCADE, set only
  for `tag`.
- `beat_id` integer not null, references `beats(id)` ON DELETE CASCADE.
  Deleting counts deletes their cues; undo restores them. Amended
  2026-10-15: the delete write path first carries the last cue forward to
  the next beat (see that amendment).
- `value` text: a built-in id (`builtin:...`) or `show:<phrase_assets.id>`.
- `phrase_asset_id` integer, references `phrase_assets(id)` ON DELETE
  RESTRICT, set only for show phrases, so a phrase in use can't be deleted
  from under its cues.
- `length` integer, phrases only, at least 2.
- `transition_length` integer, states only, at least 1; null means the
  value's library default.
- `settings_json` text not null, default `'{}'`, validated by the value's zod
  schema from the library catalog.
- `ripple_json` text, nullable: `{ version: 1, span, order }` with order
  `drill`, `left_right`, `right_left` or `down_form`. Rejected on `feet`.
- `notes` text.
- the shared timestamps.

CHECK constraints keep the target, kind and value columns consistent. No
priority column: same-count, same-specificity ties go to the newest cue (the
higher `id`), and the editor flags them.

A cue's instant is the **start** of its beat row (the count's click, where
the 3D marchers' heel lands). Page flags keep their end-of-beat meaning.

### D-2 Hand-picked sets

`cue_marchers` (`cue_id` references `cues` ON DELETE CASCADE, `marcher_id`
references `marchers` ON DELETE CASCADE, primary key on both). The marcher
deletion write path deletes any `set` cue left with no members, in the same
transaction. No trigger reads or writes cue tables.

### D-3 Show phrase assets

`phrase_assets`: `id`, `name`, `label`, `source` (`copied_builtin`, `posed`
or `imported`; v1 writes only `copied_builtin`), `channels_json` (channels
taken over), `format_version` integer, `data_json` (the versioned phrase
format: bone rotations, an optional body-space prop path, an optional facing
turn, the stretchable section, the length range, the settings schema), and
timestamps. Built-ins aren't stored; cues reference them by id.

### D-4 Set and show settings

- `page_performer_settings` (`page_id` primary key, references `pages(id)` ON
  DELETE CASCADE; `dot_mode` text `foot` or `body`). No row means the show
  default.
- Workspace settings gain an optional `performerDefaults`:
  `{ stepOffFoot: "left" | "right", dotMode: "foot" | "body" }`, defaulting to
  left and foot.

### D-5 Migration and write paths

- One Drizzle migration generated with the repo scripts, numbered after the
  timeline's 0017 and 0018 and after the 3D branch's renumbered
  `view3d_venue`. It only creates tables and indexes (`cues(beat_id)`,
  `cues(channel, beat_id)`, `cue_marchers(marcher_id)`).
- No conversion step and no `user_version` bump: convert-on-open ignores
  tables it doesn't know, and beat ids survive conversion. The tables behave
  the same in page mode and timeline mode, and are not on the page-era freeze
  list. Nothing derives cue data from `marcher_pages`.
- All writes go through `transactionWithHistory`; the new tables join
  `tablesWithHistory`, get real query keys in `singleTableNameToQueryKey`,
  and are added to repair's copy order after `beats`, `pages`, `marchers`
  and `tags`.
- Converting a file clears undo history, cue edits included. Acceptable.

### D-6 Compile module

`@openmarch/core` exports a platform-free `cues` module:

- `CUE_LIBRARY`, `cueLibraryValue` and `defaultCueValue`: the built-in
  catalog's metadata, including each value's settings descriptors;
- `compileCues(input, recompile?)`, returning per-marcher, per-channel
  segments and flags, with an optional channel-at-a-time recompile;
- `traceCue(compiled, marcher, channel, count)` for the editor's "why"
  readout.

The exact shapes are in the spec's section 6. Its input and output types are
a public package API; changing them needs an amendment here.

### D-7 Amendments to ADR 0002

- **D-4 Sync:** the editor relays a synthetic `["timeline"]` query key on
  `view3d:invalidate` after each delivered timeline change batch or reset.
  No new channel. The `selection` payload stops depending on
  `selectedPageId` in timeline mode.
- **D-6 Positions:** in timeline mode `positions.ts` builds its own resolver
  from the timeline tables and samples it at count boundaries. Page mode
  keeps `marcher_pages` until the timeline drops it.
- **D-7 Performers:** facing comes from the Facing channel; "the upper body
  always faces the front sideline" becomes its default. Motion follows the
  compiled Feet channel (pace, techniques, stand on holds, step-off foot, dot
  mode per set). The window's horn state, guard equipment and step-off foot
  toggles stop being the source; at most they remain as unsaved preview
  overrides. Channels are baked as per-channel rows and composed once per
  frame, per performer and bone, in a GPU render-to-texture pass; skinning
  then reads one matrix per influence. Props get virtual bones. The om-pose renderer moves
  into the repo as owned code.

## Consequences

- **Older builds** ignore the new tables, so a show opened in one plays with
  the defaults. An older build that rewrites workspace settings drops
  `performerDefaults` (zod strips unknown keys), reverting to left foot and
  foot on the dot.
- **Precedence is tested logic**, not data: no priority numbers to manage,
  but every rule in the spec's resolution list needs unit tests in core.
- **Show phrase assets can outlive their use**; deleting one in use is
  refused until its cues go.
- **Built-in improvements change existing shows** by design. "Copy into show"
  is the way to freeze a phrase.
- **The 3D renderer becomes ours to maintain**, with its parity suite.
- **The appearance cascade's dormant equipment columns** stay in the schema
  until Alex approves dropping them.
- **New durable surface**: four tables, a workspace setting, a core API and
  an IPC key convention. Changing any of them needs a new record or an
  amendment.

## Verification

- Unit tests in `packages/core` for compile: defaults; latest wins;
  specificity on the same count; newest-wins clashes flagged; phrase overlays
  and overlaps; take-overs and the kneel-on-a-moving-count flag; fits;
  inclusive counting for transitions and phrases (including length 1 as a
  snap); ripple start times under a changing tempo for each order.
- Schema tests: the CHECK constraints reject inconsistent targets and kinds;
  ON DELETE behavior for beats, tags, marchers, pages and phrase assets.
- History tests: create, edit and delete cues, set members and phrase assets
  undo and redo; deleting a marcher that empties a set removes the cue, and
  undo restores both.
- Migration tests: a page-mode file and a converted timeline file both open
  with the new tables, and convert-on-open leaves cue rows intact.
- E2E: add a horn cue in the Visuals mode and see the 3D window follow
  without reopening; edit a timeline move and see the window's positions
  update.
- Performance: the spec's first-task measurements recorded in
  `docs/3d/findings.md` before channel layering merges.

## Amendment 2026-10-11: Carry, Silk and Uniform channels, and item tables beside cues

- Status: approved by the owner on 2026-10-11, beside the ADR 0002
  amendment of the same date. The rest of this record is still proposed.
- Amends: D-1, D-5, D-6 and D-7; spec sections 2.3, 3, 7.1, 7.6, 8.5, 10
  and 11
- Companion: [ADR 0002](0002-3d-view.md), amendment of 2026-10-11 (D-9 to
  D-11); design spec [docs/3d/props-spec.md](../3d/props-spec.md)

### Context

The 3D customization map resolved, after the 2D editing prototype was
rejected, that what performers carry, their silk and their uniform are state
cues on new channels, and that item Placement lives in its own beat-keyed
table edited in Visuals mode [07 revision, 22]. Bracketed numbers cite the
map's resolved tickets, compiled in `docs/3d/props-spec.md`; [26.n] cites item
n of the owner's review notes on ticket 26.

### Decision

#### Three new channels

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

#### Carry decides what is held

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

#### Silk and Uniform

- A Silk cue changes Artwork only. A different Cut is a different flag,
  which is a Carry change [08].
- A Silk cue applies only to performers carrying a flag; others are skipped
  silently. A flag of another Cut gets the Artwork fitted per the sizing
  contract, with a note when the aspect differs [26.13].
- A **Uniform** cue holds one uniform reference, never per-part overrides.
  Hats off is "Trumpets → _Band, hats off_ from count N" [09].

#### Cue values that name Library items

Carry, Silk and Uniform values name Library items (a model, an Artwork, a
Uniform) at an exact Version, embedded in the show (ADR 0002 D-12), as
`library:<uuid>@<version hash>`; Carry also takes `none` [06, 26.10, 26.14].

- Save never prunes a Library item a cue names [06].
- While a cue uses a Library item, the show's copy can't be deleted. Deleting it
  offers "Replace with…" and lists the cues that use it [26.10].

#### Making an item from an implicit flag

When an item row is made from a performer's implicit flag, the editor writes
a Carry `none` cue for that performer at the item's first count, linked to
the item so undo and delete remove both together. Compile needs no special
case [26.14].

#### Item tables beside cues

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

#### Visuals mode (spec section 7.1)

The tabs gain **Carry**, **Silk** and **Uniform**, and an **Items** tab where
Placement, Outline geometry and artwork slots are edited [07 revision, 22,
24]. Item ripple groups edit like a cue ripple, with the same orders [21].
Also in Visuals mode [26.16]:

- the uniform editor, in the inspector on the Uniform tab;
- the Library side panel;
- the show's notes list (the 3D View shows a small note count).

Slot pickers write count-keyed data: a Silk cue for performers, a beat-keyed
artwork slot row for items [26.1].

#### Held items render as prop bones (D-7)

A held item renders as D-7's prop bone: the holder's hand times the grip
offset from the model's `OM_grip_*` nodes [07 revision, 01]. The per-look
uniform texture (`aLook`) is built in the repo's renderer, not upstream in
om-pose [26.3].

#### Step 6 and the integrated-GPU run (spec sections 8.5 and 10)

One integrated-GPU run serves section 8.5 and ADR 0002's budget (base M1,
Intel Iris Xe, `pro`, the compose pass's own GPU time, plus silk layers,
Garments and hidden-part skinning). Build step 6 waits to merge until the
per-look texture and the silk wave (phase packages C4.3 and C4.4) are built
on it, so the run measures them together [26.23].

#### The 2D appearance cascade (spec section 7.6)

Carry, Silk and Uniform don't read the cascade or its `equipment_name` column
[07 revision]. The dormant `equipment_state` column is **dropped**: equipment
pose is the Horn/Equipment channel [26.4].

#### Out of scope (spec section 11)

Printing cues stays out of scope, with one exception: page-grained exports
(coordinate sheets, mobile exports) may optionally list Carry, Silk, Uniform
and item Placement changes under their page with their count. Behavior cues
(Feet, Horn/Equipment, Facing, Body) are still never printed [21, 26.5].

#### Storage decisions (owner, 2026-10-12)

- **Q70:** ADR 0004's storage migration (0020 on the local branch
  `3d/cue-storage`) stays tables-only. The dormant `equipment_state` column
  is dropped in C3's own migration, not in ADR 0004's. To be confirmed with
  Alex in review.
- **Q71:** `cue_marchers` has a surrogate `id` primary key plus a unique
  (`cue_id`, `marcher_id`) constraint, not a two-column primary key, because
  undo replays by rowid (as `marcher_tags` does).

### Consequences

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

### Verification

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

## Amendment 2026-10-15: timelines only

- Amends: D-5, D-6 Positions (in D-7) and D-7 Sync, after main dropped page
  mode

Page mode is gone: main's `0020_drop_page_era` removes the page-era tables,
and a page-era file converts to a timeline when it opens.

- **D-5:** "the tables behave the same in page mode and timeline mode" no
  longer holds. The cue migration is **0022**, after the timeline and
  Library migrations, not "after 0017 and 0018". A page-era file gets the cue
  tables, and their undo triggers, only when it converts on open; until then
  the history triggers and cue cleanup skip the tables the file lacks.
- **D-7, ADR 0002 D-6 Positions:** "page mode keeps `marcher_pages`" is moot.
  `view3d/positions.ts` on main already builds the window's own resolver
  from the timeline tables. It samples it at any show time (a time becomes
  a beat through the tempo map), not only at count boundaries.
- **D-7, ADR 0002 D-4 Sync:** already on main, with one difference: after
  each batch of committed timeline changes the editor relays
  `VIEW3D_TIMELINE_QUERY_KEY` (`["view3d_timeline"]`, the window's resolver
  query) on `view3d:invalidate`, not a synthetic `["timeline"]` key. No new
  channel. The `selection` payload still carries `selectedPageId`.
- **D-7 Performers (owner, 2026-10-15):** accepted with the planner (#119).
  Feet and Facing cues drive motion and facing, with the planner rules in
  `docs/3d/technique.md` "Pace, holds and facing in the planner" as the
  defaults. The show's saved performer defaults (`performerDefaults`, ADR
  0004 D-4) win over the window's step-off foot, horn and guard toggles,
  which remain only as unsaved preview overrides. Wiring the stored cues and
  defaults into the 3D window is a follow-up; until then the window compiles
  no cues.

## Amendment 2026-10-15: cues when beats, tags or marchers go

- Status: approved by the owner on 2026-10-15.
- Amends: D-1 (`beat_id`), D-2, D-3, D-6 and D-7 Sync; spec sections 2.3,
  2.4, 2.5, 3 (Facing) and 8.1

### Context

D-1 keys a cue to its beat with ON DELETE CASCADE, so deleting counts or a
measure silently deletes every cue on them. A cue says what performers do
from its count on, so losing it changes the rest of the show, and nothing
tells the designer. This amendment also records the owner's answers to the
review questions on the compile module (#118) and the units of a "toward a
point" facing.

### Decision

#### Deleting beats or measures

Deleting beats (or a measure, which deletes its beats) carries their cues
forward instead of dropping them. The rule runs inside the same transaction
as the beat deletion, so one undo restores the beats and the cues together
(as `withTimelinePageRipple` in `db-functions/timelineRipple.ts` does for
pages):

- **Keep the last one.** Per channel and target, of the cues on the
  deleted beats only the **last** one is kept: the state in effect at the
  end of the deleted span. It moves to the first surviving beat after the
  deletion. The earlier ones are dropped.
- **An existing cue wins.** If that next beat already has a cue on the same
  channel and target, the existing cue stays and the moved one is dropped.
- **Phrases** move their start to the next beat and keep their length. If a
  moved phrase now overlaps the next cue on the same channel and target, it
  is shortened to end where that cue starts; if that leaves it shorter than
  the minimum length of 2, it is dropped. Phrases aren't otherwise dropped.
- **The end of the show.** With no beat after the deletion, the cues on the
  deleted beats are dropped.
- **Ripples** move with their cue unchanged.
- **No blocking popup.** Afterwards the editor shows a non-blocking notice
  with Undo, such as "2 cues moved to count 17".

`cues.beat_id` keeps ON DELETE CASCADE as the backstop: the write path moves
or deletes the cues before the beats go, so the cascade finds nothing left.

#### Deleting marchers and tags

- **Marchers (D-2, unchanged):** deleting a marcher removes them from
  hand-picked sets, and a set left empty deletes its cue in the same
  transaction.
- **Tags:** cues that target a deleted tag are deleted (the cascade on
  `target_tag_id`). The tag delete confirmation gains a line saying so, such
  as "3 cues target this tag and will be removed".

#### Sync (D-7, ADR 0002 D-4)

Deleting beats, measures, tags or marchers invalidates the `["cues"]` query
(and the phrase asset and performer settings queries), and the editor
relays those keys to the 3D window on `view3d:invalidate`, so the window and
every cue query refresh after any of these deletes.

#### Prune (D-3, ADR 0002 D-12)

Pruning the show's embedded Library keeps every phrase asset and every
Library item Version a cue references.

#### Compile (D-6), the owner's answers on #118

- **Fit at landing.** A cue's fit to a performer is checked at the count
  where its ripple reaches that performer, not at the authored count. What
  Carry gives can change inside a ripple's span.
- **Ripple order** counts only the performers the cue fits (kept as built).
- **Section names** match ignoring case (and outer spaces) both in section
  cue targets and in the section defaults.

#### Facing toward a point

The `x` and `y` settings of `facing.point` are **field coordinates**, the
same space as dot positions, not world meters. They are converted to world
space where positions are, so a facing point and a dot at the same field
coordinates are the same place in the 3D View.

### Consequences

- Deleting counts no longer loses the state in effect after them, and the
  notice says what moved. Undo is still one step.
- The beat and measure delete write paths read the cue tables, so they skip
  the cue rule when a file lacks them (as D-5's cue cleanup does).
- Matching section targets ignoring case is a compile behavior change: a
  section cue now reaches members whose section differs only in case.

### Verification

- Unit tests for the beat deletion rule, one per bullet above, and that one
  undo restores the beats and the cues.
- Compile tests: fit checked at a ripple's landing count; section cue
  targets matched ignoring case.
- Prune tests: a phrase asset and a Library Version a cue references survive.
- E2E or a recorded check: a stored cue drives the 3D window, and deleting
  its beat moves it, with the notice.
