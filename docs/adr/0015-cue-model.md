# 0015: Cue model: one parameter per cue type

<!-- cspell:words shako -->

- Status: accepted by the owner on 2026-11-15, decision by decision, in a
  design pass (the record is under "Decisions with the owner").
- Date: 2026-11-15
- Supersedes in part: [ADR 0004](0004-performer-cues.md) D-1 to D-3 and its
  channels, including those of its 2026-10-11 amendment, and the Feet default
  of its 2026-11-11 amendment. ADR 0004's compile module (D-6), 3D View
  amendments (D-7) and beat deletion rule (2026-10-15) stand.

## Context

Three issues wait on the cue model:

- **#966 equipment changes:** the guard switches between rifle, flag and
  sabre. Show it now, select "Rifles" by who holds one at a moment, and handle
  logistics such as put-downs later.
- **#976 look changes:** reveals, capes off, lights on the uniform or shako,
  unzipping that changes the color scheme.
- **#775 mark time:** marchers mark time too often, and nothing can say
  "stand here" for some of them.

The owner (Alex) gave the model on 2026-11-14:

> A cue just means a definition at a moment in time, and it's either relevant
> for just that moment or perpetuates until the next cue of that type
>
> To me, a cue modifies an entity of a component (the performer) and each cue
> type controls a specific param.

The owner also wants the timeline to have separate lanes for equipment,
looks, facings and so on.

ADR 0004 is the earlier design, from the 3D work. Its compiler shipped
(`packages/core/src/cues`) and drives the 3D View with show defaults only. Its
storage, Visuals mode and item placement are parked on
`archive/pre-convergence` (002b6da97), and ADR 0011 dropped their tables. No
file on fork main holds cues.

### The parked design against the owner's model

**Where it agrees**

- A state cue is the owner's lasting cue: the latest one at or before a count
  wins.
- A cue sits on a beat id, and its instant is the count's click.
- Defaults are never stored. Each has a show setting, and a cue changes it
  from a count.
- Carry, Silk and Uniform each hold one value and cut on their count.
- Compile is pure, and it can say why a performer does something on a count.

**Where it is more complex than the model needs**

- **Channels are body regions.** `feet` holds pace, moving technique, hold
  technique and step-off foot; `horn_equipment` holds horn position, stick
  position, guard position and equipment work; `body` holds posture and
  choreography. Because the latest cue wins the whole channel, a cue that
  sets one of them resets the others to their defaults.
- **Phrases** are a second kind of cue with their own library values, a
  minimum of 2 counts, stretchable sections, overlap flags, a `phrase_assets`
  table and "copy into show". The model needs only "for just that moment".
- **Take-overs:** a cue on one channel owns another (kneel over Feet,
  choreography over Horn/Equipment).
- **Targets with precedence:** band, section, tag or hand-picked, resolved
  live, with the narrower group winning on a tie.
- **Item placement beside cues:** holders, hands, crew, ripple groups and a
  beat rank. That is logistics, which #966 puts later.

**What is missing**

- **"For just that moment" on every type.** Phrases exist only on
  Horn/Equipment and Body, and they are never one count long.
- **Selecting by what a performer holds at a moment** ("Rifles").
- **Equipment on the 2D field.** Only the 3D View would show it.
- **"Stand here".** It takes a Feet cue that restates pace, technique and
  step-off foot.

## Decision

### D-1 What is a cue, and what isn't

- **Entity:** a performer (a `marchers` row of type `marcher`). Props may get
  cues later.
- **Cue type:** controls exactly one parameter of a performer.
- **Cue:** a type, a value, a moment (a beat id, at the count's click) and the
  performers it applies to.
- **Only things that change independently of the drill are cues.** Something
  that belongs to a hold or a move is stored on that hold or move:
  - hold style (stand or mark time) is a property of the hold (D-5);
  - pace and step style are properties of the move, when they are built;
  - step-off foot and dot mode stay show settings.

### D-2 Lasting and momentary

- Each cue is **lasting** or **momentary**, chosen per cue, for any type.
  - **Lasting:** sets the parameter from its moment until that performer's
    next lasting cue of the type.
  - **Momentary:** applies for a length in counts (1 by default), then the
    lasting value shows again. It never changes the lasting value.
- Each value has a natural default: Equipment, Look and Facing are lasting; a
  toss is momentary. The choice stays open wherever it makes sense ("sabre for
  8 counts, then back"). A value that works only one way is locked: a toss is
  momentary only.
- **Transition length:** a cue may say how many counts its change takes
  ("horns down over 2", "turn to the back over 4"). Each value has a default,
  such as a snap for horns and 2 counts for a facing change.
- Before a performer's first cue of a type, the parameter has its
  **default**: a show setting or the section's, never stored as a cue.

### D-3 Cue types

Each type is a lane on the timeline (D-6).

| Group     | Cue type  | Parameter                | Values                                                                     | Default                |
| --------- | --------- | ------------------------ | -------------------------------------------------------------------------- | ---------------------- |
| Equipment | Equipment | What the performer holds | The section's instrument, flag, rifle, sabre, nothing                      | The section's usual    |
| Equipment | Position  | How it is held           | Horn up, down, trail; sticks playing, in, down; set, port, present; tosses | Up, playing or set     |
| Equipment | Silk      | A held flag's design     | Plain color; artwork later                                                 | The section's color    |
| Looks     | Look      | Which uniform look       | A look from #972                                                           | The band or guard look |
| Facing    | Facing    | Where the performer faces | Front, back, side 1, side 2, direction of travel, an angle, toward a point | Front                  |
| Body      | Posture   | The body's posture       | Neutral, kneel; body visuals later                                         | Neutral                |

- **Lights** is its own on/off type under Looks, added later. Lights are not
  folded into looks, so a show with 3 looks and lights doesn't need 6.
- Hats and capes can become their own types once garments exist (#971).
- A value can say where it applies. A Position value fits only the equipment
  it names (horns up skips a rifle). A kneel shows only while the dot holds.
  When Equipment changes, Position returns to the new equipment's default
  until its next cue.
- No take-overs. Which body parts a value moves is the renderer's business.

### D-4 Who a cue applies to

- **A cue stores the performers that were selected when it was made.** The
  list is fixed; it doesn't follow later changes to sections or tags.
- Groups (a section, a tag, "holding a rifle at the playhead", a hand-picked
  set) are **selection tools only**. "Select Rifles" picks whoever holds a
  rifle at the playhead, whatever their section (#377's `#rifles`). Core
  answers "who holds what on count N" from the compiled cues.
- For each performer and type, the latest cue at or before a count wins. There
  are no precedence rules between groups.
- A cue keeps a display-only **label** of how its performers were picked, such
  as "Trumpets".
- Accepted costs: a marcher added to a section later doesn't inherit that
  section's earlier cues, and fixing them is by hand. A group that follows the
  show can be added later without changing stored cues.

### D-5 Mark time

- **Holds stand still by default.** Mark time is opt-in.
- **Each Held hold can carry a style:** stand, mark time or high mark time,
  set on the hold for the performers in it. No style means the show setting.
- **The show setting's default becomes Stand.** Set to Mark time, it keeps
  today's rule: a holding performer marks time while anyone in the band
  travels, and stands when the whole band holds.
- This answers both halves of #775 ("too often" and "stand here") without
  cues, and gives #655's stops their mark time or halt.

### D-6 Equipment and logistics

- Equipment belongs to the performer: "G3 holds a rifle from count 40". The
  default comes from the section: a Rifle section holds rifles, Flag and Color
  Guard hold flags, winds and battery hold their instrument.
- The 2D field and the 3D View both show what each performer holds at the
  playhead.
- **Logistics comes later**, through one optional item link on the Equipment
  cue to an `items` row of kind `equipment`. The item's whereabouts are
  derived from the cue: in the performer's hands while the cue lasts, and at
  its placed spot otherwise. There is one source of truth, and cues without a
  link keep meaning "a rifle from somewhere". Nothing is reserved in storage
  now; the nullable column comes with logistics.
- Appearances' dormant `equipment_name` and `equipment_state` columns stay
  unread.

### D-7 Timeline lanes

- One lane per cue type in the main timeline, under the drill rows, grouped as
  in D-3. Each lane can be shown or hidden, and all are hidden by default.
- A lane draws a lasting cue as a bar to the next one and a momentary cue as a
  block of its length.
- There is no separate Visuals workspace: cues are timed against the drill, so
  the drill stays in view.
- A prototype settles the rows inside a lane, when performers have different
  values at once, before the lanes are built.

### D-8 Ripples

Ripples are later, as one design for both moves and cues: an order through
the performers and a delay per step. A cue already stores its performers, so a
ripple adds an order and a delay to that list without changing existing cues.
Until then, a ripple is several cues on successive counts.

### D-9 Storage

- `cues`: `id`, `type`, `beat_id`, `value`, `settings_json`, `length` (null
  for a lasting cue), `transition` (null for the value's default), `label`,
  `notes` and the shared timestamps.
- `cue_marchers`: `cue_id`, `marcher_id`. Every cue has its performers here.
- `timeline_held_marks` gains a nullable `style` (`stand`, `markTime`,
  `highMarkTime`).
- `type` and `value` are checked in code, not by a CHECK constraint. A build
  that doesn't know a type keeps its cues and ignores them, so a new type
  needs no migration.
- ADR 0004's write rules stay: history, repair, and carrying cues forward when
  beats are deleted, per type and performer.

### D-10 Compile

`@openmarch/core`'s cue module keeps its shape (compile, trace, flags). Its
public types change:

- `CueChannel` becomes the cue types of D-3, and a cue is lasting or
  momentary, with a length and a transition.
- A cue names its performers; targets and precedence leave the input.
- The Feet channel leaves. Hold style comes from the holds and the show
  setting.
- Phrases, phrase assets and take-overs leave the input and output.
- A new query answers who has a value on a count.

### What comes back from the archive, and what doesn't

**Comes back, simplified**

- the `cues` and `cue_marchers` tables, their write paths, undo and query
  hooks (`db-functions/cues.ts`, `useCues`);
- the beat deletion rule;
- the 3D window reading stored cues (`useStoredCues`);
- the lane drawing, the who list and the why readout, as starting points for
  the lanes (`VisualsCueBand`, `visualsLanes.ts`, `visualsWho.ts`,
  `visualsWhy.ts`).

**Stays parked**

- item placement, holders, crew and artwork slots, until logistics;
- the embedded Library and `library:` values;
- per-set dot mode (`page_performer_settings`).

**Dropped**

- `phrase_assets` and the phrase asset format, which can return with tosses
  and choreography as an authoring format;
- take-overs;
- the `feet`, `horn_equipment` and `body` channels;
- live targets and group precedence;
- Visuals mode as a separate workspace.

### Build order

1. **Mark time:** holds stand by default, with a style on each Held hold. It
   needs no cues and closes #775.
2. **Cue foundations:** core types, storage and undo.
3. **Equipment, end to end:** set it for a selection, see it on the 2D field
   and in 3D, select by equipment at the playhead, and its lane. That is the
   "show it now" part of #966.
4. **Facing and Position,** with transition lengths.
5. **Look,** after the looks model (#972).
6. **Later, in no fixed order:** tosses and other momentary values, Lights,
   ripples, logistics.

## Decisions with the owner

Worked through one at a time on 2026-11-15.

1. **What a cue is:** only something that changes independently of the
   drill, one parameter per type. Hold style, pace and step style are not
   cues. Agreed after the owner asked whether hold style should be a cue at
   all.
2. **Lasting or momentary:** chosen per cue for any type, with a natural
   default per value and locks where only one makes sense. Agreed; the owner
   noted that equipment is almost always lasting but the option doesn't hurt.
3. **Who:** a cue stores the selected performers; groups only select. The
   owner rejected the proposed live groups: adding a cue by section means the
   section was selected at that moment.
4. **Equipment:** performer-first, logistics later through an optional item
   link. Agreed.
5. **Look and Lights:** separate types. Agreed; Lights can come later.
6. **Mark time:** a style on the hold, with Stand as the show default and mark
   time opt-in. The owner chose Stand over today's mark time while the band
   moves.
7. **Lanes:** show/hide lanes in the main timeline, no separate workspace.
   Agreed.
8. **Dropped:** take-overs and phrase assets. The owner kept transition
   lengths ("a horns down that takes 2 counts, a facing change that takes 4")
   and wants ripples for both moves and cues, so they come later as one
   design.
9. **Build order:** as above. Agreed.

## Consequences

- A cue can never reset a parameter it doesn't name.
- Six cue types now, against seven channels. Lanes are hidden until shown, so
  the timeline stays calm.
- `@openmarch/core`'s cue types change, which is a public package API change.
  The 3D View's compile call changes with it.
- Two tables return to the file format and one column is added. Older builds
  ignore them and play the defaults.
- Shows need no conversion: no file on fork main holds cues. Shows that never
  changed the hold setting switch from mark time to stand.
- A marcher added to a section later doesn't pick up that section's earlier
  cues.
- Tosses and choreography have no authoring format until momentary values are
  built.

## Verification

- Compile unit tests: one parameter per type (a Position cue leaves Facing
  alone); lasting and momentary cues, including one count; transition
  lengths; the latest cue per performer wins; the Position fit rule; defaults.
- Mark time tests: holds stand by default; a Held hold's style wins over the
  show setting; the show setting at Mark time keeps today's band rule.
- Schema and history tests for the two tables and the new column, and the
  beat deletion rule.
- An unknown cue type survives a save in a build that doesn't know it.
- End to end: set a rifle for the selection at a count; the 2D field and the
  3D View show it from that count; "Select Rifles" picks those performers
  there and not before.
