import type { AnyToolKind, ToolEnv } from "../tool/toolKind";
import type { XY } from "../types";
import {
    DEGREE,
    fieldToFrame,
    flipFrame,
    frameCorners,
    frameToField,
    DEFAULT_PIVOT,
    isPivotKey,
    normalizeAngle,
    pivotAt,
    pivotPoint,
    rotateFrame,
    rotationDegrees,
    ROTATION_SNAP_DEGREES,
    samePivot,
    snapRotation,
    type FlipAxis,
    type Pivot,
} from "./frame";
import { linePull } from "./edgeGuides";
import { carryPivot, pivotOf, snapPivot, withPivot } from "./pivot";

/**
 * The gestures every open or selected shape has, whatever its kind
 * (08-shape-system-ux.md, "Handles and gestures"): its own handles, the rotate knob, turning
 * from just outside a corner, the center dot, its pivot (#350), and a drag on its body. The new
 * shape tool and a selected placed shape both use these, so they behave the same. Everything
 * here is pure.
 */

/** What a press on a shape grabs */
export type ShapeTarget =
    | { readonly type: "handle"; readonly key: string }
    /** The knob above the shape, or just outside a corner */
    | { readonly type: "rotate"; readonly from: "knob" | "corner" }
    /** The center dot: the shape's center follows the pointer */
    | { readonly type: "center" }
    /**
     * The pivot (#350): its crosshair once it's out of the center, or a reach-inside press on the
     * center dot, which pulls it out (`pulled`: the press used its key)
     */
    | { readonly type: "pivot"; readonly pulled?: true }
    /** The shape's body */
    | { readonly type: "move" };

export type ShapeGesture =
    | { readonly type: "handle"; readonly key: string; readonly base: unknown }
    | {
          readonly type: "rotate";
          readonly from: "knob" | "corner";
          readonly base: unknown;
          /** What it turns around, in field units, fixed at the press */
          readonly pivot: XY;
          /** The pointer's angle from the pivot at the press */
          readonly startAngle: number;
      }
    | { readonly type: "center"; readonly base: unknown }
    | { readonly type: "pivot"; readonly base: unknown }
    | { readonly type: "move"; readonly base: unknown; readonly grab: XY };

/** How far the knob stands above the shape's back edge, in handle reaches */
const KNOB_STEM = 2.4;
/** How far outside a corner still turns the shape, in handle reaches */
const CORNER_ROTATE_REACH = 2.6;

/**
 * The knob, its stem's foot on the back edge, the center dot, and the pivot's crosshair when it's
 * out of the center (null at the center, where the dot is the pivot), in field units
 */
export function frameControls(
    kind: AnyToolKind,
    params: unknown,
    n: number,
    env: Pick<ToolEnv, "hitRadius">,
): { knob: XY; stem: XY; center: XY; pivot: XY | null } {
    const frame = kind.frameOf(params, n);
    const back = -frame.halfDepth;
    const pivot = pivotOf(params);
    return {
        pivot: pivot === DEFAULT_PIVOT ? null : pivotPoint(frame, pivot),
        stem: frameToField(frame, { x: 0, y: back }),
        knob: frameToField(frame, {
            x: 0,
            y: back - KNOB_STEM * env.hitRadius,
        }),
        center: frame.center,
    };
}

const near = (a: XY, b: XY, r: number) => Math.hypot(a.x - b.x, a.y - b.y) <= r;

/**
 * What a press at `at` grabs on the shape, nearest the front of what's drawn first: the pivot's
 * crosshair, a handle, the knob, the center dot (the pivot with reach inside), the ring just outside
 * a corner, then the body. Null when it misses.
 */
export function shapeTargetAt(
    kind: AnyToolKind,
    params: unknown,
    n: number,
    at: XY,
    env: ToolEnv,
): ShapeTarget | null {
    const controls = frameControls(kind, params, n, env);
    // Drawn over everything, so it wins over a handle on the marcher it sits on
    if (controls.pivot && near(controls.pivot, at, env.hitRadius))
        return { type: "pivot" };
    let best: { key: string; d: number } | undefined;
    for (const h of kind.handles(params, n)) {
        const d = Math.hypot(h.at.x - at.x, h.at.y - at.y);
        if (d <= env.hitRadius && (!best || d < best.d))
            best = { key: h.key, d };
    }
    if (best) return { type: "handle", key: best.key };
    if (near(controls.knob, at, env.hitRadius))
        return { type: "rotate", from: "knob" };
    if (near(controls.center, at, env.hitRadius))
        return env.reachInside
            ? { type: "pivot", pulled: true }
            : { type: "center" };
    const frame = kind.frameOf(params, n);
    const local = fieldToFrame(frame, at);
    // Diagonally past a corner, as in design apps; past an edge is the body (it has a margin)
    const pastCorner =
        Math.abs(local.x) > frame.halfWidth &&
        Math.abs(local.y) > frame.halfDepth;
    if (
        pastCorner &&
        frameCorners(frame).some((c) =>
            near(c, at, CORNER_ROTATE_REACH * env.hitRadius),
        )
    )
        return { type: "rotate", from: "corner" };
    if (kind.contains(params, n, at)) return { type: "move" };
    return null;
}

const angleFrom = (pivot: XY, p: XY) =>
    Math.atan2(p.y - pivot.y, p.x - pivot.x);

/** The gesture a press at `at` starts on the shape, or null when it misses */
export function startShapeGesture(
    kind: AnyToolKind,
    params: unknown,
    n: number,
    at: XY,
    env: ToolEnv,
): ShapeGesture | null {
    const target = shapeTargetAt(kind, params, n, at, env);
    if (!target) return null;
    switch (target.type) {
        case "handle":
            return { type: "handle", key: target.key, base: params };
        case "center":
            return { type: "center", base: params };
        case "pivot":
            return { type: "pivot", base: params };
        case "move":
            return { type: "move", base: params, grab: at };
        case "rotate": {
            const pivot = pivotPoint(kind.frameOf(params, n), pivotOf(params));
            return {
                type: "rotate",
                from: target.from,
                base: params,
                pivot,
                startAngle: angleFrom(pivot, at),
            };
        }
    }
}

/** The shape as `gesture` has it with the pointer at `at`, its pivot kept */
export function dragShape(
    kind: AnyToolKind,
    n: number,
    gesture: ShapeGesture,
    at: XY,
    env: ToolEnv,
): unknown {
    const base = gesture.base;
    if (gesture.type === "pivot")
        return withPivot(base, snapPivot(kind.frameOf(base, n), at, env));
    return carryPivot(base, dragged(kind, n, gesture, at, env));
}

function dragged(
    kind: AnyToolKind,
    n: number,
    gesture: Exclude<ShapeGesture, { type: "pivot" }>,
    at: XY,
    env: ToolEnv,
): unknown {
    const base = gesture.base;
    switch (gesture.type) {
        case "handle":
            return kind.dragHandle(base, n, gesture.key, at, env);
        case "move":
            return movedOnAxis(
                kind,
                base,
                n,
                { x: at.x - gesture.grab.x, y: at.y - gesture.grab.y },
                env,
            );
        case "center": {
            const { center } = kind.frameOf(base, n);
            return movedOnAxis(
                kind,
                base,
                n,
                { x: at.x - center.x, y: at.y - center.y },
                env,
            );
        }
        case "rotate": {
            const frame = kind.frameOf(base, n);
            if (near(at, gesture.pivot, 1e-9)) return base;
            const turn = angleFrom(gesture.pivot, at) - gesture.startAngle;
            const rotation = snapRotation(frame.rotation + turn, env);
            const turned = carryPivot(
                base,
                kind.withFrame(
                    base,
                    n,
                    rotateFrame(frame, rotation, gesture.pivot),
                ),
            );
            return settled(kind, turned, n, env, gesture.pivot);
        }
    }
}

/**
 * `base` moved by `delta` ({@link moveOntoLines}); with `constrain` held, on one axis only, across
 * or down, whichever the drag has gone further along, as a marcher drag does (`ruledMove`). The
 * other axis stays where it was, whatever the grid or a line would pull it to.
 */
function movedOnAxis(
    kind: AnyToolKind,
    base: unknown,
    n: number,
    delta: XY,
    env: ToolEnv,
): unknown {
    if (!env.constrain) return moveOntoLines(kind, base, n, delta, env);
    const across = Math.abs(delta.y) <= Math.abs(delta.x);
    const moved = moveOntoLines(
        kind,
        base,
        n,
        across ? { x: delta.x, y: 0 } : { x: 0, y: delta.y },
        env,
    );
    const start = kind.frameOf(base, n).center;
    const frame = kind.frameOf(moved, n);
    return kind.withFrame(moved, n, {
        ...frame,
        center: across
            ? { x: frame.center.x, y: start.y }
            : { x: start.x, y: frame.center.y },
    });
}

/**
 * `base` moved by `delta`, one of its snap points (a corner or the center, at any turn) landing
 * on a field line within the pull radius (#444, #446), or on two lines' crossing, as a stretch's
 * edge does (#425); the kind's own grid snap on an axis with none.
 * The radius is never more than a quarter step (half the grid's detent), so every half step near
 * a line can still be reached: a stretch's quarter of its detent (#425) would be under a pixel for
 * a move at the fitted zoom. `fine` still pulls, off the grid; the Snap toggle off doesn't (owner
 * on #453).
 */
function moveOntoLines(
    kind: AnyToolKind,
    base: unknown,
    n: number,
    delta: XY,
    env: ToolEnv,
): unknown {
    const snapped = kind.move(base, n, delta, env);
    if (env.pull === false || !env.fieldLines) return snapped;
    if (!kind.snapPoints) return snapped;
    const free = kind.move(base, n, delta, { ...env, snap: false });
    const at = kind.frameOf(free, n).center;
    const pull = linePull(
        kind.snapPoints(free, n),
        env.fieldLines,
        Math.min(env.pullRadius ?? 0, env.stepPx / 4),
    );
    if (pull.x === null && pull.y === null) return snapped;
    const frame = kind.frameOf(snapped, n);
    return kind.withFrame(snapped, n, {
        ...frame,
        center: {
            x: pull.x === null ? frame.center.x : at.x + pull.x,
            y: pull.y === null ? frame.center.y : at.y + pull.y,
        },
    });
}

/**
 * The shape after a double click on its pivot (#350): the pivot back at the center. Null when the
 * press wasn't on the pivot, or it already was there.
 */
export function centerPivot(gesture: ShapeGesture): unknown {
    return gesture.type === "pivot" && pivotOf(gesture.base) !== DEFAULT_PIVOT
        ? withPivot(gesture.base, DEFAULT_PIVOT)
        : null;
}

/** The shape turned to `rotation` (radians) about `pivot` (the shape's own, normally) */
export function turnShape(
    kind: AnyToolKind,
    params: unknown,
    n: number,
    rotation: number,
    pivot: Pivot,
    env: ToolEnv,
): unknown {
    const frame = kind.frameOf(params, n);
    const turned = carryPivot(
        params,
        kind.withFrame(
            params,
            n,
            rotateFrame(
                frame,
                normalizeAngle(rotation),
                pivotPoint(frame, pivot),
            ),
        ),
    );
    return settled(
        kind,
        turned,
        n,
        env,
        samePivot(pivotOf(params), pivot) ? pivotPoint(frame, pivot) : null,
    );
}

/**
 * The shape mirrored along its own axis about `pivot` (the shape's own, normally). Its own pivot
 * stays where it is on the field, so flipping twice puts the shape back: flipped around its right
 * edge, that point is its left edge afterwards.
 */
export function flipShape(
    kind: AnyToolKind,
    params: unknown,
    n: number,
    axis: FlipAxis,
    pivot: Pivot,
    env: ToolEnv,
): unknown {
    const frame = kind.frameOf(params, n);
    let flipped = carryPivot(
        params,
        kind.withFrame(params, n, flipFrame(frame, axis, pivot)),
    );
    if (!samePivot(pivotOf(params), pivot))
        return settled(kind, flipped, n, env, null);
    const around = pivotPoint(frame, pivot);
    flipped = withPivot(flipped, pivotAt(kind.frameOf(flipped, n), around));
    return settled(kind, flipped, n, env, around);
}

/**
 * After a turn, flip or scale: the shape put back on the grid by its kind, its pivot kept. A
 * pivot dragged somewhere of its own (onto a marcher, say) stays at `around`, the field point the
 * change went around, rather than shifting with the shape's small step back onto the grid.
 */
export function settled(
    kind: AnyToolKind,
    params: unknown,
    n: number,
    env: ToolEnv,
    around: XY | null,
): unknown {
    if (!kind.settle) return params;
    const out = carryPivot(params, kind.settle(params, n, env));
    if (!around || isPivotKey(pivotOf(out))) return out;
    return withPivot(out, pivotAt(kind.frameOf(out, n), around));
}

/** The shape's outline on the field: the kind's own, or its frame's four corners */
export function shapeOutline(
    kind: AnyToolKind,
    params: unknown,
    n: number,
): readonly XY[] {
    return kind.outline?.(params, n) ?? frameCorners(kind.frameOf(params, n));
}

/** Pixels of drag per degree on a rotation number */
export const ROTATION_PX_PER_DEGREE = 2;

/**
 * The shape's rotation dragged `distance` px clockwise, 1° per 2 px from where it started: in 15°
 * steps as the knob turns (#403), whole degrees with `fine`, free with the Snap toggle off
 */
export function scrubTurn(
    kind: AnyToolKind,
    base: unknown,
    n: number,
    distance: number,
    pivot: Pivot,
    env: ToolEnv,
): unknown {
    const turn = distance / ROTATION_PX_PER_DEGREE;
    const stepped = env.pull !== false;
    if (Math.trunc(turn) === 0 && stepped) return base;
    const degrees = rotationDegrees(kind.frameOf(base, n).rotation) + turn;
    const step = env.fine ? 1 : ROTATION_SNAP_DEGREES;
    const snapped = stepped ? Math.round(degrees / step) * step : degrees;
    return turnShape(kind, base, n, snapped * DEGREE, pivot, env);
}
