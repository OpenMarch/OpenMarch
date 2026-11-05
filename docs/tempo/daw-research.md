<!-- cspell:disable -- research notes full of product names and British spellings from sources -->

# Tempo mode: how DAWs and other tools fit a grid to fixed audio

Research for OpenMarch's timeline tempo mode. Written 2026-10-20. Drill software is deliberately excluded.

**Scope.** We look at DAWs, Melodyne, notation software, rhythm-game chart editors, DJ beatgrids and video editors.

**The question.** How does each tool:

- edit tempo, meter, markers and bar numbers;
- insert and delete time;
- tap tempo;
- above all, make a beat grid follow a fixed recording?

**Sources.**

- Official manuals, cited inline. Versions read: the current Apple Logic Pro guide (12.x), the Ableton Live 12 manual, the Pro Tools Reference Guide 2025.12 ("PT p.N" means a page of that PDF), Cubase Pro 14, the REAPER User Guide 7.81, the Fender Studio Pro manual (Studio One's successor), Ardour 8, Melodyne 5, Dorico 5/6, Sibelius Reference 2020.3, the MuseScore 4 handbook, the rekordbox 7.2 manual and the DaVinci Resolve 20 manual.
- For the rhythm-game editors (osu! lazer, ArrowVortex, Moonscraper and Editor on Fire), we read the source code.
- Anything else is marked _(unverified)_.

**Direction tags.** These tags matter for every feature below.

- **[GRID←AUDIO]**: the grid or tempo map moves to fit audio that stays put. This is what we need.
- **[AUDIO←GRID]**: the audio or content is stretched or moved to fit the grid. This is the usual DAW case, and it is a false parallel for us.

---

## 0. The direction problem, in one table

| Tool                                       | Right direction (grid follows audio)                                                                                                         | False parallel (audio follows grid)                              |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Logic Pro                                  | Project Tempo **Adapt** mode; "Apply Region Tempo to Project Tempo"; **Beat Mapping track**; "Adjust Tempo using Region Length and Locators" | Keep mode; region Smart Tempo "On + Align Bars/Beats"; Flex Time |
| Ableton Live 12                            | Clip **Tempo Leader** (the set follows the clip's warp markers)                                                                              | Default warping, Auto-Warp, Warp From Here                       |
| Pro Tools                                  | **Identify Beat**; Bar\|Beat markers; Beat Detective "Bar\|Beat Marker Generation"                                                           | Elastic Audio; Conform to Tempo                                  |
| Cubase 14                                  | Time Warp **"Warp Grid"**; Tempo Detection; Process Tempo; Calculate Tempo from MIDI Events                                                  | Time Warp "Free Warp"; "Warp Grid (musical events follow)"       |
| REAPER 7                                   | Ctrl-drag tempo or time-signature markers; "Create measure from time selection (detect tempo)"                                               | Stretch markers                                                  |
| Studio One / Fender Studio Pro             | "Extract to Tempo Track"; Time Scale tool                                                                                                    | Detect Tempo + Timestretch follow mode; Audio Bend               |
| Ardour 8                                   | **Grid tool** ("y"); audio-locked markers; Map Tempo mode                                                                                    | —                                                                |
| Melodyne 5                                 | **Assign Tempo** mode ("fit the metronome click to the music, not the audio to the click")                                                   | Edit Tempo mode                                                  |
| osu!, ArrowVortex, Moonscraper, EOF        | Everything. The audio is fixed by design.                                                                                                    | —                                                                |
| DJ apps (rekordbox, Serato, Traktor, djay) | Everything. The grid is metadata over the track.                                                                                             | —                                                                |

Logic's docs state the opposite-direction pairing outright:

- Beat Mapping inserts tempo changes "although their absolute time position is unchanged" ([Beat Mapping overview](https://support.apple.com/guide/logicpro/beat-mapping-overview-lgcp624214db/mac)).
- Melodyne's training page is titled "Assignment vs editing" ([Celemony](https://helpcenter.celemony.com/M5/doc/melodyneStudio5Training/en/HC2-Training_R1T2_Zuweisung_vs_Bearbeitung_M5)).

---

## 1. Where tempo editing lives

**Lanes inside the main timeline (the dominant pattern)**

| Tool           | Where                                                                                                                                                                                                                                                                                                                           | How tempo is edited                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Logic**      | Global tracks: Track > Global Tracks > Show (**G**). Arrangement, Marker, Signature and Tempo show by default; Beat Mapping, Chord and Movie are opt-in via **Configure Global Tracks**. Each has a Protect (lock) button. ([show/hide](https://support.apple.com/guide/logicpro/show-and-hide-global-tracks-lgcpd0e8ce94/mac)) | Click (Pointer/Pencil) adds a point; Ctrl-Opt-Cmd-click adds one and opens a BPM field. Drag a point vertically (Shift = fine). Dragging the **line between two points changes both**. A drag moves a point _either_ vertically _or_ horizontally, never both. Delete, double-click or Eraser removes. ([tempo points](https://support.apple.com/guide/logicpro/add-and-edit-tempo-points-lgcpd20f7149/mac)) Numeric **Tempo List** (Add Tempo at playhead; bars or SMPTE) and alternative **Tempo Sets**. ([list](https://support.apple.com/guide/logicpro/add-tempo-changes-in-the-tempo-list-lgcp52fb6ec6/mac)) |
| **Cubase**     | Tempo track in the project window (Project > Add Track > Tempo) _or_ a separate Tempo Track Editor                                                                                                                                                                                                                              | "Type of New Tempo Points": **Ramp / Step / Automatic** (copies the previous type). "Activate Tempo Track" toggles fixed tempo vs map. Buttons for Process Tempo and Process Bars. ([toolbar](https://www.steinberg.help/r/cubase-pro/14.0/en/cubase_nuendo/topics/editing_tempo_and_signature/editing_tempo_tempo_track_editor_toolbar_r.html?contentId=hvlmQnZm1sDoK3ldRjyDfg))                                                                                                                                                                                                                                  |
| **Pro Tools**  | Conductor rulers (View > Rulers): Markers 1–5, Tempo (expands to a Tempo Editor), Meter, Key, Chords. The **Conductor** button turns the map off.                                                                                                                                                                               | Pencil shapes Free Hand, Line, Parabolic, S-Curve; blue curve handles after drawing; Trim tool scales BPM. (PT p.1109–28)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Ableton**    | Automation lane on the Main track (Mixer > Song Tempo)                                                                                                                                                                                                                                                                          | Click adds a breakpoint; **Option-drag a segment curves it**; B = draw mode. ([envelopes](https://www.ableton.com/en/manual/automation-and-editing-envelopes/))                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **REAPER**     | Tempo/time-signature markers on the timeline, mirrored as the Master tempo envelope                                                                                                                                                                                                                                             | **Shift+C** inserts; the dialog has BPM, "Gradually transition tempo to next marker", time signature, "Allow a partial measure before this marker". Double-click edits, Alt-click deletes. (§10.8, [PDF](https://www.reaper.fm/userguide/ReaperUserGuide781c.pdf))                                                                                                                                                                                                                                                                                                                                                 |
| **Studio One** | Tempo track behind a toggle button                                                                                                                                                                                                                                                                                              | Click adds a point; drag sets value; right-click to type; mid-segment handle curves a ramp. ([tempo track](https://fenderstudiopromanual.fender.com/en/Content/Arranging_Topics/Tempo_Track.htm))                                                                                                                                                                                                                                                                                                                                                                                                                  |

**A separate _mode_ for fitting.** Melodyne splits **Assign Tempo** from **Edit Tempo** inside one tempo editor ([tempo editor](https://helpcenter.celemony.com/M5/doc/melodyneStudio5/en/M5tour_TempoEditorDefinition?env=standAlone)). Ardour's **Grid tool** ("y") is for human performances and "not useful" for click-based production ([8.1 notes](https://ardour.org/news/8.1.html)). Dorico's tempo track must be unlocked before editing; Shift-drag changes values without moving them in time ([Dorico](https://www.steinberg.help/r/dorico-pro/5.1/en/dorico/topics/play_mode/play_mode_tracks_tempo_r.html)).

**Takeaway.** Tempo and meter as toggled lanes in the main timeline, edited with _click to add, drag to change, type for exact_, is mainstream. Separate fit modes exist because fitting is a different job from composing a tempo.

---

## 2. Time signatures and gradual changes

**"Until the next change" is universal.** Each tempo or meter event holds until the next one. Ramps go _from_ a point _to_ the next point.

- **Logic ramps:** select two points and drag the corner handle at the second point to create a curve. The curve is rendered as tempo steps at the Snap resolution (1/16 gives four changes per quarter note). ([tempo curves](https://support.apple.com/guide/logicpro/create-tempo-curves-lgcpf7cb8542/mac))
- **Logic Tempo Operations** builds a curve from start/end positions and start/end tempos (three curve types). It has a **"Continue with new Tempo"** checkbox that decides whether the end tempo persists after the ramp. ([tempo operations](https://support.apple.com/guide/logicpro/create-and-edit-tempo-changes-lgcp0f61a684/mac))
- **Pro Tools Tempo Operations**: pages for Constant, Linear, Parabolic, S-Curve, Scale and Stretch. It can **fit a given number of bars|beats into a precise time range** (calculating the end time or the tempo). "Preserve Tempo after Selection" is a checkbox. (PT p.1130–37)
- **Ardour**: right-click a tempo marker for **Ramp to Next**, Continue or Set Constant. The marker dialog has BPM at start and end. ([tempo ruler](https://manual.ardour.org/ardours-interface/rulers-and-markers/tempo/))
- **Notation tools express rit./accel. as a target percentage.**
  - Dorico: **Final tempo %** ([Dorico](https://steinberg.help/dorico/v4/en/dorico/topics/notation_reference/notation_reference_tempo/notation_reference_tempo_playback_final_tempo_changing_t.html)).
  - Sibelius: defaults are rit. 75%, poco rit. 90%, molto rit. 50%, accel. 133%. Curve shape is Early, Late or Linear.
  - MuseScore: Amount % plus easing (Normal, Ease in, Ease out) ([MuseScore](https://handbook.musescore.org/text/tempo-markings.md)).

**What happens to existing bars when the meter changes mid-song**

| Tool                          | Behaviour                                                                                                                                                                                                                                                                                                                              |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Logic                         | The Signature track takes Pencil clicks (a dialog with a Beat Grouping field, e.g. "223"). The **Scissors** split a bar: cutting 5/4 at beat 4 gives 3/4 + 2/4. Audio stays where it is in time; bar lines are recomputed. ([edit signatures](https://support.apple.com/guide/logicpro/edit-time-and-key-signatures-lgcpf56f9162/mac)) |
| Pro Tools                     | Change Meter creates **partial measures** where needed and shows the next meter in italics. Time Operations > Change Meter can apply to a _selected range_, _end of session_ or _until next bar_. A **Realign** option chooses whether markers and tracks move. (PT p.1142–46)                                                         |
| REAPER                        | Signature markers must sit at measure starts. With snap off, moving one **modifies the preceding tempo so only whole measures remain**. A truncated measure is marked "\*". (§10.8)                                                                                                                                                    |
| Ableton                       | Signature markers are not quantized. A mid-bar marker creates a crosshatched **"fragmentary bar"** with "Delete Fragmentary Bar Time" and "Complete Fragmentary Bar" commands. ([arrangement](https://www.ableton.com/en/manual/arrangement-view/))                                                                                    |
| Studio One / Cubase           | Signature changes allowed only on beat 1 (Studio One); snap forces bar starts (Cubase).                                                                                                                                                                                                                                                |
| Sibelius / Dorico / MuseScore | A new meter **rebars the music up to the next time signature**. If a passage is selected, Sibelius restores the old meter after it. Dorico's Insert mode decides whether beats are added or the music is rebarred in place.                                                                                                            |

---

## 3. Markers and rehearsal marks

| Tool              | Add / name                                                                                                                                                                                                                                                                 | Navigate                                                                                                                                                | Time vs musical anchoring                                                                                                                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Logic**         | Add Marker button (rounds to a quarter); "Create Marker" (rounds to a bar) or "without rounding"; drag the cycle area onto the track. Length runs to the next marker. Double-click renames. ([add](https://support.apple.com/guide/logicpro/add-markers-lgcp564d6a94/mac)) | Option-click; "Go to Marker Number 1–20"; previous/next. ([navigate](https://support.apple.com/guide/logicpro/navigate-using-markers-lgcpa855b268/mac)) | **Lock SMPTE Position** keeps time when tempo changes; lock icon. ([edit](https://support.apple.com/guide/logicpro/edit-markers-lgcp09f1e34f/mac))                                                                           |
| **Pro Tools**     | Keypad **Enter**; during playback auto-names "Marker 1, 2…". Up to 5 marker rulers.                                                                                                                                                                                        | Period, number, Period; Period +/− next/previous.                                                                                                       | **Bar\|Beat** (chevron, keeps bar) vs **Absolute** (diamond, keeps time). (PT p.1158–71)                                                                                                                                     |
| **REAPER**        | M; Shift+M names. Shift+R region from selection.                                                                                                                                                                                                                           | 1–0 go to markers 1–10; `]` `[` next/previous.                                                                                                          | Beat position by default. (§9.2, §9.8)                                                                                                                                                                                       |
| **Studio One**    | Y; Shift+Y named.                                                                                                                                                                                                                                                          | Shift+N / Shift+B.                                                                                                                                      | Per-marker **note/clock icon**. ([marker track](https://fenderstudiopromanual.fender.com/en/Content/Mixing_Topics/Using_the_Marker_Track.htm))                                                                               |
| **Cubase**        | Alt-click; Shift-Alt-click names. Markers window Cmd-M. ([markers](https://www.steinberg.help/r/cubase-pro/14.0/en/cubase_nuendo/topics/markers/markers_editing_markers_on_the_marker_track_c.html?contentId=HDo_cSKQNeT~Mz_FHFr~Ew))                                      | Keypad numbers _(unverified)_                                                                                                                           | —                                                                                                                                                                                                                            |
| **FCP / Resolve** | **M during playback**; Resolve Cmd-M adds and opens the dialog.                                                                                                                                                                                                            | —                                                                                                                                                       | Resolve **Ripple Timeline Markers** toggle. ([Resolve 20](https://documents.blackmagicdesign.com/UserManuals/DaVinci_Resolve_20_Reference_Manual.pdf), [FCP](https://support.apple.com/guide/final-cut-pro/verf3fd3b5c/mac)) |

**Arrangement sections** (Logic Arrangement track, Studio One Arranger) carry content: moving a section moves its regions and shifts later sections; "Suspend Content Connection" detaches them ([Logic](https://support.apple.com/guide/logicpro/edit-arrangement-markers-lgcpf7c0a3d7/mac)).

**Notation rehearsal marks auto-sequence.**

- **Dorico** Shift-A: marks can be entered in any order and the sequence fixes itself; letters, numbers or bar numbers ([Dorico](https://steinberg.help/dorico/v4/en/dorico/topics/write_mode/write_mode_notations_input/write_mode_rehearsal_marks_inputting_t.html)). Go to Bar Cmd-G; Edit > Go To > Rehearsal Mark ([go to](https://www.steinberg.help/r/dorico-pro/5.1/en/dorico/topics/write_mode/write_mode_navigation/write_mode_navigation_go_to_rehearsal_mark_t.html)).
- **Sibelius** Ctrl+R: deleting B renumbers C, D, E to B, C, D; "Restart sequence" takes _Start at_ plus prefix/suffix. Go to Bar (Ctrl+Alt+G) accepts any format, e.g. "12a" (Reference §5.12).
- **MuseScore** Ctrl+M: inserting between marks gives suffixes until you run **Tools > Resequence Rehearsal Marks** ([handbook](https://handbook.musescore.org/text/rehearsal-marks.md)).

---

## 4. Bar and measure numbering

| Tool          | Mechanism                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Pro Tools** | Event > **Renumber Bars** renumbers every bar without moving anything in time. Time Operations > Move Song Start has "Renumber Song Start To". (PT p.1149–50)                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Logic**     | Drag the **Project Start marker** left of 1 1 1 1 "allowing upbeats … before the first downbeat". A bar-number offset exists only for the printed score (Numbers & Names "Bar Offset"). ([project start](https://support.apple.com/guide/logicpro/set-the-project-start-and-end-points-lgcpce0833d7/mac))                                                                                                                                                                                                                                                                                                    |
| **Cubase**    | Project Setup "Time Offset (Bars+Beats)" is display-only and global. ([project setup](https://www.steinberg.help/r/cubase-pro/14.0/en/cubase_nuendo/topics/project_handling/project_handling_project_setup_dialog_r.html?contentId=c6F9GLHOc6Ffi~leGg4~uw))                                                                                                                                                                                                                                                                                                                                                  |
| **REAPER**    | Right-click the ruler > "Set measure 1 to nearest measure to current edit cursor" or "Reset project start measure". (§12.2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Ardour**    | A **BBT marker** resets bar\|beat numbering to any value (e.g. 7\|3\|0) _at any point_ through a "New Music Time" dialog. ([BBT markers](https://manual.ardour.org/ardours-interface/rulers-and-markers/barsbeats/))                                                                                                                                                                                                                                                                                                                                                                                         |
| **Melodyne**  | Bar 1 is placed at the first downbeat on import. A pickup becomes **bar −1** and leading silence sits in negative time.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Dorico**    | Bar number changes come in four types. **Primary** sets a new number that holds "until the next bar number change". **Subordinate** gives 12a, 12b ("more bars inserted, but the original bar numbers are required"). **Don't Include** takes a bar out of the count. **Continue Primary** returns to the primary sequence. Deleting a change makes later bars follow the earlier sequence again. Pickups are not counted. ([Dorico](https://www.steinberg.help/r/dorico-pro/5.1/en/dorico/topics/notation_reference/notation_reference_bar_numbers/notation_reference_bar_numbers_sequence_changes_c.html)) |
| **Sibelius**  | Bar Number Change offers **New bar number**, **Follow previous bar numbers** (1a/1b formats) or **No bar number (don't count)**. "Follow previous" changes _update as you drag them_; a fixed new number does not. With a selection, numbering reverts after it. Pickup = **bar 0** automatically. (Reference §5.13)                                                                                                                                                                                                                                                                                         |
| **MuseScore** | Measure Properties has **Exclude from measure count** (default for wizard pickups) and **Add to measure number** ("from this point on"). ([measure properties](https://handbook.musescore.org/notation/rhythm-meter-and-measures/measure-properties.md))                                                                                                                                                                                                                                                                                                                                                     |

**Takeaway.** Only notation tools and Ardour support **overrides at any bar**. DAWs offer at most a global offset.

The notation model is the right one for us:

- an automatic sequence;
- sparse override events that hold until the next override;
- separate "set to N", "insert letter suffix" and "don't count" kinds.

---

## 5. Inserting and deleting time (and what happens to everything else)

**Commands**

| Tool           | Insert                                                                     | Delete                                                    | What moves                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------- | -------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Logic          | Edit > Cut/Insert Time > **Insert Silence Between Locators**               | **Cut Section Between Locators**                          | Later regions, bar changes, tempo changes and global score symbols move. If you limit it to selected regions, Logic _asks_ whether to move global events. ([gaps](https://support.apple.com/guide/logicpro/add-or-remove-gaps-lgcp21e2cb21/mac))                                                                                                                                                                      |
| Pro Tools      | Time Operations > **Insert Time** (with _Set Meter_ for the inserted bars) | **Cut Time**                                              | A **Realign** choice: Meter ruler only, or rulers plus tick-based markers and tracks, plus All or No sample-based ones. (PT p.1146–49)                                                                                                                                                                                                                                                                                |
| Cubase         | Range > **Insert Silence**                                                 | **Cut Time / Delete Time**                                | Later events shift. Whether tempo events move depends on the range including the tempo track _(forum, reported as inconsistent)_. **Process Bars** has Insert, Delete, **Reinterpret** ("playback stays the same") and Replace. ([process bars](https://www.steinberg.help/r/cubase-pro/14.0/en/cubase_nuendo/topics/editing_tempo_and_signature/editing_tempo_process_bars_r.html?contentId=mdhsB5YAjyE8JYNbC1z90w)) |
| REAPER         | Insert > Empty space at time selection                                     | Remove contents (moving later items)                      | Ripple modes (Alt+P): Off, Per track, All tracks. Two options on the ripple button: **"Ripple edit all affects tempo map"** and "Add edge points…". Both are off by default, and the guide warns tempo won't move without the first one. (§7.20)                                                                                                                                                                      |
| Ardour         | Track > **Insert Time**                                                    | **Remove Time**                                           | Checkboxes: intersected regions stay, move or split; "**Move markers**" (incl. locked ones); "**Move tempo and meter changes**". ([insert/remove time](https://manual.ardour.org/editing/editing-regions-and-selections/insertremove-time/))                                                                                                                                                                          |
| Ableton        | Insert Silence (Cmd-I)                                                     | Delete Time (Cmd-Shift-Del), Cut Time                     | Acts on all tracks and signature markers. Locators and tempo automation: _unverified_. ([shortcuts](https://www.ableton.com/en/manual/live-keyboard-shortcuts/))                                                                                                                                                                                                                                                      |
| Studio One     | Arranger: drop a section between others (pushes later right)               | Section right-click > **Delete Range** (pulls later left) | Sections carry events, markers, tempo and automation. ([arranger](https://fenderstudiopromanual.fender.com/en/Content/Arranging_Topics/ArrangerTrack.htm))                                                                                                                                                                                                                                                            |
| ArrowVortex    | **Insert beats**                                                           | **Delete beats**                                          | "All notes and tempo changes after the cursor will be shifted…; in the deleted region will be removed." _(source code)_                                                                                                                                                                                                                                                                                               |
| Editor on Fire | Beat > Add                                                                 | Beat > Delete                                             | Re-fits BPM **evenly between the surrounding anchors**, so nothing outside the anchors moves. _(source/manual)_                                                                                                                                                                                                                                                                                                       |

**Keep time position vs keep musical position: the core choice**

Every serious tool exposes this choice somewhere:

- **Per track or item timebase.**
  - Cubase: Musical vs Linear per track ([time base](https://www.steinberg.help/r/cubase-pro/14.0/en/cubase_nuendo/topics/editing_tempo_and_signature/editing_tempo_track_time_base_c.html?contentId=Hs28vBLyQ_8gvoUFodapcQ)).
  - Pro Tools: tick vs sample, where audio defaults to sample-based (PT p.1113).
  - REAPER: Time / Beats (position, length, rate) / Beats (position only), per item, track or project (§7.16).
  - Studio One: track Follow modes Don't Follow, Follow or Timestretch.
- **Per marker.** Logic Lock SMPTE Position, Pro Tools Bar\|Beat vs Absolute, Studio One note/clock icon, Ardour music-locked vs audio-locked.
- **Per edit.**
  - Logic's "Apply Region Tempo" has a **"Maintain relative position of all other regions"** checkbox.
  - Cubase Time Warp has two modes: _Warp Grid_ (musical tracks keep their time) and _Warp Grid (musical events follow)_.
  - Pro Tools Beat Detective's realign dialog offers **Preserve Sample Position**, recommended for "a freely played performance" (PT p.974–83).
  - osu! has the option "Move already placed objects when changing timing". In lazer it only affects that timing section ([osu! wiki](https://osu.ppy.sh/wiki/en/Client/Beatmap_editor/Timing)).

**Ripple vs roll (video editors)**

- Resolve: **Ripple** changes duration and moves everything after; **Roll** keeps the overall duration.
- Final Cut: the **Position tool** leaves a gap clip so later clips stay put; inserting into the storyline ripples later clips right.
- Premiere: **Sync Lock** decides which tracks shift.
- This is the same "shift later vs keep later" decision as our drill choice.

**Mapping to drill.** "Moves keep their counts" is musical timebase plus ripple: a move stretches if time is inserted inside it. "Moves keep their time" is linear timebase or roll: the move holds and absorbs the new beat.

Tools do not default one way for everything:

- the default depends on content type (audio is time-locked, MIDI is beat-locked);
- edits that could surprise the user _ask_ (Logic) or _show a checkbox_ (Ardour, Logic Apply Region Tempo, Pro Tools Realign).

---

## 6. Tapping tempo

| Tool                                 | How it works                                                                                                | Notable details                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Sibelius Live Tempo** (best model) | Play > Live Tempo. Tap while the score plays, and the score follows.                                        | **Calibrate** first (input latency plus your reaction time). **Count-in** (1 bar by default, includes pickups). **Allow beat multiples** (on by default; ×2 or ×3 subdivisions, or once per bar, detected automatically). **Sensitivity** slider (smooth ↔ follow each tap). If you stop tapping, it continues at the last tempo. **Tap points** are set per beat, half-bar or bar, and Sibelius _waits_ at each one. A **fermata waits for your next tap**. A **deviation graph** sits over the score. **Select bars > Clear removes only those bars.** (Reference §6.4, [PDF](https://resources.avid.com/SupportFiles/Sibelius/2020.3/Sibelius_Reference.pdf))                                                                                                                     |
| **Logic Tempo Interpreter**          | Edit > Tempo > Tempo Interpreter. Requires Manual sync mode.                                                | **Tap Step** (1/4 recommended). **Window** (taps outside it are ignored; 0 accepts all). **Tempo Response** (2 if taps are imprecise). **Max Tempo Change**. **Tap Count-In**. **Smoothing**. Pre/Post display flashes yellow when a tap is in range and red when it is out. "Tempo Recording … should normally be deselected". ([interpreter](https://support.apple.com/guide/logicpro/use-the-tempo-interpreter-lgcpbf38527c/mac))                                                                                                                                                                                                                                                                                                                                                 |
| **Logic Smart Tempo Editor**         | During playback press **D** (downbeat hint) or **T** (beat hint). Pressing D while stopped starts playback. | Taps are _hints_ to the detector, not final positions. Hints on every beat of one bar, or downbeats in 3 consecutive bars, define a tempo range. ([hints](https://support.apple.com/guide/logicpro/improve-the-tempo-analysis-using-hints-lgcpb99c36d7/mac))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Cubase**                           | Transport "Tap" button, or **Shift+Space** repeatedly.                                                      | **Tap Tempo Mode**: Automatic (selection start, else last playback start or cursor), Insert at selection start / last playback start / cursor, Set project tempo, Display only. The message shows where the event will go. For a full map, record MIDI taps and run MIDI > Functions > **Calculate Tempo from MIDI Events** (formerly Merge Tempo from Tapping). ([tap modes](https://www.steinberg.help/r/cubase-pro/14.0/en/cubase_nuendo/topics/editing_tempo_and_signature/editing_tempo_tap_tempo_modes_r.html?contentId=XLKNLTtTK9ix6R5_Y~1QnQ), [from MIDI](https://www.steinberg.help/r/cubase-pro/14.0/en/cubase_nuendo/topics/editing_tempo_and_signature/editing_tempo_tempo_changes_unknown_project_track_from_tapping_setting_t.html?contentId=lOW693sLmgbBe_CWaYLH8w)) |
| **osu!**                             | T or "Tap Here!".                                                                                           | lazer ignores the first 4 taps, averages up to 128, writes a **rounded** BPM into the _selected timing point_, and has Play-from-point next to it _(source)_.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Pro Tools**                        | Conductor off, click the tempo field, press **T**.                                                          | Averages the last 8 taps. It sets a single tempo, not a map (PT p.1118). Beat Detective's "Tap End B\|B" works out the bar count of a selection.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Ableton / rekordbox / djay**       | Tap button.                                                                                                 | Ableton can start playback after 4 taps. These give a single tempo only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

**Patterns worth copying**

- Latency calibration (Sibelius).
- Auto beat multiples (Sibelius).
- A rejection window with a visual in/out indicator (Logic).
- Scoped clear of a selection (Sibelius).
- An explicit "where will this go" message (Cubase).
- Tap-as-hint plus a detector (Logic).

---

## 7. Aligning the grid to audio

**Interaction A: drag a grid line onto the heard beat, and decide what moves**

| Tool                             | Gesture                                                                                                                                                                                                                                                            | What happens before / after                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Logic Beat Mapping track**     | Click a ruler position, drag the line's foot onto the transient (Ctrl snaps where there is no note). "Analyze Transients" draws blue lines with a −/+ threshold (start low). ([audio](https://support.apple.com/guide/logicpro/on-audio-regions-lgcp6338b8d1/mac)) | Inserts tempo changes; audio keeps its time. Work **left to right**; earlier mappings stay. Apple: don't edit the Tempo track afterwards.                                                                                                                                                                                                                                                                        |
| **Cubase Time Warp (Warp Grid)** | Drag a musical position onto its time position.                                                                                                                                                                                                                    | "The tempo value of the last tempo event before the click position is changed"; if later events exist, "a new tempo event is created at the click position", so later stays fixed. ([time warp](https://www.steinberg.help/r/cubase-pro/14.0/en/cubase_nuendo/topics/editing_tempo_and_signature/editing_tempo_time_warp_musical_positions_to_time_positions_adjusting_t.html?contentId=Z7eYwo~5Uxt_zFlvlEA_qw)) |
| **REAPER**                       | **Ctrl-drag** a time-signature marker; **Ctrl+Shift-drag** a tempo marker.                                                                                                                                                                                         | The previous tempo (or earlier markers) adjust; **later tempo changes stay in place**. Markers can't cross and turn red while dragged. (§10.8)                                                                                                                                                                                                                                                                   |
| **Pro Tools**                    | Drag a **Bar\|Beat marker**; or **Identify Beat**: select audio, type its bar\|beat.                                                                                                                                                                               | The marker keeps its bar\|beat; its BPM and the one to its left recompute; markers to the right stay. Identify Beat deletes tempo events in the range. (PT p.1138–41)                                                                                                                                                                                                                                            |
| **Ardour Grid tool**             | Drag a bar line that has a marker; drag _between_ bar lines.                                                                                                                                                                                                       | Changes it and the previous marker; the second gesture creates a ramp. Left to right, then revisit. ([toolbox](https://manual.ardour.org/ardours-interface/the-toolbox/))                                                                                                                                                                                                                                        |
| **Melodyne Assign**              | Time Grid on: Quantized Movement drags a beat (later beats follow); Wave tool moves one bar line most, neighbours less. Grid off: single beats. Drag "mountains/valleys" to add or remove beats.                                                                   | Notes never move.                                                                                                                                                                                                                                                                                                                                                                                                |
| **Moonscraper**                  | BPM marker with **Anchor** on; Ctrl+right-drag a marker.                                                                                                                                                                                                           | Anchors are "locked into that place in time despite any changes to bpm values before". Editing an earlier BPM recomputes the BPM before the next anchor; the drag rewrites the previous BPM, clamped at the next anchor. ([repo](https://github.com/FireFox2000000/Moonscraper-Chart-Editor))                                                                                                                    |
| **Editor on Fire**               | Drag any beat; **A** toggles an anchor; "Anchor measures" anchors every downbeat.                                                                                                                                                                                  | **Dragging auto-anchors**: "an anchor will not move unless dragged, nonanchor beats will adjust to fit". Shift-drag keeps notes from following. "Lock tempo map" shows in the title bar.                                                                                                                                                                                                                         |
| **ArrowVortex visual sync**      | Drag a row to the mouse (destructive vs non-destructive mode).                                                                                                                                                                                                     | Destructive changes the previous BPM so later material moves. Non-destructive re-solves both sides so later beats stay, refusing to pass them ("Cannot move row past next BPM change").                                                                                                                                                                                                                          |
| **Ableton (Tempo Leader)**       | Double-click to add warp markers; hover shows gray pseudo-markers on transients.                                                                                                                                                                                   | "The Set plays back at the tempo determined by the clip's Warp Markers". Manual: warp long files **left to right in sections**, pinning each, metronome on. ([warping](https://www.ableton.com/en/manual/audio-clips-tempo-and-warping/))                                                                                                                                                                        |
| **djay**                         | "Add anchor".                                                                                                                                                                                                                                                      | Between anchors djay adapts timing. ([help](https://help.algoriddim.com/user-manual/djay-pro-mac/dj-tools/beatgrids-bpm-sync/beatgrid-editor))                                                                                                                                                                                                                                                                   |

**Interaction B: smart handles (Logic Smart Tempo Editor, beat-marker mode).** Hovering a beat marker shows handles: **Move Marker** (one beat), **Scale Selection** (no selection = the bar), **Scale Left, Move Right** ("for temporary speed-ups or slow-downs"), **Scale All**, **Move All**, **Set Downbeat**. **Cmd-drag** snaps to "significant analysis points"; ×2 / /2 buttons; "Set Average Tempo within Each Bar". Manual edits survive reanalysis and **Lock Range** protects a section. A built-in **metronome with click/audio balance** is how you verify. ([beat markers](https://support.apple.com/guide/logicpro/correct-tempo-analysis-results-beat-markers-lgcp644481aa/mac), [lock range](https://support.apple.com/guide/logicpro/protect-smart-tempo-edits-by-locking-a-range-lgcp6e8d3a01/mac))

**Interaction C: one measure at a time.** REAPER "Create measure from time selection (detect tempo)" (Alt+Shift+C): select exactly one bar of audio, run it, repeat; a "(new time signature)" variant handles meter changes (§9.16.5). Cubase **Process Tempo**, Pro Tools **Tempo Operations** and Logic "Adjust Tempo using Region Length and Locators" fit N bars into a time range.

**Automatic detection and correction**

Correction controls offered:

- **Logic Smart Tempo**: ×2, /2, Set Downbeat, hints. Meter changes can **only** be found through signature hints.
- **Cubase Tempo Detection**: ×2, /2, **×4/3 and ×3/4** (for 6/8 vs 2/4 confusion), **Offbeat Correction** (shift by half a beat), Smooth Tempo. Requires ≥7 s and "discernible beats". It switches all tracks to linear timebase. ([panel](https://www.steinberg.help/r/cubase-pro/14.0/en/cubase_nuendo/topics/editing_tempo_and_signature/editing_tempo_tempo_detection_panel_r.html))
- **Melodyne**: per-region subdivision (2→3 for triplet feel, 4 to halve). "Detect Tempo of Selection and Merge with Current Tempo". Advice: detect from reliable instruments only.
- **rekordbox**: **Normal** (constant) vs **Dynamic** analysis. Edited grid lines turn **blue**. Re-analysis **overwrites** manual edits unless **Analysis Lock** is on. ([manual PDF](https://cdn.rekordbox.com/files/20260807093645/rekordbox7.2.18_manual_EN.pdf))

**Reliability on rubato or live acoustic music.** Every vendor hedges:

- Logic: complex or irregular material "may not initially produce useful results". For material with tempo changes, cut it into pieces, Lock SMPTE Position on each, then map them. ([auto beat mapping](https://support.apple.com/guide/logicpro/automatic-beat-mapping-lgcp85d272f0/mac))
- Pro Tools: the selection should "contain no tempo or meter changes".
- Ableton: auto-warp "usually estimates … correctly" but may miss the downbeat.
- osu!: live click-free recordings are "a tough feat" ([guide](https://osu.ppy.sh/wiki/en/Beatmapping/Timing)).
- Ardour: built a manual drag tool specifically for this case.
- The earlier internal survey of beat-tracking models found roughly 60–77% F1 on expressive or classical material (one beat in four wrong). Treat detection as **snap targets and suggestions**, never as the answer.

**Fermatas and pauses**

- **StepMania/ArrowVortex STOP**: the beat clock freezes for N seconds. ArrowVortex can "Convert the selected region to a stop".
- **Melodyne**: double-click the ruler to create a **tempo region** that protects a pause. **Free Tempo Assignment** handles rubato: drag each bar start onto its note, then Finalize.
- **Ardour**: audio-locked time signatures for pauses that can't be counted.
- **Sibelius Live Tempo**: the fermata waits for the next tap.
- **Dorico / Sibelius / MuseScore**: hold % and gap % on the fermata.
- **Logic**: a tempo event (a very slow beat) is the only mechanism.

**Verifying alignment**

- **Metronome or click** following the map: Logic K, plus the Smart Tempo Editor click/audio balance; rekordbox's three-level metronome; EOF and osu! metronome ticks.
- **osu! lazer WaveformComparisonDisplay**: 8 stacked rows, each cut at a predicted beat. Correct timing gives a vertical column of transients; drift gives a diagonal. Click to lock the view _(source)_.
- **Tempo blips as error signals**: Pro Tools notes that neighbouring tempos deviating in opposite directions flag a misplaced marker. Sibelius shows a deviation graph.
- **Dorico Find Tempo**: ranks candidate tempos by average frames off each marker (shown per marker as frames, seconds and fraction of a whole note). It is the clearest "how wrong is each point" readout found. ([Find Tempo](https://www.steinberg.help/r/dorico-pro/5.1/en/dorico/topics/write_mode/write_mode_notations_input/write_mode_markers_find_tempo_dialog_r.html))

---

## 8. What makes this easy for non-experts

- **Context-chosen defaults.** Logic's **Automatic** tempo mode picks Keep if there is a musical reference, otherwise Adapt. Curve colours on the tempo track show what will change: **blue** unchanged, **orange** to be defined, **red** to be replaced. ([tempo mode](https://support.apple.com/guide/logicpro/choose-the-project-tempo-mode-lgcpca199cf6/mac))
- **Ask once, remember the answer.** After Logic Free Tempo Recording, a dialog asks Apply region tempo / Apply average / Apply project tempo to region / Don't analyze. The default is set in Project Settings, including "Ask". ([free tempo](https://support.apple.com/guide/logicpro/use-free-tempo-recording-lgcp36952350/mac))
- **Coarse first, fine later.** Apple advises a few downbeat hints first and beat markers only if needed. Hint mode is the default.
- **Edited vs automatic is always visible.** rekordbox blue lines; Logic manual beat markers survive reanalysis; Logic and Ardour lock icons; EOF "(Tempo map locked)".
- **Constrained drags with feedback.** Logic points move only vertically or horizontally. REAPER markers turn red and can't cross. ArrowVortex refuses with a message. Moonscraper clamps at the next anchor.
- **Musical vocabulary.** Notation tools say "rit. 75%", "Final tempo %" and "bar 12a" rather than BPM curves and ticks.
- **Work left to right** is the explicit advice in Logic Beat Mapping, Ableton and Ardour. It keeps a mental model of "everything before here is done".

---

## 9. Synthesis: recommendations for OpenMarch tempo mode

**1. Where it lives**

- A **Tempo mode toggle** that reveals lanes in the existing timeline: _Tempo_, _Meter_, _Marks_, plus a _bar-number row_. This follows Logic's global tracks (G, Configure Global Tracks) and Pro Tools' Conductor rulers. Do not build a separate editor window. Keep the drill rows visible so the effect on pages is obvious.
- Tempo points: **click to add, drag vertically to change value, double-click to type BPM**. Constrain each drag to one axis (Logic). Dragging the segment between two points moves both (Logic).
- Offer a numeric **list view** as a secondary panel for exact entry (Logic Tempo List, Cubase Tempo Track Editor).

**2. Meter and gradual changes**

- Each event holds **until the next change**, and meter changes snap to the start of a measure. If a change would leave a partial measure, show it marked (REAPER "\*", Pro Tools italics, Ableton fragmentary bar) and offer **Complete / Remove partial measure** (Ableton).
- Ramps: right-click a tempo event > **"Ramp to next"** (Ardour), or draw a ramp across a selection. Label ramps musically: "rit. to ♩=96" or "rit. 75%" (Dorico Final tempo %, Sibelius defaults).
- Changing a meter in tempo mode must **never move audio**. It only regroups counts into measures. Default it to apply "until next meter change" (Pro Tools "until next bar", Sibelius rebar-to-next).

**3. Rehearsal marks**

- An **auto-sequencing** mark (A, B, C… or numbers), with "restart sequence at" (Sibelius, Dorico). Resequence automatically on insert or delete. Don't make users run a command (MuseScore's suffix plus Resequence is the worse version).
- Marks are **musically anchored** (attached to a count, Pro Tools Bar|Beat type), so they follow tempo edits.
- Provide **M while playing** to drop a mark (FCP, Resolve, REAPER), next/previous mark keys, and **Go to bar / mark** (Dorico Cmd-G, Sibelius Go to Bar accepting "12a").

**4. Measure numbers**

- Use Dorico's model: automatic numbering plus sparse **bar-number change events** that hold until the next one.
  - _Set to N_.
  - _Continue with suffix_ (12a, 12b), for inserted bars that keep the original numbers.
  - _Don't count this bar_.
- A **pickup is bar 0** by default (Sibelius), or excluded from the count (MuseScore, Dorico). Count-off or lead-in counts before bar 1 get negative or zero numbers (Melodyne bar −1, Logic Project Start).
- Overrides that "follow the previous number" should move with their bar. "Set to N" stays N (Sibelius drag behaviour).

**5. Inserting and deleting beats**

- Make the choice explicit **per edit**, in a small popover with a remembered default:
  - **"Shift everything after"**: ripple. Moves keep their counts; drill after the edit slides in time. This follows Resolve Ripple, ArrowVortex Insert beats, Logic Insert Silence.
  - **"Keep everything else in place"**: roll. The new beat is absorbed between the neighbouring anchors, and the move spanning it gets a hold or stretch. This follows EOF Add beat re-fitting between anchors, ArrowVortex non-destructive shift, FCP Position tool.
  - Copy Logic: if the edit is ambiguous, _ask_. Copy Ardour and Pro Tools: list which things move (marks, meter changes, bar-number changes) as checkboxes, all on by default.
- Since audio never moves, inserting a beat in tempo mode really means **re-dividing a fixed stretch of audio into one more count**. Present it that way: "This measure now has 5 counts in the same time" vs "add one count of time here; later counts shift".

**6. Tapping**

- **Tap a region, not the whole show.**
  - Select a range (or start from any count) and tap with a **count-in from the music**.
  - Taps overwrite only the tapped span.
  - Stopping keeps the rest (Sibelius Clear-on-selection, Cubase insert-at-selection mode).
  - Show "next tap sets: m. 23 count 1" (Cubase's "where it goes" message).
- Use **latency calibration**, **auto beat multiples** (taps on half notes or bars) and a **rejection window** with an in/out flash (Sibelius plus Logic Tempo Interpreter).
- Taps are a **draft layer**. Show ghost beats, let the user drag or delete them, then Apply (Logic hints and Apply Changes). A fermata = a long gap the user taps through (Sibelius "waits for next tap").

**7. Aligning grid to audio**

- **Drag a count or bar line onto the music** in tempo mode, with handle semantics borrowed from Logic's Smart Tempo Editor:
  - default **Scale left, move right** (the previous segment re-spaces; later counts shift with their tempos unchanged);
  - a modifier for **Move one count**;
  - a modifier to disable snapping.
  - **Snap to detected onsets** while dragging (Logic Cmd-drag, Cubase hitpoints, Ableton pseudo markers).
- **Pins.** Any count the user drags becomes pinned automatically (EOF). Drags re-space only between the nearest pins and are **clamped with a visible reason** (Moonscraper, ArrowVortex HUD, REAPER red marker). Add "Pin all measure starts up to here" so users can work left to right (EOF Anchor measures, Ableton advice).
- **Verification.**
  - A click that follows the counts, with a **click/music balance**: the Logic Smart Tempo Editor pairs a metronome with a balance slider.
  - An **osu!-style stacked check view** for a selected passage.
  - Colour segments whose implied tempo jumps oddly. A spike-then-dip pair means one misplaced count (Pro Tools tip).
- Fermatas: model them as a **held count** (one count with its own length, like a StepMania STOP or a Melodyne protected region). Do not use a fake BPM.
- Auto-detect is **suggestions only**. Provide ×2 / ÷2 / ×3⁄2 fixes (Logic, Cubase, Melodyne) and never overwrite manual pins (rekordbox Analysis Lock, Logic Lock Range).

**8. Non-expert ease**

- **Progressive disclosure:**
  1. Set the first downbeat and one tempo (ArrowVortex Adjust Sync, rekordbox "set beat 1").
  2. Drag a few measure starts into place.
  3. Then reach for ramps, meter changes and taps.
- **Always show what is confirmed and what is guessed.** Pinned vs computed counts (rekordbox blue), plus Logic-style colouring of what an edit will change _before_ release.
- Use musical words ("rit.", "hold", "bar 12a", "count 3"), not ticks or BPM curves. Remember the user's answer to the shift-or-keep question (Logic Smart Tempo "Ask").

---

## 10. False parallels: things not to copy

- **Warping, flex, elastic and stretch markers** (Ableton default warp, Logic Flex/Smart Tempo "Align", Pro Tools Elastic Audio, REAPER stretch markers, Cubase Free Warp, Studio One Timestretch, Bitwig beat markers). They change the audio to fit the grid. Our audio is the truth and must never be retimed.
- **Logic Keep vs Adapt as a project-wide mode.** Apple itself warns that Adapt should be used "only temporarily … with some caution". We are always in "adapt"; there is no mode to pick.
- **Track timebases as a per-track setting.** Drill isn't multitrack audio. The keep-time vs keep-counts question belongs on the edit, not hidden in a track inspector.
- **Live conducting** (Logic Tempo Interpreter driving playback, Ableton Tempo Follower, Sibelius _Live Playback_). These drive playback in real time. We need a stored map; take only their tap-filtering ideas.
- **Single-tempo tap buttons** (Pro Tools, Ableton, rekordbox, osu! rounding to whole BPM). A live band is never one tempo. Whole-BPM rounding is wrong for us.
- **DAW Insert Silence semantics.** Inserting time in a DAW inserts _silence into the audio_. For us, "insert a beat" cannot add audio, so the label must not suggest that.
- **Re-analysis that overwrites manual work** (rekordbox without lock, Cubase Tempo Detection switching all tracks to linear, Logic Beat Mapping being broken by later tempo-track edits). Manual pins must be sacred.
- **Global-only bar offsets** (Cubase Time Offset, Logic score Bar Offset). Too weak for shows with resets and skips. Use notation-style per-bar overrides.
- **Arrangement tracks that move content** (Logic Arrangement, Studio One Arranger, Cubase Arranger chains). They rearrange a song; rehearsal marks for us are labels on counts, not containers.

---

## 11. Open questions for the product owner

1. **Default for insert or delete beat.** Should the default be "shift everything after" or "keep everything else in place"? Should we ask every time, or ask once and remember (Logic "Ask")?
2. **Fermatas.** Should a fermata be one held count (its own length), extra counts, or a "free time" region with no count grid (Melodyne Free Tempo Assignment)? This affects how drill counts are labelled.
3. **Pins.** Should dragging pin automatically (EOF), or only an explicit "pin" action? Should measure starts pin automatically once confirmed?
4. **Detection.** Should onset detection be on by default as snap targets, or opt-in? Do we ever auto-place counts, or only suggest them?
5. **Bar numbering.** Should pickup and lead-in counts be bar 0 or negative bars? Which override kinds do we need (set N, letter suffix, don't count), and should overrides follow their bar when beats are inserted before them?
6. **Rehearsal marks.** Letters, numbers, or user-chosen? Must they sit on a measure start, or can they sit on any count?
7. **Ramps.** Should rit./accel. be entered as an end tempo, a % (notation style), or only by dragging counts?
8. **Scope of a tap pass.** Should taps overwrite only the tapped range and leave the rest untouched, or re-fit up to the next pin?
9. **Verification.** Should we ship a stacked "beat check" view (osu!) in v1, or start with click plus waveform only?
10. **Meter changes vs drill pages.** If a meter change re-groups counts, do pages keep their count numbers or their measure:count labels?
