<!-- cspell:disable -->

# Prior art: what happens to a set, frame or cue nobody edited

Research for the OpenMarch "page 3 snaps back after editing page 2" problem. Date: 2026-10-08.
How sources are marked:

- **[F]** means I fetched the page or read the search snippet of the cited source.
- **[L]** means I checked it locally (Blender 5.2.2 at `~/opt/blender`).
- **[M]** means it is from memory and was not verified this session. Treat [M] claims as hypotheses.

## TL;DR

- **Lighting cue consoles (ETC Eos, grandMA) are the closest analogue.** They also solved this
  exact problem. A cue stores only _move instructions_, which are values that changed. Every
  other value is _tracked_, meaning derived from the last move. An edit to cue N tracks forward
  until the next move or block. The mode, Tracking or Cue Only, is a per-edit override, not a
  data model switch. Every value shows on screen as moved, tracked or blocked, by color.
- **Animation and DAW tools all use sparse keys.** Only keys or breakpoints are stored; the
  rest is derived. "Hold" (After Effects, Rive), "Constant" (Blender) and "Stepped" (Spine)
  are interpolation modes on that sparse data. When users have dense copies, the tools add an
  explicit _propagate_ command, for example Blender `Pose > Propagate` and Pro Tools "Write to
  Next Breakpoint / End / Punch".
- **Drill tools are mixed:**
  - EnVision has dense **Sets**, which every performer must hit, plus sparse **Subsets**,
    where only attached performers have a dot. It also has an explicit **Revert Performer /
    Step Through** tool that turns a range into a hold.
  - Pyware's model is count-based: "no editing has been done at those counts, so the
    performers are holding in place". A deleted transition becomes a Hold.
  - I found no drill tool with automatic forward propagation of an edit into later dense sets.
    The standard workaround is copy/paste or revert-style tools.
- **Recommendation for OpenMarch:** use (B) sparse, "defined here vs. inherited" storage with
  Eos-style semantics:
  - An edit at page N writes a definition at N only.
  - Later inherited pages follow automatically, up to the next definition.
  - Offer a per-edit "this page only" option, which writes a definition on N+1 that keeps the
    old value, like Eos Cue Only and grandMA "blocked in the next cue".
  - Offer "Hold here" / "Pin", which is a block.
  - Make delete and insert explicit about what happens to inherited values.
  - Show defined vs. inherited state per marcher per page.
  - This maps directly onto the timeline "moves as clips with absolute destinations, hold when
    no move" direction: a page without a move clip for a marcher _is_ an inherited hold.

## 1. Drill design tools

### Pyware 3D

- **Data model.** Pyware has a count track, with sets marked by page tabs. Editing happens at
  the Red Anchor, the end of a transition, against the Yellow Anchor, the start, which is shown
  as a background reference. Transitions can start and end on any count, not just set counts.
  Pyware says that at counts where "no editing has been done at those counts, so the performers
  are holding in place". [F] https://www.pyware.com/guide/3d/11.0/en/topic/count-track
- **Delete transition.** "Delete Transition" "resets the transition between counts X and X" of
  the selected positions "to a 'Hold' (or mark time)". So a hold is the absence of a
  transition, which is the same as OpenMarch's planned "no clip = hold". [F]
  https://www.pyware.com/guide/3d/11.0/en/topic/edit-delete
- **Copying between sets.** Copy and paste works per performer, with the options "same matching
  order", "different matching order" and paste-as-new. This is how designers copy positions
  between sets. [F] https://www.pyware.com/guide/3d/10.0/en/topic/edit-paste-performers
- **Other editing tools.** Cut/Paste Range and Lengthen/Shorten Transition operate on count
  ranges. The docs do not state the effect on later sets. [F]
  https://www.pyware.com/guide/3d/11.0/en/topic/edit-cut-range
- **[M] Unverified.** I believe editing a performer's spot at a set in Pyware does _not_
  rewrite later sets that already have their own transitions. A performer holding through later
  counts appears to follow, because the later counts are derived from the last transition end.
  I could not confirm this from a fetched page. It is worth a 5-minute test in Pyware if anyone
  has a licence.
- **Forum complaints.** Pyware forums and r/marchingband threads did not surface through search
  on this specific issue. No citation.

### EnVision (Box5)

- **Add Set.** "Inserts a set into the timeline, copying the set information from the current
  set". The docs say this copies counts and tempo; it is not explicit about positions. [F]
  https://box5software.com/envision-help-center (Timeline section). The Box5 forum warns that
  adding a set on a synced set pushes later sets and can give wrong counts. [F] same page and
  https://envision.box5software.com/forum/viewtopic.php?t=1473
- **Editing a set** "will automatically adjust the performer's path, both before and after the
  set". [F] help center.
- **Subsets are the key sparse construct.**
  - "A Subset is a point in time between Sets where some Performers may have a defined
    position"
  - "Performers who are not attached to this Subset will move directly from the previous Set to
    the next Set."
  - Moving a performer on a subset attaches them.
  - There are commands for "Remove Selected from Subset", "Crop Selected from Subset",
    "Convert Set to Subset / Subset to Set" ("make it a mandatory set for all performers").
  - [F] help center. Box5 CEO answer: "Performers are not attached to subsets by default when
    they are created." [F] https://forum.box5software.com/viewtopic.php?t=1362
  - Note that an unattached performer _interpolates_ through a subset; they do not hold. That
    is a "pass-through" default, not "hold last".
- **Revert Performer tool.** "Return selected performers to a previous location"; "may also be
  reverted to a future set". It has two modes:
  - **Skip Over** copies the previous positions into the current set only.
  - **Step Through** "copies the beginning set to every intermediate set and subset,
    effectively turning the whole range into a hold".

  This is an explicit, user-invoked _propagate_ over dense data. Its existence, and the forum
  user's reaction "was clearly created just for this", shows that designers hit the
  "make these sets match" chore. [F] help center and forum t=1362.

### Ultimate Drill Book (UDB), StageWrite, dance formation apps

- **UDB.** UDB is a performer-facing viewer that imports Pyware files (coordinates, paths,
  music sync). It is not an authoring tool for this question. [F] https://dev.pyware.com/?p=45522
- **StageWrite** (stage management). Reviewers praise "duplicate the previous stage picture and
  then change any element". That is a dense copy-forward model, the same as OpenMarch today.
  [F, snippet] https://dance-teacher.com/?p=3382
- **Choreographic and Formation** (dance). These use formations with transition durations, and
  new formations are added or cloned one slide at a time. I found no documented propagation
  or inheritance. [F, store listings]
  https://apps.apple.com/us/app/-/id1608391996 , https://apps.apple.com/jp/app/formation/id1435689225
- **Research.** ChoreoVis (2024) notes that adjusting formations later is time-consuming. [F]
  https://arxiv.org/pdf/2404.04100
- **ArtiChoke and Field Pro.** I could not find documentation for either.

**Takeaway.** Drill and formation tools mostly duplicate forward and give _explicit_ tools,
such as copy/paste and Revert/Step Through, to re-sync later sets. EnVision's Subset is the
only per-performer "defined here or not" concept I found in the domain. It is a precedent for
storing _some_ marchers on a page and deriving the rest.

## 2. Animation keyframe tools

- **Blender.**
  - Only keyframes are stored. Values between keys come from the F-curve interpolation.
    "Constant" interpolation holds the key's value until the next key, giving a stepped curve
    used for blocking.
  - Extrapolation holds the first and last key values outside the key range by default.
  - [F, snippet] https://docs.blender.org/manual/ja/2.92/editors/graph_editor/fcurves/introduction.html
- **Blender Pose > Propagate** "Copy selected aspects of the current pose to subsequent poses
  already keyframed". [L, from operator RNA in Blender 5.2.2] Its termination modes:
  - `NEXT_KEY` propagates the pose to the first keyframe after the current frame only.
  - `BEFORE_END` propagates to all keyframes from the current frame until no more are found.
  - `BEFORE_FRAME` propagates up to a given frame.
  - `SELECTED_KEYS` propagates to the selected keyframes.
  - `SELECTED_MARKERS` propagates to keyframes on frames with scene markers after the current
    frame.
  - `LAST_KEY` propagates to the last keyframe only, making the action cyclic.

  The original 2011 tool had a heuristic **"While Held"** mode, which "tried to guess when to
  stop by checking pauses in the animation curves". It was removed from the docs and the
  operator in 2023. [F] https://lists.blender.org/pipermail/bf-docboard-svn/2023-January/006908.html ,
  https://docs.blender.org/manual/en/4.2/animation/armatures/posing/editing/propagate.html
  (search snippet; the page itself returned 403). **Lesson:** animators with _dense duplicated
  keys_, such as hold keys made by copying a pose, need a propagate command. An _automatic_
  "guess where the hold ends" mode was too magic and got dropped. Explicit stop rules survived.

- **After Effects.** "Toggle Hold Keyframe" sets outgoing interpolation to Hold, so the value
  stays until the next keyframe. Hold keys draw as a square or half-square icon. Users trip on
  the fact that it affects only the _outgoing_ side. [F, forum]
  https://community.adobe.com/t5/after-effects-discussions/keyframes/td-p/12885083
- **Rive.** Hold "doesn't interpolate values between keys and simply holds the current value
  until the next key is reached". [F] https://rive.app/docs/editor/animate-mode/interpolation-easing
- **Spine.** "Stepped" curve: "the value won't change until the second key is set". [F, forum]
  https://en.esotericsoftware.com/forum/d/6469-no-interpolation-between-specific-keyframes
- **UI convention.** Keys are drawn as diamonds on a dope sheet, while derived frames are
  empty. Interpolation type is shown by key shape. This is the "defined here" marker.

## 3. DAW automation

- **Model.** Breakpoint envelopes are sparse. A value changes between breakpoints by the line
  shape and holds after the last breakpoint. [M for hold-after-last; F for breakpoint editing]
  https://www.ableton.com/en/manual/automation-and-editing-envelopes/
- **Ableton.** Touching an automated control _overrides_ the automation. The automation LED goes
  off, and a global **Re-Enable Automation** button lights up. This is an explicit "you've
  diverged from stored data" state with a one-click restore. [F] same URL.
- **Logic.** Touch mode returns to existing automation on release. Latch mode makes "the new
  parameter value replace existing automation" until stop. [F] Apple Logic Remote guide
  https://support.apple.com/guide/logicremote-logicpro-iphone/chscdb296afb/ios
- **Pro Tools Manual Write commands** are the closest DAW analogue to "propagate until the next
  defined point". They are listed in the Automation window and EUCON (Pro Tools Avid commands
  list, v2022.4):
  - **Write to Next Breakpoint** "writes automation statically from the point where you click
    it to the next breakpoint". This is _exactly_ "propagate forward until the next touched
    point".
  - **Write to Selection End / Session End** writes "from the point where you click it to
    either the selection end or the end of the session".
  - **Write to Selection Start** writes backward.
  - **Write to Punch Point** writes "back to the point at which you first started making
    adjustments".
  - **Write on Stop** variants defer the write until transport stops.
  - Sources: [F] https://www.production-expert.com/production-expert-1/mastering-pro-tools-automation-manual-write-write-on-stop-and-write-to-current-explained ,
    https://resources.avid.com/SupportFiles/ProMixing/Pro_Tools_EUCON_Commands_v2022.4.pdf
- **Lesson.** DAWs give the _user_ the choice of how far a change extends: to the next
  breakpoint, to the selection, or to the end. They do not decide it silently. "To next
  breakpoint" is the most-used safe default [M].

## 4. Lighting consoles: tracking vs. cue only (closest analogue)

### ETC Eos

- **Data model.**
  - "A move instruction is any change to a parameter from its previous stored value." Only
    moves are stored; other values are _tracked_ from earlier cues.
  - "changes to a parameter in a cue will track forward through the cue list until a move
    instruction".
  - "Manual data will remain at its value until a move instruction is provided for it."
  - [F] https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/04_System_Basics/Important_Concepts.htm
- **Tracking mode (default).** "changes move forward through the cue list until a block or a
  move instruction is encountered." [F]
  https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/12_Cues_and_Cue_Lists/About_Cues_and_Cue_Lists.htm
- **Cue Only mode.** "changes to cues have no impact on subsequent cue data". "Cue Only" applied
  to one record or update "prevents changes from tracking forward into subsequent cues, unless
  overridden with a track instruction". Mechanically, recording mid-list Cue Only **adds a move
  instruction to the next cue** for levels that were tracking, so the old value is preserved
  downstream. The `[Q Only/Track]` key posts the opposite of the current mode for one command.
  [F] Important Concepts and About Cues pages; mode setting
  https://support.etcconnect.com/ETC/Consoles/Eos_Family/Software_and_Programming/How_to_Enable_and_Disable_Tracking_in_Eos
- **Block.**
  - "Blocked channel data is an editing convention only, and it prohibits tracked
    instructions". It turns a tracked value into a hard stop for later edits.
  - **Assert** is the playback counterpart, forcing a tracked or blocked value to replay.
    The canonical use is a blackout cue.
  - The trade-off, from the community: once blocked, "you could no longer do a track edit from
    the first cue to change the background value on those channels".
  - [F] Important Concepts; https://community.etcconnect.com/control_consoles/eos-family-consoles/f/eos-family/471/how-to-use-the-assert-and-assert-time
- **Trace.** Trace is an update that writes a live change _backward_ into the cue where the
  value was last moved, then tracks forward. [F] Important Concepts. This is the analogue of
  "I'm on page 5, but this marcher's spot is really defined on page 2. Edit it at its source."
- **Delete.** Deleting a cue in tracking mode loses its moves, so later cues inherit from the
  cue before. `Delete Cue N [Q Only]` keeps the later cues' look by pushing the values forward.
  ETC staff: you "cannot simply delete a cue without explicitly stating where you'd want those
  values to move". [F, snippet]
  https://community.etcconnect.com/control_consoles/eos-family-consoles/f/eos-family/53366/delete-cues-without-messing-up-the-tracking
- **Insert.** When you record a new cue between two others in Track mode, its changes track
  into the following cues until a move. In Cue Only, the next cue gets moves that preserve its
  old look. [F] Important Concepts. ControlBooth users single out insert as confusing ("What
  happens when you 'insert' a cue between two others"). [F]
  https://www.controlbooth.com/threads/tracking-consoles.25719/
- **UI: the gold standard for "defined here vs. inherited".** Every value in Live/Blind is
  color-coded:
  - **blue** means a move up
  - **green** means a move down
  - **magenta** means _tracked_, unchanged from the previous cue; a tracked zero shows as "-"
  - **white** means blocked; _underlined_ white means an auto-block
  - **red** means manual, not yet recorded

  [F, snippets] https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/04_System_Basics/04_Live_and_Blind_[Tab_1]/Indicators_in_Live_and_Blind.htm ,
  https://support.etcconnect.com/ETC/Consoles/Eos_Family/Software_and_Programming/Channels_Are_Stuck_On_and_Have_a_Colored_Value ,
  https://community.etcconnect.com/control_consoles/eos-family-consoles/f/eos-family/25028/what-do-different-colours-of-fixture-parameters-mean-and-why-are-my-lights-being-held-on/84017 .
  The "About" key shows the _source_ cue of a tracked value. [F, snippet]

### grandMA2 and grandMA3

- **Tracking.** "the new value for fixture 1 tracks into cues 4 and 5, thus changing the look
  of the cues".
- **Cue Only store.** "the tracked values will be blocked in the next cue or cue part to
  preserve the previous look on stage". It is unavailable on the last cue, since there is
  nothing downstream. It is chosen per store, with `/CueOnly` or a pop-up. [F]
  https://help.malighting.com/grandMA3/2.2/HTML/cue_tracking_cue-only.html
- **Delete.** A normal delete loses the values that tracked out of the cue. A Cue Only delete
  "will store values that would track into the following cues". [F]
  https://help2.malighting.com/grandMA2/en/help/key_cs_delete_cues.html
- **Tracking Shield.** This is a heuristic stop. Tracked changes do not reach cues where the
  fixture comes back on from 0 (or is above 0), so a new edit cannot leak into an unrelated
  later "scene". [F] https://help.malighting.com/grandMA3/2.2/HTML/cue_tracking_shield.html
  The OpenMarch analogue would be "stop propagation at the next page where the marcher has a
  move".

### What lighting users say

- **For tracking.** "Tracking ... more flexible and easy to use". Asking "is it a single cue
  thing or something you want to change wholesale until the next major change" is the core
  decision the operator makes on every edit.
- **Pitfalls.**
  - Edits leak forward ("it tracks to cue three and channel fifteen is now at 60").
  - Inserting cues confuses people.
  - Forgotten values persist: lights stay on until something turns them off.
  - Newer software added blocking "to make tracking friendlier".
  - [F] ControlBooth thread above.
- **[M]** Eos users often hit "why is this light stuck on?". The answer is almost always a
  tracked value from a much earlier cue, and the color plus About/source exists for that
  reason.

## Lessons for OpenMarch

### Which model matches designers' mental models

1. **Designers already think "hold unless told to move".** Drill vocabulary ("hold 8, move 8")
   and Pyware's "no editing ... holding in place" both reflect this. So does the timeline plan,
   where moves are clips and no clip means hold. All of these are **sparse "hold last
   defined"**, which is option (B), with Eos tracking semantics.
2. **Today's dense copy is the StageWrite/EnVision "duplicate the previous picture" model.**
   Every tool using it ends up adding explicit re-sync tools, such as EnVision Revert/Step
   Through, Blender Propagate and Pro Tools Write To. Option (A), a "touched" flag on dense
   rows, is effectively sparse storage with a cache. It is fine as an _implementation_ or
   migration path, but the semantics should be (B).
3. **Per-marcher sparseness has domain precedent in EnVision Subsets.** Not every performer
   needs a dot on every page. OpenMarch should choose "hold" for undefined marchers, unlike
   EnVision's pass-through interpolation. Pass-through conflicts with the timeline "hold when no
   move" rule.

### Semantics to adopt

- **Edit at page N.** Write a definition at N for the edited marchers. Inherited pages after N
  follow, _up to the next page where that marcher is defined_, which is the Eos "move
  instruction" stop. Never overwrite a later definition silently.
- **Per-edit "This page only".** This is Eos Cue Only and grandMA "blocked in next cue". Write
  the _old_ value as a definition on page N+1, only if N+1 was inheriting, so later pages keep
  their look. Make it a modifier or menu option, not a global mode. Eos's global Track/Cue Only
  setting plus a per-command inverse key is a known source of confusion. [M]
- **"Hold here" / "Pin".** This is a block. It marks a page as defined with its current
  inherited value, so future upstream edits stop there. Also offer **"Unpin / Inherit"**, which
  removes the definition so the page follows upstream again. That is the opposite of a block
  and the equivalent of Ableton's Re-Enable Automation.
- **Edit at the source (Trace).** On page 5, where the marcher is inherited from page 2,
  dragging should ask, or default to one of:
  - (a) create a definition at 5, which is the default and the least surprising, or
  - (b) "edit where defined (page 2)", which updates the source so pages 2 to 5 all change.
- **Delete page.** Follow the Eos/grandMA lesson: say explicitly what happens to values
  defined on the deleted page. The default should preserve later pages' look, as in Cue Only
  delete: if the next page was inheriting from the deleted page, give it a definition.
  Otherwise, deleting page 2 makes pages 3 and later snap back to page 1, which is the same bug
  in a new place.
- **Insert page.** A new page has no definitions, so everyone inherits and holds. This removes
  the copy-at-creation problem entirely. Inserting must not change any later page's look.
- **First page.** The first page must define every marcher. This is the base case, the same as
  Eos cue 1 or Blender extrapolation.
- **Timeline unification.** "Marcher has a move clip ending at page N" equals "defined at N".
  No clip equals inherited hold. A page flag with no clips is pure timing. This makes A/B
  migration and the timeline the same data model.

### UI affordances (from Eos colors, dope-sheet keys and EnVision Subsets)

- **Per-marcher state on the field.** Distinguish _defined here_ (solid dot or a key/diamond
  badge) from _inherited_ (hollow or dimmed dot, Eos magenta-like tint). Use a third state for
  _pinned/blocked_.
- **Timeline and page strip.** Show a key marker per page where the selected marchers are
  defined. Show a hold bar across inherited pages, like a dope sheet.
- **"Defined at page X" readout.** For an inherited marcher, show "Defined at page X" with a
  jump link, like Eos About/source. This answers "why didn't my marcher move?".
- **Propagation preview.** After an edit, briefly highlight the pages that followed ("Moved on
  pages 2 to 4; stopped at page 5, defined") and give a one-click "keep this page only" undo
  option. This is the Ableton re-enable pattern in reverse.
- **Explicit commands for dense workflows.** Provide "Copy to next page", "Copy to pages ... /
  to end", and "Make range a hold", as in Pro Tools Write To and EnVision Step Through. Avoid
  Blender-style "guess where the hold ends" automation; it was removed.

### Pitfalls to design around

- **Leaking edits.** In tracking, an edit can reach far-later pages the designer isn't looking
  at. Mitigate with the propagation preview, stopping at definitions, and an optional
  Tracking-Shield-like stop. For example, OpenMarch could stop propagation at a page where the
  marcher next has an authored move.
- **Insert and delete surprises** are the most-cited confusion on lighting consoles. Make both
  look-preserving by default.
- **Hidden inheritance** confuses people (like spreadsheet `=B2` links vs. pasted values [M]). Inherited vs.
  defined must be visible without hovering.
- **Pinning everything.** Over-pinning brings back today's bug: blocks stop "change the
  background" edits, the Eos trade-off. Offer "Unpin range".
- **Exports and printouts** (coordinate sheets, UDB-style apps) need resolved absolute
  coordinates per page. Derive them at export; don't store them twice.

## Gaps and confidence

- No fetched source confirms Pyware's exact behavior when a set is edited before later
  unedited sets [M]. A quick hands-on test would settle whether Pyware is "sparse hold" in
  practice.
- No designer forum complaints (Reddit, Pyware forums) were retrievable through search, so the
  confusion evidence comes from the lighting and EnVision forums.
- Eos color definitions come from search snippets of the official page, which returned 404 when
  fetched directly with a different path.
