/**
 * How far a press may wander, and how far from a target it may land, by the
 * kind of pointer that made it. A mouse is exact to the pixel; a pen is nearly
 * so; a fingertip is about 7 mm wide and wobbles as it lifts (tablet parity,
 * section 4). Every slop, hit radius and handle reach on the field reads its
 * value here for the press's kind, so the mouse values live in one place and
 * stay as they were.
 *
 * All distances are CSS pixels on screen.
 */

/** What made a press: `PointerEvent.pointerType`, with anything unknown read as a mouse. */
export type PointerKind = "mouse" | "pen" | "touch";

export type PointerThresholds = {
    /** A press that moves less than this is a click or tap: it never moves anything. */
    readonly clickSlop: number;
    /** A press becomes a drag once it has moved this far. Never less than {@link clickSlop}. */
    readonly moveThreshold: number;
    /** A second press within this distance of the first (and in time) is its double-click or double-tap. */
    readonly doubleClickSlop: number;
    /** The smallest radius a marcher's target gets, however far the view is zoomed out. */
    readonly hitRadius: number;
    /** How far from a selection box handle's center, along each axis, a press still grabs it. */
    readonly handleReach: number;
    /** How far from a shape's handle (corner, point, pivot) a press still grabs it. */
    readonly shapeHandleReach: number;
};

/**
 * The mouse values are the field's long-standing ones: the click slop of the
 * rules table, a 13 px handle square and the shape tool's 10 px reach.
 */
const MOUSE: PointerThresholds = {
    clickSlop: 4,
    moveThreshold: 4,
    doubleClickSlop: 8,
    hitRadius: 5,
    handleReach: 13 / 2,
    shapeHandleReach: 10,
};

/** A pen tip is precise, but the hand holding it isn't resting on a desk. */
const PEN: PointerThresholds = {
    clickSlop: 6,
    moveThreshold: 6,
    doubleClickSlop: 12,
    hitRadius: 8,
    handleReach: 10,
    shapeHandleReach: 14,
};

/**
 * A finger: a tap may move up to 10 px, a drag starts at 12 px (a press
 * between the two is neither), and anything within 22 px of a target hits it.
 */
const TOUCH: PointerThresholds = {
    clickSlop: 10,
    moveThreshold: 12,
    doubleClickSlop: 24,
    hitRadius: 22,
    handleReach: 22,
    shapeHandleReach: 22,
};

const BY_KIND: Record<PointerKind, PointerThresholds> = {
    mouse: MOUSE,
    pen: PEN,
    touch: TOUCH,
};

/** The thresholds for a press made by `kind`. */
export function thresholdsFor(kind: PointerKind): PointerThresholds {
    return BY_KIND[kind];
}

/** A `PointerEvent.pointerType` as a {@link PointerKind}: "" and unknown types are a mouse. */
export function pointerKindOf(pointerType: string): PointerKind {
    return pointerType === "pen" || pointerType === "touch"
        ? pointerType
        : "mouse";
}
