# Performer behavior: cues

<!-- cspell:words retargeting Choreo recompiles rebakes rebaked rebake playhead lerp lerps texel texels -->

- Status: draft for owner review
- Date: 2026-10-10
- Decision record: [ADR 0004](../adr/0004-performer-cues.md) (proposed)
- Builds on: `timeline-try-2` (ADR 0001, the timeline motion model) and
  [ADR 0002](../adr/0002-3d-view.md) (the 3D View)

The show tells performers what to do, not only where to stand: step style,
horn state and angle, equipment work and choreography. A designer places
**cues** on counts; a pure **compile** step turns them into each marcher's
behavior over time; the 3D View plays that behavior in layers, one per
**channel**; and a **Visuals mode** in the editor is where cues are authored.

The owner (Trevor) set the behavior rules below between 2026-10-09 and
2026-10-10. Marching technique lives in [technique.md](technique.md); this
file points there instead of restating it. The engineering calls the owner
left to the spec are marked **Spec call** so they can be reviewed on their
own.

## 1. Glossary

These words mean one thing everywhere in the UI, the code and these docs.

- **Cue**: an instruction, placed on a count, that tells some performers what
  to do on one channel.
- **State**: a cue that holds until a later cue changes it ("horns up").
- **Phrase**: a cue that plays for a length in counts and then ends, falling
  back to the state underneath ("3-count toss"). Not "move": the timeline
  uses move for marcher motion.
- **Channel**: one part of a performer's behavior that cues set
  independently: Feet, Horn/Equipment, Facing, Body.
- **Target**: who a cue applies to: the band, a section, a tag, or a
  hand-picked set of marchers.
- **Count**: one beat of the show. Cues sit on counts.
- **Default**: what a performer does on a channel before any cue applies.
  Built in, never stored.
- **Specificity**: how narrow a target is: band, then section, then tag, then
  hand-picked set. It only breaks ties between cues on the same count.
- **Transition**: the motion into a new state, landing on the state's count.
  (The timeline also uses the word for page-to-page motion.)
- **Take over**: a phrase or state overriding other channels while it applies.
- **Pace**: how often the feet step: single, half or double. It sets the
  stride; the dots set the distance.
- **Technique**: how the feet step: straight leg, bent leg, high step while
  moving; stand, mark time, high mark time while holding.
- **Dot mode**: what a set's dot marks: the landing foot or the body's
  center.
- **Phrase asset**: what a phrase is made of, whatever its source.
- **Snap**: a transition keyed in fixed time (about 0.2 s), not counts.
- **Ripple**: one cue staggered across its marchers over a span of counts.
- **Hold**: counts where a marcher's dot doesn't move (the timeline's
  meaning).
- **Set** (equipment): the guard's resting equipment position between work.
- **Label**: the short name of a state value or phrase ("HU"). Every value
  and phrase has a full name and a label.

## 2. Cues

### 2.1 What a cue is

A cue has:

- a **channel**;
- a **target**: the band, one section, one tag, or a hand-picked set of
  marchers (exactly those marchers, not a live rule);
- a **count**: one beat, stored by beat id;
- a **kind**: state or phrase;
- a **value**: a state value or a phrase, from the built-in library or the
  show's own phrase assets;
- **settings** for that value (horn angle, facing target, pace and so on);
- for a state, an optional **transition length** in counts (empty means the
  value's library default);
- for a phrase, a **length** in counts;
- an optional **ripple**: a span in counts and an order;
- optional **notes**.

There are no priority numbers and no sub-count timing on the cue itself.
Timing finer than a count lives inside phrase assets (a release on the "and")
and in ripples.

### 2.2 When a count happens

**Owner-confirmed (2026-10-10; corrects an earlier call):** a cue's instant
is the **click of its count**: the start of its beat row, the same moment the
3D marchers' heel lands (technique.md, "Heel on the beat" and "Counts and
clicks"; `STEP_AHEAD` in `marcherMotion.ts`). The anchoring decision had put
it at the end of the beat row, where page flags sit. That is one count late
against the feet and the music: "horns up on 7" would land on the click of 8.
Page flags keep their meaning; only cues use the click.

Counting is inclusive, the way staff count (technique.md, "Counting and
facing"):

- A state "on 7" is in position on the click of 7. Its transition of length
  `L` runs from the click of `7 - L + 1` to the click of 7. "Ends on 7, takes
  3 counts" moves from the click of 5 to the click of 7. Length 1 is a snap
  that ends on the click.
- A phrase "on 1, 3 counts" covers counts 1, 2, 3: a toss releases on the
  click of 1 and catches on the click of 3, and the state underneath owns the
  channel again from count 4. A phrase is at least 2 counts long.
- All timing between clicks follows the tempo map, so a 3-count transition at
  a slow tempo takes longer in seconds. Snaps are the exception: fixed time.

Confirmed by the owner (2026-10-10), with the click as the instant: under
this counting a 1-count transition is a snap. The library defaults set
earlier ("1 count facing, 2 counts kneel") are written below as lengths 2 and
3, so they keep one and two counts of motion. A drop spin "one turn per
count" over `L` counts makes `L - 1` turns between its first and last clicks.

### 2.3 Resolution

For each marcher, channel and count:

1. Start from the **default** (section 3).
2. The **latest** applicable state cue at or before this count wins. A
   band-wide cue on count 33 overrides a section cue on count 17.
3. On the **same count**, the most specific target wins:
   band < section < tag < hand-picked set.
4. Still tied (same count, same specificity), the **newest** cue wins, and
   the editor flags the clash.
5. A **phrase** overlays the state for its length. A state cue that lands
   during a phrase shows when the phrase ends. A later phrase on the same
   channel that starts during an earlier one takes over on its own count, and
   the overlap is flagged.
6. A phrase or state that **takes over** other channels (a choreography
   phrase over Horn/Equipment, kneel over Feet) wins those channels while it
   applies.
7. A cue applies only to the performers it **fits**. A horn state skips the
   guard; a rifle state fits any guard performer (and puts a rifle in their
   hands). A cue that fits none of its targets is flagged. Fit is checked at
   the count where the cue reaches the performer: for a ripple, where it
   lands for them, not the authored count (owner, 2026-10-15).
8. Section names match ignoring case and outer spaces, in section targets
   and in the section defaults (owner, 2026-10-15).

### 2.4 Ripples

A ripple is a setting on one cue, not a set of copies, so marchers added to
or reordered in the target slot in automatically.

- **Span** in counts and an **order**: drill order, left to right, right to
  left, or down the form. More orders come later.
- The first marcher lands (a state) or starts (a phrase) on the cue's count.
- Starts are spread evenly in time (seconds) over the span, inclusive: with
  `n` marchers, marcher `i` (from 0) starts `i/(n-1)` of the way from the
  click of the cue's count to the click of its last count, following the
  tempo map. A span that runs past the show's last count stops there. This is
  the only timing between counts. **Owner to check:** evenly in seconds, not
  evenly in counts; they differ when the tempo changes inside the span.
- Positional orders (left to right, down the form) read positions at the
  cue's count. **Down the form** runs along the form's long axis, starting
  from the end nearest the first marcher in drill order (**owner to check**).
- The order counts only the performers the cue fits; each is then checked
  again where the ripple lands for them (rule 7).
- Ties are settled where the cue was authored: a section cue and a rippled
  band cue on the same count go to the section cue for every section member,
  not only the first in the ripple.
- Every channel can ripple except Feet.

### 2.5 Editing over time

- A cue lives on its beat. Inserting counts inside a page or dragging a page
  flag leaves it on the same music (its page:count label may change).
- Deleting counts (beats or a measure) carries their cues forward, in the
  same transaction and undo step as the deletion (owner, 2026-10-15; ADR
  0004 amendment of that date):
  - per channel and target, only the **last** cue on the deleted counts is
    kept, the state in effect at the end of the deleted span; it moves to the
    first count after the deletion and the earlier ones are dropped;
  - if that count already has a cue on the same channel and target, the
    existing cue wins and the moved one is dropped;
  - a phrase moves its start and keeps its length; if it now overlaps the
    next cue on that channel and target it is shortened to fit, and dropped
    if that leaves it under 2 counts;
  - deleting the end of the show (no count after) drops the cues;
  - ripples move with their cue unchanged;
  - no blocking popup: afterwards a notice with Undo says what moved, such
    as "2 cues moved to count 17".
- Deleting a marcher drops them from hand-picked sets; a set left empty
  deletes its cue in the same transaction.
- Deleting a tag deletes the cues that target it. The tag delete
  confirmation says how many cues will go.
- After any of these deletes the cue queries and the 3D window refresh.
- Pruning the show's Library keeps the phrase assets and Library Versions
  that cues reference.
- Copying or duplicating a page or a timeline move does not copy cues (v1).
  Cue copy and paste lives in the Visuals mode (section 7.4).
- Drill edits never rewrite cues. Their effects (a kneel that now falls on a
  moving count) show up as flags.

## 3. Channels

Each channel owns body parts outright in v1; cues on different channels
stack. There is no additive blending.

### Feet

Legs, hips and travel. Default: from the dots.

- A Feet state has three settings: **pace** (single, half, double);
  **moving technique** (straight leg; bent leg and high step play straight
  leg until animated); **on holds** (stand, the default; mark time; high mark
  time, which plays mark time for now). Plus the **step-off foot**, defaulting
  to the show's setting (left).
- The dots say where, not how. Pace sets the stride: 8-to-5 dots in half time
  are 4-to-5 strides. No stride warnings yet.
- "Stand" on holds replaces today's automatic mark time while the band
  moves.
- No Feet phrases in v1. A future Feet phrase travels along the dot path with
  the legs animated on top; a standing-only phrase on moving counts is
  flagged.
- Dot mode is a setting on each **set** (page), not a cue: foot on the dot
  (the default) or body center, reverting to the show default on the next
  set (technique.md, "Foot on the dot and body center").
- Feet does not ripple.

### Horn / Equipment

Shoulders, arms, hands and what they hold. One channel, labeled by what the
performer carries: **Horn** for winds, **Equipment** for guard and
percussion. Default: horn up, or the section's carry (technique.md).

- Horn angle (the box, or 10 degrees above it) is a setting on the up state.
- Horn transitions (snap, or a sweep spread over the transition's counts) are
  generated between the holds each instrument already solves, so they work
  for every instrument.
- The guard's resting position is **set** (not "hold"); "carry" stays a horn
  state.

### Facing

Where the whole performer faces, feet included at rest. States only.
Default: the audience (front).

- Values: front, back, side 1, side 2, direction of travel, custom angle, and
  toward a fixed point on the field.
- A point is in field coordinates, the same space as dot positions, not
  world meters; it converts to world space where positions do (owner,
  2026-10-15).
- Moving, the upper body holds the facing and the legs do the most logical
  thing for the travel: facing the backfield and moving back is a forward
  march; a slide is the upper body holding while the legs travel elsewhere.
  With the front facing, today's slide rules stand (technique.md, "Slides").
- "Direction of travel" on a hold keeps the last direction of travel.

### Body

Spine and head. States and phrases. Default: neutral.

- Kneel (right knee down, left foot flat) is a Body state that also takes
  over Feet. It is valid only while the dot holds; on a moving count it is
  flagged.
- The choreography phrase takes over Horn/Equipment while it plays.

### Not channels

- No head channel: Body owns the head.
- No visibility cue: the 3D View honors the 2D `visible` appearance. A
  walk-off can be a phrase later.
- Drum majors hold their hands in front; conducting is a later effort.

## 4. Library v1

Every value and phrase has a stable id, a **name** and a **label**. Built-in
ids are `builtin:<channel>.<family>.<value>`. Labels below are proposals for
the owner to adjust.

**Spec call:** the catalog's metadata (ids, names, labels, kind, channels
taken over, who it fits, length range, default transition, settings schema)
is plain data in `@openmarch/core`, so the editor and the compile step read it
without the 3D assets. The animation data lives with the 3D View.

Horn (winds):

- States: up ("HU"; angle: box or +10°), down/carry ("HD"), trail ("Trail").
- Transitions: snap (default) or sweep over the transition's counts.

Equipment (battery):

- States: playing ("Play", have), sticks in ("In"), sticks down ("Down").

Equipment (guard):

- Flag: set ("Set", have), port ("Port"); phrases drop spin ("Drop"), single
  toss ("1x").
- Rifle: port arms ("Port", have), present ("Pres"); phrases drop spin
  ("Drop"), single toss ("1x"), double toss ("2x").
- Sabre: set ("Set", have); phrase single toss ("1x", like the rifle's).
- Positions are in technique.md. Flag port, spin and toss and rifle present
  and toss are first takes to check against video.

Body:

- States: neutral ("—"), kneel ("Kneel"; default transition 3 counts).
- Phrase: one generic 8-count choreography phrase ("Choreo") with energy low,
  medium or high; takes over Horn/Equipment.

Facing:

- States only (section 3); default transition 2 counts (one count of turning).

Feet:

- One state value with the settings in section 3; label from its settings
  ("½", "2×", "MT").

Later additions (out of scope here): sit, lie down, horn flourishes, swing
flag work, exchanges, Feet phrases, battery motion from percussion files.

## 5. Phrase assets

A phrase asset is data the 3D bake turns into channel rows. Built-in, posed
and imported phrases share one versioned format from day one.

- **Contents:** bone rotations for the channels it takes over; an optional
  prop path in body space (so a prop can leave the hand); an optional facing
  turn. Never travel across the field: the dots own position.
- **Timing:** keyed in counts and stretched with the tempo, except snaps,
  keyed in fixed time.
- **Lengths:** one asset covers a range of lengths. It marks one stretchable
  section (a toss's time in the air); a cue's length stretches only that
  section. Transitions stretch evenly.
- **Retargeting:** horn transitions are generated per instrument (section 3).
  Hand-keyed horn phrases (flourishes, later) are authored per family. No
  mirror setting.
- **Built-ins** ship with the app and are referenced, so improvements reach
  existing shows. "Copy into show" freezes one as a show phrase asset, with
  an editable label that defaults to its name.
- **Show phrase assets** live in the show file (ADR 0004). No export between
  shows in v1.
- **Spec call:** each asset carries `formatVersion`; readers migrate older
  versions on load and never write back silently.

## 6. Compile

**Spec call:** a pure module, `packages/core/src/cues/`, exported from
`@openmarch/core` beside the timeline resolver. No React, Electron or
database. The editor (result row, "why" readout, flags) and the 3D window
(playback) both call it; later printing reads the same output.

Input (`CompileInput`):

- the cues, with hand-picked set members inlined, and the show's phrase
  assets (metadata: name, label, channels);
- marchers with section, tag ids, drill order and what each carries (from
  the section, as today);
- the beat grid: the timed beats in order, with durations;
- optional `travels(marcher, count)` and `positionAt(marcher, count)`, from
  whichever resolver the caller has (the timeline resolver in timeline mode,
  `marcher_pages` in page mode);
- the show defaults (`stepOffFoot`).

Dot mode per set is not a compile input: it doesn't depend on cues, so the
planner reads it from the set directly. The library catalog is built in.

Every library value describes its **settings** as plain data (a choice with
options, or a number, each with a default): horn angle, Feet pace, moving
technique, on holds and step-off foot, facing angle and point, choreography
energy. Segments carry the cue's settings filled in from those defaults (and
the show's step-off foot). Validating stored settings against the
descriptors is the storage layer's job.

Output (`CompiledCues`), per marcher and channel, a list of **segments**:
`{ from, to, kind: "default" | "state" | "transition" | "phrase", value,
settings, label, cueId | null, snap?, takenOverFrom? }`, with `from` and `to`
in counts (fractional only where a ripple puts them between clicks). A snap is
a zero-length transition. Feet labels come from the settings ("½", "2×",
"MT"). Plus:

- `traceCue(compiled, marcher, channel, count)`: the winning cue, whether it
  is another channel's take-over, and the applicable cues it beat, latest
  first, then most specific;
- **flags**, each with the cue ids and marchers involved: clash (rule 4),
  phrase overlap (rule 5), take-over on a moving count (kneel), fits nobody
  (rule 7), a phrase on a states-only channel (Facing, Feet; ignored), and a
  transition cut short because it would start before the previous state
  lands.

Incremental use: `compileCues(input, { previous, channels })` resolves only
the listed channels again and reuses the rest from `previous`, so an edit to
Horn cues recompiles and rebakes only Horn rows. Take-overs and the flags that
cross channels are always redone. It is valid only when nothing but those
channels' cues changed.

The Feet segments become the planner's new inputs (section 8.2).

## 7. Editor: Visuals mode

Authoring follows the Light Designer on `origin/lighting`, as a throwaway
prototype settled (its variant D, owner: "pretty close").
Polish is for the build.

### 7.1 Layout

- A workspace mode beside Editor and Light Designer. Switching swaps the
  toolbar, timeline and inspector together.
- One **tab per channel** (Feet, Horn/Equipment, Facing, Body) with a cue
  count. The Horn/Equipment tab names itself by who is focused.
- A **Who list** in the inspector: band, sections, tags, hand-picked groups,
  and the canvas selection. Clicking focuses that who and dims everyone else
  on the field; hovering highlights them. "Marchers in this move" is a picker
  that fills a hand-picked group with a timeline move's current members (no
  live link).
- On the timeline, **below Alex's clip rows** (inside `TimelineSurface`,
  after the clip band; collapsible, since the timeline should stay calm):
  - one editable lane for the focused who on the current tab, titled
    "Editing: Equipment for Color Guard";
  - read-only grey rows: broader cues above, exceptions inside below; click
    one to go there;
  - a **result row**: what the who does, colored by where it came from,
    hatched where the group is mixed.
- The inspector shows the **why** readout (value, how many of the group, the
  cue that set it, the trace) and the selected cue's settings (who, counts,
  transition, ripple, facing wheel, pick a point on the field). No popovers.
- The field previews only the current tab.

### 7.2 Gestures

- Click empty lane space: add a state on that count. Drag: add a phrase of
  that length.
- Drag a cue to move it; drag a phrase's end for its length; drag a state's
  ramp for its transition (start count or length, ending on the cue's
  count).
- Ctrl/Cmd+drag keeps the timeline's meaning everywhere (draw a range or
  loop); cue gestures don't reuse it.
- Facing: a wheel for an angle, or click a point on the field.
- Clash, overlap and take-over flags draw on the lane and the result row.

### 7.3 Snapping (spec call)

Cue drags snap to counts, always (there is nothing between counts). They use
the timeline's existing snapping helpers (`snapSeekBeat`,
`isPageSnapDisabled`) so page flags, measure downbeats and rehearsal marks
pull the same way they do for the playhead, and the same modifier turns that
pull off.

### 7.4 Copy and paste (spec call)

- Copy the selected cues in the lane (Cmd/Ctrl+C). Paste (Cmd/Ctrl+V) at the
  playhead onto the **focused who**, keeping the cues' spacing in counts,
  their values, settings, transitions and ripples. One history group.
- Pasting onto a different who is how a section's work is reused for
  another; pasting across channels isn't allowed.
- Copying pages or timeline moves still doesn't carry cues (section 2.5).

### 7.5 What goes away

The 3D window's `hornState` and `guardEquipment` toggles become cues; the
step-off foot becomes the show default plus the Feet setting. Each window
control is removed, or kept only as a clearly labeled preview override that
is never saved.

### 7.6 The 2D appearance cascade

Appearances (look, per page, first non-empty value by tag priority) and cues
(behavior over time, latest wins) stay separate models with their own rules.
They share targets and the section and tag pickers. The dormant
`equipment_name` and `equipment_state` appearance columns are left alone and
unread; the spec asks Alex to approve dropping them later.

## 8. 3D View runtime

### 8.1 Positions and sync (ADR 0002 amendment)

In timeline mode `marcher_pages` is frozen and stale, and timeline edits
invalidate no query keys. So:

- `positions.ts` (ADR 0002 D-6) gains a timeline-mode path: the window
  cold-builds its own resolver from the timeline tables (as
  `acquireExportResolver` does) and samples `positionsAt(beat)` at every
  count boundary. Page mode keeps the `marcher_pages` path until the
  timeline's Phase 10.
- The editor relays a synthetic `["timeline"]` key on `view3d:invalidate`
  after each delivered change batch or reset (ADR 0002 D-4 keeps its shape;
  no new channel). The window rebuilds its resolver on that key.
- Cue tables have real query keys, so cue edits reach the window through the
  existing invalidation. Deleting beats, measures, tags or marchers also
  invalidates and relays `["cues"]` (owner, 2026-10-15).
- The selection payload stops depending on `selectedPageId`, which timeline
  mode deprecates.

### 8.2 Planner (Feet and Facing)

`core/marchers/planner.ts` stays pure and per count. New inputs, from the
compiled Feet and Facing segments:

- pace per count (sets the clip rate and the stride from the dots);
- moving technique and on-holds technique per count; stand is the hold
  default;
- step-off foot per move (mirrored clips, as today);
- dot mode per set;
- a heading per count from Facing. The whole instance turns to it (feet
  included at rest); while moving the legs pick forward, backward or slide
  relative to it. Turning eases over the transition on the CPU, through the
  instance matrix it already writes every frame.

ADR 0002 D-7's "the upper body always faces the front sideline" becomes the
Facing default.

### 8.3 Layered animation

Keep the baked-texture instanced renderer, with no per-marcher animation
mixers. Compose each performer's bones **once per frame in a GPU pre-pass**,
not per vertex (measured 2026-10-11, findings.md).

- **Bake per channel**, not per combination: feet clips, horn and equipment
  rows, body rows. Rows add up across channels instead of multiplying (today
  every clip is rebaked per hold). The hold's arm pose becomes the
  Horn/Equipment default row. Measured on the Fall Show: 828 of 4096 texels
  wide (27.1 MB, Feet bake 0.23 s), against 3,864 wide (126.6 MB, 1.04 s)
  today.
- **Compose pass**: each frame, one render-to-texture pass (WebGL2 with
  `EXT_color_buffer_float`) writes every performer's final skinning matrices
  into a small float texture: 4 texels per bone, 24 bones (23 plus a prop
  bone), one row per instance. Each fragment samples its bone's channel row
  (with the time lerp and any blend) from a per-bone channel id, and
  re-anchors upper-body chains to the torso the Feet or Body channel is
  moving.
- **Skinning reads one matrix per influence** from that texture, for bodies
  and instruments alike. That is fewer fetches than today's two-row lerp, so
  the frame gets cheaper: −0.8 to −1.2 ms at 300 marchers and −3.4 to −3.9 ms
  at 600 on full quality (M1 Pro). Composing per vertex instead cost +5.8 to
  +7.4 ms at 300, because every instrument vertex paid for it. Composing on
  the CPU and uploading also fit, but its main-thread time grows with the
  band (0.8 ms at 300, 1.5 ms at 600), so the GPU pass is the choice.
- **Per-instance channel state** (row, phase, rate for each channel) moves to
  a small float data texture read by `gl_InstanceID`, written only when a
  segment changes. Vertex attribute slots (14 of 16 used) stay free.
- **Transitions are baked rows**, not matrix lerps, so a horn snap or rifle
  flip doesn't shrink bones.
- **Props as virtual bones** on the Horn/Equipment channel: held, a prop bone
  is the hand times a grip offset; in a toss it follows the phrase's prop
  path in body space. No per-frame CPU work.
- **Ripples** are per-instance phase offsets, so they cost nothing extra.
- The one-marcher editor (shaping phrases, a later effort) can use three's
  `AnimationMixer` with track-filtered clips. A parity test compares that
  with the compose pass.

### 8.4 om-pose (spec call)

**Move the renderer into the repo** as owned code instead of patching the
vendored copy. The channel layering is OpenMarch-specific and will change
often while it's built. om-pose's README forbids app-side shader edits, and
round-tripping every change through om-pose slows the work. Bring its pixel
parity suite along, record the source commit, and leave om-pose as the
reference for single-clip behavior. The shadow pass stays unpatched (no
change from today). A WebGPU move later rewrites the shader in TSL either way.

### 8.5 Performance budget (spec call)

Measured on 2026-10-10 and 2026-10-11 (findings.md), on an Apple M1 Pro
with the high school kit:

- **Channel layering at most +1 ms at 300 marchers, full quality:** pass with
  the compose pass (the frame is cheaper than today). Composing per vertex
  failed (+5.8 to +7.4 ms), and so did its two-channel fallback.
- **The bake inside 4096 × 2048:** pass (828 texels wide); Horn/Equipment
  needs no texture of its own.
- **Full show bake under 1.5 s:** pass (0.23 s for Feet). **A cue edit
  rebakes only its channel in under 100 ms:** pass for Horn (under 1 ms);
  Feet's partial rebake isn't built yet.
- **60 fps at 1080p with 300 performers in `pro` on an integrated GPU**
  (design.md section 9): not yet measured. A base M1, an Intel Iris Xe and
  the `pro` kit still need numbers, and so does the compose pass's own GPU
  time on its own. Measure them before step 6 merges.

## 9. Storage

The schema, the file format and the ADR 0002 amendments are in
[ADR 0004](../adr/0004-performer-cues.md). In short: new tables `cues`,
`cue_marchers`, `phrase_assets` and `page_performer_settings`; show defaults
in workspace settings; additive, no conversion step, numbered after the
timeline's migrations.

## 10. Build order (for writing-plans)

Each item is one or more PRs into AlexDumo `main`, each on its own branch
off `main`. The timeline and `3d-async` have both landed on `main`; bring a
branch up to date by merging `main` into it (no rebase), and regenerate a
migration with the repo scripts if `main` gained one first.

1. **Measure** (section 8.5). Done for the M1 Pro: per-vertex composition
   failed, the compose pass passed (branches `3d/cue-layering-measure`,
   `3d/cue-compose-pass`). A base M1, Iris Xe and `pro` remain.
2. **Storage**: migration, schema, db-functions, query hooks, history and
   repair (ADR 0004). History tests.
3. **Library catalog and compile** in `@openmarch/core`, with unit tests for
   every resolution rule, counting, ripples, take-overs and flags.
4. **Window positions and sync** (section 8.1), the ADR 0002 amendment.
5. **Planner**: pace, techniques, stand on holds, step-off, dot mode per
   set, Facing.
6. **Renderer in the repo, then layering**: per-channel bake, per-bone
   composition, channel state texture, baked transitions, prop bones.
7. **Library v1 assets**: horn transitions, battery and guard states and
   phrases, kneel, the choreography phrase. Owner review against video.
8. **Visuals mode**: tabs, Who list, lanes, result row, why readout,
   inspector, gestures, snapping, copy and paste, flags.
9. **Retire the window toggles** (section 7.5).

Owner verdicts on looks go in findings.md, and new technique rules in
technique.md, as each lands.

## 11. Out of scope

- Printing cues anywhere (coordinate sheets, drill charts, the mobile dot
  book, the video overlay). The compiled segments carry labels so it can be
  added later.
- Shaping phrases in the 3D window (posing keys, trimming and retargeting
  imports); exporting and importing phrases between shows; motion capture
  from video.
- Form-relative behavior: facing down the line or along a curve, follow the
  leader, ripple orders beyond the four above.
- Guessing cues from the drill beyond footwork.
- Animating bent leg, high step and high mark time; step-size warnings.
- Drum major conducting.
- Battery motion driven by percussion files; sit, lie down, horn
  flourishes, stick visuals, swing flag work patterns and exchanges.

## 12. Risks

- `timeline-try-2` is still moving (UI decisions daily). Re-check the
  timeline's tables, `TimelineSurface` layout and snapping helpers when the
  plan starts.
- Migration numbering: the 3D branch's `view3d_venue` and the timeline both
  use 0017 today. Never open one show file in builds of both until the 3D
  branch rebases.
- The GPU and texture budgets are unmeasured (section 8.5).
- Older builds that rewrite workspace settings drop keys they don't know, so
  show defaults saved by a newer build can revert to left foot and foot on
  the dot. The timeline's `timelineMode` key has the same exposure.
