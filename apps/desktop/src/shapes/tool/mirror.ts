import { flipFrame, pivotAt, type FlipAxis } from "../frame/frame";
import { carryPivot } from "../frame/pivot";
import type { XY } from "../types";
import type { AnyToolKind, ToolEnv } from "./toolKind";

/**
 * A paste mirrored through a point (Paste mirrored): the open shape is the mirror image of
 * `source`, the copy as Paste exactly would show it, through `point` on the field. `across`
 * mirrors it side to side (across the line through the point that runs like a yard line), `deep`
 * front to back (across the line through it that runs like the sidelines); both turn it half a turn
 * around the point.
 *
 * While the open shape carries one, it stays tied to it: moving the point, or switching a
 * direction, shows the mirror image again, and moving the shape moves the point half as far.
 * Anything else (a turn, a resize, a number typed) unties it, and it's an ordinary open shape
 * from there. Everything here is pure.
 */
export interface Mirror extends MirrorAxes {
    /** The shape as Paste exactly would open it, not mirrored */
    readonly source: unknown;
    /** The mirror point, in field units */
    readonly point: XY;
}

/** Which ways a mirror goes: side to side, front to back, both or (for a moment) neither */
export interface MirrorAxes {
    readonly across: boolean;
    readonly deep: boolean;
}

/** `p` mirrored through `point` the ways `axes` say */
export function mirrorPoint(p: XY, point: XY, axes: MirrorAxes): XY {
    return {
        x: axes.across ? 2 * point.x - p.x : p.x,
        y: axes.deep ? 2 * point.y - p.y : p.y,
    };
}

/**
 * `params` of `kind` (with `n` spots) mirrored through `point` on the field: each spot lands on
 * its mirror image. A turned shape turns the other way, as Flip does (`flipFrame`).
 */
export function mirrorParams(
    kind: AnyToolKind,
    params: unknown,
    n: number,
    point: XY,
    axes: MirrorAxes,
): unknown {
    if (!axes.across && !axes.deep) return params;
    let frame = kind.frameOf(params, n);
    const flips: FlipAxis[] = [];
    if (axes.across) flips.push("across");
    if (axes.deep) flips.push("deep");
    for (const axis of flips)
        frame = flipFrame(frame, axis, pivotAt(frame, point));
    return carryPivot(params, kind.withFrame(params, n, frame));
}

/** The open shape a mirror shows: its source mirrored through its point */
export const mirroredOf = (
    kind: AnyToolKind,
    n: number,
    mirror: Mirror,
): unknown => mirrorParams(kind, mirror.source, n, mirror.point, mirror);

/** `mirror` with its point moved to `point` */
export const withMirrorPoint = (mirror: Mirror, point: XY): Mirror =>
    point.x === mirror.point.x && point.y === mirror.point.y
        ? mirror
        : { ...mirror, point };

/** `mirror` with `axis` switched */
export const toggledMirror = (mirror: Mirror, axis: FlipAxis): Mirror =>
    axis === "across"
        ? { ...mirror, across: !mirror.across }
        : { ...mirror, deep: !mirror.deep };

/**
 * Where the mirror point goes when the mirrored shape is moved by `by`: half as far, along the
 * ways it mirrors. Along a way it doesn't mirror the shape stays level with the copied marchers,
 * so that part of the move is dropped.
 */
export function pointAfterMove(mirror: Mirror, by: XY): XY {
    return {
        x: mirror.point.x + (mirror.across ? by.x / 2 : 0),
        y: mirror.point.y + (mirror.deep ? by.y / 2 : 0),
    };
}

/**
 * Where a dragged mirror point lands: on a marcher within reach, else on each axis onto one of
 * the field's lines within pull (a yard line, a hash, a sideline), else on the half-step grid.
 * `fine` leaves the grid out but keeps the lines and marchers; the Snap toggle off leaves it
 * where the pointer is.
 */
export function snapMirrorPoint(at: XY, env: ToolEnv): XY {
    if (env.pull === false && !env.snap) return at;
    if (env.pull !== false) {
        let best: { p: XY; d: number } | null = null;
        for (const p of env.marcherSnaps?.() ?? []) {
            const d = Math.hypot(p.x - at.x, p.y - at.y);
            if (d <= env.hitRadius && (!best || d < best.d)) best = { p, d };
        }
        if (best) return { x: best.p.x, y: best.p.y };
    }
    const grid = env.gridSnap(at);
    const pull = env.pull !== false ? (env.pullRadius ?? 0) : 0;
    const nearest = (v: number, lines: readonly number[] | undefined) => {
        let found: number | null = null;
        for (const line of lines ?? [])
            if (
                Math.abs(line - v) <= pull &&
                (found === null || Math.abs(line - v) < Math.abs(found - v))
            )
                found = line;
        return found;
    };
    return {
        x: nearest(at.x, env.fieldLines?.x) ?? grid.x,
        y: nearest(at.y, env.fieldLines?.y) ?? grid.y,
    };
}

/** Frames this close are the same, in field units or radians */
const SAME = 1e-6;

/**
 * How far `after` is `before` moved, when it's only moved (the same size, turn and flip); null
 * for any other change, or none
 */
export function movedBy(
    kind: AnyToolKind,
    before: unknown,
    after: unknown,
    n: number,
): XY | null {
    const a = kind.frameOf(before, n);
    const b = kind.frameOf(after, n);
    if (
        Math.abs(a.halfWidth - b.halfWidth) > SAME ||
        Math.abs(a.halfDepth - b.halfDepth) > SAME ||
        Math.abs(a.rotation - b.rotation) > SAME ||
        a.flipX !== b.flipX ||
        a.flipY !== b.flipY
    )
        return null;
    const by = { x: b.center.x - a.center.x, y: b.center.y - a.center.y };
    return Math.abs(by.x) <= SAME && Math.abs(by.y) <= SAME ? null : by;
}
