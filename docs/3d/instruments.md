# Instruments, holds and the front ensemble: design

<!-- cspell:words Zaber mellophone mellophones sousaphone sousaphones contras leadpipe Mylar lathed swept subwoofer spocks ligature -->

Status: reviewed by the owner 2026-10-08; the front ensemble design (§6)
settled 2026-11-11. The brass, woodwind and battery work is built; the front
ensemble models are built but the app doesn't load them yet.

How 3D View marchers come to carry instruments that read as the real thing,
hold them the way a corps does, and how the front ensemble and its speakers
appear on the field. Adds to [ADR 0010](../adr/0010-3d-view.md) D-7; §6's
`items.model` column is that ADR's amendment of 2026-11-11.

## 1. Where we are

- om-pose's body meshes carry three placeholder instruments (trumpet,
  mellophone, baritone; 120 triangles each) skinned to the right hand, and
  every clip holds one "horn up" arm pose. Every other section carries
  nothing. The bodies and clips are vendored as read-only
  (`src/view3d/render/README.md`).
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

| Section       | Model                                                     | As built (rim to bell, bell) | Open length | Hold       |
| ------------- | --------------------------------------------------------- | ---------------------------- | ----------- | ---------- |
| Trumpet       | B♭ trumpet, 3 piston valves                               | 0.56, bell 0.125             | 1.48        | brass      |
| Mellophone    | marching mellophone in F, front bell                      | 0.48, bell 0.264             | 1.97        | brass      |
| Baritone      | marching baritone, front bell                             | 0.585, bell 0.254            | 2.9         | brass      |
| Euphonium     | marching euphonium, front bell                            | 0.61, bell 0.28              | 2.9         | brass      |
| Trombone      | tenor trombone, slide                                     | 1.18, bell 0.21              | 2.75        | trombone   |
| Bass Trombone | larger bell and bore, one rotor with an F attachment      | 1.17, bell 0.24              | 2.75        | trombone   |
| Tuba          | marching tuba (contra): the loop on the left shoulder, or | 1.07, bell 0.50              | 5.6         | contra     |
|               | a sousaphone: the hoop round the body, the bell overhead  | hoop 0.9, bell 0.66          | 5.6         | sousaphone |

The Tuba section carries the marching tuba unless the show's venue settings
say `tuba: "sousaphone"` (ADR 0010, amendment 2026-11-09; `tubaCarry` in
`catalog.ts`).

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
| Bari Sax      | baritone sax on a harness | height 1.0, bell 0.17  | bariSax  |

### Battery (`FAMILIES.Battery`)

| Section   | Model                                     | Working dimensions                             | Hold    |
| --------- | ----------------------------------------- | ---------------------------------------------- | ------- |
| Snare     | marching snare on a carrier               | 14 in × 12 in shell                            | snare   |
| Tenors    | sixes on a carrier                        | 10, 12, 13, 14 in drums, 6 and 8 in shots      | tenors  |
| Bass Drum | marching bass on a carrier, sized per dot | 14 to 32 in diameter in 2 in steps, 14 in deep | bass    |
| Cymbals   | pair of 18 in crash cymbals               | 18 in                                          | cymbals |
| Flub Drum | the bass model, sized with the bass line  |                                                | bass    |

Bass drum size: automatic, never picked (owner, 2026-11-15: the drill
writer won't touch it), so the show stores no size. The sizes are what
Yamaha (MB-8300) and Pearl (Championship Maple) sell: 14 to 32 in, in 2 in
steps. The marchers whose section carries the bass model (Bass Drum and Flub
Drum), in id order, spread evenly from the line's smallest size up to 32 in,
smallest first. Lines of up to five start at 18 in, a line of six at 16 in
and longer lines at 14 in, so every drum gets its own size up to ten; a
lone drum gets 26 in (`bassSizesFor`, `bassOptions` in `looks.ts`). The drums ride high, as in the
owner's reference photo: every size keeps its back at the carrier, just in
front of the belly plate, so bigger drums reach further forward, and each
hangs where its head's center is one mallet length up and forward from the
hands at the hips, its top no higher than 1.6 m. Centers land between 1.2
and 1.4 m. Where that cap brings a center closer than a mallet's length,
the mallet runs back through the hand with its butt behind the fist. The
arms are one pose for every size; a hold per size would refine the small
drums.

**Drum hardware (owner, 2026-11-15: match Yamaha's marching drums).** The
drums follow current high-tension marching drums, after Yamaha's MS-9400
snares, MQ-8300 multi-toms and MB-8300 basses, with no maker's badge or
logo. Shells are paint under a glossy clear coat in the section's color, not
metal; heads are smooth white. The snare's shell floats inside satin
aluminum hardware: a tall top hoop over a tension frame, ten long tube lugs
down to the bottom hoop, four feet, the strainer at the player's right and a
mount bar at the back for the J-bars. Tenor shells are open below and cut
away toward the player (about half depth on the near side), under tall
chrome hoops with short lug casings. Bass drums have wood hoops in the
shell's color, claw hooks and long tension rods to a center lug at each
position (8 lugs up to 20 in, 10 to 26 in, 12 above), with a thin mount at
the back. Cymbals are brilliant bronze in either brass finish, with the
lathing's tone grooves and a leather pad on each bell. Each pad rests on its
palm, and no hand passes through its cymbal on any body
(`cymbalGrip.test.ts`); the strap runs inside the fist, so it isn't drawn.
Bolt heads and lug casings are drawn at high detail only.

**Carriers.** Snare, tenors and bass hang from one plate carrier, after
current aluminum vest carriers: flat satin bars from a yoke on the chest up
over the shoulders (padded where they sit) and down the back, a plate down
the sternum onto a belly plate, a bar across the upper back, and J-bars
from the belly plate to the drum. Its clearances come from the seven body
meshes: shoulder tops at 1.46 m, chests reaching z 0.17, upper backs
z −0.19.

**Tenor layout.** Sixes, after the owner's reference photo of a Dynasty
six-drum set. The two shots (6 and 8 in) sit in the middle nearest the
player, just in front of the carrier bracket. Drums 1 (10 in) and 2 (12 in)
sit in front of them, and drums 3 (13 in) and 4 (14 in) wrap round at the
player's left and right. The shells nearly touch, every head is level, and
the set stays under 1.1 m wide. The left hand covers drum 1 and the right
drum 2.

### Guard, Other, Pit

| Model             | What it is                                                                                                   | Working dimensions                     | Hold            |
| ----------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------- | --------------- |
| 6 ft flag         | chrome pole, rubber end caps, tape, a silk in the section's color                                            | pole 1.83, silk 36 × 54 in             | flag            |
| Swing flag        | held in one fist at the butt, a bare tab above the hand, the silk sleeved along the rest                     | pole 52 in (tab 0.14), silk 44 × 66 in | swingFlag       |
| Double swing flag | two swing flags, one in each hand, mirrored                                                                  | as the swing flag                      | doubleSwingFlag |
| Rifle             | white spinning rifle (an Ultra Spin): flat-sided stock, wrist dip, chrome bolt plate, black sling drawn taut | 0.91 long, butt 0.12 deep              | rifle           |
| Sabre             | spinning sabre (a Zaber): broad curved chrome blade, rubber tip, chrome cup and D-bow, finger-grooved grip   | blade 0.8 (85 mm of curve), grip 0.12  | sabre           |

Today the Color Guard and Flag sections carry the 6 ft flag and the Rifle
section the rifle. The swing flag, the double swing flag and the sabre are
built and held but no section maps to them: they wait for a per-section
choice (owner, 2026-10-09), which lands in the catalog's `Carry.model` like
the sousaphone. Drum Major and Soloist carry nothing. Pit marchers carry
nothing: their instruments are equipment items (§6).

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

**Brass rebuilt in code (2026-11-09).** The owner asked for the winds to be
greatly improved against the reference pages. Every brass horn is now built
in code from `core/instruments/hornKit.ts`: tubing bent through true arcs
(`bentPath`, `pipe`), bells lathed from a horn flare (`bellFlare`), piston
valves with caps, stems and pearl buttons, slides with their sleeves,
braces, water keys and a mouthpiece. The third-party trumpet mesh and the
Blender scripts that derived four horns from it are gone, with their
credits; nothing third-party ships. One file per layout:
`marchingBrass.ts` (the oval-wrap builder and the mellophone),
`lowBrass.ts` (baritone, euphonium), `trumpet.ts`, `trombones.ts`,
`contra.ts`, `sousaphone.ts`. Three rules hold for all of them, and
`__test__/brass.test.ts` enforces the second and third:

1. **Laid out over the photo.** Each horn is drawn orthographically at the
   reference photo's scale and compared with it, tube by tube, then checked
   from several other angles for parts that float or end in air.
2. **One air path, held to pitch.** Mouthpiece, leadpipe, valve block,
   wrap, bell: one centerline, within a few percent of the open length for
   the horn's key (`BRASS_OPEN_LENGTH`).
3. **Valve loops by interval, not by eye.** Each valve has exactly one loop,
   leaving and returning to its own casing, and its length is solved from
   `VALVE_SLIDE_RATIO`: the second valve adds a half step (5.9 % of the open
   length), the first a whole step (12.2 %), the third a step and a half
   (18.9 %). The bass trombone's F attachment adds a fourth (33.5 %).

A bell is not a cone: it stays slim through its throat and opens fast in its
last few centimeters, the rim turned almost flat (owner, 2026-11-09).
`bellFlare` is that curve, fixed by the bell's two ends; read the rim's
position at its plane, which in a product photo taken a little from the
front is the center of the rim's ellipse, not its far edge.

Known gaps: tubing hidden behind a valve block in the photos is a
consistent reading, not a trace; the contra's mouthpiece sits where its
hold needs it rather than where the photo has it; the sousaphone's valve
loops are narrower than the real horn's and its neck is probably long; the
bell-front horns' bells are level where the photos tilt them a few degrees.

**Woodwinds rebuilt (2026-11-09).** The woodwinds are rebuilt the same way,
against the reference pages' angled views and front-on photos of marching
players: `woodwindKit.ts` holds the shared parts (cups on chimneys, hinge
rods with posts, key guards, mouthpieces with reed and ligature, flared
tubes), `woodwinds.ts` the flute, piccolo and clarinets, `saxophones.ts`
the saxophones. The curved saxes have a true U bow, a bell in front of the
body tube that leans forward as it
flares to a rolled rim with its low cups under guards, a bell-to-body brace
and a neck with its octave key; the bari has its top loop. The flute's lip
plate lines up with its keys; the bass clarinet has a swan-neck crook and a
forward-leaning bell. Key work is simplified: it reads at the 30-yard line,
less so close up.

**Material (revised 2026-11-09).** Instruments are their own instanced mesh
per look group, driven by the same bake texture, in one
`MeshPhysicalMaterial` whose surface is set per vertex (`surfaceOf` in
`instrumentGeometry.ts`, the `_surface` attribute): lacquered brass is
polished metal (roughness 0.2) under a glossy clear coat, which gives it a
second, sharper highlight; silver plate is bare and sharper (0.11); nickel
trim is a mirror (0.1); the parts that aren't metal (`MATTE_PARTS`: the
rifle's painted stock, silks, rubber and plastic, drum heads) draw
non-metallic at roughness 0.65, because a fully metallic white stock shows
only reflections and reads as chrome (owner, 2026-10-09). A metal's color is
its reflectance, paler than the color the eye names, and most of what a lit
horn shows is what it reflects. So the environment map (`envMap.ts`) holds
more than a sky gradient: a dark band of stands round the horizon, a sun
many times brighter than white, clouds, the light towers at night and a
hall's ceiling panels, and instruments take it `ENVIRONMENT_BOOST` times as
brightly as the turf and uniforms do. One extra draw call per brass group.

**Silks** are not instrument pieces (C4.4, props-spec.md section 7). A flag
model lists its silks as `SilkSpec`s (size, frame in the instrument frame,
bone, mirror); `silkSet.ts` draws every silk in the band in one instanced
cloth mesh per detail tier (24 × 16 cells near, 12 × 8 far and at `low`):
metalness 0, roughness 0.8, double-sided, no shadows. A silk is plain in
the section's 2D fill when it has one; otherwise it takes the guard
preset's carry color and silk pattern (D-18), which the fragment shader
samples at the grid's (u, v) from one texture holding every preset's
pattern (`silkPatternTexture`). The vertex shader waves each silk in its own frame
before skinning (`silkWave.ts`, the silk prototype's variant B: it hangs
at rest and billows on the move), from per-instance inputs written by
count: the show clock, a phase seed, ground speed, distance covered and
turn rate. Only the swing flag's sleeve stays a silk-colored piece.
A silk's Cut shapes the grid before the wave: each column runs from the
outline's top to its bottom at that point of the fly (a depth field
sampled 17 times along the fly, `silkCutProfile`), so the swing silks take
the catalog's flat-bottomed swing Cut and the 6 ft flag stays a rectangle.

**Parts and finish.** The uniform shader paints parts by id; it knows ids 0
to 15 today. Instruments take new ids from 16 upward: 16 brass finish (gold
lacquer by default, silver plate as the alternative), 17 reserved, 18 chrome, 19 drum shell (section color, paint under clear coat), 20 drum
head, 21 bar (rosewood), 22 black hardware, 23 wood (clarinet), 24 speaker
grille or flag silk, 25 satin aluminum (drum hoops, lugs, carriers), 26
cymbal bronze. The
finish (lacquer or silver) is the show's choice for its whole brass line
(venue settings `brassFinish`, ADR 0010 amendment 2026-11-09); woodwinds
keep the finish they are made in (`finishFor`). Painting new ids needs a change in the vendored
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
playing grip** (right hand over the valve buttons, left hand on the valve
casings;
woodwind hands on their stacks), and at carry **the mouthpiece sits at eye
level** (for the flutes, clarinets and soprano sax, the first key; see the
woodwind bullets). The states differ by where the bell
points and where the elbows go.

- **Every hold, the arms' turn (issue #980, 2026-11-16).** A hold gives
  each arm an elbow, a wrist and the way the fingers point; how the arm
  turns about its own length follows one of three rules (`poseArm` in
  `armPose.ts`). The hand bone's +Y is the fingers, +Z the thumb's side and
  ±X its two faces: the palm is −X on the right hand and +X on the left,
  because the bind pose mirrors the arms by flipping X. The body's hands are
  fists with no fingers or thumb, so the turn shows only in the fist's shape;
  the hold gallery draws the palms yellow to make it plain.
  - No rule given: every bone's thumb side turns toward the bend plane's
    normal, (shoulder to elbow) × (elbow to wrist). This is the first
    rule, and the winds and the guard, tuned by eye on it, keep it. It is
    the same formula on both arms, so on mirrored targets the left arm
    lands half a turn from the right's mirror image. With the upper arm
    down and the forearm forward, as on the drums, it turned the right
    palm up and the left palm down.
  - `halfTurn`: half a turn on from that. On the left arm of a mirrored
    hold it gives the right arm's mirror image (the cymbals).
  - `palm`: the way the palm faces. The hand turns to it, the forearm
    half as far (a real forearm twists along its length), and the upper
    arm whichever way round leaves the wrist the smaller twist, unless
    the hold says which (`upperArm`: its thumb side in toward the body or
    out; the snare's left arm). The snare, tenors and bass use it.
- **Every hold, the head (owner, 2026-11-10).** The head is up 15 degrees
  (`HEAD_UP`), and a hold may lean or turn it as well. The neck and head ride
  the Horn/Equipment channel with the arms, so the hold sets them. Lips
  are at (0, 1.588, 0.088) with the head at bind (`LIPS`), and the hold's
  head turn carries them. Brass rims sit at the turned lips. The reed
  woodwinds' mouthpiece tips sit 1 cm inside them, and the flutes' lip
  plates sit just under them.
- **brass, horns up (owner, 2026-11-10).** Trumpet, mellophone, baritone
  and euphonium: the horn 15 degrees above level, bell forward, the
  mouthpiece's rim at the lips. The right hand comes over the valves from the
  performer's right, its knuckles beside the buttons and the fingers across
  them; the left hand holds the valve casings from the horn's left side.
  Each horn's hold is built from its own geometry (`valvedUp` in
  `holds.ts`: the rim and each valve's casing and button), so a rebuilt
  horn keeps its hands on its valves. Elbows out, each solved from the
  arm's bone lengths.
- **brass, carry (set and down are the same hold; owner, 2026-10-08).**
  Instrument vertical in front of the torso, mouthpiece at eye level, bell
  toward the ground, elbows in.
- **brass, trail.** Instrument in the right hand only, bell backward, valve
  block perpendicular to the ground, arm straight down the side. Left arm
  straight down, closed fist, thumb on top, along the leg.
- **trombone, horns up (owner, 2026-11-10).** 15 degrees above level with
  the rim at the lips; the right hand on the slide at first position, the
  left on the bell section by the mouthpiece.
- **contra, horns up and carry (owner, 2026-11-10; photos).** 15 degrees
  above level with the rim at the lips. The rim sits 0.12 m behind the
  valves, so they stand in front of the face at forehead height. The loop
  lies back over the left shoulder, its plane outside the head. The right
  hand comes across from the right, fingers across and down onto the
  pistons, the elbow up toward shoulder height. The left hand holds the
  front bow, the tube coming down the front of the loops on the horn's left
  side. The head is up 15 degrees, leaned 12 toward the right shoulder and
  turned 18 toward the mouthpiece (`CONTRA_HEAD`).
- **sousaphone (owner, 2026-11-10).** Its players wear a beret, not the
  shako and plume: a black beret pulled down toward the right, built with
  the horn and riding the head bone (`beret.ts`). The bell rides low over
  the beret, its axis at 1.96 m: its center about 0.34 m above the eyes,
  its lower rim across the brow from the front, and its rim plane about
  0.18 m in front of the nose (side-on photos, 2026-11-10). The left hand
  holds the mouthpiece in place at the lips.
- **Woodwind hands (wrist study, 2026-11-10).** A stiff mitt reads as a hand
  only when it carries straight on from the forearm. So every woodwind hand
  bends at most 30 degrees at the wrist, toward where the fingers would
  curl, and the tube lies across the knuckles, 0.1 m up the fingers. The
  targets are in `WOODWIND_HANDS`. The flutes' right forearm rises nearly
  straight from an elbow at the side, and the left crosses the chest from
  an elbow low in front. The clarinets' and saxes' elbows hang at the sides,
  and their forearms come forward and in. These supersede the hand
  positions in the bullets below.
- **Percussion arms (drum corps photos, 2026-11-10).** The upper arms hang
  10 to 20 degrees off vertical against the ribs and the forearms reach
  forward. The snare rides 0.45 m out on its carrier, the tenor hands sit
  about shoulder width apart, and the cymbal plates are held at the chest
  0.26 m apart.
- **flute.** Level and parallel to the shoulders, running straight out to
  the player's right from the lips (owner, 2026-11-10). Up (photos,
  2026-11-10): each wrist just under and behind the tube, the fingers
  draped over it pointing forward. The left elbow is low and out to the
  left, the forearm rising to the hand. Before that change, both hands sit under the tube, wrists
  0.12 m below it so the stiff hands' fingertips just reach over the top
  onto the keys: the left hand 0.2 m
  along by the face, its forearm across the chest and the elbow in front;
  the right hand 0.42 m along with the elbow down and out. As on a real
  flute the embouchure hole lines up with the keys, and both face up,
  tipped 14 degrees back toward the lips; the tube sits just under the
  lower lip, its lip plate at the lips (owner, 2026-11-09). Carry (owner,
  2026-10-09): vertical in front of the face, head joint up, keys forward,
  the first key (0.2 m along) at eye level; the hands make a triangle, the
  left wrist 0.25 m along and the right 0.43 m, each a hand's length out and
  below, elbows out. Trail: vertical in the right fist at the side, head
  joint to the ground, held 0.5 m along; the arms are the brass trail's.
- **piccolo.** The flute's line, level and parallel to the shoulders, with
  both hands brought in to the short body: the left 0.12 m along, the right 0.24 m. Carry: as the flute, the
  first key 0.101 m along at eye level, the hands at 0.14 and 0.24 m.
  Trail: as the flute, held 0.18 m along.
- **clarinet.** Down the center line, angled 37 degrees out (photos and The
  Instrumentalist, 2026-11-10; it was 28), with the elbows down and in near
  the body. The hands wrap
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
- **sax (alto and tenor).** Up (owner, 2026-11-14, replacing the
  2026-11-09 turn and the 2026-11-10 kick): the sax stands straight up and
  down on the strap in front of the body, the mouthpiece straight back into
  the mouth and the bell straight away from the player, directly in front
  of the body tube, so neck, body and bell lie in one front-to-back plane.
  The model turns its body 90 degrees about its own axis under the neck
  (`SAX_BODY_TURN` in `saxophones.ts`) to line them up, which leaves the
  pearls facing the performer's right. The hands come from the model's own
  stacks (`saxHands` in `holds.ts`; the alto and tenor share a hold, so
  their hands go between the two saxes' stacks), in the real grip: the
  thumbs on the player's side of the tube, the palms on its flanks and the
  fingers curled round onto the pearls, so each stiff mitt points along the
  curled fingers' chord, bent toward the palm at the wrist by up to 30
  degrees (`SAX_WRIST_BEND`). The elbows hang under the shoulders. Carry: the
  playing orientation raised so the mouthpiece is at eye level, on the
  center line 0.13 m out; the hands stay on the stacks. Trail: level along
  front to back through the right fist, the mouthpiece forward, the bow and
  bell hanging straight down below the body tube, clear of the leg; the
  arms are the brass trail's.
- **bari sax.** A hold of its own, so its hands land on its own, longer
  stacks. The model follows the same rule as the alto and tenor: the
  mouthpiece comes straight back to the player and the bell faces straight
  away, with the top loop, crook and neck receiver on the near side of the
  body in the same plane. Up (owner, 2026-11-14, after trying a carry slung
  sideways down the body): straight up and down like the alto and tenor,
  the long body hanging in front of the performer, the hands in the same
  real grip on its stacks. Carry: as the
  alto's, the hands on the bari's upper stacks so they reach at eye level.
  Trail: as the alto's, the tube a little further out for the wide bell.
- **snare, tenors.** Elbows at the sides, not winged (photos, 2026-11-10).
  Drum at waist height on the carrier, its shell clear of the belly plate.
  Matched grip, palms down. Each stick runs through the hand a third of
  the way up (the butt behind the fist) and angles in from each side. On
  the tenors the hands sit just behind the back rim, forearms forward and
  level, each reaching over the shots to drum 1 or drum 2, and the two
  hands are mirror images. The snare's arms follow the owner's photos of
  drum corps snare lines (below).
- **snare (owner, 2026-11-16).** After the owner's two photos of drum
  corps snare lines: one in uniform seen from the front and a little to the
  players' left, one rehearsing seen from the front. Both hands sit behind
  the back rim, 5 to 10 cm above the head and just outside its sides (0.2 m
  either side of the middle), and the two sticks angle in about 45 degrees
  from straight ahead to meet over the middle of the head, a centimeter or
  two above it, without crossing. The drum stays level.
  - The right hand is matched grip: palm down, the elbow a little out from
    the ribs (12 cm outside the shoulder), the forearm forward, turned in
    about 20 degrees and 30 degrees down. The wrist is straight (owner,
    2026-11-17): the hand carries on from the forearm, its top sloped a
    little down. The stick doesn't run along the fingers: it leaves the
    hand between the thumb and first finger, turned about 25 degrees in
    from them (45 degrees in from straight ahead) and tipped down to the
    head. Pointing the hand along the stick instead bent the wrist about
    40 degrees, in and up. The hold gives the stick's way as the `stick`
    of its grip in `battery()`.
  - The left hand is traditional grip. The upper arm hangs close to the
    ribs, the elbow tucked in under the shoulder (within 3 cm of it, closer
    in than the right elbow), and the forearm runs straight forward, about
    30 degrees down. The hand is turned thumb up, its palm in toward the
    other hand and about 25 degrees up. The stick rests on top of the hand
    in the web of the thumb, 11 cm from its butt, and crosses the palm at
    about 30 degrees, from the thumb's side to the little finger's, so it
    comes in from the side lying fairly flat (under 20 degrees down) and
    its butt runs back up behind the thumb, outside the forearm and higher
    than the right stick's.
  - The left upper arm turns its thumb side in toward the body, as the
    right one does (`upperArm: "in"`). With the thumb on top the two ways
    round are nearly even, and the way with the smaller twist pinched the
    shoulder.
  - `TRADITIONAL` in `holds.ts` holds the left hand's numbers: where the
    web of the thumb is, the way the hand and palm face, and the way the
    elbow goes. The stick's tip is the right stick's, mirrored.
    `snareGrip.test.ts` checks on every body that both hands clear the drum
    and the belly plate and that the butt clears the forearm.
  - References: the owner's photos (kept outside the repo); on Wikimedia
    Commons, "Crossmen marching band drum line (3688891856).jpg" (a drum
    corps snare line, level drums), "Regular grip left hand 01.jpg" and
    "02" (the stick across the open left hand) and "Marching snares.jpg"
    (a snare line playing), the matched grip photo by the author of the left hand photos and "German grip
    right hand 01.jpg" (the stick across the right palm, the wrist
    straight); a Bluecoats snare line rehearsing (the owner's photo); and
    the grip pages of Yamaha's educator guide
    and the Iowa and Kansas State snare handbooks (the fulcrum in the web
    of the thumb about 4 in from the butt, the hand held out as for a
    handshake and turned outward).
- **bass.** Drum sideways on the carrier, carried high: its center about the
  shoulders, the biggest drums' tops at the top of the head (no higher than
  1.85 m). The hands are at the lower ribs (1.12 m) with steep mallets
  (photos, 2026-11-10). Upper arms down,
  forearms forward at the hips, the hands beside the heads below the
  center, the mallets angled up and forward to each head's center for
  every size from 18 to 32 in. Matched grip, the two hands mirror images:
  the palms face in toward the heads, thumbs on top.
- **cymbals.** Pair held at chest height, plates vertical, elbows closer to
  the body (photos, 2026-11-10). The left arm is the right's mirror image
  (owner, 2026-11-16), so the plates sit evenly either side of the center.
  Photos show two other positions, low at the
  sides while marching and a diagonal "gumption" to play. Which one to use
  is the owner's call.
- **flag.** Up (present; instruction pages and parade photos, 2026-11-10):
  the left hand covers the butt at the belly button, and the right hand
  grips the pole 0.6 m up it at about nose height. The pole leans 25
  degrees forward and out to the right (`FLAG_PRESENT`). Before that
  change: the pole vertical in front of the body, right hand at the chest,
  left hand low on the pole, the silk overhead toward
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

**Which hold plays when.** Horn/Equipment cues decide (performer-behavior.md
sections 3 and 7). Without one, brass, woodwinds and battery play their _up_
hold. The 3D window's settings panel has a Horn state preview (Follow cues,
up, carry, trail) that holds every carrier in one hold for the whole show
so the poses can be checked; it is never saved and Follow cues is the
start (section 7.5).

**Tuning.** Each hold is a table of eight quaternions tuned by eye against
the photos, with the instrument attached, in the web preview in a real
browser. The hold table is data, so a second pass by a person who marches
is a number change.

## 6. Front ensemble and speakers: equipment items

The owner's design (2026-11-11). It replaces the earlier `view3d_props`
proposal, which is retired. The front ensemble is mainly for the 3D View;
2D draws each piece as its model seen from above, so writers see how much space the pit takes. Timeline-mode
shows only, like every item (ADR 0010 D-9).

**Models.** Built and CC0: 44 models, each with a `-low` version, in
`src/view3d/assets/pit/`, generated by
`apps/desktop/scripts/view3d-assets/pit/build.py`. Mallet keyboards (marimba,
vibraphone, xylophone, glockenspiel), synths, drum sets, aux racks, timpani,
chimes, gongs, congas, bongos, concert bass drums, a trap table, speakers,
mixer carts and podiums. Amps are built but not offered yet.

**Equipment is items.** Pit instruments, speakers, the mixer and podiums are
items (`marchers.type = 'item'`, `items.kind = 'equipment'`), stored per show.
Each names its built-in model in a new nullable `items.model` column (a model
id such as `pit/marimba-5.0`; NULL draws a block, as props do today). This is
the ADR 0010 amendment of 2026-11-11; it is separate from the future Library
reference. The model is picked as family, then variant. Default variants:
marimba 4.3 rosewood, vibraphone 3.0 silver, synth 88-key single, drum set
plain, speaker tall, mixer cart, podium low.

**Locked items.** Any item can be locked. A locked item has one position for
the whole show and no moves: dragging it on any page moves it on every page.
Lasso and select-all skip it, so selecting marchers never picks up the pit;
clicking it still selects it, and 2D shows a lock icon on a locked prop (not on
equipment, which is locked as a rule). Unlocking gives it
moves again. Equipment (pit instruments, podiums, speakers, the mixer,
including everything a preset creates) is created locked; props are created
unlocked. The flag is a boolean `items.locked` column, added in the same
migration as `items.model`. Props that are on the field for only some pages
are the placement work in `props-spec.md` §4, not part of this.

Equipment is edited with the normal prop editing, but not in the Props panel
(owner, 2026-11-15): designers don't think of the pit or the podiums as props,
since they don't move and aren't staging. A pit is set up about once per show,
so it lives in the Marchers panel: a Front ensemble row at the top says what the
show has and opens the front ensemble view in place. That view lists the
equipment and podiums in the show apart, each with its edit view; its header
has Add, which opens the catalog as its own view (every model as a picture, by
group: keyboards, percussion, audio and podiums, with a search box), and the
Small, Medium and Large presets behind one button, "Start from a preset" or,
once there is a pit, "Reset to preset". Opening the view and opening Add are
registered actions. The Props panel lists only props. Storage is unchanged:
equipment stays `items` rows with `kind = 'equipment'`. A new show can start
with a pit: the new-show dialog has a Front ensemble step after Performers
(None, Small, Medium, Large). Equipment never takes part in
cues: items are never cue targets (ADR 0004, amendment of 2026-10-11).

**Players are marchers.** Pit players are ordinary marchers in pit sections
and can move anywhere; battery and wind players can visit an instrument.
Nothing stores who plays what: whoever's dot is on an instrument's playing
spot (within about 1 ft) plays it, snapping to face it in a playing pose.
Players stand on the field side of the instrument, facing the audience. Pit-section players carry nothing;
a visiting player keeps their own carried instrument in v1 (instrument swaps
are their own future design).

**Sections.** The Pit family gains Glockenspiel, Drum Set, Rack and Timpani
beside Marimba, Vibraphone, Xylophone, Aux Percussion and Synthesizer. Aux
Percussion has no instrument of its own: chimes, gong, congas, bongos,
concert bass drum and trap table stay equipment that aux players walk to.

**Presets.**

|                          | Small     | Medium    | Large     |
| ------------------------ | --------- | --------- | --------- |
| Marimba                  | 2         | 4         | 6         |
| Vibraphone               | 2         | 3         | 4         |
| Xylophone / Glockenspiel | 0         | 1 + 1     | 1 + 1     |
| Rack                     | 1         | 1         | 2         |
| Drum set                 | 0         | 1         | 1         |
| Synth                    | 1         | 1         | 2         |
| Speakers                 | 2         | 4         | 6         |
| Podium                   | on the 50 | on the 50 | on the 50 |

Every size adds one mixer, behind the pit (audience side), slightly off
center. Marimbas are 4.3 octaves in Small and Medium and 4.6 in Large, never
the 5.0; vibes are always the 3.0 (owner, 2026-11-15).

- Two rows. The field-side row (the back line) has the xylophone and
  glockenspiel on either side of the drum set at center, and the rack and
  synth at the outer edges. The audience-side row has the marimbas in the center
  with vibes on each side.
- The field-side row starts 3 ft in front of the front sideline. The
  audience-side row starts 3 ft past the deepest item in the field-side row,
  which is the drum set whenever there is one (about 7 ft deep), so the
  keyboards sit about 11.6 ft out at Medium and Large.
- The speakers stand on the audience-side row's line, one per side on
  consecutive 5-yard lines, starting at the first yard line past the end of
  the pit (for Medium, the 40s and 35s). They never overlap the pit.
- The podium sits on the 50, 3 ft past the audience-side row: the drum
  major is always the closest performer to the audience, facing the field.
  At Medium and Large this puts the podium on the edge of the track in the
  `hs` venue; that is accepted.
- Presets ignore the venue; in a tight venue such as the gym, fix it by
  hand.
- "Also add performers" is checked by default: one performer per instrument
  in its section, plus a Drum Major standing on the podium, skipping
  performers that already exist.
- Re-applying a preset replaces only the items the previous preset created.
  The previous preset's players (standing on its instruments' playing spots or
  its podium) move onto the new spots for their section, and those whose
  instruments the new preset doesn't have are removed with them (owner,
  2026-11-15). Anyone else stays put. Applying is one undo step.

**Podium.** The drum major stands on the podium at a standing height from
the model's metadata, not through `surface_type`: the items check
constraint keeps equipment without one. The `hs` and `bighs` venues draw
their own podium box; it hides when the show has a podium item.

A performer on a podium always faces the band, across the field: on a podium
in front of the field (audience side) they face the back sideline, and on a
podium behind the back sideline they face the audience. The drill's facing
doesn't change this while they stand on it. Podiums can stand at the back of
the field too; a podium placed on the back half is turned to face the field.

**2D.** Each piece is drawn as its model seen from straight above (owner
pick 2026-11-15, "outline + details"): its silhouette, faintly filled, at
every zoom, and once zoomed in past about 24 px per meter the edges seen from
above (bars, drum heads, steps) and a small facing mark. The drawings are
generated from the GLBs into `assets/pit/plan.json`
(`scripts/view3d-assets/pit-plan.mjs`); a model without one draws its
footprint rectangle. The playing spot isn't drawn (owner, 2026-11-15): where
the player stands is plain from the drawing. Right-clicking a piece offers
Edit, which opens its edit view.

Under the equipment, the field draws a pit area (owner pick 2026-11-15,
"flat tone"): a flat tone, the field's background with a little of its line
color, against the front sideline, only as wide and deep as the equipment
plus 4 ft, with no lines. A matching one sits behind the back sideline when
equipment stands there (a back podium). The yard-line labels stay at the sidelines, over it (owner, 2026-11-15), and
the zoom fit includes it. They are drawing aids only;
`FieldProperties` doesn't change.

**Later.** Instrument swaps (their own design), more podium models
(scaffold, traditional and others), artwork slots, amps, and a
percussionist's review of the models.

## 7. Scope and order

Four pull requests into the fork's `main`, each with screenshots from a
real browser:

1. **Brass and holds.** The hold pipeline (bake with replaced arm tracks,
   settings row), part ids and finish paint, and the seven brass models.
   Replaces the three placeholders.
2. **Woodwinds.** Eight models, three holds.
3. **Battery.** Carriers, five drums, cymbals, the bass size spread.
4. **Front ensemble.** The `items.model` migration first, then the models
   in the 3D View, the Front ensemble group and presets, playing spots and
   the 2D pit area (§6).

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
3. Answered: the front ensemble is equipment items with a built-in
   `items.model`, not a `view3d_props` table (§6, ADR 0010 amendment of
   2026-11-11).
4. Answered: carry, set and down are one hold with the bell to the ground.
   Horns up is the bell front.
