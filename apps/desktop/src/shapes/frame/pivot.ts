import type { ToolEnv } from "../tool/toolKind";
import type { XY } from "../types";
import {
    DEFAULT_PIVOT,
    isPivot,
    PIVOT_KEYS_SIMPLEST_FIRST,
    pivotAt,
    pivotPoint,
    type Pivot,
    type ShapeFrame,
} from "./frame";

/**
 * A shape's pivot (#350, spec #344): what it turns, flips and scales around, saved with the shape.
 * It lives in the shape's params as `pivot`, beside the kind's own numbers, so undo, placing (the
 * recipe stores the params) and selecting a placed shape again all carry it without the kind
 * knowing. Absent is the center, which every new shape starts at. Everything here is pure.
 */

/** Params with the host's pivot beside the kind's own numbers */
export type WithPivot = { readonly pivot?: Pivot };

/** The shape's pivot: the center unless one was set */
export function pivotOf(params: unknown): Pivot {
    const pivot =
        typeof params === "object" && params !== null
            ? (params as WithPivot).pivot
            : undefined;
    return isPivot(pivot) ? pivot : DEFAULT_PIVOT;
}

/**
 * `params` with `pivot`. The center is kept as `undefined`, which a saved recipe leaves out, but
 * which still says the pivot was set (see {@link carryPivot}).
 */
export function withPivot<P>(params: P, pivot: Pivot): P {
    return {
        ...params,
        pivot: pivot === DEFAULT_PIVOT ? undefined : pivot,
    } as P;
}

/**
 * `after`, a change of `before` by a kind, with `before`'s pivot: kinds keep fields they don't
 * know when they spread their params, but one that builds its params again would drop it
 */
export function carryPivot<P>(before: unknown, after: P): P {
    if (after === null || typeof after !== "object") return after;
    if ("pivot" in (after as object)) return after;
    const pivot = pivotOf(before);
    return pivot === DEFAULT_PIVOT ? after : withPivot(after, pivot);
}

/**
 * The pivot dragged to `at` on `frame`: onto a marcher ({@link ToolEnv.pivotSnaps}) or one of the
 * frame's 9 points within reach, whichever is nearer (a point when they're the same), or else onto
 * the half-step grid. `fine` or the Snap toggle off (`snap` false) leaves it where the pointer is.
 */
export function snapPivot(frame: ShapeFrame, at: XY, env: ToolEnv): Pivot {
    if (!env.snap) return pivotAt(frame, at);
    let best: { pivot: Pivot; d: number } | null = null;
    const consider = (pivot: () => Pivot, p: XY) => {
        const d = Math.hypot(p.x - at.x, p.y - at.y);
        if (d <= env.hitRadius && (!best || d < best.d - 1e-9))
            best = { pivot: pivot(), d };
    };
    for (const key of PIVOT_KEYS_SIMPLEST_FIRST)
        consider(() => key, pivotPoint(frame, key));
    for (const p of env.pivotSnaps?.() ?? [])
        consider(() => pivotAt(frame, p), p);
    return best
        ? (best as { pivot: Pivot }).pivot
        : pivotAt(frame, env.gridSnap(at));
}
