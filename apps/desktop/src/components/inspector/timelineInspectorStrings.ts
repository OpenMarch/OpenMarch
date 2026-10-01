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
