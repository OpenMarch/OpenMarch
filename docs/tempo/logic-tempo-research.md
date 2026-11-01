<!-- cspell:disable -->

# Logic Pro tempo editing: an interaction-level teardown

Research for OpenMarch's tempo mode. Written 2026-10-31. It complements the broad survey in [daw-research.md](daw-research.md) and covers only Logic's tempo track, plus a short comparison of how other DAWs handle the time base.

**Sources.**

- **Primary:** the Apple Logic Pro User Guide for Mac, current version 12.3 (support.apple.com/guide/logicpro). Each claim links the page it comes from.
- **Older Apple guides**, marked "[L9]" or "[10.1]": the Logic Pro 9.1.6 and 10.1 manuals on help.apple.com. These are still Apple's own words, and they are often more detailed. Where they differ from 12.3, both are given.
- **Figures:** "Fig." means an observation from a screenshot embedded in the cited Apple page. I opened the images and described what they show.
- **Secondary** sources are marked _(secondary)_.
- Anything that no source supports is marked _(unverified)_.

---

## 1. Tempo track anatomy

**Where it lives.** The Tempo track is a global track. It appears below the ruler in the Tracks area, Piano Roll, Step Editor and Score Editor ([Tempo track overview](https://support.apple.com/guide/logicpro/tempo-track-overview-lgcpc0ba44af/mac); [Global tracks overview](https://support.apple.com/guide/logicpro/global-tracks-overview-lgcp4994bead/mac)).

- Show or hide all global tracks with G. Show or hide the Tempo track alone with Shift-Command-T ([key commands](https://support.apple.com/guide/logicpro/views-showing-time-ruler-lgcp267f63a1/mac)).

**Height.**

- You resize one global track by dragging its lower dividing line. You resize the whole global-tracks area by dragging the line between it and the Tracks area ([Resize and reorder global tracks](https://support.apple.com/guide/logicpro/resize-and-reorder-global-tracks-lgcpcbcf580a/mac)).
- Shift-clicking the divider resets the header height ([pointer shortcuts](https://support.apple.com/guide/logicpro/global-tracks-lgcpb19fa45b/mac)).
- The overview says you can "expand the Tempo track to give yourself more room to work" ([overview](https://support.apple.com/guide/logicpro/tempo-track-overview-lgcpc0ba44af/mac)).
- [L9] The BPM number beside each point appears only "if the vertical height of the Tempo track is adequate" ([L9 Using the Tempo Track](https://help.apple.com/logicpro/mac/9.1.6/en/logicpro/usermanual/chapter_33_section_2.html)).

**Value scale (BPM range).**

- **Manual range:** drag the maximum or minimum value in the tempo scale vertically, or double-click either value and type a number ([overview](https://support.apple.com/guide/logicpro/tempo-track-overview-lgcpc0ba44af/mac)).
  - Fig.: the scale sits at the right edge of the track header and shows 170 / 150 / 130 / 110 / 100. The maximum is drawn in blue.
  - Fig.: while you hover or drag the maximum, the pointer is the standard arrow and a help tag reads "Set Tempo Scale Max Tempo: 170".
- **Auto-ranging, [L9]:** "The display range for tempo events is adjusted automatically. Dragging a node beyond the current maximum or minimum scale boundaries results in an automatic adjustment of the range."
  - User-defined limits were shown in yellow. Leaving the field empty returned to automatic scaling ([L9](https://help.apple.com/logicpro/mac/9.1.6/en/logicpro/usermanual/chapter_33_section_2.html)).
- **Auto-ranging, current iPad guide:** "Moving a tempo point to the upper or lower limit of the tempo range extends the tempo range" ([iPad: Use tempo points](https://support.apple.com/guide/logicpro-ipad/use-tempo-points-lpipeb1df68d/ipados)).
- _(unverified)_ The 12.3 Mac guide doesn't restate auto-extension. The blue maximum in the current figure probably marks a user-set value, as yellow did in L9.

**How tempo is drawn** (Fig., [overview](https://support.apple.com/guide/logicpro/tempo-track-overview-lgcpc0ba44af/mac) and [add/edit points](https://support.apple.com/guide/logicpro/add-and-edit-tempo-points-lgcpd20f7149/mac)):

- **A step line with a filled area below it.** Each segment is a horizontal line at the tempo value, filled translucent blue down to the bottom of the lane.
  - At each change, a vertical riser joins the old value to the new one.
  - [L9] puts it in words: "dots connected by lines … followed by horizontal lines that continue to the next node … a vertical line is connected to the node of the ensuing tempo change. This creates a series of hills and valleys."
- **Two dots at every change:**
  - a **filled dot**, the tempo point itself, at the new value;
  - a **small hollow dot** at the top or bottom of the riser, at the old value, directly above or below the point. This hollow dot is the "corner" or curve node that you drag to make a curve (see §5).
- **Labels:** the BPM value is printed next to each point as a bold number in the track colour (e.g. 120, 118, 123, 135, 126).
- **Selection:** the selected segment, its points and its label turn white. The others stay blue (Fig., pencil and curve figures).
- **Tempo set pop-up:** the header shows a pop-up such as "Tempo: Default" for the tempo set (see §9).
- **Colour code** _(secondary)_: in Smart Tempo projects, the tempo line is blue where Smart Tempo has analysed the audio and orange where it hasn't ([SOS, Paul White, Nov 2025](https://www.soundonsound.com/techniques/logic-pro-using-smart-tempo)).

**Help tags while hovering and dragging.**

- **Dragging a point vertically:** "A help tag displays the tempo value" ([add/edit](https://support.apple.com/guide/logicpro/add-and-edit-tempo-points-lgcpd20f7149/mac)).
- **Pencil insert:** the tag shows the value and the position. Fig.: "Insert Tempo: 121 / Position: 5 3 3 1", with the position in bar, beat, division and tick.
  - Apple says: "watch the help tag, and don't release the mouse button until it shows the intended tempo and position." So a Pencil press is a live drag-to-set gesture, and the event is committed on release.
- **Curve node:** "Move Curve Node" ([curves](https://support.apple.com/guide/logicpro/create-tempo-curves-lgcpf7cb8542/mac)). The 12.3 figure's tag reads "Move Tempo Curve Automation Point".
- **Double-click insert:** "No help tag appears when you double-click with the Pointer tool."

## 2. Hit zones and cursor shapes

What the sources establish:

| Target                                                        | Pointer tool                                                                                                                                                                                                                                                                                                                           | Source                                                                                                                                                                                             |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tempo point** (filled dot)                                  | Click selects. Drag up or down changes the value; drag left or right moves it in time. The axis locks per gesture. Option-drag copies. Double-click deletes.                                                                                                                                                                           | [add/edit](https://support.apple.com/guide/logicpro/add-and-edit-tempo-points-lgcpd20f7149/mac), [move/copy](https://support.apple.com/guide/logicpro/move-and-copy-tempo-points-lgcpef92f808/mac) |
| **Line to the right of a point** (the horizontal segment)     | Click selects the point on its left: "Select the tempo point, by either clicking it or the line to the right of it". Dragging it vertically changes the tempo (12.3: "changing the values of both tempo points"). [L9] Dragging it horizontally moves the point: "grab the node (or the line to the right) and drag it left or right". | [add/edit](https://support.apple.com/guide/logicpro/add-and-edit-tempo-points-lgcpd20f7149/mac); [L9](https://help.apple.com/logicpro/mac/9.1.6/en/logicpro/usermanual/chapter_33_section_2.html)  |
| **Corner / curve node** (hollow dot at the riser's other end) | With two points selected, drag the corner to bend the step into a curve. Once a curve exists, drag its node horizontally or vertically to reshape it. Double-click removes the curve. Fig.: the cursor is a **pointing hand (finger)**.                                                                                                | [curves](https://support.apple.com/guide/logicpro/create-tempo-curves-lgcpf7cb8542/mac)                                                                                                            |
| **Scale max/min numbers** (header)                            | Drag vertically, or double-click to type. Fig.: standard arrow with a "Set Tempo Scale Max Tempo" tag.                                                                                                                                                                                                                                 | [overview](https://support.apple.com/guide/logicpro/tempo-track-overview-lgcpc0ba44af/mac)                                                                                                         |
| **Empty lane space**                                          | See below.                                                                                                                                                                                                                                                                                                                             |                                                                                                                                                                                                    |

**Empty space, Pointer tool.**

- The 12.3 text says "Click the target time position with the Pointer tool" to add a point. The same paragraph then says "No help tag appears when you **double-click** with the Pointer tool" ([add/edit](https://support.apple.com/guide/logicpro/add-and-edit-tempo-points-lgcpd20f7149/mac)).
- [L9] is unambiguous: "**Double-click** at the desired position with the Pointer tool" ([L9](https://help.apple.com/logicpro/mac/9.1.6/en/logicpro/usermanual/chapter_33_section_2.html)).
- Conclusion: with the Pointer tool, inserting takes a **double-click**. A single click on empty space doesn't create anything. The 12.3 wording is a doc slip, since it contradicts itself.
- _(unverified)_ A single click on empty lane space presumably deselects, as clicking the background does elsewhere. The move/copy page says "Deselect all tempo points (by clicking the background)" ([move/copy](https://support.apple.com/guide/logicpro/move-and-copy-tempo-points-lgcpef92f808/mac)).
- _(unverified)_ No source says what dragging on empty space does with the Pointer tool. The automation convention suggests a rubber-band selection. The guide documents Control-drag to select tempo points: "Shift-click or drag to select (while pressing and holding Control)" ([move/copy](https://support.apple.com/guide/logicpro/move-and-copy-tempo-points-lgcpef92f808/mac)).

**Empty space, Pencil tool.**

- A single click inserts a point. Holding the button shows the live "Insert Tempo / Position" tag, and the value follows the pointer height until release ([add/edit](https://support.apple.com/guide/logicpro/add-and-edit-tempo-points-lgcpd20f7149/mac), Fig.).
- On iPad, inserting needs the Pencil button in the global tracks header to be on ([iPad: Use tempo points](https://support.apple.com/guide/logicpro-ipad/use-tempo-points-lpipeb1df68d/ipados)). This is a deliberate mode switch on touch.

**Numeric insert.** Control-Option-Command-click opens a BPM text field at the click position. Return commits ([add/edit](https://support.apple.com/guide/logicpro/add-and-edit-tempo-points-lgcpd20f7149/mac)). Fig.: the field shows one decimal, e.g. "107.0".

**Cursor shapes.**

- Confirmed: a pointing hand over the curve node (Fig.) and the standard arrow over the scale (Fig.).
- _(unverified)_ Whether the pointer changes to an up/down resize cursor over a horizontal segment. No Apple page or figure shows one.
- _(unverified)_ Whether a hand or finger appears over points and lines generally.
- What the docs do establish is the hit rule. Only the point, the line to its right and the corner node are draggable. In empty space a single click with the default Pointer tool doesn't create a point, which needs a double-click.

## 3. Dragging a segment (the line between two points)

- **What changes:** "You can also drag the line connecting two tempo points, changing the values of both tempo points" ([add/edit](https://support.apple.com/guide/logicpro/add-and-edit-tempo-points-lgcpd20f7149/mac); same wording in the [iPad guide](https://support.apple.com/guide/logicpro-ipad/use-tempo-points-lpipeb1df68d/ipados)).
  - In the step model, the horizontal line from point A to point B is drawn at A's value. B's hollow corner sits on it at the "from" value of B's riser.
  - Dragging the line moves that whole level, i.e. A's value and the start of B's riser together. That is the likely meaning of "both tempo points" _(interpretation, unverified)_.
- **Scope:** points are absolute values, so the drag changes only the tempo between A and B.
  - _(inference)_ Later points keep their BPM. Everything after B still shifts in absolute time, because the bars before it got faster or slower.
  - No source describes a "ripple all following tempos" behaviour for a segment drag. The tools for relative changes over a range are Tempo Operations' **Scale Existing Tempo** and **Stretch** ([Tempo Operations](https://support.apple.com/guide/logicpro/create-and-edit-tempo-changes-lgcp0f61a684/mac)).
- **Axis lock:** "To prevent unintentional changes, tempo points are restricted to either vertical or horizontal movement. You can change either the value … or the position … but not both at once" ([add/edit](https://support.apple.com/guide/logicpro/add-and-edit-tempo-points-lgcpd20f7149/mac)).
  - [L9] says the same "for each operation", so the axis is chosen per gesture.
  - [L9] says grabbing the line and dragging horizontally moves its left point in time.
  - _(unverified)_ The threshold that picks the axis. It is probably the first few pixels of movement.
- **Shift.** The sources disagree:
  - 12.3: "To change the value in finer increments, press and hold Shift while dragging a tempo point" ([add/edit](https://support.apple.com/guide/logicpro/add-and-edit-tempo-points-lgcpd20f7149/mac)).
  - 12.3 pointer-shortcut table: "Restrict to horizontal movement — Shift key while dragging tempo event" ([pointer shortcuts](https://support.apple.com/guide/logicpro/global-tracks-lgcpb19fa45b/mac)).
  - [L9]: "To make finer tempo change movements, hold Shift while dragging a node left or right."
  - _(unverified)_ Which one current builds do. Probably Shift gives finer value steps when dragging vertically.
- **Value resolution:** _(unverified)_ Plain drags appear to step in whole BPM (labels are integers). Shift gives finer steps, and numeric entry takes one decimal (Fig. "107.0").
- **Snap:** horizontal moves follow the tempo track's own Snap (Tempo > Snap in the track header) ([add/edit](https://support.apple.com/guide/logicpro/add-and-edit-tempo-points-lgcpd20f7149/mac)).
  - The Tracks-area overrides generally apply: Control for finer grid, Control-Shift for ticks or samples ([Snap items to the grid](https://support.apple.com/guide/logicpro/snap-items-to-the-grid-lgcpf7c0f66a/mac)).
  - _(unverified)_ Whether these overrides apply to tempo points specifically.

## 4. Points

- **Add:**
  - Pencil click: drag before release to set the value.
  - Pointer double-click.
  - Control-Option-Command-click for numeric entry.
  - ([add/edit](https://support.apple.com/guide/logicpro/add-and-edit-tempo-points-lgcpd20f7149/mac); [L9](https://help.apple.com/logicpro/mac/9.1.6/en/logicpro/usermanual/chapter_33_section_2.html))
- **Change value:** drag the point vertically, with a help tag. Shift gives finer steps. On iPad you can also edit the Tempo field in the inspector ([iPad](https://support.apple.com/guide/logicpro-ipad/use-tempo-points-lpipeb1df68d/ipados)).
- **Move in time:**
  - Drag left or right; the axis is locked.
  - Pickup Clock (Move Region/Event to Playhead Position) moves the selected point to the playhead.
  - **Extend Left** (Control-click menu) moves the point onto the previous point and replaces it. It isn't available for the first point.
  - ([move/copy](https://support.apple.com/guide/logicpro/move-and-copy-tempo-points-lgcpef92f808/mac))
- **Copy:**
  - Option-drag.
  - Copy and Paste: the paste goes at the playhead, and a Position field appears beside the first pasted point so you can retarget the bar.
  - "Any tempo points at the target positions are replaced by the moved or copied ones."
  - ([move/copy](https://support.apple.com/guide/logicpro/move-and-copy-tempo-points-lgcpef92f808/mac))
- **Select multiple:** Shift-click, or Control-drag a rectangle. Edit > Select Inside Locators selects a passage ([move/copy](https://support.apple.com/guide/logicpro/move-and-copy-tempo-points-lgcpef92f808/mac)).
- **Delete:**
  - Select a point (by clicking it or the line to its right) and press Delete.
  - Double-click the point with the Pointer tool.
  - Click it with the Eraser.
  - ([add/edit](https://support.apple.com/guide/logicpro/add-and-edit-tempo-points-lgcpd20f7149/mac))
  - Note the symmetry: **double-click empty space adds, double-click a point deletes.**
- **Bulk value operations:**
  - **Replace By Average** (shortcut menu).
  - **Apply Smoothing to Selected Points**, which "reduces the number of tempo changes while maintaining the length (duration) of the performance".
  - **Replace Selected Points by Average Tempo**, a weighted average that keeps the duration.
  - ([add/edit](https://support.apple.com/guide/logicpro/add-and-edit-tempo-points-lgcpd20f7149/mac))
- **Snap:** Tempo > Snap in the track header picks the beat value ([add/edit](https://support.apple.com/guide/logicpro/add-and-edit-tempo-points-lgcpd20f7149/mac)).
- **Numeric list:** the Tempo List (§9).
  - _(secondary)_ Shift-double-click on the Tempo track opens it ([SOS, Stephen Bennett, May 2006, Logic 7](https://www.soundonsound.com/techniques/logic-tempo-matching-global-tracks)).
  - The 12.3 pointer table lists Shift-double-click on the Signature track to open the Signature List ([pointer shortcuts](https://support.apple.com/guide/logicpro/global-tracks-lgcpb19fa45b/mac)).

## 5. Curves and ramps

**Creating a curve in the track** ([curves](https://support.apple.com/guide/logicpro/create-tempo-curves-lgcpf7cb8542/mac)):

1. Select the two tempo points.
2. "Drag the tip of the right angle line (the corner) above or below the second tempo point."
   - The corner is the hollow dot at the far end of the riser, at the old value.
   - Dragging it away from the corner turns the step into a diagonal or curve running from the first point's level to the second point.
3. "A curve or diagonal line results (a Move Curve Node help tag is shown), which can be dragged—horizontally or vertically—to alter the curve shape. The process is similar to drawing track automation curves with the pointer."
   - Fig.: after bending, the node sits off the curve, below the bend. It is a hollow circle under a pointing-hand cursor, with the tag "Move Tempo Curve Automation Point". The curve in the figure is strongly convex, rising late into the second point.
   - Dragging the node changes the curvature continuously. Moving it toward the straight diagonal gives a linear ramp; moving it toward either corner gives a concave or convex shape _(inferred from the figure and the automation analogy; Apple doesn't name the shapes)_.
   - [L9] adds nothing more, apart from noting that a curve can be made between any adjacent pair.

- **Delete a curve:** click the curve node with the Eraser, or double-click it with the Pointer tool. The segment goes back to a step ([curves](https://support.apple.com/guide/logicpro/create-tempo-curves-lgcpf7cb8542/mac)).
- **iPad:** "Curve nodes appear as small black dots and are located between tempo points … touch and hold a curve node between two tempo points, then drag to set and alter the curve shape" ([iPad curves](https://support.apple.com/guide/logicpro-ipad/use-tempo-curves-lpip91b10b32/ipados)). On touch the node is always visible, and no prior selection is needed.

**How curves are stored and played** ([curves](https://support.apple.com/guide/logicpro/create-tempo-curves-lgcpf7cb8542/mac); [Tempo List](https://support.apple.com/guide/logicpro/add-tempo-changes-in-the-tempo-list-lgcp52fb6ec6/mac)):

- A curve is **rendered as discrete tempo steps at the snap resolution**. "The Snap pop-up menu in the Tempo track … define[s] the number of tempo changes that are actually performed when using curves."
  - 1/16 gives four changes per quarter note. 1/1 gives one change per bar, "a more abrupt transition".
  - "You can define a different snap value for each tempo curve." [L9] calls this "Resolution" and says it is set per node.
- The Tempo List hides those intermediate events by default. "Additional Info … All tempo change events, including those located on the tempo curve, are displayed."
  - The list has its own **Options > Granularity** setting for tempo curves.
  - So the model is: the user edits two points plus a curve node, and Logic generates the step events.
- Playback is a staircase at that resolution. It is not a mathematically continuous ramp _(stated by the docs as the "number of tempo changes actually performed")_.

**Tempo Operations window** (Edit > Tempo > Tempo Operations) ([overview](https://support.apple.com/guide/logicpro/tempo-operations-overview-lgcpf988d98d/mac); [operations](https://support.apple.com/guide/logicpro/create-and-edit-tempo-changes-lgcp0f61a684/mac)):

- **Create Tempo Curve:**
  - Position or Time fields set the start and end.
  - Enter start and end tempo.
  - The **Curve Type** pop-up offers "three kinds of tempo curves". Each has a **Curvature** value, and its sign decides speeding up or slowing down.
  - **Density** sets how many events are generated. Apple warns against 1/8 or finer "just to make the curve look smoother".
  - The preview curve is drawn **in red** live as you change values.
  - Apply commits.
  - Apple doesn't name the three curve types in any version I found _(unverified names)_.
- **"Continue with new Tempo":** unchecked, the original tempo resumes after the curve ends. Checked, the curve's last tempo is kept.
- **Other operations:**
  - Create Constant Tempo: defaults to the average. With Apply, it removes variation "without changing the SMPTE time for the rightmost position".
  - Scale Existing Tempo (percentage).
  - Stretch Existing Tempo Curve (new end position or %).
  - Thin Out (1/1–1/32 per bar).
  - Randomize.
  - Round (whole BPM or 1/10 BPM).
- The window "automatically displays the area you've selected", and changes are shown "graphically in real time" ([overview](https://support.apple.com/guide/logicpro/tempo-operations-overview-lgcpf988d98d/mac)).

## 6. Display time base

**Logic Pro.**

- **Primary ruler:** bars and beats when the project uses the musical grid; minutes and seconds otherwise ([Position items using the ruler](https://support.apple.com/guide/logicpro/position-items-using-the-ruler-lgcpf7c0ec53/mac)).
  - The switch is **File > Project Settings > General > Use musical grid**. It "sets the primary ruler to bars and beats … If deselected, the ruler is set to time" ([General project settings](https://support.apple.com/guide/logicpro/general-project-settings-lgcpc2a5a728/mac)).
- **Secondary ruler:** View > Secondary Ruler, or Control-Option-Shift-R, shows the other format underneath ([ruler](https://support.apple.com/guide/logicpro/position-items-using-the-ruler-lgcpf7c0ec53/mac); [key commands](https://support.apple.com/guide/logicpro/views-showing-time-ruler-lgcp267f63a1/mac)).
  - Apple's tip for music recorded to a grid: keep bars in the primary ruler and show time in the secondary one ([General](https://support.apple.com/guide/logicpro/general-project-settings-lgcpc2a5a728/mac)).
- **Bars stay equal width when the tempo changes.** Fig.: in the tempo-track figure, tempo steps 120 → 118 → 123 → 135 → 126 across bars 1–5, yet the bar lines sit at equal spacing (about 127 px each) ([overview figure](https://support.apple.com/guide/logicpro/tempo-track-overview-lgcpc0ba44af/mac)). So the default Tracks area is **beat-linear (tick-linear)**.
- **Audio that doesn't follow tempo changes length on screen.**
  - [L9]: "The length of imported audio regions and the project tempo are directly linked … the length of regions at, and after, this position changes", while "You won't hear a difference in the playback speed of the imported audio" ([L9 Working with Tempo and Audio Regions](https://help.apple.com/logicpro/mac/9.1.6/en/logicpro/usermanual/chapter_18_section_0.html)).
  - In a beat-linear view, a fixed recording therefore widens or narrows on screen as the tempo under it changes.
- **Pinning to absolute time:** Lock SMPTE Position keeps events at a fixed absolute time "regardless of tempo changes" ([Lock position](https://support.apple.com/guide/logicpro/lock-the-position-of-events-lgcpa9056fca/mac)).
- **Did Logic ever have a time-linear view? Yes, in L9.**
  - The Bar ruler had Time, Bar, Bar and Time, and Time and Bar modes. "You can choose between time and bar linear views. To activate a time linear view: choose the Time, or Time and Bar setting … To activate a bar linear view: choose the Bar, or Bar and Time setting" ([L9 Adjusting the Bar Ruler Display](https://help.apple.com/logicpro/mac/9.1.6/en/logicpro/usermanual/chapter_4_section_11.html)).
  - So the primary ruler format decided the linearity of the whole window.
  - _(unverified)_ Whether "Use musical grid" off in 10.x–12.x likewise makes the Tracks area time-linear. The current guide only says the ruler "is set to time". It doesn't say whether bar lines then spread unevenly, and it never uses the words "linear view".
- **Tempo curve drawing:** in a beat-linear view, a linear-in-beats ramp is drawn as a straight diagonal. _(unverified)_ How L9's time-linear view drew it.

**Other DAWs:**

- **Pro Tools.**
  - **Per track:** audio tracks are **sample-based** by default (blue clock icon) and stay at fixed sample positions when the tempo changes. MIDI and instrument tracks are **tick-based** by default (green metronome icon) and stay at bar|beat positions.
  - **View:** the Edit window has a **Linearity Display mode**: "You can choose whether the timebase used to display the Edit window is linear in terms of absolute time or musical intervals". With **Linear Tick**, "irrespective of the tempo, each bar will be displayed as equally long", and the samples and min:sec rulers then change scale with the tempo ([SOS, Mike Thornton, "Super Conductors", Dec 2010](https://www.soundonsound.com/techniques/super-conductors) _(secondary)_).
  - Tempo curves are drawn with the Pencil in Line or Parabolic mode and rendered as straight-line steps at a "Tempo Edit Density" (same article).
  - _(unverified)_ The exact menu labels ("Linear Sample Display" / "Linear Tick Display") and that sample-linear is the default.
  - Pro Tools **can switch the view** between time-linear and beat-linear.
- **REAPER.**
  - **Timebase** is set per project, track or item: **Time**, **Beats (position, length, rate)** or **Beats (position only)**. Items with Time stay at their clock position when the tempo changes.
  - Defaults: items, envelopes and markers use Beats (position, length, rate); the tempo and time-signature envelopes use Beats ([REAPER User Guide 5.974](http://dlcf.reaper.fm/userguide/ReaperUserGuide5974c.pdf); [5.00](http://dl.reaper.fm/userguide/ReaperUserGuide500k.pdf)).
  - The tempo map is a "Tempo map envelope" on the master track, with square (step) or linear shapes per point _(secondary/unverified for current version)_.
  - _(unverified)_ The arrange view is always **time-linear**: bar lines spread unevenly under tempo changes, and no beat-linear view exists.
- **Ableton Live.**
  - The Arrangement shows a **beat-time ruler** (bars-beats-sixteenths) and a separate **time ruler** (minutes-seconds-milliseconds) ([Arrangement View](https://www.ableton.com/en/live-manual/12/arrangement-view/)).
  - "When the Warp switch is off, the sample plays at its original tempo, unaffected by the Set's current tempo." Warped clips follow the tempo ([Audio Clips, Tempo, and Warping](https://www.ableton.com/en/manual/audio-clips-tempo-and-warping/)).
  - Tempo is an automation envelope in the Main track.
  - _(unverified)_ The arrangement is beat-linear, so an unwarped clip changes width as tempo automation passes under it, and the time ruler spacing becomes uneven. There is no time-linear view.
- **Cubase.**
  - **Per track:** each track has a **musical or linear time base**. With musical, events keep bar positions; for audio events "tempo changes … affect only the start position and not the actual audio" ([Track Time Base](https://www.steinberg.help/r/cubase-pro/15.0/en/cubase_nuendo/topics/editing_tempo_and_signature/editing_tempo_track_time_base_c.html)).
  - **View:** the ruler has a **Ruler Mode**. **Time Linear** spaces the ruler by time, so "if the Tempo track has tempo changes, the distance between bars varies in Bars+Beats mode". **Bars+Beats Linear** keeps bars evenly spaced, and seconds then stretch ([Cubase Pro 12 Ruler Modes](https://archive.steinberg.help/cubase_pro/v12/en/cubase_nuendo/topics/project_window/project_window_ruler_mode_r.html); wording via search snippet because the page refused direct fetch).
  - Cubase, like Pro Tools and L9, **lets you switch the view**.
  - _(unverified)_ How each mode redraws the tempo-track curve. Presumably a beat-linear ramp is straight in Bars+Beats Linear and bowed in Time Linear.

**Summary.** Logic (default), Ableton and, _unverified_, REAPER each have one fixed linearity: Logic and Ableton beat-linear, REAPER time-linear. Pro Tools, Cubase and Logic 9 offer a view switch, and the choice applies to the whole edit window.

## 7. Beat Mapping track

Sources: [overview](https://support.apple.com/guide/logicpro/beat-mapping-overview-lgcp624214db/mac), [MIDI](https://support.apple.com/guide/logicpro/on-midi-regions-lgcp46a73246/mac), [audio](https://support.apple.com/guide/logicpro/on-audio-regions-lgcp6338b8d1/mac), [automatic](https://support.apple.com/guide/logicpro/automatic-beat-mapping-lgcp85d272f0/mac).

- **Layout:**
  - The upper part is a ruler with "the same time divisions (bars, beats, and subdivisions) as … the LCD", and its density depends on zoom.
  - The lower part shows the selected regions: MIDI notes, or the audio waveform with transients as **blue vertical lines**.
  - Show it with Shift-Command-B.
- **Gesture:**
  1. Select the region.
  2. Click a ruler position; "a vertical line appears at the clicked ruler position".
  3. "Drag the bottom part of the line so it aligns with the beginning of the note".
  - The line goes diagonal, from the ruler tick at the top to the note or transient at the bottom.
  - On release, "Logic Pro automatically inserts a tempo change, which appears in the Tempo track."
  - Work left to right.
  - Fig.: a white diagonal line runs from a ruler tick down to a note, under a pointing-hand cursor. A help tag shows the source ruler position and an offset ("Position: 3 2 4 195. +12 1 0 0"). Earlier mappings appear as blue vertical lines through the lane.
  - [Secondary, Logic 7] the line was yellow and "the bar line then snaps into place" on a note ([SOS 2006](https://www.soundonsound.com/techniques/logic-tempo-matching-global-tracks)).
- **Snapping:** the bottom end snaps to notes or transients. Hold **Control** to snap to any subdivision where there is no note ([MIDI](https://support.apple.com/guide/logicpro/on-midi-regions-lgcp46a73246/mac)).
- **Delete:**
  - Double-click a mapping with the Eraser, or select it and press Delete.
  - Clicking the track header selects all mappings, then Delete removes them.
  - Apple warns that Delete can also hit other selected items.
- **Transient density:** –/+ buttons in the header set the detection threshold. Apple's advice is to start low ([audio](https://support.apple.com/guide/logicpro/on-audio-regions-lgcp6338b8d1/mac)).
  - "Move Selection with First Transient to Nearest Beat" pre-aligns the region.
  - Protect MIDI and Protect Flex keep those events at their ruler positions.
- **Automatic:** Beats from Region, with a note value and one of two algorithms:
  - "Tolerate missing or additional events";
  - "Use exactly all existing events".
  - If it fails, set the first one or two downbeats by hand and retry ([automatic](https://support.apple.com/guide/logicpro/automatic-beat-mapping-lgcp85d272f0/mac)).
- **Relation to the tempo track:**
  - Beat mapping writes tempo events; it is a tempo-track editor driven by "ruler beat X happens at audio moment Y".
  - "Their absolute time position is unchanged": the audio stays put and the grid moves.
  - Apple warns: "you should avoid making changes in the Tempo track after using beat mapping functions. Doing so will defeat the timing derived from the beat mapping functions" ([overview](https://support.apple.com/guide/logicpro/beat-mapping-overview-lgcp624214db/mac)). So the two editors don't stay in sync: tempo-track edits silently break earlier mappings.

## 8. Smart Tempo Editor beat-marker handles (dragging a beat onto audio)

Source: [Correct tempo analysis results using beat markers](https://support.apple.com/guide/logicpro/correct-tempo-analysis-results-beat-markers-lgcp644481aa/mac).

- In Beat Marker mode, the detected beats are vertical markers over the waveform, and downbeats are "more prominent".
  - Fig.: orange lines, with downbeats in brighter orange.
- **Handles:** "When you hold the pointer over a beat marker, a set of circular handles appears along the length of the beat marker. Holding the pointer vertically over each handle shows a tag describing the function."
  - Handles appear only on hover.
  - Fig.: five circles stacked on the marker, the hovered one larger, with a "Move Marker" tag above.
- **Handle functions** (each a separate vertical zone on the same line):
  - **Set Downbeat**: click.
  - **Move Marker**: one beat.
  - **Scale Selection**.
  - **Scale Left, Move Right**: "useful for correcting tempo detection where the music temporarily slows down or speeds up".
  - **Scale All**.
  - **Move All**.
- **Command-drag** snaps a marker "to significant analysis points" (transients).
- If there is no selection, Logic picks a default range, such as the bar containing the marker or the bars on both sides of a downbeat.
- **Lock Range** (Control-click a selection) protects finished sections from later edits and re-analysis. Locked ranges are darker and show a lock icon ([Lock a range](https://support.apple.com/guide/logicpro/protect-smart-tempo-edits-by-locking-a-range-lgcp6e8d3a01/mac)).
- **Hint mode** splits the lane into vertical zones: "Clicking in the upper third of the main display adds a downbeat hint, and clicking in the lower third adds a beat hint". You can also tap D or T during playback ([Work in the Smart Tempo Editor](https://support.apple.com/guide/logicpro/work-in-the-smart-tempo-editor-lgcp2a428fed/mac)).

## 9. Tempo List and tempo sets

**Tempo List** ([interface](https://support.apple.com/guide/logicpro/tempo-list-interface-lgcp31f1e7c9/mac); [add](https://support.apple.com/guide/logicpro/add-tempo-changes-in-the-tempo-list-lgcp52fb6ec6/mac); [Synchronization settings](https://support.apple.com/guide/logicpro/general-project-settings-lgcp7c04a41a/mac)):

- It is an Event-List-style table with Position (bars and beats), SMPTE and Tempo columns.
- **Add Tempo** inserts an event at the playhead with the current tempo.
- Change a position by dragging the numbers up or down, or by double-clicking and typing in the Position or SMPTE column.
- **Additional Info** reveals the generated curve events.
- **Options > Granularity** sets the curve resolution.
- It always shows real SMPTE, never the view offset.

**Tempo sets** ([Use tempo sets](https://support.apple.com/guide/logicpro/use-tempo-sets-lgcpe0d3d943/mac)):

- These are alternative tempo maps per project. New, Rename and Delete are in the Tempo Set pop-up, which also appears as "Tempo: Default" in the track header.
- Only the current set's events appear and play. "The initial tempo is always visible."
- [L9] called them Tempo Alternatives (up to nine). Option-choosing a target copied the current map into it, "allowing you to experiment … while retaining a fallback map" ([L9](https://help.apple.com/logicpro/mac/9.1.6/en/logicpro/usermanual/chapter_33_section_2.html)).

## 10. What makes it feel good or prevents accidental edits

- **Per-gesture axis lock** on points and lines. This is the only anti-accident rule Apple states explicitly: "To prevent unintentional changes … value or position, but not both at once" ([add/edit](https://support.apple.com/guide/logicpro/add-and-edit-tempo-points-lgcpd20f7149/mac)).
- **No single-click creation with the default tool.**
  - With the Pointer tool, a new point needs a double-click; a single click selects or deselects.
  - Creating with one click requires the Pencil tool, an explicit tool change. On iPad it requires the Pencil button ([L9](https://help.apple.com/logicpro/mac/9.1.6/en/logicpro/usermanual/chapter_33_section_2.html); [iPad](https://support.apple.com/guide/logicpro-ipad/use-tempo-points-lpipeb1df68d/ipados)).
- **Small, explicit drag targets:** the point, the line to its right, and the corner node.
  - The curve node shows only as a small hollow dot, and on Mac bending a step requires the **two points to be selected first** ([curves](https://support.apple.com/guide/logicpro/create-tempo-curves-lgcpf7cb8542/mac)).
  - This two-step requirement means a stray drag near a riser can't bend it.
- **Live help tags** show BPM and position during every drag and Pencil press. The Pencil commits only on release ([add/edit](https://support.apple.com/guide/logicpro/add-and-edit-tempo-points-lgcpd20f7149/mac)).
- **Value range that grows instead of clamping:** dragging past the scale extends it ([L9](https://help.apple.com/logicpro/mac/9.1.6/en/logicpro/usermanual/chapter_33_section_2.html); [iPad](https://support.apple.com/guide/logicpro-ipad/use-tempo-points-lpipeb1df68d/ipados)).
- **Fine mode** with Shift. **Numeric entry** with Control-Option-Command-click or the Tempo List.
- **Undo:** up to 200 steps, plus an Undo History window ([Undo and redo](https://support.apple.com/guide/logicpro/undo-and-redo-edits-lgcp1dbd67ab/mac)).
  - _(unverified)_ That one drag is one undo step. That is the usual Logic behaviour, but not documented for tempo.
- **Protection:**
  - Lock SMPTE Position keeps events at a fixed time ([Lock position](https://support.apple.com/guide/logicpro/lock-the-position-of-events-lgcpa9056fca/mac)).
  - Smart Tempo Lock Range ([Lock a range](https://support.apple.com/guide/logicpro/protect-smart-tempo-edits-by-locking-a-range-lgcp6e8d3a01/mac)).
  - Keep Project Tempo mode stops the tempo track from changing on imports and region moves ([Project Tempo mode](https://support.apple.com/guide/logicpro/choose-the-project-tempo-mode-lgcpca199cf6/mac)).
  - _(unverified)_ No source documents a lock or protect toggle on the Tempo track itself.
- **Tempo sets** give a cheap fallback before risky edits ([tempo sets](https://support.apple.com/guide/logicpro/use-tempo-sets-lgcpe0d3d943/mac)).
- _(unverified)_ Drag threshold, hysteresis and hover-highlight timing aren't documented anywhere I found.

---

## Unknowns

- What the cursor looks like over a tempo point and over a horizontal segment: an up/down resize arrow, a hand, or the plain arrow. Only the curve node (pointing hand) and the scale (arrow) are shown in Apple figures.
- What a single click or a drag on empty lane space does with the Pointer tool (presumably deselect and marquee select). The 12.3 guide's "Click … with the Pointer tool" to add contradicts its own next sentence and L9's "double-click".
- What Shift does in 12.x: finer value steps (12.3 task page, L9) or restrict to horizontal (12.3 pointer-shortcut table).
- The pixel threshold that picks the drag axis, and whether that axis can change mid-drag.
- What "changing the values of both tempo points" means precisely when dragging a segment.
- How a segment drag behaves when the segment is a curve.
- The names of the three Curve Types in Tempo Operations. Whether the hand-drawn curve has named shapes or only continuous curvature.
- Whether the 10.x–12.x Tracks area ever becomes time-linear (e.g. with "Use musical grid" off), as L9's Time ruler mode did.
- Whether the Mac Tempo track still auto-extends its range when you drag past the limit (documented for L9 and current iPad), and what the blue maximum label means.
- Undo granularity for tempo drags.
- Whether Pro Tools defaults to sample-linear display, and its exact menu labels. Whether REAPER and Ableton arrange views are strictly time-linear and beat-linear respectively, with no alternative.
