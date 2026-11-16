# Performer behavior: cues

<!-- cspell:words rebakes playhead lerp lerps texel texels -->

- Status: describes [ADR 0015](../adr/0015-cue-model.md) (accepted
  2026-11-15), the source of truth. Where this file and the ADR disagree,
  the ADR wins.
- Date: 2026-11-16 (first written 2026-10-10 for ADR 0004's channels)
- Earlier design: [ADR 0004](../adr/0004-performer-cues.md). ADR 0015
  replaces its D-1 to D-3 and its channels. Its compile module (D-6), its 3D
  View amendments (D-7) and its beat deletion rule (2026-10-15) stand.
- Builds on: [ADR 0010](../adr/0010-3d-view.md) (the 3D View) and the
  timeline motion model.

**Built now:**

- Core's cue module, `packages/core/src/cues/`: the six cue types, lasting
  and momentary cues, transitions, the compile step and its queries
  (`compileCues`, `traceCue`, `cueValueAt`, `whoHasValue`, `heldAt`,
  `whoHolds`). Hold style comes from holds, not cues (`holdStyle.ts`).
- Storage: the `cues` and `cue_marchers` tables
  (`apps/desktop/src/db-functions/cues.ts`), with undo and the beat deletion
  carry.
- Equipment, end to end (fork #992): set it for the selection, see it on the
  2D field and in the 3D View, select by what's held at the playhead, and the
  timeline's Equipment lane.
- In the 3D View, Position cues drive the arms and Facing cues turn the
  performer.

**Not built yet:** editors for Position, Facing, Silk, Look and Posture
(ADR 0015 build order step 4 and on), their lanes, ripples, logistics, and
animations for battery and guard positions, tosses and kneel.

The show tells performers what to do, not only where to stand. A designer
places **cues** on counts for the selected performers; a pure **compile** step
turns them into each performer's values over time; the 2D field, the timeline
and the 3D View read that one result. Marching technique lives in
[technique.md](technique.md); this file points there instead of restating it.

## 1. Glossary

These words mean one thing everywhere in the UI, the code and these docs. The
"Cues" section of `CONTEXT.md` has the short forms.

- **Cue**: a value set for some performers at a count, for one cue type. Only
  things that change independently of the drill are cues.
- **Cue type**: what a cue controls, exactly one parameter of a performer:
  Equipment, Position, Silk, Look, Facing or Posture (Lights later).
- **Lasting**: a cue that holds until that performer's next lasting cue of the
  type ("rifle from count 40").
- **Momentary**: a cue that applies for a length in counts (1 by default),
  then the lasting value shows again ("sabre for 8 counts, then back", a
  toss). It never changes the lasting value.
- **Transition length**: how many counts a cue's change takes, landing on its
  count. Each value has a default; some values cut instead.
- **Snap**: a transition keyed in fixed time (about 0.2 s), not counts.
- **Default**: a parameter's value before a performer's first cue of the type,
  from a show setting or the section. Never stored as a cue.
- **Label**: a cue's display-only name for how its performers were picked
  ("Trumpets", "Rifles"). It never decides who. Values also have a short label
  for the timeline ("HU").
- **Count**: one beat of the show. Cues sit on counts, stored by beat id.
- **Hold**: counts where a performer's dot doesn't move (the timeline's
  meaning).
- **Hold style**: what the feet do on a hold: stand, mark time or high mark
  time. A property of the hold, not a cue.
- **Set** (equipment): the guard's resting equipment position between work.
- **Render channel**: the 3D renderer's internal bone groups (Feet, Body,
  Horn/Equipment; section 8.3). Not a cue word.
- **Ripple**: one cue staggered across its performers. Later (section 2.4).

## 2. Cues

### 2.1 What a cue is

A cue has:

- a **type** (section 3);
- a **value** of that type: a built-in id (`builtin:...`) or one the show
  adds;
- a **count**: one beat, stored by beat id;
- its **performers**: the ones selected when it was made. The list is fixed;
  it doesn't follow later changes to sections or tags;
- **settings** for the value (horn angle, facing angle or point);
- a **length**: empty for a lasting cue, a number of counts for a momentary
  one;
- a **transition** length in counts (empty means the value's default);
- a display-only **label** and optional **notes**.

There are no priority numbers and no timing finer than a count on a cue.

Groups (a section, a tag, "holding a rifle at the playhead", a hand-picked
set) are **selection tools only**. Making a cue "for the Trumpets" means
selecting the Trumpets and making a cue; the cue stores those performers. A
marcher added to the section later doesn't inherit its earlier cues (an
accepted cost, ADR 0015 D-4).

### 2.2 When a count happens

**Owner-confirmed (2026-10-10):** a cue's instant is the **click of its
count**: the start of its beat row, the same moment the 3D marchers' heel
lands (technique.md, "Heel on the beat" and "Counts and clicks"; `STEP_AHEAD`
in `marcherMotion.ts`). Page flags keep their meaning; only cues use the
click.

Counting is inclusive, the way staff count (technique.md, "Counting and
facing"):

- A cue "on 7" is in place on the click of 7. Its transition of length `L`
  runs from the click of `7 - L + 1` to the click of 7. "Ends on 7, takes 3
  counts" moves from the click of 5 to the click of 7. Length 1 is a snap
  that ends on the click.
- A momentary cue "on 1, 3 counts" covers counts 1, 2 and 3, and the lasting
  value shows again from count 4.
- All timing between clicks follows the tempo map, so a 3-count transition at
  a slow tempo takes longer in seconds. Snaps are the exception: fixed time.

Under this counting the built-in defaults are written as lengths that include
the landing count: a facing change is 2 (one count of turning), a kneel 3.

### 2.3 Resolution

For each performer, type and count:

1. Start from the **default** (section 3).
2. The **latest** lasting cue at or before this count wins. There are no
   precedence rules between groups: a cue for the whole band on count 33
   wins over a cue for the trumpets on count 17.
3. Two cues of one type and kind on one count for the same performer: the
   newer wins, and compile flags the clash.
4. A **momentary** cue shows over the lasting value for its length. One that
   starts inside an earlier momentary cue ends it, and the overlap is
   flagged.
5. A cue reaches only the performers its value **fits**. A Position value
   fits only the equipment it names (horns up skips a rifle), checked against
   what Equipment gives on the cue's count. A cue that fits none of its
   performers is flagged.
6. When Equipment changes, Position returns to the new equipment's default
   until its next cue, and a momentary Position cue under the change ends.
7. A value that shows only on holds (kneel) shows while the dot holds; on a
   count where the dot travels it is flagged and the default shows.
8. A cue of a type this build doesn't know is kept and ignored. A value it
   doesn't know is flagged and ignored. A lasting cue on a momentary-only
   value (a toss), or the reverse, is flagged and ignored.
9. Section names match ignoring case and outer spaces in the section defaults
   (owner, 2026-10-15).

### 2.4 Ripples

Later, as one design for moves and cues (ADR 0015 D-8): an order through the
performers and a delay per step. A cue already stores its performers, so a
ripple will add an order and a delay to that list without changing existing
cues. Until then, a ripple is several cues on successive counts.

### 2.5 Editing over time

- A cue lives on its beat. Inserting counts or dragging a page flag leaves it
  on the same music (its page:count label may change).
- Deleting counts (beats or a measure) carries their cues forward, in the
  same transaction and undo step as the deletion (ADR 0004 amendment of
  2026-10-15, per type and performer as ADR 0015 D-9 has it):
  - for each performer and type, only the **last** cue on the deleted counts
    keeps them, the value in effect at the end of the span; it moves to the
    first count after the deletion. Lasting and momentary cues are kept apart;
  - if the performer already has a cue of that type and kind on that count,
    the existing cue wins;
  - a moved cue keeps its length, transition and settings; a cue that keeps
    no performer is dropped;
  - deleting the end of the show (no count after) drops the cues;
  - no blocking popup: afterwards a notice with Undo says what moved.
- Replacing all the beats (a tempo edit in the audio editor, a MusicXML
  import) moves each cue to the surviving beat nearest its time, by the same
  rules.
- Deleting a marcher drops them from every cue; a cue left with no performers
  is deleted in the same transaction.
- After any of these the cue queries and the 3D window refresh.
- Drill edits never rewrite cues. Their effects (a kneel that now falls on a
  moving count) show up as flags.

## 3. Cue types

Each type controls one parameter and is one lane on the timeline (section
7.3). Cues of different types never touch each other: a Position cue leaves
Facing alone.

| Group     | Cue type  | Parameter                 | Values                                                                     | Default                | Built                                     |
| --------- | --------- | ------------------------- | -------------------------------------------------------------------------- | ---------------------- | ----------------------------------------- |
| Equipment | Equipment | What the performer holds  | A catalog item (guard, brass, woodwinds, drums), their own, nothing        | The section's usual    | End to end (fork #992)                    |
| Equipment | Position  | How it is held            | Horn up, down, trail; sticks playing, in, down; set, port, present; tosses | Up, playing or set     | Compile; 3D horn holds. No editor         |
| Equipment | Silk      | A held flag's design      | Plain color; artwork later                                                 | The section's color    | Compile only                              |
| Looks     | Look      | Which uniform look        | A look from #972                                                           | The band or guard look | Compile only; waits on #972               |
| Facing    | Facing    | Where the performer faces | Front, back, side 1, side 2, direction of travel, an angle, toward a point | Front                  | Compile; 3D headings. No editor           |
| Body      | Posture   | The body's posture        | Neutral, kneel; body visuals later                                         | Neutral                | Compile; the 3D feet stand. No kneel pose |

- Equipment, Look and Facing are naturally lasting; a toss is momentary only.
  The choice stays open wherever it makes sense.
- **Lights** will be its own on/off type under Looks. Hats and capes can
  become their own types once garments exist (#971).
- No take-overs: which body parts a value moves is the renderer's business.

### Equipment

- Equipment belongs to the performer: "G3 holds a rifle from count 40". The
  default comes from the section: each section holds its own catalog item (a
  trumpet, a tuba, a 6 ft flag, a rifle; `cueSections.ts`).
- The values are a fixed catalog of real items (`equipmentCatalog` in core),
  grouped by family: guard equipment (flag, swing flag, double swing flags,
  rifle, sabre), brass, woodwinds and drums. Any performer can hold any item.
  Each lines up with a 3D View model (`cues/equipmentItems.ts`).
  `builtin:equipment.usual` is "their own instrument", which compile resolves
  to the performer's section default; `builtin:equipment.none` is nothing.
  Imported equipment will be a family of its own later.
- The swap cuts on the count, with no animation.
- The 2D field and the 3D View both show what each performer holds at the
  playhead (section 7).

### Position

- Horn angle (the box, or 10 degrees above it) is a setting on horns up.
- Horn transitions (snap, or a sweep over the transition's counts) are
  generated between the holds each instrument already solves, so they work
  for every instrument.
- The guard's resting position is **set** (not "hold"); "carry" stays a horn
  word.

### Facing

- A point is in field coordinates, the same space as dot positions, not
  world meters; it converts to world space where positions do (owner,
  2026-10-15).
- Moving, the upper body holds the facing and the legs do the most logical
  thing for the travel: facing the backfield and moving back is a forward
  march; a slide is the upper body holding while the legs travel elsewhere.
  With the front facing, today's slide rules stand (technique.md, "Slides").
- "Direction of travel" on a hold keeps the last direction of travel.

### Posture

- Kneel (right knee down, left foot flat) is valid only while the dot holds
  (rule 7). The 3D View stands a kneeling performer's feet still; the kneel
  pose isn't animated yet.

### Not cues: the feet and the rest

Only things that change independently of the drill are cues (ADR 0015 D-1).

- **Hold style** (stand, mark time, high mark time) is set on each Held hold
  (`timeline_held_marks.style`). Without one, the show setting decides:
  **Stand** by default; set to Mark time, a holding performer marks time
  while anyone in the band travels and stands when the whole band holds (ADR
  0015 D-5). High mark time plays mark time for now.
- **Pace** (single, half, double) and **step style** (straight leg, bent leg,
  high step) will be properties of the move. They aren't built, so every
  count plays the defaults: single time, straight leg.
- **Step-off foot** is a show setting (left by default).
- **Dot mode** (foot on the dot or body center) is a show setting. Per-set
  dot mode stays parked (technique.md, "Foot on the dot and body center").
- **Visibility** is the 2D `visible` appearance, which the 3D View honors.
- Drum majors hold their hands in front; conducting is a later effort.

## 4. Built-in values

Every value has a stable id, a **name** and a short **label**. Built-in ids are
`builtin:<family>.<value>` (`builtin:horn.up`, `builtin:equipment.rifle`). The
catalog is plain data in `@openmarch/core` (`library.ts`): type, who it fits,
natural kind and lock, default length and transition, whether it shows only
on holds, and its settings with defaults. The editor and the compile step read
it without the 3D assets; the animation data lives with the 3D View. A show
can add values of its own, such as a section's equipment.

- **Equipment:** the catalog's items by family (section 3), nothing
  ("None") and their own instrument ("Own"). Horn and drum stay only as the
  default of a section with no catalog item. Cuts on its count.
- **Position, winds:** horns up ("HU"; angle box or +10°), horns down ("HD"),
  trail ("Trail"). Snap by default.
- **Position, battery:** playing ("Play"), sticks in ("In"), sticks down
  ("Down").
- **Position, guard:** flag set ("Set"), port ("Port"); rifle port arms
  ("Port"), present ("Pres"); sabre set ("Set"). Tosses, momentary only and 2
  counts by default: flag drop spin and single toss; rifle drop spin, single
  and double toss; sabre single toss.
- **Silk:** plain ("Plain"), in the section's 2D color by default.
- **Look:** band ("Band"), guard ("Guard").
- **Facing:** front, back, side 1 ("S1"), side 2 ("S2"), direction of travel,
  an angle, toward a point. 2 counts by default.
- **Posture:** neutral ("—"), kneel (3 counts by default; shows only on holds).

In the 3D View only the horn holds animate so far. Battery and guard positions
and tosses keep the hold underneath (`hornChannel.ts`). Guard positions are in
technique.md; flag port, spin and toss and rifle present and toss are first
takes to check against video.

Later additions (out of scope here): sit, lie down, horn flourishes, swing
flag work, exchanges, battery motion from percussion files.

## 5. Dropped from ADR 0004, and later

ADR 0015 drops these; they no longer apply anywhere:

- **Channels as body regions** (`feet`, `horn_equipment`, `body`), where the
  latest cue won a whole channel and reset its other settings.
- **Phrases** and **phrase assets** (and "copy into show"). Momentary cues
  replace phrases. An authoring format for tosses and choreography can return
  with them.
- **Take-overs** (kneel over Feet, choreography over Horn/Equipment).
- **Live targets and precedence** (band, section, tag, hand-picked, with the
  narrower winning a tie).
- **Feet cues**: their settings are hold style, move properties or show
  settings (section 3).
- **Visuals mode** as a separate workspace: lanes live in the main timeline
  (section 7.3).

**Logistics comes later** (ADR 0015 D-6), through one optional item link on
the Equipment cue to an `items` row of kind `equipment`. The item's
whereabouts will be derived from the cue: in the performer's hands while the
cue lasts, at its placed spot otherwise. Nothing is reserved in storage now.
Item placement, holders, crew and artwork slots stay parked on
`archive/pre-convergence` until then.

## 6. Compile

A pure module, `packages/core/src/cues/`, exported from `@openmarch/core`. No
React, Electron or database. The editor (`apps/desktop/src/cues/showCues.ts`)
and the 3D window both call it, and later printing can read the same output.

Input (`CompileInput`):

- the beat grid: the timed beats in order, with durations;
- the marchers, with section, what each usually carries, and whether each is
  a performer or an item (a cue never reaches an item);
- the cues, each with its performers;
- each section's usual equipment and 2D color, and an equipment fallback by
  section name;
- the hold styles the holds carry, and `travels` (and optionally
  `bandTravels`) from whichever resolver the caller has;
- show defaults: the hold style while the band moves, and the band and guard
  looks;
- values the show adds to the built-in catalog.

Output (`CompiledCues`):

- `segments(marcher, type)`: what the parameter is over `[from, to)` counts,
  each `{ kind: "default" | "lasting" | "transition" | "momentary", value,
label, settings, cueId | null, snap? }`. A snap is a zero-length
  transition;
- `holdStyle(marcher)`: what the feet do on holds over the show (not a cue);
- **flags**, each with the cue ids and performers involved: clash, momentary
  overlap, a standing-only value on a moving count, fits nobody, a kind the
  value doesn't allow, an unknown value, and a transition cut short because
  it would start before the cue before it;
- **notes**: things done quietly, such as a Position cue ignored for a
  performer whose equipment doesn't match.

Queries on the result:

- `traceCue(compiled, marcher, type, count)`: the cue in effect (or where the
  default comes from) and the performer's other cues it beat, latest first;
- `cueValueAt`: the value at a count's click (a transition hasn't landed until
  its count);
- `whoHasValue`: who has a value of a type at a count;
- `heldAt` and `whoHolds`: what a performer holds at a count, and who holds a
  kind of equipment ("Select Rifles").

Incremental use: `compileCues(input, { previous, types })` resolves only the
listed types again and reuses the rest. An Equipment edit also resolves
Position and Silk again, since what is held decides what fits. It is valid
only when nothing but those types' cues changed.

## 7. Editor

### 7.1 Equipment commands (built)

These are commands (`shortcuts/definitions.ts`, `cues/useCueCommands.ts`),
so the command bar finds them. The field's right-click menu has an
**Equipment** submenu (their own instrument; the last four items picked; a
submenu per family; Nothing) and a **Select by equipment** submenu grouped the
same way. The Equipment lane's cue menu offers the cue edits:

- **Equipment: <item>**, one per catalog item, **their own instrument** and
  **Nothing:** what the selected performers hold from the paused playhead on,
  as one lasting cue that stores them. The menu checks what every selected
  performer already holds, and keeps the last four items picked (UI settings,
  per device).
- **Add selected to this cue, Remove selected from this cue:** change who the
  picked cue applies to (picked in the lane, else the one Equipment cue on the
  playhead's count). After a change the cue's label names its performers
  again (`cueLabel.ts`).
- **Make lasting, Make momentary** (8 counts by default), **Move cue to
  playhead** and **Delete cue** for the picked cue.
- **Select <items>** for each item, **Select all <family>** for each family,
  and **Select empty hands:** select whoever holds it at the playhead,
  whatever their section (`whoHasValue`).

### 7.2 The 2D field (built)

The field tags a drill number with what the performer holds when it isn't
their own instrument: a short abbreviation per item, such as **R** rifle, **F**
flag, **Tp** trumpet, **Tu** tuba, **SD** snare, **N** nothing (`ITEM_TAG` in
`cues/equipmentItems.ts`; ASCII only, for the field's glyph atlas). Shows
without Equipment cues draw no tags.

### 7.3 Timeline lanes

One lane per cue type in the main timeline, under the drill rows, grouped as
in section 3. Each can be shown or hidden from the timeline's Lanes button, a
checklist of the lanes that are built (`cues/cueLanes.ts`), and all are hidden
by default. A
lasting cue draws as a bar to the next one and a momentary cue as a block of
its length. There is no separate workspace: cues are timed against the drill,
so the drill stays in view (ADR 0015 D-7).

The **Equipment lane** is built (`cues/equipmentLane.ts`,
`components/timeline/cues/EquipmentLane.tsx`; fork #991's option E):

- one row per group of performers with the same Equipment history, folding
  into a stacked summary of how many hold each thing;
- only performers with an Equipment cue are in it; a section's usual (not a
  cue) draws as a dashed bar;
- click a cue to pick it for the commands above; right-click or long-press it
  for its menu; click a row's name to select its performers;
- drag a cue sideways to move it to another count, as a move's clip moves
  (whole beats, pulled to page lines, `snapRangeOffset`), and drag a momentary
  cue's end to change its length; each drag is one undo step, and a cue that
  spans rows moves in all of them.

The other lanes come with their editors. The parked branch's who list and why
readout are starting points (ADR 0015, "What comes back").

### 7.4 Not built yet

- Setting Position, Facing, Silk, Look and Posture, with transition lengths
  (ADR 0015 build order steps 4 and 5).
- Showing a cue's flags and its why readout (`traceCue`) in the editor.
- Copying and pasting cues.

### 7.5 The 3D window's old toggles

The 3D window's horn state, guard equipment and step-off foot toggles are
gone. The window draws what the compiled cues and Show settings say.

### 7.6 The 2D appearance cascade

Appearances (colors, per page, first non-empty value by tag priority) and cues
(values over time, latest wins) stay separate models. The dormant
`equipment_name` and `equipment_state` appearance columns stay unread (ADR
0015 D-6).

## 8. 3D View runtime

### 8.1 Positions and sync (ADR 0010 amendment)

In timeline mode `marcher_pages` is frozen and stale, and timeline edits
invalidate no query keys. So:

- `positions.ts` (ADR 0010 D-6) has a timeline-mode path: the window
  cold-builds its own resolver from the timeline tables
  (`acquireExportResolver`) and samples it at every count boundary.
- The editor sends an invalidation of `VIEW3D_TIMELINE_QUERY_KEY` on
  `view3d:invalidate` after every committed timeline change (ADR 0010 D-4
  keeps its shape; no new channel). The window rebuilds its resolver on that
  key.
- The window reads the stored cues (`useStoredCues`). Cue tables have real
  query keys, and the editor relays every query it invalidates, so a cue
  edit, an undo or a beat or marcher deletion refreshes them.

### 8.2 Planner (feet and facing)

`core/marchers/planner.ts` stays pure and per count. `cueInputs.ts` turns a
performer's compile result into its inputs:

- the feet per count: the defaults (single time, straight leg), the show's
  step-off foot, and the compile's hold style (stand under a kneel);
- dot mode, from the show setting;
- a heading per count from Facing. The whole instance turns to it (feet
  included at rest); while moving the legs pick forward, backward or slide
  relative to it. Turning eases over the transition on the CPU, through the
  instance matrix it already writes every frame; a snap turns in fixed time.

ADR 0010 D-7's "the upper body always faces the front sideline" is the Facing
default.

### 8.3 Layered animation

Keep the baked-texture instanced renderer, with no per-marcher animation
mixers. Compose each performer's bones **once per frame in a GPU pre-pass**,
not per vertex (measured 2026-10-11, findings.md).

The renderer layers three **render channels**: Feet (legs, hips and travel),
Body (spine and head) and Horn/Equipment (shoulders, arms, hands and what they
hold). These are the renderer's own bone groups, not cue types. Position cues
drive Horn/Equipment (`hornChannel.ts`), Equipment decides which piece is in
the hands (`equipmentSpans.ts`), Facing turns the instance, and the feet come
from the planner.

- **Bake per channel**, not per combination: feet clips, horn and equipment
  rows, body rows. Rows add up across channels instead of multiplying. The
  hold's arm pose is the Horn/Equipment default row. Measured on the Fall
  Show: 828 of 4096 texels wide (27.1 MB, Feet bake 0.23 s), against 3,864
  wide (126.6 MB, 1.04 s) before.
- **Compose pass**: each frame, one render-to-texture pass (WebGL2 with
  `EXT_color_buffer_float`) writes every performer's final skinning matrices
  into a small float texture: 4 texels per bone, 24 bones (23 plus a prop
  bone), one row per instance. Each fragment samples its bone's channel row
  (with the time lerp and any blend) from a per-bone channel id, and
  re-anchors upper-body chains to the torso the Feet or Body channel is
  moving.
- **Skinning reads one matrix per influence** from that texture, for bodies
  and instruments alike. That is fewer fetches than the old two-row lerp, so
  the frame gets cheaper: −0.8 to −1.2 ms at 300 marchers and −3.4 to −3.9 ms
  at 600 on full quality (M1 Pro). Composing per vertex instead cost +5.8 to
  +7.4 ms at 300, and composing on the CPU grows with the band (0.8 ms at 300,
  1.5 ms at 600), so the GPU pass is the choice.
- **Per-instance channel state** (row, phase, rate for each channel) lives in
  a small float data texture read by `gl_InstanceID`, written only when a
  segment changes. Vertex attribute slots (14 of 16 used) stay free.
- **Transitions are baked rows**, not matrix lerps, so a horn snap doesn't
  shrink bones.
- **Props as virtual bones** on the Horn/Equipment channel: held, a prop bone
  is the hand times a grip offset. A toss, once animated, can move it in body
  space. No per-frame CPU work.
- **Equipment swaps** cut on the cue's count: the piece in the hands changes,
  and Position returns to the new piece's default hold.

### 8.4 om-pose

The renderer lives in the repo as owned code (`view3d/render/README.md`)
instead of a patched vendored copy. The channel layering is OpenMarch-specific
and changes often; om-pose stays the reference for single-clip behavior. The
shadow pass stays unpatched. A WebGPU move later rewrites the shader in TSL
either way.

### 8.5 Performance budget

Measured on 2026-10-10 and 2026-10-11 (findings.md), on an Apple M1 Pro with
the high school kit:

- **Channel layering at most +1 ms at 300 marchers, full quality:** pass with
  the compose pass (the frame is cheaper than before).
- **The bake inside 4096 × 2048:** pass (828 texels wide); Horn/Equipment
  needs no texture of its own.
- **Full show bake under 1.5 s:** pass (0.23 s for Feet). **A cue edit
  rebakes only what changed in under 100 ms:** pass for Horn (under 1 ms).
- **60 fps at 1080p with 300 performers in `pro` on an integrated GPU**
  (design.md section 9): not yet measured. A base M1, an Intel Iris Xe and the
  `pro` kit still need numbers, and so does the compose pass's own GPU time.

## 9. Storage

ADR 0015 D-9 has the schema; the write rules are ADR 0004's.

- `cues`: `id`, `type`, `beat_id`, `value`, `settings_json`, `length` (null
  for a lasting cue), `transition` (null for the value's default), `label`,
  `notes` and the shared timestamps (migration `0022_cues.sql`).
- `cue_marchers`: `cue_id`, `marcher_id`. Every cue has its performers here.
- `timeline_held_marks.style`: the hold style, nullable (`stand`, `markTime`,
  `highMarkTime`; migration `0021_held_mark_style.sql`).
- `type` and `value` are checked in code, not by a CHECK constraint. A build
  that doesn't know a type keeps its cues, writes them back untouched and
  ignores them, so a new type needs no migration.
- Write paths, undo and the beat deletion carry are in
  `apps/desktop/src/db-functions/cues.ts`; the query hooks are `useCues`.

## 10. Build order

ADR 0015's build order, with where it stands:

1. **Mark time:** holds stand by default, with a style on each Held hold.
   Built.
2. **Cue foundations:** core types, storage and undo. Built.
3. **Equipment, end to end:** set it for a selection, see it on the 2D field
   and in 3D, select by equipment at the playhead, and its lane. Built (fork
   #992).
4. **Facing and Position,** with transition lengths. Compile and the 3D View
   handle them; the editor and lanes are next.
5. **Look,** after the looks model (#972).
6. **Later, in no fixed order:** tosses and other momentary values, Lights,
   ripples, logistics.

The 3D runtime work in section 8 (window positions, planner inputs, the
renderer in the repo, the per-channel bake and the compose pass) is built.
Animations for battery and guard positions, tosses and kneel are not.

Owner verdicts on looks go in findings.md, and new technique rules in
technique.md, as each lands.

## 11. Out of scope

- Printing cues anywhere (coordinate sheets, drill charts, the mobile dot
  book, the video overlay). The compiled segments carry labels so it can be
  added later.
- Shaping tosses and choreography in the 3D window, importing motion, and
  motion capture from video.
- Form-relative behavior: facing down the line or along a curve, follow the
  leader.
- Guessing cues from the drill.
- Animating bent leg, high step and high mark time; step-size warnings.
- Drum major conducting.
- Battery motion driven by percussion files; sit, lie down, horn flourishes,
  stick visuals, swing flag work patterns and exchanges.

## 12. Risks

- `@openmarch/core`'s cue types are a public package API; changing them
  changes the 3D View's compile call with them.
- A marcher added to a section later doesn't pick up that section's earlier
  cues; fixing them is by hand (ADR 0015 D-4).
- The GPU budget on integrated GPUs is unmeasured (section 8.5).
- Older builds that rewrite workspace settings drop keys they don't know, so
  show defaults saved by a newer build can revert to left foot and foot on
  the dot. The timeline's `timelineMode` key has the same
  exposure.
