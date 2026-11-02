import { fieldToFrame, frameToField, type ShapeFrame } from "../frame/frame";
import type { AnyToolKind, ToolEnv } from "../tool/toolKind";
import type { XY } from "../types";
import { regionSides } from "./distribute";
import { closedOf } from "./modes";
import type { OddGap, OutlineDistribution } from "./distribution";
import {
    gapOf,
    gapPoint,
    OUTLINE_MIN,
    outlineLoop,
    type OutlineSides,
} from "./outline";

/**
 * Picking an odd-count outline's gap (#390), for any closed kind with corners and without knowing
 * it: where the missing spot is on the field, and which spot a click between corners moves it to.
 * Everything is pure.
 */

interface OutlineOnField {
    readonly d: OutlineDistribution;
    readonly sides: OutlineSides;
    readonly across: number;
    readonly deep: number;
    readonly frame: ShapeFrame;
}

/** A shape filled in Outline with a gap to pick: 4 or more spots, a kind with corners */
function outlineOnField(
    kind: AnyToolKind,
    params: unknown,
    n: number,
): OutlineOnField | null {
    const closed = closedOf(kind, params, n);
    if (!closed?.intervals || params === null || n < OUTLINE_MIN) return null;
    const d = closed.distribution(params, n);
    if (d.mode !== "outline") return null;
    const region = closed.region(params, n);
    if (region.corners.length === 0) return null;
    const { across, deep } = closed.intervals(params);
    return {
        d,
        sides: regionSides(region, n, d, across, deep),
        across,
        deep,
        frame: kind.frameOf(params, n),
    };
}

/** A point in the kind's frame, before its flip, on the field */
const onField = (frame: ShapeFrame, p: XY): XY =>
    frameToField(frame, {
        x: frame.flipX ? -p.x : p.x,
        y: frame.flipY ? -p.y : p.y,
    });

/** The other way: a field point in the kind's frame, before its flip */
function inFrame(frame: ShapeFrame, at: XY): XY {
    const local = fieldToFrame(frame, at);
    return {
        x: frame.flipX ? -local.x : local.x,
        y: frame.flipY ? -local.y : local.y,
    };
}

/** Where the open outline's missing spot is on the field; null when it has none to show */
export function outlineGapAt(
    kind: AnyToolKind,
    params: unknown,
    n: number,
): XY | null {
    const o = outlineOnField(kind, params, n);
    if (!o) return null;
    const p = gapPoint(n, o.sides, o.d.oddGap, o.across, o.deep);
    return p && onField(o.frame, p);
}

/**
 * The outline's gap as it is now, `at` the actual spot, beside the gap as stored (`at` null for
 * the middle); null without one
 */
export function outlineGapOf(
    kind: AnyToolKind,
    params: unknown,
    n: number,
): {
    readonly gap: OddGap & { readonly at: number };
    readonly stored: OddGap;
    readonly sides: OutlineSides;
} | null {
    const o = outlineOnField(kind, params, n);
    if (!o) return null;
    const gap = gapOf(n, o.sides, o.d.oddGap);
    return (
        gap && {
            gap: { ...o.d.oddGap, ...gap },
            stored: o.d.oddGap,
            sides: o.sides,
        }
    );
}

/**
 * The params with the gap moved to the spot between corners nearest `at`, within half an
 * interval; null when the click isn't on one, or is on the side already spread evenly or the gap
 * itself
 */
export function gapPickAt(
    kind: AnyToolKind,
    params: unknown,
    n: number,
    at: XY,
    env: ToolEnv,
): unknown | null {
    const o = outlineOnField(kind, params, n);
    const gap = o && gapOf(n, o.sides, o.d.oddGap);
    if (!o || !gap) return null;
    const local = inFrame(o.frame, at);
    const reach = Math.min(o.across, o.deep) / 2;
    let best: { side: OddGap["side"]; at: number } | null = null;
    let nearest = reach;
    for (const spot of outlineLoop(o.sides, o.across, o.deep)) {
        if (spot.side === null) continue;
        const d = Math.hypot(spot.x - local.x, spot.y - local.y);
        if (d <= nearest) {
            nearest = d;
            best = { side: spot.side, at: spot.at };
        }
    }
    if (!best) return null;
    const style = o.d.oddGap.style;
    if (best.side === gap.side && (style === "spread" || best.at === gap.at))
        return null;
    return withOddGap(kind, params, n, { ...o.d.oddGap, ...best }, env);
}

/** The params with the outline's gap set to `oddGap` */
export function withOddGap(
    kind: AnyToolKind,
    params: unknown,
    n: number,
    oddGap: OddGap,
    env: ToolEnv,
): unknown {
    const closed = closedOf(kind, params, n);
    if (!closed) return params;
    const d = closed.distribution(params, n);
    if (d.mode !== "outline") return params;
    return closed.withDistribution(params, n, { ...d, oddGap }, env);
}

/**
 * The spacing on an odd-count outline's leftover side when it spreads its marchers evenly
 * (#458, owner on #459): its marchers share that side's whole length, one gap fewer than the
 * full sides, so they stand wider apart. Null when the outline has no leftover, leaves a gap
 * (its marchers keep the full spacing), or the side has no spot between corners.
 */
export function leftoverSpacing(
    kind: AnyToolKind,
    params: unknown,
    n: number,
): number | null {
    const o = outlineOnField(kind, params, n);
    if (!o || o.d.oddGap.style !== "spread") return null;
    const gap = gapOf(n, o.sides, o.d.oddGap);
    if (!gap) return null;
    const across = gap.side === "back" || gap.side === "front";
    const len = across ? o.sides.a : o.sides.b;
    if (len < 2) return null;
    return (len * (across ? o.across : o.deep)) / (len - 1);
}
