# Instruments, holds and front ensemble props: design

<!-- cspell:words Zaber mellophone mellophones sousaphone sousaphones contras leadpipe Mylar lathed swept subwoofer spocks ligature -->

Status: reviewed by the owner 2026-10-08; §9 item 3 (props persistence) is
still open. Nothing here is built.

How 3D View marchers come to carry instruments that read as the real thing,
hold them the way a corps does, and how the front ensemble and its speakers
appear on the field. Adds to [ADR 0002](../adr/0002-3d-view.md) D-7; the
schema addition in §6 needs an ADR amendment before it is built.

## 1. Where we are

- om-pose's body meshes carry three placeholder instruments (trumpet,
  mellophone, baritone; 120 triangles each) skinned to the right hand, and
  every clip holds one "horn up" arm pose. Every other section carries
  nothing. The bodies and clips are vendored as read-only
  (`src/view3d/vendor/om-pose/README.md`).
- The window bakes the clips itself (`bakeClips`) from the loaded clip files,
  and the library already builds rigid one-bone meshes that ride the baked
  skeleton (`blockGeometry`). Both are the hooks this design uses, so nothing
  in om-pose changes.
- Pit members are marchers with dots. The show stores nothing about
  speakers, racks or carts.

## 2. Goals and non-goals

Goals, in the owner's words: render the horns better, add real marching
percussion, add front ensemble and speaker setups, model them as closely as
possible to the real thing from multiple angles, and make the arm poses match
each instrument. Woodwinds are in scope.

Non-goals: photo textures or logos from any manufacturer; mallet, stick and
finger animation; sound; props other than the front ensemble set.

**Reference policy.** Yamaha's product pages (marching brass under
`usa.yamaha.com/products/musical_instruments/winds/marching_brass/`, marching
percussion and multi-frame keyboards under
`.../musical_instruments/marching/`) are the proportion reference: bell
diameters, bore, shell sizes, frame widths, viewed from their multi-angle
galleries and spec tabs. Nothing from those pages ships. Geometry, colors and
finishes are ours. No model names or marks appear in the app.

**Style.** The fidelity brief's stylized-realistic maquette: real
proportions, real finishes (lacquer, silver, chrome hoops, Mylar heads, rosewood
or synthetic bars), simplified detail. An instrument must read correctly from
the press box and from a seat on the 30, not from a macro lens.

## 3. Instrument catalog

Every section in `Sections.ts` maps to one model or to none. Dimensions are
the working numbers to build from, in meters, to be checked against the
reference pages during the build.

### Brass (`FAMILIES.Brass`)

| Section       | Model                                                                    | Working dimensions          | Hold     |
| ------------- | ------------------------------------------------------------------------ | --------------------------- | -------- |
| Trumpet       | Bb trumpet, 3 piston valves; a modeled mesh (Kagelok, CC BY 4.0)         | length 0.48, bell 0.125     | brass    |
| Mellophone    | marching mellophone, front bell                                          | length 0.55, bell 0.26      | brass    |
| Baritone      | marching baritone, front bell                                            | length 0.62, bell 0.25      | brass    |
| Euphonium     | marching euphonium, front bell                                           | length 0.66, bell 0.28      | brass    |
| Trombone      | tenor trombone, slide                                                    | length 1.18, bell 0.21      | trombone |
| Bass Trombone | same with larger bell and a second rotor                                 | bell 0.24                   | trombone |
| Tuba          | marching contra: a long horizontal loop on the left shoulder, front bell | body 0.95 × 0.40, bell 0.50 | contra   |

The Tuba section renders the marching contra. A sousaphone (circular wrap,
bell overhead) becomes a per-section choice on Tuba later (owner,
2026-10-08); the catalog's `Carry.model` is where that choice lands.

The app has no French horn section; mellophone covers it. If one is added
later it gets its own hold (bell under the right arm, left hand on the
rotors).

### Woodwinds (`FAMILIES.Woodwind`)

| Section       | Model                     | Working dimensions     | Hold     |
| ------------- | ------------------------- | ---------------------- | -------- |
| Piccolo       | piccolo                   | length 0.32            | piccolo  |
| Flute         | C flute                   | length 0.67            | flute    |
| Clarinet      | Bb clarinet               | length 0.66            | clarinet |
| Bass Clarinet | bass clarinet with peg    | length 1.0             | clarinet |
| Soprano Sax   | straight soprano          | length 0.65            | clarinet |
| Alto Sax      | alto sax on a strap       | height 0.65, bell 0.12 | sax      |
| Tenor Sax     | tenor sax on a strap      | height 0.80, bell 0.14 | sax      |
| Bari Sax      | baritone sax on a harness | height 1.0, bell 0.19  | sax      |

### Battery (`FAMILIES.Battery`)

| Section   | Model                                     | Working dimensions                             | Hold    |
| --------- | ----------------------------------------- | ---------------------------------------------- | ------- |
| Snare     | marching snare on a carrier               | 14 in × 12 in shell                            | snare   |
| Tenors    | sixes on a carrier                        | 10, 12, 13, 14 in drums, 6 and 8 in shots      | tenors  |
| Bass Drum | marching bass on a carrier, sized per dot | 18 to 32 in diameter in 2 in steps, 14 in deep | bass    |
| Cymbals   | pair of 18 in crash cymbals               | 18 in                                          | cymbals |
| Flub Drum | the bass model, sized with the bass line  |                                                | bass    |

Bass drum size: the show stores no size, so each marcher gets one. The
marchers whose section carries the bass model (Bass Drum and Flub Drum), in
id order, spread evenly over 18, 20, … 32 in, smallest first; a lone drum
gets 26 in (`bassSizesFor`, `bassOptions` in `looks.ts`). A stored
per-marcher size is a later schema change. The drums ride high, as in the
owner's reference photo: every size keeps its back at the carrier, just in
front of the belly plate, so bigger drums reach further forward, and each
hangs where its head's center is one mallet length up and forward from the
hands at the hips, its top no higher than 1.6 m. Centers land between 1.2
and 1.4 m. Where that cap brings a center closer than a mallet's length,
the mallet runs back through the hand with its butt behind the fist. The
arms are one pose for every size; a hold per size would refine the small
drums.

**Carriers.** Snare, tenors and bass hang from one shoulder-hoop carrier:
chrome hoops from a black belly plate up over the shoulders (padded where
they sit) and down the back, with chrome J-bars from the plate to the drum.
Its clearances come from the seven body meshes: shoulder tops at 1.46 m,
chests reaching z 0.17, upper backs z −0.19.

**Tenor layout.** Sixes, after the owner's reference photo of a Dynasty
six-drum set. The two shots (6 and 8 in) sit in the middle nearest the
player, just in front of the carrier bracket. Drums 1 (10 in) and 2 (12 in)
sit in front of them, and drums 3 (13 in) and 4 (14 in) wrap round at the
player's left and right. The shells nearly touch, every head is level, and
the set stays under 1.1 m wide. The left hand covers drum 1 and the right
drum 2.

### Guard, Other, Pit

| Model             | What it is                                                                                                   | Working dimensions                    | Hold            |
| ----------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------- | --------------- |
| 6 ft flag         | chrome pole, rubber end caps, tape, a silk in the section's color                                            | pole 1.83, silk 36 × 54 in            | flag            |
| Swing flag        | held in one fist at the butt, a bare tab above the hand, the silk sleeved along the rest                     | pole 1.02 (tab 0.32), silk 1.5 × 0.7  | swingFlag       |
| Double swing flag | two swing flags, one in each hand, mirrored                                                                  | as the swing flag                     | doubleSwingFlag |
| Rifle             | white spinning rifle (an Ultra Spin): flat-sided stock, wrist dip, chrome bolt plate, black sling drawn taut | 0.91 long, butt 0.12 deep             | rifle           |
| Sabre             | spinning sabre (a Zaber): broad curved chrome blade, rubber tip, chrome cup and D-bow, finger-grooved grip   | blade 0.8 (85 mm of curve), grip 0.12 | sabre           |

Today the Color Guard and Flag sections carry the 6 ft flag and the Rifle
section the rifle. The swing flag, the double swing flag and the sabre are
built and held but no section maps to them: they wait for a per-section
choice (owner, 2026-10-09), which lands in the catalog's `Carry.model` like
the sousaphone. Drum Major and Soloist carry nothing. Pit marchers carry
nothing on their dots: their instruments are props (§6).

## 4. Geometry: procedural, one bone each

Instruments are built in code, in `src/view3d/core/instruments/`, as pure
functions from a few dimensions to triangle lists, in the manner of
`blockGeometry`: lathed bells and bows, swept tubing along a polyline, valve
blocks as cylinders with caps, drum shells as open cylinders with hoops and
lugs, bars as boxes on a frame. Each piece is rigidly weighted to one bone
of the v4 skeleton and carries a `_part` id so the uniform shader paints it.
Triangle budget, revised 2026-10-08 after the owner saw the first pass:
8,000 to 12,000 per horn at high quality and about 2,500 at low, from the
same code at lower segment counts; drums follow the same ratio. 150 brass
at high add about 1.5 M triangles in instanced draws; the frame time is
measured, not assumed.

Why procedural: no modeling tool is available on this side, the maquette
style lives in proportion and finish rather than surface detail, the
geometry instances with the body for free, and a dimension change is a
number. Hand-modeled GLB assets are the alternative if the result reads as
too simple; the attachment and paint path below is the same either way.

**Modeled meshes (2026-10-09).** The trumpet is the first instrument from a
modeled mesh rather than code: "Trumpet" by Kagelok on Sketchfab, CC BY 4.0
(credit and changes in `src/view3d/assets/instruments/CREDITS.md`). The
owner picked it as the look every horn should match. Blender bakes it into
the instrument frame with `apps/desktop/scripts/view3d-assets/export-horn.py`
and a per-horn config (scale, grip origin, material-to-part map, a decimate
ratio per detail), writing quantized JSON that `core/instruments/meshAsset.ts`
turns back into pieces. The trumpet keeps the procedural trumpet's mouthpiece
rim, (0, 0.018, −0.168), so the brass holds are unchanged. The mellophone,
baritone, euphonium and contra followed the same day: no licensed models
were found, so `build-horns.py` builds them in Blender from the trumpet's
valve block and mouthpiece, with tubing and bells to the reference photos'
proportions (oval wrap behind the valves, leadpipe across the top into an
inner loop, slides below, bell forward on the wrap's top line; the contra
the same layout, its valves low by the bell). Each keeps its procedural
predecessor's mouthpiece and left grip, so the holds are unchanged too. The
trombones stay procedural. Only meshes whose
license allows redistribution under AGPL, such as CC0 or CC BY with credit,
can ship here.

**Material (revised 2026-10-08).** The first pass painted horns through the
uniform shader: flat-shaded, no metalness, one color. It cannot read as
brass. Instruments are instead their own instanced mesh per look group,
driven by the same bake texture through `instancedSkinning`, with a smooth
metallic `MeshStandardMaterial` (metalness about 1, roughness about 0.25) in
the look's finish color, with chrome and black hardware by part. Metal needs
something to reflect, so the scene gains an environment map generated from
the sky gradient over a bright ground, applied scene-wide (the fidelity
brief's "sky-baked environment lighting"). One extra draw call per brass
group. The part ids below remain the mesh's own attribute for the material
to color by. Parts that aren't metal (the rifle's painted stock, silks,
rubber and plastic, drum heads: `MATTE_PARTS` in `instrumentGeometry.ts`)
draw non-metallic at roughness 0.65, because a fully metallic white stock
shows only reflections and reads as chrome (owner, 2026-10-09).

**Parts and finish.** The uniform shader paints parts by id; it knows ids 0
to 15 today. Instruments take new ids from 16 upward: 16 brass finish (gold
lacquer by default, silver lacquer as the alternative), 17 reserved, 18 chrome, 19 drum shell (section color), 20 drum head, 21 bar
(rosewood), 22 black hardware, 23 wood (clarinet), 24 speaker grille. The
finish choice per section (lacquer or silver) is a look option like the hat
today. Painting new ids needs a change in the vendored
`uniform-shader.js`: that change goes to om-pose first, then is copied back,
as the vendor README requires. Until then the app patches the shader's
`onBeforeCompile` chain locally, which is allowed and already how the window
extends the material.

**Bones.** Horns ride `DEF-hand.R`, with the left hand's grip placed by the
hold so the hand lands on the instrument. Drums ride `DEF-spine.002` (the
carrier is a chest plate: a drum and its carrier are one rigid piece).
Flutes and clarinets ride `DEF-hand.R`, saxes ride `DEF-spine.003` by the
strap.

## 5. Holds: arm poses per instrument

A hold is a fixed pose of the eight arm bones (`shoulder`, `upper_arm`,
`forearm`, `hand`, L and R) in the body's frame. Before baking, the window
replaces those bones' tracks in every clip with the hold's constant
rotations, so the legs march as recorded while the arms hold the instrument.
One bake per (height class, hold); marchers sharing a hold share the rows.
Bake rows scale with holds, so §8 measures the budget first.

The holds, from the owner's reference photos (kept outside the repo) and
notes. Two rules hold across every state: **the hands never leave their
playing grip** (right hand on the valve caps, left hand behind the valves;
woodwind hands on their stacks), and at carry **the mouthpiece sits at eye
level** (for the flutes, clarinets and soprano sax, the first key; see the
woodwind bullets). The states differ by where the bell
points and where the elbows go.

- **brass, horns up.** The bell is front: forward at face height, horizontal. Upper arms
  out to the sides near horizontal, forearms up and in: a triangle slightly
  wider than equilateral from shoulder to shoulder to the hands. Baritone
  and euphonium: the same with the bell above eye line.
- **brass, carry (set and down are the same hold; owner, 2026-10-08).**
  Instrument vertical in front of the torso, mouthpiece at eye level, bell
  toward the ground, elbows in.
- **brass, trail.** Instrument in the right hand only, bell backward, valve
  block perpendicular to the ground, arm straight down the side. Left arm
  straight down, closed fist, thumb on top, along the leg.
- **trombone, horns up.** As brass with the left hand at the bell brace and
  the right hand on the slide at first position.
- **contra, horns up and carry.** The loop lies along the left shoulder,
  its plane outside the head and its bottom tube resting on the shoulder,
  bell forward and a little above the head. The valves sit at chin height
  in front, left of center; the right hand reaches across to them and the
  left supports the bottom tube at the front. (Placed by reasoning from the
  instrument's layout, 2026-10-08; the owner checks it against a photo of a
  player.)
- **flute.** Horizontal to the player's right, lips at the head joint,
  angled a little forward and down. Both hands sit under the tube, wrists
  0.12 m below it so the stiff hands' fingertips just reach over the top
  onto the keys: the left hand 0.2 m
  along by the face, its forearm across the chest and the elbow in front;
  the right hand 0.42 m along with the elbow down and out. The lip plate
  faces back at the lips and the keys face forward. Carry (owner,
  2026-10-09): vertical in front of the face, head joint up, keys forward,
  the first key (0.2 m along) at eye level; the hands make a triangle, the
  left wrist 0.25 m along and the right 0.43 m, each a hand's length out and
  below, elbows out. Trail: vertical in the right fist at the side, head
  joint to the ground, held 0.5 m along; the arms are the brass trail's.
- **piccolo.** The flute's line with both hands brought in to the short
  body: the left 0.12 m along, the right 0.24 m. Carry: as the flute, the
  first key 0.101 m along at eye level, the hands at 0.14 and 0.24 m.
  Trail: as the flute, held 0.18 m along.
- **clarinet.** Down the center line, angled 28 degrees out. The hands wrap
  the joints from the sides, fingers across the front onto the holes: left
  hand on the upper joint, right hand on the lower, elbows a little out.
  The soprano sax shares this hold. Carry (owner, 2026-10-09): as the
  flute, vertical with the mouthpiece up and the first key at eye level
  (0.16 m along: the clarinet's throat Ab, the soprano's C), the hands at
  0.25 and 0.42 m. Trail: as the flute, mouthpiece to the ground, held
  0.5 m along.
- **bass clarinet.** A hold of its own: the body hangs 0.124 m toward the
  keys from the mouthpiece and runs a meter long. Up: nearly vertical,
  tipped 10 degrees out, the neck bringing the mouthpiece up into the lips;
  left hand on the upper cups, the right arm almost straight with its
  fingers angled down to the lower cups. Carry and trail: as the saxes; at
  carry the crook and bell sit low at the right side, at trail the keys
  face the ground so the crook and bell hang below the tube behind the
  leg.
- **sax.** On the strap in front of the body, as front-on photos of marching
  saxes show: the neck brings the body out in front of the mouth and the
  body runs straight down to the bow at the stomach (lower for the tenor and
  bari). The keys face forward and the bell sits on the player's left of the
  body tube, its flare leaning toward the keys so it opens forward and up.
  The hands wrap the body from the sides, fingers across the front: left
  hand on the upper stack, right hand on the lower, elbows out. Carry
  (owner, 2026-10-09): vertical just in front of the body, turned a quarter
  so the keys face the performer's right and the bell stands out in front
  of the body tube (the model's bell is on its +X = +Y × +Z; the other
  quarter turn would put it in the chest). The mouthpiece sits at eye
  level, 0.11 m left of center so the body tube hangs on the center line,
  0.21 m out. The hands stay where they play: left wrist on the upper
  stack from the left, right wrist on the lower stack from the right.
  Trail: level along front to back through the right fist, the mouthpiece
  forward, the keys facing out so the bow and bell hang below the tube with
  the flare leaning away from the leg; the arms are the brass trail's.
- **snare, tenors.** Drum at waist height on the carrier, its shell clear
  of the belly plate. Matched grip: the hands just behind the back rim
  (wider on the tenors), palms down, forearms forward and level, elbows
  relaxed at the sides. Each stick runs through the hand a third of the way
  up (the butt behind the fist) and angles in from each side: on the snare
  the tips meet near the center a little above the head without crossing;
  on the tenors each hand reaches over the shots to drum 1 or drum 2.
- **bass.** Drum sideways on the carrier, carried high. Upper arms down,
  forearms forward at the hips, the hands beside the heads below the
  center, the mallets angled up and forward to each head's center for
  every size from 18 to 32 in.
- **cymbals.** Pair held at chest height, plates vertical.
- **flag.** Up (present): the pole vertical in front of the body, right
  hand at the chest, left hand low on the pole, the silk overhead toward
  the performer's right (instrument +X under this hold; seen from the
  audience it flies to the camera's left). Carry and trail: the pole
  vertical at the right side, left arm down. Which side a guard presents
  the silk to is unconfirmed; flipping it is one sign in `guard.ts`.
- **swingFlag, doubleSwingFlag.** Down 45 in every state, ready to start
  swinging (owner, 2026-10-09): the arm straight, out and down at 45 degrees
  from the shoulder and a little forward, the pole running on along the arm
  from the fist, the silk trailing back and a little down so it clears the
  ground. One swing flag is in the right hand with the left arm relaxed at
  the side; a pair puts one in each hand, the left flag the right one's
  mirror image through the body's center plane.
- **rifle.** Always level, in every state (owner, 2026-10-09): across the
  front of the body at the waist, top up, the butt out past the right hip
  and the muzzle to the performer's left. Right hand at the wrist of the
  stock, left hand on the fore-end.
- **sabre.** Up (present): the blade vertical in front of the right
  shoulder. Carry and trail: at the right hip, blade up along the
  shoulder, left arm down.

**Which hold plays when.** The show stores no horn state. Default: brass,
woodwinds and battery play their _up_ hold while the band moves or marks
time, and brass drops to _carry_ during full-band holds at attention.
_Down_ and _trail_ exist as holds and are reachable in the settings panel
("Horn state: automatic, up, carry, down, trail") so they can be seen and
checked. A per-page horn state is a later schema change.

**Tuning.** Each hold is a table of eight quaternions tuned by eye against
the photos, with the instrument attached, in the web preview in a real
browser. The hold table is data, so a second pass by a person who marches
is a number change.

## 6. Front ensemble and speakers: props

The owner's call (2026-10-08): the front ensemble and speakers are geometry
in the 3D View that function as props, not dots.

**Models** (ground-standing, not skinned):

- 4.3 octave marimba, 5 octave marimba, 3 octave vibraphone, 3.5 octave
  xylophone, each on its field frame with wheels, bars in rosewood or
  synthetic amber, resonators in black or gold.
- Synthesizer on a keyboard stand with a rack; aux percussion rack with a
  concert bass drum, suspended cymbals, a chime rack.
- Speaker stacks: a mid-high cabinet over a subwoofer, in black, on each
  side of the pit, with a mixer position behind.

**Placement.** Props need positions the show file doesn't have. Proposal:
a `view3d_props` table (`id`, `kind`, `x`, `y` in field pixels like
`marcher_pages`, `rotation_degrees`, `label`), edited in the 3D window's
panel with "Add prop", drag on the field and a rotation handle, and undo
through the existing history tables. The window already saves the venue
choice in the show the same way (`view3dVenue.ts`), so the pattern exists.
This is a schema and file-format change: it goes into ADR 0002 as an
amendment before any code, per the project rules.

**Default layout** so a show looks right before anyone places props: on
first open of a show with pit marchers, seed one prop per pit marcher at the
marcher's first-page dot (Marimba, Vibraphone, Xylophone, Synthesizer, Aux
Percussion each map to a model), facing the audience, and a speaker stack
on each end of that row, 2 m beyond the outer prop. The seed is a one-time
write the user can edit or delete; it never follows the dots afterward.

Pit marchers themselves keep marching bodies with no instrument, standing
behind their prop when their dot is there, which is the usual case.

## 7. Scope and order

Four pull requests into `3d-async`, each with screenshots from a real
browser:

1. **Brass and holds.** The hold pipeline (bake with replaced arm tracks,
   settings row), part ids and finish paint, and the seven brass models.
   Replaces the three placeholders.
2. **Woodwinds.** Eight models, three holds.
3. **Battery.** Carriers, five drums, cymbals, the bass size spread.
4. **Front ensemble props.** ADR amendment and migration first, then the
   models, the props panel and the seed layout.

## 8. Risks and what to measure first

- **Bake texture rows.** Holds multiply rows. Measure the texture at 5
  height classes × (today's clip count) × N holds against the float texture
  limit on the owner's machine and on a software renderer before fixing N.
  Fallback: bake only the holds a show uses (the window already bakes only
  the clips a show uses), and merge the low tier to one hold.
- **Arm tracks and the halt.** Replacing arm tracks removes the arm swing
  om-pose recorded for the step-off and halt. Instruments don't swing, so
  this is correct, but the clips' hands may clip the body at the halt;
  check the carry hold at attention.
- **Shader part ids.** Adding ids locally diverges from om-pose until the
  change lands there. Keep the patch in one file and list it in the vendor
  README's "Local changes" column.
- **Triangle budget.** A 300-piece band with instruments and 300 bodies is
  the P5.1 perf scene plus about 150 k triangles. Re-run that scene's
  frame-time check after PR 1.

## 9. Open questions for the owner

1. Answered: gold lacquer by default, silver lacquer per section.
2. Answered: always up; the panel exposes the others for testing.
3. Props: the table in §6 is the real fix. Is the ADR amendment acceptable
   now, or should PR 4 start with the seed layout only and no persistence?
4. Answered: carry, set and down are one hold with the bell to the ground.
   Horns up is the bell front.
