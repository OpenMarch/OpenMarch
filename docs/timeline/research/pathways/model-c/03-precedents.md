<!-- cspell:disable -->

# 03 — Precedents: shared motion with per-member overrides

Research for the pathways data-model grill (see `BRIEF.md`). Sources are the vendors' own docs where we could reach them. Where an official page blocked automated fetches, the source is marked **(secondary)**, for example an archived Adobe manual or a vendor community forum. No drill software is used as a precedent.

Each section answers four questions:

1. **Stored structure:** what is owned by whom.
2. **Override key:** how an override is keyed (by id, by index, by parameter).
3. **Structural edits:** what happens when the parent gains or loses points or members.
4. **Failure modes:** what users complain about.

---

## 1. Adobe After Effects

Sources:

- Parenting: Adobe Learn, "Animating with parenting", https://www.adobe.com/learn/after-effects/web/animating-with-parenting
- AE user manual, "Parent and child layers" **(secondary, archived Adobe manual)**: https://www.manualsdir.com/manuals/753844/adobe-after-effects.html?page=166
- Mask path vertex numbering, AE manual **(secondary)**: https://www.manualsdir.com/manuals/753844/adobe-after-effects.html?page=337
- Precompose, "Precomposing, nesting, and pre-rendering": https://helpx.adobe.com/mx/after-effects/desktop/work-with-compositions/precomposing-and-nesting/precomposing-nesting-pre-rendering.html (helpx refuses automated fetches; read through search snippets)
- Expressions `valueAtTime`: https://ae-expressions.docsforadobe.dev/objects/property/

**Stored structure.**

- **Parenting.** The child stores its own transform keyframes in the parent's space. A layer has at most one parent, and a parent can have any number of children. Parenting affects every transform property except Opacity (Position, Scale, Rotation, and Orientation for 3D layers). A null object is an invisible layer that exists only to be a parent.
- **Parent and child data are separate.** The parent owns the shared motion and the child owns its delta. Nothing is copied.
- **Expressions.** These are a pull model. A property reads another property, often at a shifted time, with `thisComp.layer(index-1).position.valueAtTime(time - delay)`. This is how follow-the-leader trails are built.
- **Precompose** offers two choices:
  - "Leave all attributes in": the precomp layer in the outer comp keeps the transforms and keyframes, so the group moves as one.
  - "Move all attributes into the new composition": each member keeps its own keyframes inside the precomp.

  This is the closest AE gets to deciding where group motion lives versus member motion. It is a one-time choice at creation.

**Override key.**

- The child's override is its whole local transform channel, keyed by **layer identity** (the parent pick whip stores a reference to the layer).
- Expressions reference layers by **name or by stack index**, as in `index-1`. Index references silently re-target when layers are reordered.
- Mask and shape path animation keys vertices by **index from a "first vertex"**. AE numbers vertices from the first vertex at the initial keyframe "and then assigns the same numbers to the corresponding vertices at all successive keyframes" (AE manual, secondary).

**Structural edits.**

- **Re-parenting.** By default the child keeps its on-screen position, and AE rewrites the child's values to compensate. With Alt/Option held, the child keeps its numbers and therefore jumps (AE manual, secondary).
- **Un-parenting** (Parent = None) bakes the parent's current effect into the child unless you hold Option (ProVideo Coalition, secondary). Detaching is effectively "bake and keep the world position".
- **Parent keyframe edits** (adding or removing keys on the parent) never touch the child's keys. The child's delta just rides on the new parent motion. This is the "Adjust" behavior the owner described.
- **Adding a vertex to an animated mask** changes the vertex count across keyframes, and vertices "appear and collapse" mid-animation. Community answers recommend the preference "Preserve constant vertex point count when editing masks", which must be on _before_ the vertices are created. Smart Mask Interpolation exists because index matching fails. It has a "First Vertices Match" option and adds intermediate keyframes ([community report](https://community.adobe.com/t5/after-effects-discussions/inconsistent-vertex-count-between-keyframes-that-have-same-number-of-vertices/td-p/13296511), secondary).

**Failure modes.**

- The child's keyframes are in the parent's space. After re-parenting, the numbers in the timeline no longer mean what they did, and users are confused by "jumping" children.
- An index-keyed vertex correspondence breaks when points are added or removed.
- Index-based expression references (`index-1`) break silently when layers are reordered.
- The precompose choice is made once and can't be changed later.

---

## 2. Blender

Sources (Blender Manual, source RST in https://projects.blender.org/blender/blender-manual; rendered pages under https://docs.blender.org/manual/en/latest/):

- Follow Path constraint: `animation/constraints/relationship/follow_path`
- Clamp To constraint: `animation/constraints/tracking/clamp_to`
- Child Of constraint: `animation/constraints/relationship/child_of`
- Constraint Influence: `animation/constraints/interface/common` (#Influence)
- NLA strips: `editors/nla/strips`; NLA sidebar (Blend In/Out, Influence, Strip Time, Playback Scale, Sync Length): `editors/nla/sidebar`
- Actions and Action Slots: `animation/actions`
- Curve modifier: `modeling/modifiers/deform/curve`
- Curve Guide force field (particles): `physics/forces/force_fields/types/curve_guide`
- Relative shape keys: `animation/shape_keys/introduction`
- Geometry Nodes Instance on Points: `modeling/geometry_nodes/instances/instance_on_points`; Sample Curve: `modeling/geometry_nodes/curve/sample/sample_curve`; built-in `id` attribute: `modeling/geometry_nodes/attributes_reference`
- Drivers: `animation/drivers/introduction`

**Stored structure.**

- **Follow Path.** The curve owns the geometry and the time. The curve datablock has an `eval_time`, and "Animate Path" keys it to the scene frame. Each follower object owns a constraint with:
  - **Offset**: "the number of frames to subtract from the Curve's _Evaluation Time_"; a time lag.
  - **Fixed Position + Offset Factor**: an absolute 0–1 position along the curve "independent of its _Evaluation Time_", which can itself be animated.
  - **A spatial offset**: the follower's own location "as offsets to the position and rotation on the Curve … if _Follow Curve_ is enabled, the offsets are added in the space of the current curve point" (lateral and forward relative to the tangent).

  So the shared thing (curve plus its time) is owned once. Each member owns a time offset **or** its own parameter track, plus a spatial delta in path-local space.

- **Constraint Influence** is a 0–1 strength. 1 fully overrides, 0 is "the same as disabling or even deleting the constraint", values in between "give an interpolated result", and "the _Influence_ can be keyframed, meaning constraints can be turned on and off over the course of an animation". Child Of exists mainly _because_ its Influence is animatable, "which makes it possible to switch to different parents over time".
- **NLA.**
  - An Action holds keyframes. Strips _reference_ actions: "Multiple strips can reference the same action, so that you can potentially change multiple parts of the animation by editing a single set of keyframes."
  - Each strip owns its own placement and its own time mapping: Frame Start/End, Playback Scale, Repeat, Reversed, an animatable Strip Time, Blend In/Out, Influence, and a blend mode (Replace/Add/Multiply/Combine).
  - This is a _linked clip with per-instance timing_.
- **Action Slots.** One action can hold many slots ("100 bouncing balls … a single action with 100 slots"). Crucially, "slots are not 'for' any specific data-block: any data-block can use any slot … two different characters [can] use the same slot". Animation belongs to the slot, and the binding to a subject is separate.
- **Relative shape keys** store per-vertex _deltas_ from a Basis. "Blender applies each shape's weighted offset relative to its reference key."
- **Curve Guide (particles).** One curve guides every particle. "The velocity depends on its lifetime and the length of the path."
  - **Free**: the fraction of particle life not spent on the curve.
  - **Clumping Amount / Shape**: particles "come together at the end of the curve (1) or … drift apart (-1)", and the shape controls _where_ along the curve they converge.

  This is a built-in, single-parameter "spacing handoff" profile.

- **Geometry Nodes.** Instance on Points puts one reference per point. Per-instance data are point attributes keyed by **index**, or by the optional `id` attribute when it exists.
  - The `id` attribute is "created by Distribute Points on Faces to provide stability when the shape of the input mesh changes".
  - "Instance Index … by default the point ID is used, or the index if that doesn't exist."
  - Sample Curve evaluates at a factor or length along the curve. That is parameter-space sampling, not point-index sampling.
- **Drivers.** Any property can be a function of other properties, through a driver configuration plus a mapping F-curve. This is a pull model, like AE expressions.

**Override key.**

- Follow Path offsets are keyed by **parameter**: a frame offset or a 0–1 factor.
- The spatial delta is in **path-local frame** at the current parameter.
- Shape keys and hooks are keyed by **vertex index**.
- GN attributes are keyed by **index**, unless `id` is present.

**Structural edits.**

- Editing the curve (adding or removing control points) never invalidates Follow Path followers, because they hold a parameter, not a point reference. They just land somewhere else on the new curve. The 0–1 factor maps to a different physical spot when the length changes.
- Index-keyed data (shape keys, hook assignments, GN attributes without `id`) go wrong when topology changes. That is exactly why `id` exists.
- **Clamp To** depends on the curve's _bounding box_ along a main axis, evaluated in the curve's local space. The manual has a long warning that after moving or rotating the curve "the _Main Axis_ will still be chosen as X …; for the most intuitive results, keep the Curve object at the default rotation."

**Failure modes.**

- Follow Path speed is tied to curve length and eval_time. Editing the curve changes how fast everyone walks, and "Offset" is in frames, which surprises people.
- Child Of's Set Inverse. The manual itself explains it as "if the child's transform is correct with the constraint disabled but incorrect with the constraint enabled, click this button". A hidden inverse matrix is a classic source of jumps.
- Clamp To's derived reference (the bounding box) makes results depend on unrelated geometry. This is a warning sign for lanes anchored to a computed centroid.
- Index-keyed per-element data break on topology edits.

---

## 3. Figma, and Illustrator blends

Sources:

- Figma, "Apply overrides to instances": https://help.figma.com/hc/en-us/articles/360039150733-Apply-overrides-to-instances
- Figma, "Detach an instance": https://help.figma.com/hc/en-us/articles/360038665754-Detach-an-instance-from-the-component
- Figma Plugin API, InstanceNode (`overrides`, `detachInstance`, `swapComponent`, `removeOverrides`): https://developers.figma.com/docs/plugins/api/InstanceNode/
- Figma "Edit main components" (help-center mirror, secondary): https://figma-signup.helpjuice.com/create-and-share-libraries/edit-main-components
- Figma forum threads on lost overrides (secondary): https://forum.figma.com/t/nested-variant-instances-within-a-component-are-reset-after-the-library-update/36684 , https://forum.figma.com/suggest-a-feature-11/show-me-the-overrides-per-component-instance-and-give-me-the-option-to-reset-them-individually-32767
- Illustrator, "Blending objects": https://helpx.adobe.com/illustrator/using/blending-objects.html (mirror: https://learn.adobe.com/illustrator/using/blending-objects.html)

**Stored structure.**

- The main component owns the full tree. An instance stores a reference plus a sparse list of overrides. The Plugin API exposes `overrides: { id, overriddenFields[] }[]`, which is "all of the fields directly overridden on this instance. Inherited overrides are not included".
- An override is **(sublayer, field) → value**. It is a per-property sparse patch, not a copy.
- **What can be overridden:** text, fill, stroke, effects, layout guides, export settings, layer names, and nested-instance swaps.
- **What can't:** "It's not possible to make changes to the underlying structure of an instance." That rules out layer order, position, constraints, and text bounds. To change those you detach or edit the main.
- **Push overrides to main component** promotes one instance's changes to the main, which "updates any other instances".
- **Detach** "make[s] the instance a regular frame, while keeping the current layers and properties" and removes the link. For nested instances the API "also detaches all ancestors nodes that are instances".
- **Deleting a main component** doesn't delete its instances. Any instance can **Restore main component** (secondary mirror).

**Override key.**

- **Inside one component:** by sublayer identity and field.
- **Across a swap or variant change:** by heuristics. The help page says overrides are kept when "the layer names of the current instance and the variant or instance you're selecting must match", _and_ the overridden property originally matched between the variants. Text overrides are kept if the name matches and "Figma will also check if the text layer's hierarchy is similar". The API warns: "we may update these override preservation heuristics from time to time."

**Structural edits.**

- When the main component changes (layers added, removed, renamed, or re-nested), overrides on surviving layers persist. Overrides on removed or renamed layers are dropped **silently**.
- Figma staff guidance in the forums is to diff "renamed sublayers, added or removed sublayers, and nested components switched to a different variant" to find out why overrides vanished.

**Failure modes (forum).**

- **"Components suddenly reset all changes"** after a library update, caused by a rename or re-nest upstream.
- **Nested instance overrides are lost** when a parent variant changes, or when a variable mode switch changes a nested variant.
- **Reset granularity.** "If you want to reset a particular override … you will have to reset the entire component" (feature request). Per-property reset now exists in the menu, but users still can't _see_ the list of overrides easily.
- **Detaching a nested instance detaches all its ancestors.** It's a blunt tool.

**Illustrator blends.** A blend owns two or more key objects plus a **spine** path.

- **Object > Blend > Replace Spine** swaps the path for any drawn path. The intermediate steps are recomputed, and the key objects keep their identity.
- **Reverse Spine** flips the order.
- **Spacing**: Smooth Color, Specified Steps, or Specified Distance. It is a single rule on the blend, not per step.
- The intermediates are _derived_: you can't override one step without **Expand**, which bakes everything (Illustrator help).
- **Precedent:** the path is a replaceable attribute of the group, and the members are derived from rules. Overriding one derived member means you must bake the whole group, which is the failure mode we want to avoid.

---

## 4. DAWs: Logic Pro, Ableton Live, Bitwig Studio

Sources:

- Logic Pro, "Track automation vs. region automation": https://support.apple.com/guide/logicpro/track-automation-vs-region-automation-lgcp967649d0/mac
- Logic Pro, "Create MIDI aliases": https://support.apple.com/guide/logicpro/create-aliases-of-midi-regions-lgcpf7c0cea3/mac
- Ableton Live manual, "Clip Envelopes" (§27.3 Mixer and Device Clip Envelopes, §27.5 Unlinking): https://www.ableton.com/en/manual/clip-envelopes/
- Bitwig Studio user guide, "Automation" (Automation Follow, relative automation) and "Arranger clips" (meta clips): https://www.bitwig.com/userguide/latest/automation/ , https://www.bitwig.com/userguide/latest/arranger_clips_and_the_browser_panel/

**Stored structure.**

- **Logic: track vs region automation.** "With track automation, if you … move, or copy regions … the automation data remains tied to the initial point on the track … with region automation, if you move or copy the region … the automation remains with the region." The same track can have both, and there are four **Convert** commands between them (Mix > Convert Automation). Who owns a curve, the timeline position or the clip, is an explicit, convertible choice.
- **Logic aliases.** An alias references a parent region's _content_ but owns its own _playback parameters_ (position, and region parameters such as transpose or delay).
  - "Convert to Region Copy": a real region "whose contents are identical to those of the original … but its playback parameters are those of the alias". That is a detach that keeps the instance's own settings.
  - Double-clicking an alias asks whether to edit the original or make a real copy.
  - **Re-Assign Alias** points an alias at a different original.
  - **Deleting the original** opens a dialog: **Convert** (make all aliases real), **Keep** (leave orphan aliases, which can be reassigned later), or Cancel. There are commands to select and delete orphan aliases.
- **Ableton clip envelopes.** In Session clips there are **automation envelopes** (absolute) and **modulation envelopes**. Modulation is _relative_: "modulation envelopes can only influence this defined value", and for sends "the modulation is a relative percentage". Arrangement clips "only have modulation envelopes", while absolute automation lives on the track lane.
  - **Linked vs Unlinked:** "when in Linked mode, clip envelopes respond to changes in the clip's Warp Markers". When unlinked, "this envelope now has its own local loop/region settings".
- **Bitwig.**
  - Supports track automation, clip automation, and "multiple layers of control [that] cooperate to shape individual parameters in a relative way".
  - The **Automation Follow** toggle decides whether "track automation is moved in tandem with Arranger clips or not".
  - Meta clips each "act as an alias of the clip (or clips) that they represent".

**Override key.**

- Aliases are keyed by **region identity**: the alias points at its parent.
- Per-instance settings are keyed by **parameter**: offset, transpose, loop, and so on.
- Automation points are keyed by **time** (absolute for track automation, clip-relative for region or clip automation).

**Structural edits.**

- Editing an alias's parent changes every alias. The per-alias playback parameters stay.
- Linked clip envelopes follow warp-marker edits: they are stored in clip-local, warpable time.
- Moving a clip either drags the automation along or leaves it behind, depending on ownership (region vs track) or the global Follow toggle (Bitwig).

**Failure modes.**

- **Orphans.** Logic keeps them "in case you decide to reassign them" and provides cleanup commands. That shows the problem is real.
- **Lost or flattened data when converting between modes.** Users report that dragging a Session clip with unlinked envelopes into the Arrangement produced a flat line ([Ableton forum](https://forum.ableton.com/viewtopic.php?p=1557836), secondary).
- **Confusion when a move does or doesn't carry automation along.** Bitwig had to add a toggle for this.

---

## 5. Crowds and instancers: Houdini, Maya MASH, Unreal ZoneGraph

Sources:

- Houdini, POP Steer Path: https://www.sidefx.com/docs/houdini/nodes/dop/popsteerpath.html
- Houdini, SOP crowd motion paths: https://www.sidefx.com/docs/houdini/crowds/sopcrowds.html
- Houdini, Crowd MotionPath Edit: https://www.sidefx.com/docs/houdini/nodes/sop/crowdmotionpathedit.html
- Houdini, Crowd MotionPath Layer: https://www.sidefx.com/docs/houdini/nodes/sop/crowdmotionpathlayer.html
- Maya, MASH Curve node: https://help.autodesk.com/cloudhelp/2023/ENU/Maya-MotionGraphics/files/GUID-3D6115AD-0A3E-4263-834E-CE326D74EC21.htm
- Unreal, ZoneGraph lane profile API: https://dev.epicgames.com/documentation/unreal-engine/API/Plugins/ZoneGraph/FZoneLaneProfile/GetLanesTotalWidth?application_version=5.4
- Unreal, ZoneShapePoint Python API: https://docs.unrealengine.com/PythonAPI/class/ZoneShapePoint.html (blocked; details from search snippet)
- Unreal forum (secondary): https://forums.unrealengine.com/t/issue-of-adjacent-links-being-registered-incorrectly-in-a-zonegraph/2575141

**Stored structure.**

- **Houdini POP Steer Path.**
  - Paths are curves, and agents are points with attributes.
  - Binding: "an agent follows the curve closest to its initial position". With **Match by Attribute**, only curves whose Curve Attribute matches the agent's Agent Attribute are used, falling back to curve primitive numbers.
  - **Path Variance** is how far agents may drift from their initial distance before a constraint force pulls them back. This is a per-agent lateral lane, kept as the _initial offset_.
  - **Anticipation** is how far ahead agents look for bends.
- **Houdini SOP motion paths.**
  - Crowd MotionPath _generates_ per-agent paths from a simulation or clips.
  - **Crowd MotionPath Edit** deforms them with weighted **pins**. "The first and last points of each path are automatically pinned". Default Pin Weight and Start Point Weight are set separately. Scale Adjustment "maintains the original lengths of the motion paths".
  - **Crowd MotionPath Follow** deforms paths to follow a drawn curve. **Parent–child** relationships let a child path ride on a parent path, but "parent and child paths must have the same number of points".
  - **Crowd MotionPath Layer** layers clips with **Blend In Frames / Blend Out Frames / Blend Ratio**.
- **Maya MASH Curve.**
  - One node distributes N points along input curves.
  - **Step** (spacing), **Equal Spacing**, and **Ignore Step** (spread evenly over the whole curve).
  - **Offset Along Curve** ("time value used to animate points along the curve").
  - **Animation (slide)** ("speed … as a fraction of the curve length").
  - **Clip Start/Clip End**, **Curve Length Affects Speed**, and **Stop At Curve End**.
  - **Time Step Variation**: per-point randomized time.
  - **Strength / Random Strength / Step Strength**: fade the node's effect for everyone at once, randomly, or "one object at a time".
- **Unreal ZoneGraph (Mass crowds).**
  - Shapes (splines or polygons) carry **lane profiles**: a set of lanes with widths and directions. Each shape point can reference a lane profile by index or inherit the shape's profile.
  - Lanes are derived from shape plus profile, and agents occupy lanes at runtime.
  - Lane occupancy is not stored on the agent's identity. The lane is a property of the shape.

**Override key.**

- Houdini binds by **attribute match** (agent attr ↔ curve attr), or else by proximity, or else by primitive number. Pins are **path points**, and parent and child are matched **by point count and index**.
- MASH keys by **point index** in the MASH network.
- ZoneGraph keys lane profile **by index per shape point**.

**Structural edits.**

- Houdini: the parent–child match requires equal point counts, so adding a point to one breaks the relationship. Regenerating paths upstream re-runs downstream edits. The docs don't say how pins survive upstream changes in point count.
- MASH: changing curve length changes speed unless Curve Length Affects Speed is managed. A forum user reports this behaved differently between 2017 and 2018 (secondary).
- ZoneGraph: editing a shape rebuilds the lanes. Agents re-query.

**Failure modes.**

- ZoneGraph assumes adjacent lanes have equal width. Mismatched profiles at connections break routing, and Epic staff acknowledged it as a bug they won't fix (forum, secondary). Crowd agents also drift out of lanes after collisions (forum, secondary).
- Houdini's equal-point-count rule for parent and child.
- MASH's speed depends on curve length.

---

## 6. Cross-cutting patterns

| Concern                                        | Pattern seen                                                                       | Where                                                                                                                                                                                    |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared motion stored once                      | Reference + per-instance params                                                    | AE parent, Blender Follow Path / NLA action refs, Figma main, Logic alias, MASH node                                                                                                     |
| Adjust (survives parent edits)                 | **Delta in the parent's local/parametric space**                                   | AE child transform, Follow Path offsets (frame offset or 0–1 factor; spatial offset in curve-point space), relative shape keys, Ableton modulation envelopes, Bitwig relative automation |
| Detach                                         | **Bake the evaluated result, then drop the link** (keep own params)                | Figma Detach ("keeping the current layers and properties"), Logic "Convert to Region Copy", AE un-parent without Option, Blender "Disable and Keep Transform"                            |
| Override keyed by index                        | Breaks on structural edits                                                         | AE mask vertices, Houdini parent/child equal point counts, Blender shape keys and GN without `id`, ZoneGraph per-point profile index                                                     |
| Override keyed by stable id or name            | Survives; silently dropped when the id vanishes                                    | Figma (layer name + hierarchy), Blender GN `id`                                                                                                                                          |
| Override keyed by parameter (time or fraction) | Always resolves somewhere; may land in a surprising place                          | Follow Path factor, Sample Curve factor/length, MASH Offset Along Curve                                                                                                                  |
| Handoff / blend                                | **An animatable 0–1 influence, or blend-in/out lengths**                           | Blender constraint Influence, Child Of switching parents, NLA Blend In/Out, Houdini Blend In/Out Frames, Curve Guide Clumping shape, MASH Strength/Step Strength                         |
| Late join / own timing                         | Per-instance time offset **or** own parameter curve; speed from path length ÷ time | Follow Path Offset vs Fixed Position, NLA Playback Scale / Strip Time, MASH Clip Start/End, Curve Guide "velocity depends on lifetime and length"                                        |
| Motion belongs to a slot, not a subject        | Slot holds the data; any subject binds to it                                       | Blender Action Slots, Houdini Match by Attribute, ZoneGraph lanes                                                                                                                        |
| Orphans                                        | Ask: convert to copies, or keep as orphans and reassign later                      | Logic alias delete dialog, Figma restore main component                                                                                                                                  |

---

## Lessons for us

Each lesson maps to one of the brief's open questions: Adjust vs Detach, override keying, handoff, late join, slot vs person, nesting, plus structural edits and failure modes.

1. **Adjust vs Detach: store Adjust as a delta in group-path space.** Every tool whose child survives parent edits stores a _relative_ value: the AE child transform, Follow Path's spatial offset "in the space of the current curve point", relative shape keys, and Ableton modulation envelopes. An Adjust should be stored as (lateral, along-path) offsets at **path parameters**, not as absolute route points. Absolute geometry is what a Detach produces.
   - _Model impact:_ model A's "copy the route" (AP-R9) and B3's "carry the path as an override" are Detach semantics. Neither expresses Adjust. B needs the override row to hold _deltas_, not a route.

2. **Adjust vs Detach: Detach = bake the evaluated result, keep the instance's own settings, drop the link, in one undo step.** Figma Detach keeps "current layers and properties". Logic's Convert keeps the alias's playback parameters. AE's un-parent bakes the parent's effect.
   - Detach must snapshot the marcher's _evaluated_ path, including its Adjust deltas and its own timing. It must never revert to the raw group route.
   - Also offer the reverse, as Logic's Re-Assign Alias does: Rejoin (AP-R10) is "re-assign to a group" and should say whether the marcher's differences are discarded or turned into an Adjust.

3. **Override keying: never key by point index.** AE mask vertices, Houdini's parent/child "same number of points", Blender shape keys, and ZoneGraph per-point profile indices all break when points are added or removed. Blender had to add an `id` attribute "to provide stability when the shape … changes".
   - Key Adjust anchors either by **stable route-point ids**, or, better given "pins keep counts", by **count**: a delta defined at count _c_ of the move, interpolated between anchors.
   - Count-keyed deltas survive any re-drawing of the group route, because counts don't change when geometry does.

4. **Override keying: when an anchor disappears, re-home it visibly, never drop it silently.** Figma's biggest complaint is overrides that vanish without notice after upstream renames or re-nests. If a delta is anchored to a route point that gets deleted, re-anchor it to the same count or path fraction and flag the marcher, for example with a badge reading "adjustment re-homed". Don't discard it.
   - Provide **per-override reset** and **"push to group"**, Figma's "Push overrides to main component": promote one marcher's Adjust into the group path. Figma users complain about whole-instance-only reset.

5. **Handoff timing: make it an influence, not a mode.** Blender's model is an animatable 0–1 **Influence** between two constraints. Child Of exists so you can switch parents by keying influence. NLA has Blend In/Out lengths, and Houdini has Blend In/Out Frames. Curve Guide's Clumping shape says _where along the curve_ spacing converges.
   - Store the start-block → end-shape spacing handoff as two counts, `handoff_start` and `handoff_end`, on the shared transition. Each slot's offset is `lerp(startOffset, endOffset, w(count))`.
   - "Immediately" is `start = end = first count`, and "at the very end" is `start = end = last count`.
   - This is one value per move, not per marcher. A per-marcher handoff override can be an Adjust (lesson 1).

6. **Late join: have two primitives, and default to "cut in".** Follow Path has exactly two timing modes:
   - **Offset**, a time lag against the shared clock: "cut in where the group is".
   - **Fixed Position + animated Offset Factor**, the member's own parameter track: "walk the whole path faster".

   NLA's per-strip Playback Scale and MASH's Clip Start/End are the same idea, and Curve Guide states that "velocity depends on its lifetime and the length of the path".
   - Model a member's timing as `(enter_count, enter_fraction, exit_count, exit_fraction)` against the shared path. "Cut in" sets `enter_fraction` = the group's fraction at `enter_count`. "Walk all of it" sets `enter_fraction = 0` and derives speed.
   - Exit or re-enter (capabilities 6 and 7) are further entries in the same per-member schedule, not new transitions.

7. **Slot vs person: the path and its Adjusts belong to the slot (lane). The person is bound to a slot over a count range.** Blender's Action Slots are explicit: "slots are not 'for' any specific data-block: any data-block can use any slot". Houdini binds agents to curves by attribute match, and ZoneGraph lanes belong to the shape, not the agent. Our Assignment table (marcher → slot over counts) already has that shape.
   - So a swap mid-move is just two Assignment rows. The slot's lane offset and Adjust carry on, and the person picks up whatever the new slot does.
   - Truly personal deviations should be Detach (an own path keyed to the marcher).
   - _Model impact:_ model A's `giveOwnTransition` makes the path follow the _person_, because the person gets a one-slot transition. That makes capability 7 (re-enter at another slot) and swaps awkward. Model B's (transition, slot) override key matches the precedent.

8. **Nesting: compose deltas, cap the depth, and make detach local.** AE parent chains and Blender nested instancing both compose transforms, where each level adds its delta to its parent's. A subset path (capability 8 or 9) should be a **child group** whose lanes are deltas on the parent group path. It should not be a separate absolute route (AP-R8 today).
   - Two of Figma's worst complaints are about nesting:
     - Nested overrides are lost when a parent variant changes.
     - Detaching a nested instance "also detaches all ancestors".
   - So define resolution order explicitly (group path → subset Adjust → marcher Adjust). Make "reset parent" leave child deltas alone. Make Detach of a marcher not detach its subset. Cap nesting at group → subset → marcher.

9. **Structural edits: say who owns the data when a move is retimed.** Logic's region vs track automation and Bitwig's Automation Follow toggle show that _where curve data lives decides what moves with what_. Ableton's linked envelopes "respond to changes in the clip's Warp Markers".
   - Adjust deltas should be stored in the move's **count space**, so they warp with re-fit, pins, and start/end edits.
   - The handoff counts (lesson 5) and the enter/exit counts (lesson 6) should be stored relative to the move as well, so splitting or moving a move (AP-R7) carries them. Write down the rule for what happens to each when the move is split at the playhead.

10. **Orphans: deleting a group path needs a Logic-style choice.** When a group path is deleted, its Adjusted members are orphaned. Offer what Logic offers: **Convert** (Detach each member to an own path, baked) or **Revert** (members walk straight). Make it one undo step. Never leave hidden dangling override rows. Logic has to ship "Select/Delete Orphan Aliases" because it allows them. A foreign-key cascade or a forced choice avoids that.

11. **Caching: avoid derived anchors such as a centroid.** Blender's Clamp To reads the curve's bounding box, and its manual has to warn users about it. MASH speed depends on curve length, and users trip on that across versions.

- Lane offsets should be stored per slot, captured at creation from the start block, as Houdini's Path Variance keeps each agent's _initial_ distance. They should not be recomputed from a live centroid of other marchers. Otherwise moving one marcher shifts everyone's lane, and cache invalidation spreads across the group.

12. **Separate shared derivation from per-member override (the Illustrator lesson).** Illustrator's blend derives every step from a rule (spine plus spacing). You can't override one step without **Expand**, which bakes the whole group. That is our "everyday edits break marchers out" problem (timelinePointMoves, Basic, cuts).

- Each edit should write the narrowest override: an Adjust delta on one slot. Breaking the whole transition apart should never be the cost of touching one dot.
- Since "dragging a dot never edits a path", a dot drag on a path member should create or modify that slot's Adjust at the dragged count. That is the AE model: the child edits its own channel, and the parent is untouched.
