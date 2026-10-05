<!-- cspell:disable -->

# Prior art: group moves, peel-offs, join-ins and ghosts

Problem recap (from images/1-steal-out.png and images/2-join-in.png): a group move (green) covers N marchers over a beat range. A peel-off (yellow, higher layer) takes a subset from beat k onward, possibly running past the group's end. The group must still behave as if everyone completes it: editing its end shifts the peel-off's start, and gray "ghost" dots and paths show the part the peeled marchers never perform. Join-in is the mirror case: joiners arrive mid-group, so the group has ghost START dots for them. Open question: are those computed or placed by the user?

Confidence tags: [doc] = read in vendor docs; [snippet] = taken from search-result text only; [inferred] = my reading, not confirmed.

---

## 1. Drill software

### Pyware 3D / 3DX (the market leader; UDBapp is its student viewer)

- **Model: keyframes per count, not per page.** Pyware's patent (US5903743, George Py Kolb) stores a formation at chosen counts. The software "calculat[es] an intervening drill formation ... for each count between the first and second count locations." Page tabs are only labels on the Count Track. https://patents.google.com/patent/US5903743 [doc]
- **Two anchors set the edit window.** The Yellow Anchor is the start count and draws as black reference dots. The Red Anchor is the end count, where the shape can be edited. The anchors can sit on any count, not only on page tabs. "Different performer groups can transition across different count ranges simultaneously ... most performers might transition counts 0-16, while the guard transitions 0-40." https://www.pyware.com/guide/3d/10.0/en/topic/count-track [doc]
- **Sub-sets.** In the Page Tab Editor, the Subset column covers "moving only a certain section of the ensemble between two major pictures". Sub-sets are labelled 2, **2A**, 3 so the set count does not go up. This is the same idea as the "1A" marker in the owner's mockup. https://pyware.com/guide/3d/11.0/en/topic/page-tab-editor [doc]
- **Stagger / Sequential Push / Follow the Leader** give per-performer timing inside one transition:
  - Step Off sets the wait before each performer starts after the previous one.
  - Drop Off sets the wait before each performer finishes.
  - Duration sets the length of each performer's move.
  - "Compound Move combines two maneuvers, such as a float & stagger, in to one transition".
  - "Reset to Hold" and "Revert" are also offered.
  - The large handle marks the leader; the rest follow in grouping order.
  - https://www.pyware.com/guide/3d/10.0/en/topic/stagger-tool [doc]; https://www.pyware.com/guide/3d/9.0/en/topic/sequential-push-tool [snippet]
- **Hold style** (stand vs mark time) is a property of the performer during a hold. https://www.pyware.com/guide/3d/9.0/en/topic/visuals [snippet]
- **Lesson.** Pyware handles "subset moves at different counts" by letting each performer carry its own keyframe counts. That data is baked: the docs never describe a 16-count group move that stays one editable object while 4 members leave at count 8 [inferred]. That gap is OpenMarch's opportunity. Two things are worth copying:
  1. "Reference positions from the start of the window drawn as plain dots, editable positions drawn as symbols". This is the same split as the gray-ghost vs. live-dot rendering.
  2. The 2A sub-set naming.
- **UDBapp** shows "curved and straight-line path information for previous and next sets" and lets you step count by count. This confirms that performers expect to see prev/next pathways. https://mwm.ai/apps/udbapp-powered-by-arc/6762600003 [snippet]

### EnVision (Box5), Field Artist, others

- I found no public docs on sub-set timing or ghost display for EnVision (https://halftimemag.com/gear-up/envision-visual-performance-design.html) or for "Field Artist". **Uncertain:** treat any claim about them as unverified.

---

## 2. Animation non-linear editing

| Tool                                    | Mechanism                                                                                                                                                                                                                                                                                                                                                                                                                             | Relevance                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Blender NLA**                         | Strips sit on tracks, and upper tracks are evaluated over lower ones. **Blend type**: Replace overwrites lower tracks, or lerps when influence is below 1; Combine/Add layer on top. **Influence** 0–1 can be animated. **Blend In/Out** and **Auto Blend** ramp across an overlap. **Extrapolation** is Hold, Hold Forward or Nothing: "values at the action's last keyframe also apply to the later frames (up to the next strip)". | This is exactly "higher layer wins on overlapping beats". Extrapolation answers what a peel-off does after it ends, and what the group does for a member before it starts. https://docs.blender.org/manual/en/2.82/editors/nla/properties_modifiers.html [snippet]                                                                                                                                       |
| **Unity Animator layers + Avatar Mask** | Layers are evaluated in index order, each with Override or Additive blending and a weight. A **mask** limits a layer to some body parts ("throw on upper body while legs keep walking"). Timeline has **Override tracks** with an Avatar Mask.                                                                                                                                                                                        | A peel-off is an Override layer **masked to 4 marchers**. The group clip still evaluates for all 6; the mask only decides who shows it. https://docs.unity.cn/2022.1/Documentation/Manual/AnimationLayers.html , https://docs.unity3d.com/es/2018.4/Manual/TimelineAnimationTrackProperties.html [snippet]                                                                                               |
| **Unreal Sequencer**                    | Each section has a keyable Weight (0–1). "Intersecting two animation sections creates an automatic blend curve". Blend-in and blend-out handles sit on the section edge.                                                                                                                                                                                                                                                              | Optional easing at the handoff. https://dev.epicgames.com/documentation/en-us/unreal-engine/cinematic-animation-track-in-unreal-engine [snippet]                                                                                                                                                                                                                                                         |
| **Maya Time Editor**                    | **Clip ghosts** "view the start and end positions of a selected animation clip ... The ghost is the same color as the corresponding clip". Toggle per clip, with an icon on the clip. **Relocators / Match** align a clip's match object to the previous or next clip ("Next or Previous").                                                                                                                                           | Strongest precedent for ghost START and END dots shown **only for the selected clip**. Match relocators are the mechanism for "peel-off starts where the group would be at count 8". https://help.autodesk.com/cloudhelp/2017/ENU/Maya/files/GUID-1DC90FA7-2F44-4F8C-B671-30384CFC8FDE.htm , https://help.autodesk.com/cloudhelp/2017/ENU/Maya/files/GUID-21688EE8-BB73-4438-90C8-F556D0BB2198.htm [doc] |
| **Blender motion paths / onion skin**   | Paths are drawn "Around Frame" (N before and after) or "In Range". Past and future get different colours, with a dot per frame.                                                                                                                                                                                                                                                                                                       | A count-dot per step on ghost paths. https://docs.blender.org/manual/en/2.93/animation/motion_paths.html [snippet]                                                                                                                                                                                                                                                                                       |
| **Rive state machines**                 | Each layer plays one state; for a shared property, "layers farther down the list tak[e] priority". Blend states mix timelines.                                                                                                                                                                                                                                                                                                        | Confirms the layer-priority model, and that order is shown as list position. https://rive.app/docs/editor/state-machine/states [snippet]                                                                                                                                                                                                                                                                 |

**Lesson.** In every NLE, the lower clip keeps evaluating under the override, and the mask or priority only picks which result is shown. Ghosts are simply "evaluate the lower clip for masked-out members and draw it gray". You never need to store them.

---

## 3. Choreography / formation / sports tools

- **ArrangeUs, StageKeep, Choreographic, mubo** are formation-to-formation tools: keyframe per formation with animated transitions. Choreographic has transition timing to 0.01 s. mo-sim has "each dancer's entry timing, stop points, movement path". mubo has keyframe timelines. I found none with group-move objects or ghosts (uncertain; docs are thin). https://apps.apple.com/app/id1502182540 , https://apps.apple.com/app/id1608391996 , https://mwm.ai/apps/mubo-formation-editor/6753949227 [snippet]
- **FastDraw (basketball)**: each action is a line, and you "pull up the animation timeline to adjust when each action starts and ends relative to others". Plays are also split into numbered **frames**, much like sub-sets. https://playbank.fastmodelsports.com/library/basketball/fastdraw/807/play-POTD-Low-3 [snippet]
- **Football diagram convention**: solid lines are definite routes; **dashed lines are optional or alternate routes and motion**. This is a well-known visual language for "path that may not be run". https://gorout.com/how-to-draw-football-plays/ [snippet]

**Lesson.** Draw the unrealised remainder as **gray + dashed**, not just gray, so it reads as "not performed" even in grayscale print.

---

## 4. Crowds and motion-graphics staggers

- **Golaem Layout**: non-destructive edit layers (Trajectory Edit, Time Offset, Time Warp, Snap To, grouping) sit on top of a base simulation. Each layer applies to a selection of entities, and each is "cancellable or customizable at any time in the History Stack". https://www.cgchannel.com/2019/07/golaem-ships-golaem-7-0/ , https://golaem.com:443/content/doc/golaem-crowd-documentation/release-notes?page=8 [snippet]. This is the same pattern as a peel-off: an operation plus an entity filter, on a layer over the base.
- **Cavalry Stagger**: one behaviour spreads values from Min to Max across the instance ids of a duplicator. https://cavalry.studio/docs/nodes/behaviours/stagger/ [snippet]
- **Cinema 4D MoGraph**: the Step effector gives each clone a weight from 0 to 100%. **Time Offset** shifts each clone's animation by its weight. https://help.maxon.net/c4d/r21/us/html/OESTEP-ID_MG_BASEEFFECTOR_GROUPPARAMETER.html [doc snippet]

**Lesson.** A per-member weight or offset on one shared clip covers ripples and follow-the-leader without splitting the clip. Pyware's Stagger is the drill version of this idea.

---

## 5. Ownership handoff and "what would have happened"

- **Overwrite vs insert edits**: an overwrite edit covers the timeline without moving anything, and "edit to higher track as they have precedence" leaves lower clips intact. OpenMarch layers should behave like overwrite, never ripple. https://larryjordan.com/?p=29113 [snippet]
- **Final Cut Pro connected clips**: a clip is attached to a **connection point** on a primary clip. Move or ripple the primary and the connected clip moves with it. The connection point can be put on any frame. https://support.apple.com/guide/final-cut-pro/ver7a77ef9e/mac [snippet]. **Analogy:** the peel-off's start is a connection to (group move, beat 8). It is not a stored coordinate.
- **Figma overrides**: an instance inherits everything from the main component except the properties it overrides, and keeps receiving the main's other changes. "Reset overrides" brings it back to the main. There is a known pitfall: overriding one child inside a slot marks the whole slot as overridden. https://www.figma.com/blog/figma-feature-highlight-component-overrides/ , https://forum.figma.com/suggest-a-feature-11/overriding-one-element-inside-a-slot-marks-the-entire-slot-as-overridden-51686 [snippet]. **Lesson:** keep overrides fine-grained, per marcher and per beat range, so overriding 4 marchers never freezes the other 2 or the shape.
- **CAD topological naming problem (FreeCAD)**: features attached to "Face3" break when an upstream edit renumbers the faces. https://wiki.freecad.org/Topological_naming_problem [doc snippet]. **Lesson:** a peel-off must reference the group by **stable ids (move id + marcher id + beat offset)**, never by array index or absolute coordinate. It also needs a defined fallback when the reference becomes invalid, for example when the group is shortened so beat 8 no longer exists.

---

## Synthesis: what to borrow

1. **Ownership is resolved per marcher, per beat, by layer; membership is never removed.** The group move keeps all 6 marchers and evaluates for all of them. The peel-off is an override layer masked to 4 marchers from beat 8 (Unity mask + NLA Replace). The ghost is the group's evaluation where it lost ownership. It is derived on every evaluation and never stored, so editing the group's destination updates it automatically.
2. **The peel-off start is a reference, not a coordinate.** Store it as (source move, beat k), the way FCP connection points and Maya Match Relocators work. Store its end as a user-placed absolute position by default. Decide what happens when beat k falls outside the edited group: clamp to the group's end (NLA "Hold Forward") or flag it as broken (FreeCAD-style warning). [design choice, untested]
3. **A peel-off that runs past the group's end needs no special case.** After the group's range, ownership simply falls to whatever comes next, as with NLA extrapolation "Nothing".
4. **Join-in ghost start dots: recommend "computed by default, overridable"** (Figma inheritance plus reset).
   - Default: back-project from the joiner's slot in the group's end formation using the group's own transform. For a rigid or parallel move, slot start = slot end − group displacement. This gives the parallel ghosts in the left half of 3.png.
   - Override: the user drags the ghost. That gives the non-parallel ghosts in the right half of 3.png, and is stored as a per-slot override relative to the group's start frame.
   - Editing the group's start then carries inherited ghosts along. Overridden ones stay attached through their relative offset, and they can be reset.
   - The joiner's own move ends at the reference (group, joiner's slot, beat j), so moving the group never breaks the join.
   - Uncertain: no tool I found does this for drill. The closest analogues are Maya clip ghosts plus relocators, and Figma overrides.
5. **Ghost UI follows Maya.** Show ghosts only while the owning clip is selected. Use the clip's hue, desaturated gray. Use dashed paths (football convention) with count ticks (Blender motion paths). Draw ghost start or end dots as hollow or gray. Pyware's "reference dots vs editable symbols" split is the drill-native precedent.
6. **Optional later: blend windows** (NLA, Unreal) to ease direction changes at the handoff. Drill normally uses sharp direction changes, so leave this off by default. [inferred]
7. **Optional later: per-member stagger** (Pyware Stagger, C4D Step/Time Offset, Cavalry). This would be a property of one group move rather than many peel-offs.
