// cspell:ignore NONFOUNDING
/**
 * The timeline inspector's strings (P8.5): Tolgee key to English text. The component reads the
 * text as each key's default, and `i18n/en.json` carries the same keys (a test keeps them equal).
 * `{name}` placeholders are ICU arguments.
 */
export const TIMELINE_INSPECTOR_STRINGS = {
    "inspector.timeline.title": "Timeline",
    "inspector.timeline.marcherTitle": "{marcher} at beat {beat}",
    "inspector.timeline.noPage":
        "Select a page to see why each marcher is where it is.",
    "inspector.timeline.omitted": "and {count} more selected marchers",
    "inspector.timeline.notInTimeline": "{marcher} isn't in the timeline yet.",

    "inspector.timeline.label.span": "Span",
    "inspector.timeline.label.beats": "Beats",
    "inspector.timeline.label.transition": "Transition",
    "inspector.timeline.label.layer": "Layer",
    "inspector.timeline.label.slot": "Slot",
    "inspector.timeline.label.progress": "Progress",
    "inspector.timeline.label.origin": "Starts from",
    "inspector.timeline.label.pathStyle": "Path style",
    "inspector.timeline.label.bulge": "Bulge",
    "inspector.timeline.label.waypoints": "Waypoints",
    "inspector.timeline.label.destination": "Destination",
    "inspector.timeline.label.orderMode": "Order mode",
    "inspector.timeline.label.memberOrder": "Member order",
    "inspector.timeline.label.orderSource": "Order source",
    "inspector.timeline.label.target": "Target",

    "inspector.timeline.span.hold": "Hold",
    "inspector.timeline.span.founding": "Founding",
    "inspector.timeline.span.join": "Join",
    "inspector.timeline.span.resume": "Resume",
    "inspector.timeline.span.holdHelp":
        "Not moving: no move is active, so the marcher stays where it is.",
    "inspector.timeline.span.foundingHelp":
        "In this transition from its start, so its path starts from the marcher's position at the start of the transition.",
    "inspector.timeline.span.joinHelp":
        "Joined this transition after it started, so its path starts from where the marcher was when it joined.",
    "inspector.timeline.span.resumeHelp":
        "Back in this transition after another move took over, so its path starts from where the marcher was.",

    "inspector.timeline.beats.range": "{start} to {end}",
    "inspector.timeline.beats.showStart": "the start of the show",
    "inspector.timeline.beats.showEnd": "the end of the show",
    "inspector.timeline.transition.onTimeline": "{id} on {timeline}",
    "inspector.timeline.transition.plain": "{id}",
    "inspector.timeline.slot.value": "{slot} of {count}",
    "inspector.timeline.progress.value": "{percent}%",
    "inspector.timeline.origin.home": "Home ({x}, {y})",
    "inspector.timeline.origin.spanFounding":
        "End of the previous founding span in transition {transition} ({x}, {y})",
    "inspector.timeline.origin.spanJoin":
        "End of the previous join span in transition {transition} ({x}, {y})",
    "inspector.timeline.origin.spanResume":
        "End of the previous resume span in transition {transition} ({x}, {y})",
    "inspector.timeline.origin.spanHold": "Where it was holding ({x}, {y})",

    "inspector.timeline.pathStyle.direct": "Direct",
    "inspector.timeline.pathStyle.arc": "Arc",
    "inspector.timeline.pathStyle.follow_the_leader": "Follow the leader",
    "inspector.timeline.orderMode.inherit": "Inherit the upstream order",
    "inspector.timeline.orderMode.slot": "Slot order",
    "inspector.timeline.destination.shape": "{name} ({kind})",
    "inspector.timeline.destination.shapeUnnamed": "Shape {id} ({kind})",
    "inspector.timeline.destination.points":
        "{count} individually placed points",

    "inspector.timeline.ftl.place": "Place {place} of {count} (1 is the tail)",
    "inspector.timeline.ftl.notMember":
        "Not a member of the trail (it didn't found this transition)",
    "inspector.timeline.ftl.sourceInherit":
        "Inherited from transition {transition}",
    "inspector.timeline.ftl.sourceSlot": "Slot order",
    "inspector.timeline.ftl.sourceFallback":
        "Slot order (no single upstream order to inherit)",
    "inspector.timeline.ftl.target": "({x}, {y})",

    "inspector.timeline.edit.title": "Edit transition {id}",
    "inspector.timeline.edit.range": "Beats {start} to {end}",
    "inspector.timeline.edit.ftlNeedsShape":
        "Follow the leader follows a path, so it needs a destination shape. Pick a shape first.",
    "inspector.timeline.edit.ftlNotBlock":
        "Follow the leader can't end in a block. Pick a line, freehand, circle or box shape first.",
    "inspector.timeline.edit.bulgeInput": "Bulge value",
    "inspector.timeline.edit.bulgeHelp":
        "From -0.5 to 0.5: 0 is straight and ±0.5 is a half circle. Larger arcs aren't supported, because they could carry a marcher farther from its target than where it started.",
    "inspector.timeline.edit.waypointsHelp":
        "Points the trail passes through before it reaches the shape, in field coordinates.",
    "inspector.timeline.edit.noWaypoints":
        "No waypoints: the trail runs straight onto the shape.",
    "inspector.timeline.edit.waypointX": "Waypoint {n} x",
    "inspector.timeline.edit.waypointY": "Waypoint {n} y",
    "inspector.timeline.edit.waypointUp": "Move waypoint {n} up",
    "inspector.timeline.edit.waypointDown": "Move waypoint {n} down",
    "inspector.timeline.edit.waypointRemove": "Remove waypoint {n}",
    "inspector.timeline.edit.waypointAdd": "Add waypoint",
    "inspector.timeline.edit.orderInheritHelp":
        "Follow the leader keeps the order the marchers had in their previous move.",
    "inspector.timeline.edit.orderSlotHelp":
        "Follow the leader orders the trail by slot number.",
    "inspector.timeline.edit.destinationShape": "Shape",
    "inspector.timeline.edit.destinationIndividual": "Individual points",
    "inspector.timeline.edit.pickShape": "Destination shape",
    "inspector.timeline.edit.shapeNoFtl":
        "{shape}: follow the leader can't end in a block",
    "inspector.timeline.edit.shapeTooSmall":
        "{shape}: holds only {capacity} of {slots} slots",
    "inspector.timeline.edit.noShapes":
        "There are no shapes yet. Draw one to use it as a destination.",
    "inspector.timeline.edit.individualHelp":
        "Each slot has its own point. Switching from a shape puts each point where the shape put that slot.",
    "inspector.timeline.edit.individualFtl":
        "Follow the leader needs a shape. Change the path style first to use individual points.",
    "inspector.timeline.edit.slotCount": "Slots",
    "inspector.timeline.edit.slotCountMin":
        "At least {min}, because slot {slot} has a marcher assigned.",
    "inspector.timeline.edit.slotCountPoints":
        "New slots start at the last slot's point.",

    "inspector.timeline.assign.title": "Slots in transition {id}",
    "inspector.timeline.assign.filled": "{filled} of {count} slots filled",
    "inspector.timeline.assign.noVacant": "No vacant slots.",
    "inspector.timeline.assign.vacantList":
        "Vacant slots, where nobody goes ({count}): {slots}",
    "inspector.timeline.assign.vacantSlot": "Slot {slot}: vacant",
    "inspector.timeline.assign.moreVacant":
        "{count} more vacant slots aren't listed.",
    "inspector.timeline.assign.casting": "Casting",
    "inspector.timeline.assign.cast": "Cast selected marchers",
    "inspector.timeline.assign.castHelp":
        "Puts the selected marchers who aren't in this transition yet ({count}) into the vacant slots nearest to where they stand when it starts, one layer above any other move they have at these beats, so this one wins.",
    "inspector.timeline.assign.castHelpFtl":
        "Puts the selected marchers who aren't in this transition yet ({count}) into the lowest vacant slots, one layer above any other move they have at these beats. Follow the leader places marchers by their order on the trail, not by slot, so the nearest slot means nothing here.",
    "inspector.timeline.assign.castNoneSelected":
        "Select marchers to cast them into this transition.",
    "inspector.timeline.assign.castAllCast":
        "Every selected marcher is already in this transition.",
    "inspector.timeline.assign.castNoVacancy":
        "Selected marchers who need a slot: {count}. Vacant slots: {vacant}. Raise the slot count first.",
    "inspector.timeline.assign.castStole":
        "Cast on a higher layer, so these marchers now leave their other moves for these beats: {list}",
    "inspector.timeline.assign.castStoleItem":
        "{marcher} (transition {transitions})",
    "inspector.timeline.assign.recast": "Recast by nearest slot",
    "inspector.timeline.assign.recastHelp":
        "Gives every marcher in this transition the slot nearest to where it starts, keeping its beats and layer. A later follow-the-leader move that inherits its order from this one will follow the new slot order.",
    "inspector.timeline.assign.recastFtl":
        "Follow the leader places marchers by their order on the trail, not by slot, so it can't be recast by nearest slot.",
    "inspector.timeline.assign.recastNoMembers":
        "Nobody is in this transition yet.",
    "inspector.timeline.assign.tooManySlots":
        "Automatic casting handles up to {max} slots. Type each marcher's slot instead.",
    "inspector.timeline.assign.slots": "Slots",
    "inspector.timeline.assign.slotHelp":
        "Type a vacant slot to move a marcher there, or an occupied one to trade places with its marcher.",
    "inspector.timeline.assign.layerHelp":
        "Where a marcher's moves overlap, the one on the higher layer wins, and the others are stolen for those beats.",
    "inspector.timeline.assign.slotMember": "Slot {slot}: {marcher}",
    "inspector.timeline.assign.slotFor": "Slot for {marcher}",
    "inspector.timeline.assign.layerFor": "Layer for {marcher}",
    "inspector.timeline.assign.startFor": "First beat for {marcher}",
    "inspector.timeline.assign.endFor": "End beat for {marcher}",
    "inspector.timeline.assign.remove": "Remove {marcher} from this transition",
    "inspector.timeline.assign.notStolen": "Wins all of its beats.",
    "inspector.timeline.assign.stolen":
        "Stolen from beat {start} to {end} by a higher layer.",
    "inspector.timeline.assign.stolenBy":
        "Stolen from beat {start} to {end} by transition {transition} on a higher layer.",

    "inspector.timeline.diagnostics.title": "Diagnostics",
    "inspector.timeline.diagnostics.none": "No diagnostics.",
    "inspector.timeline.diagnostics.showTitle": "Show diagnostics ({count})",
    "inspector.timeline.diagnostics.showNone":
        "No diagnostics for the whole show.",
    "inspector.timeline.diagnostics.warning": "Warning",
    "inspector.timeline.diagnostics.info": "Info",
    "inspector.timeline.diagnostics.transition": "Transition {id}",
    "inspector.timeline.diagnostics.dVacant":
        "Slot {slot} has no marcher assigned, so nobody goes to that place.",
    "inspector.timeline.diagnostics.dRebase":
        "This marcher joined or resumed this move partway, so its path was rebased to start where it was.",
    "inspector.timeline.diagnostics.dFtlNonFounding":
        "This marcher joined or resumed a follow-the-leader move partway, so it isn't part of the trail's order and heads to its target on its own.",
    "inspector.timeline.diagnostics.dFtlEmpty":
        "Nobody founds this follow-the-leader move, so there's no trail: the marchers fill the shape from its far end.",
    "inspector.timeline.diagnostics.dOrderFallback":
        "This move couldn't inherit an order from a single earlier move, so it uses slot order.",

    "inspector.timeline.shapes.title": "Shapes",
    "inspector.timeline.shapes.help":
        "Shapes are formations in field coordinates, with no time. A transition moves its marchers into one. A new shape is drawn through the selected marchers where they stand at the selected page, or in the middle of the field when nobody is selected.",
    "inspector.timeline.shapes.canvasHelp":
        "The picked shape is drawn on the field. Drag a round handle to reshape it, or the square handle to move it. Each drag is saved as one change when you let go.",
    "inspector.timeline.shapes.dragDropped":
        "That drag wasn't saved, because another shape change was still being saved. Drag it again.",
    "inspector.timeline.shapes.newKind": "Kind of new shape",
    "inspector.timeline.shapes.create": "New shape",
    "inspector.timeline.shapes.none": "No shapes yet.",
    "inspector.timeline.shapes.pick": "Shape to edit",
    "inspector.timeline.shapes.named": "{name} ({kind})",
    "inspector.timeline.shapes.unnamed": "Shape {id} ({kind})",
    "inspector.timeline.shapes.name": "Name",
    "inspector.timeline.shapes.usedBy": "Used by transitions {list}.",
    "inspector.timeline.shapes.unused": "No transition uses this shape.",
    "inspector.timeline.shapes.usedHelp":
        "Changes move every marcher heading to this shape.",
    "inspector.timeline.shapes.kindLabel": "Kind",
    "inspector.timeline.shapes.kindHelp":
        "Changing the kind redraws the shape in the area the old one covered. A box or circle becomes an open freehand path along its outline, so its two ends are different places.",
    "inspector.timeline.shapes.kindInUse":
        "Transitions {list} use this shape. Changing its kind spreads their slots over the new shape, so their marchers end in new places.",
    "inspector.timeline.shapes.kindNoFtl":
        "It can't become a block: transition {list} follows the leader into it, and a trail can't end on a block.",
    "inspector.timeline.shapes.kinds.line": "Line",
    "inspector.timeline.shapes.kinds.freehand": "Freehand",
    "inspector.timeline.shapes.kinds.circle": "Circle",
    "inspector.timeline.shapes.kinds.box": "Box",
    "inspector.timeline.shapes.kinds.block": "Block",
    "inspector.timeline.shapes.points": "Points",
    "inspector.timeline.shapes.pointsHelp":
        "Slots are spread evenly along the path, from the first point to the last.",
    "inspector.timeline.shapes.pointX": "Point {n} x",
    "inspector.timeline.shapes.pointY": "Point {n} y",
    "inspector.timeline.shapes.pointUp": "Move point {n} up",
    "inspector.timeline.shapes.pointDown": "Move point {n} down",
    "inspector.timeline.shapes.pointRemove": "Remove point {n}",
    "inspector.timeline.shapes.pointAdd": "Add point",
    "inspector.timeline.shapes.pointsMin":
        "A freehand path needs at least two points.",
    "inspector.timeline.shapes.lineStart": "Start",
    "inspector.timeline.shapes.lineEnd": "End",
    "inspector.timeline.shapes.x": "{what} x",
    "inspector.timeline.shapes.y": "{what} y",
    "inspector.timeline.shapes.center": "Center",
    "inspector.timeline.shapes.radius": "Radius",
    "inspector.timeline.shapes.startAngle": "Start angle (degrees)",
    "inspector.timeline.shapes.direction": "Direction",
    "inspector.timeline.shapes.counterclockwise": "Counterclockwise",
    "inspector.timeline.shapes.clockwise": "Clockwise",
    "inspector.timeline.shapes.circleHelp":
        "Slots are spread evenly around the circle from the start angle. Angles and directions are in field coordinates, measured from +x toward +y.",
    "inspector.timeline.shapes.origin": "Origin",
    "inspector.timeline.shapes.width": "Width",
    "inspector.timeline.shapes.height": "Height",
    "inspector.timeline.shapes.boxHelp":
        "Slots are spread evenly around the outline, starting at the origin.",
    "inspector.timeline.shapes.rows": "Rows",
    "inspector.timeline.shapes.cols": "Columns",
    "inspector.timeline.shapes.spacing": "Spacing",
    "inspector.timeline.shapes.cells":
        "{rows} × {cols} = {cells} places, filled row by row from the origin.",
    "inspector.timeline.shapes.cellsNeeded":
        "Transition {list} has {slots} slots, so the block needs at least {slots} places.",
    "inspector.timeline.shapes.noPositions":
        "None of the selected marchers is in the timeline yet, so there is nowhere to draw the shape through. Select marchers that are, or nobody to draw it in the middle of the field.",
    "inspector.timeline.shapes.delete": "Delete shape",
    "inspector.timeline.shapes.deleteInUse":
        "It can't be deleted while transitions {list} use it. Give them another destination first.",
} as const;

export type TimelineInspectorStringKey =
    keyof typeof TIMELINE_INSPECTOR_STRINGS;

/** The diagnostic codes' string keys. */
export const DIAGNOSTIC_STRING_KEYS = {
    "D-VACANT": "inspector.timeline.diagnostics.dVacant",
    "D-REBASE": "inspector.timeline.diagnostics.dRebase",
    "D-FTL-NONFOUNDING": "inspector.timeline.diagnostics.dFtlNonFounding",
    "D-FTL-EMPTY": "inspector.timeline.diagnostics.dFtlEmpty",
    "D-ORDER-FALLBACK": "inspector.timeline.diagnostics.dOrderFallback",
} as const satisfies Record<string, TimelineInspectorStringKey>;
