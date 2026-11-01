// cspell:words nesw nwse
import type { XY } from "../types";

/**
 * The frame every shape kind sits in (docs/timeline/research/shapes/08-shape-system-ux.md, "What a
 * shape is"): a center, a size, a rotation and a flip. Moving, rotating and flipping are written
 * once against the frame, so they work the same on every kind; a kind only says how its own
 * parameters map to a frame and how its spots sit inside it. Everything here is pure.
 *
 * Local coordinates are the frame's own: x across (left to right before any rotation), y deep
 * (back to front), both from the center. Rotation turns local +x from field +x toward field +y,
 * in radians. A flip mirrors the shape inside its frame, so the marcher on the left ends up on
 * the right.
 */
export interface ShapeFrame {
    readonly center: XY;
    /** Half the distance between the outermost spots across, in field units */
    readonly halfWidth: number;
    /** Half the distance between the outermost spots deep, in field units */
    readonly halfDepth: number;
    readonly rotation: number;
    readonly flipX: boolean;
    readonly flipY: boolean;
}

/**
 * The nine points a shape can turn and flip around: its corners, edge middles and center, by
 * compass point (north is the frame's back)
 */
export type PivotKey = "nw" | "n" | "ne" | "w" | "c" | "e" | "sw" | "s" | "se";

/**
 * What a shape turns, flips and resizes around until the user picks another point: its center.
 * The back-left corner (2026-10-17) made turns swing the box off screen and flips jump a box-width
 * sideways (sims, F2). Basic mode, which has no pivot grid, always uses it.
 */
export const DEFAULT_PIVOT: PivotKey = "c";

export const PIVOT_KEYS: readonly PivotKey[] = [
    "nw",
    "n",
    "ne",
    "w",
    "c",
    "e",
    "sw",
    "s",
    "se",
];

const axes = (rotation: number) => {
    const c = Math.cos(rotation);
    const s = Math.sin(rotation);
    return { ux: { x: c, y: s }, uy: { x: -s, y: c } };
};

/** A point in the frame's local coordinates, in field units */
export function frameToField(frame: ShapeFrame, local: XY): XY {
    const { ux, uy } = axes(frame.rotation);
    return {
        x: frame.center.x + ux.x * local.x + uy.x * local.y,
        y: frame.center.y + ux.y * local.x + uy.y * local.y,
    };
}

/** A field point in the frame's local coordinates */
export function fieldToFrame(frame: ShapeFrame, p: XY): XY {
    const { ux, uy } = axes(frame.rotation);
    const d = { x: p.x - frame.center.x, y: p.y - frame.center.y };
    return { x: d.x * ux.x + d.y * ux.y, y: d.x * uy.x + d.y * uy.y };
}

/**
 * A pivot dragged anywhere on the field (#350), in the frame's own terms so it moves, turns and
 * stretches with the shape: across and deep, a multiple of the frame's half size (−1 and 1 are its
 * edges, 0 its center). On an axis with no size (a line's depth) it is in field units from the
 * center instead.
 */
export interface FreePivot {
    readonly x: number;
    readonly y: number;
}

/** What a shape turns, flips and scales around: one of its 9 points, or anywhere (#350) */
export type Pivot = PivotKey | FreePivot;

export const isPivotKey = (pivot: unknown): pivot is PivotKey =>
    typeof pivot === "string" &&
    (PIVOT_KEYS as readonly string[]).includes(pivot);

export const isPivot = (pivot: unknown): pivot is Pivot =>
    isPivotKey(pivot) ||
    (typeof pivot === "object" &&
        pivot !== null &&
        Number.isFinite((pivot as FreePivot).x) &&
        Number.isFinite((pivot as FreePivot).y));

const keyLocal = (frame: ShapeFrame, key: PivotKey): XY => ({
    x: key.includes("w")
        ? -frame.halfWidth
        : key.includes("e")
          ? frame.halfWidth
          : 0,
    y: key.includes("n")
        ? -frame.halfDepth
        : key.includes("s")
          ? frame.halfDepth
          : 0,
});

/** A half size, or 1 on an axis with none: what a free pivot's number is a multiple of */
const unitOf = (half: number) => (half > 1e-9 ? half : 1);

/** Where `pivot` is in the frame's local coordinates */
export function pivotLocal(frame: ShapeFrame, pivot: Pivot): XY {
    if (isPivotKey(pivot)) return keyLocal(frame, pivot);
    return {
        x: pivot.x * unitOf(frame.halfWidth),
        y: pivot.y * unitOf(frame.halfDepth),
    };
}

export const pivotPoint = (frame: ShapeFrame, pivot: Pivot): XY =>
    frameToField(frame, pivotLocal(frame, pivot));

/**
 * The 9 points, the center first, then the edges' middles: on a line, which has no depth, its
 * right end is both "e" and "ne", and reads as "e"
 */
export const PIVOT_KEYS_SIMPLEST_FIRST: readonly PivotKey[] = [
    "c",
    "n",
    "e",
    "s",
    "w",
    "nw",
    "ne",
    "sw",
    "se",
];

/** How close to one of the 9 points a pivot reads as that point, in field units */
const ON_POINT = 1e-6;

/** The pivot at field point `p` on `frame`: one of its 9 points when it's on one */
export function pivotAt(frame: ShapeFrame, p: XY): Pivot {
    const local = fieldToFrame(frame, p);
    const key = PIVOT_KEYS_SIMPLEST_FIRST.find((k) => {
        const at = keyLocal(frame, k);
        return (
            Math.abs(at.x - local.x) <= ON_POINT &&
            Math.abs(at.y - local.y) <= ON_POINT
        );
    });
    if (key) return key;
    return {
        x: local.x / unitOf(frame.halfWidth),
        y: local.y / unitOf(frame.halfDepth),
    };
}

export const samePivot = (a: Pivot, b: Pivot): boolean =>
    isPivotKey(a) || isPivotKey(b)
        ? a === b
        : Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;

/** The frame turned to `rotation`, `pivot` (a field point) staying put */
export function rotateFrame(
    frame: ShapeFrame,
    rotation: number,
    pivot: XY,
): ShapeFrame {
    const turn = rotation - frame.rotation;
    const c = Math.cos(turn);
    const s = Math.sin(turn);
    const d = { x: frame.center.x - pivot.x, y: frame.center.y - pivot.y };
    return {
        ...frame,
        rotation,
        center: {
            x: pivot.x + d.x * c - d.y * s,
            y: pivot.y + d.x * s + d.y * c,
        },
    };
}

/** Side to side on the field (`across`) or front to back (`deep`): which way a flip mirrors */
export type FlipAxis = "across" | "deep";

/**
 * The frame mirrored side to side (`across`: side 1 and side 2 swap) or front to back (`deep`)
 * on the field, about a line through `around`. Mirroring a turned frame turns it the other
 * way and mirrors it inside, so its spots land on their mirror images.
 */
export function flipFrame(
    frame: ShapeFrame,
    axis: FlipAxis,
    around: Pivot,
): ShapeFrame {
    const pivot = pivotPoint(frame, around);
    const center =
        axis === "across"
            ? { x: 2 * pivot.x - frame.center.x, y: frame.center.y }
            : { x: frame.center.x, y: 2 * pivot.y - frame.center.y };
    // A mirror on the field is the opposite turn and a mirror along one of the frame's own axes.
    // Mirrored across the field (x), that is the turn -θ with the frame's x mirrored, or the
    // same placement written as π - θ with its y mirrored; front to back, the other way round.
    // Of the two, the one whose angle reads closest to the old one: a box at 90° mirrored side to
    // side looks the same, so it should still read 90°, not 270° (sims, F2).
    const opposite = normalizeAngle(-frame.rotation);
    const half = normalizeAngle(Math.PI - frame.rotation);
    const near = (a: number) => {
        const d = Math.abs(normalizeAngle(a - frame.rotation));
        return Math.min(d, 2 * Math.PI - d);
    };
    const ownAxis = near(opposite) <= near(half) + 1e-9;
    const flipsX = (axis === "across") === ownAxis;
    return {
        ...frame,
        center,
        rotation: ownAxis ? opposite : half,
        flipX: flipsX ? !frame.flipX : frame.flipX,
        flipY: flipsX ? frame.flipY : !frame.flipY,
    };
}

/** The frame's outline: its four corners, back-left first, clockwise on screen */
export function frameCorners(frame: ShapeFrame): XY[] {
    const { halfWidth: w, halfDepth: d } = frame;
    return [
        frameToField(frame, { x: -w, y: -d }),
        frameToField(frame, { x: w, y: -d }),
        frameToField(frame, { x: w, y: d }),
        frameToField(frame, { x: -w, y: d }),
    ];
}

const TAU = 2 * Math.PI;

/** An angle in [0, 2π) */
export const normalizeAngle = (rad: number): number =>
    ((rad % TAU) + TAU) % TAU;

/** Whether the frame is square to the field: turned a whole number of quarter turns */
export function squareToField(rotation: number): boolean {
    const quarters = rotation / (Math.PI / 2);
    return Math.abs(quarters - Math.round(quarters)) < 1e-6;
}

export const DEGREE = Math.PI / 180;

/** A dragged rotation snaps to this many degrees, as the field's rotate handle does (`ROTATION_SNAP`) */
export const ROTATION_SNAP_DEGREES = 15;

/**
 * A rotation as dragged: 15° steps, as the field's rotate handle and the old app turn; whole
 * degrees with `fine`; as is with the Snap toggle off (`pull` false) (#403, modifier roles).
 * Typed rotations don't come through here. Kept in [0, 2π).
 */
export function snapRotation(
    rad: number,
    env: { readonly fine?: boolean; readonly pull?: boolean },
): number {
    if (env.pull === false) return normalizeAngle(rad);
    const step = (env.fine ? 1 : ROTATION_SNAP_DEGREES) * DEGREE;
    const snapped = normalizeAngle(Math.round(rad / step) * step);
    // A full turn reads as 0
    return Math.abs(snapped - TAU) < 1e-9 ? 0 : snapped;
}

/** A rotation in degrees for people: 0 to 359, whole unless the Snap toggle left it between */
export function rotationDegrees(rad: number): number {
    const deg = (normalizeAngle(rad) / DEGREE) % 360;
    const rounded = Math.round(deg * 10) / 10;
    return rounded === 360 ? 0 : rounded;
}

/**
 * The resize cursor for a handle facing `local` (a direction in the frame's axes), as the frame is
 * turned on screen
 */
export function resizeCursor(
    frame: Pick<ShapeFrame, "rotation">,
    local: XY,
): "ew-resize" | "nwse-resize" | "ns-resize" | "nesw-resize" {
    const { ux, uy } = axes(frame.rotation);
    const dx = ux.x * local.x + uy.x * local.y;
    const dy = ux.y * local.x + uy.y * local.y;
    // Screen y grows down, so 45° here is down and to the right: nwse
    const eighth =
        Math.round(normalizeAngle(Math.atan2(dy, dx)) / (TAU / 8)) % 4;
    return (["ew-resize", "nwse-resize", "ns-resize", "nesw-resize"] as const)[
        eighth
    ]!;
}
