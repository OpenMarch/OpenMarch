import {
    fieldToFrame,
    frameToField,
    pivotPoint,
    type ShapeFrame,
} from "../frame/frame";
import { pivotOf } from "../frame/pivot";
import {
    distribute,
    spreadScale,
    type FrameSpot,
} from "../distribute/distribute";
import {
    DEFAULT_ODD_GAP,
    storedDistribution,
    type Distribution,
    type DistributionMode,
} from "../distribute/distribution";
import { circleRegion, type Region } from "../distribute/region";
import { halfStep, snapInterval } from "../box/boxGeometry";
import type { ToolEnv } from "../tool/toolKind";
import type { Slot, XY } from "../types";

/**
 * A circle as the circle tool draws it (#389, spec #385): a closed region with no corners. Its
 * size follows the count: in Outline its marchers stand `interval` apart (the chord between
 * neighbors), in Spread the closest pair does, so the radius is worked out from the interval and
 * the count, never stored. The first marcher
 * stands front-center; turning the circle turns where it stands, flipping it across runs the
 * marchers the other way round. Everything here is pure.
 */
export interface CircleParams {
    readonly center: XY;
    /** Field units between neighbors, straight across (the chord) */
    readonly interval: number;
    readonly rotation: number;
    readonly flipX?: boolean;
    readonly flipY?: boolean;
    readonly distribution?: Distribution;
}

/** The ways a circle can be filled; Files waits for #394 */
export const CIRCLE_MODES: readonly DistributionMode[] = ["outline", "spread"];

/** The shape a spread fills: its size comes from the count and the interval */
const UNIT_CIRCLE = circleRegion(1);

/** How a new circle is filled */
const OUTLINE: Distribution = { mode: "outline", oddGap: DEFAULT_ODD_GAP };

/**
 * How the circle is filled: its stored distribution when it's one of the circle's modes, else
 * Outline (a circle never fills as Files)
 */
export function circleDistribution(p: CircleParams): Distribution {
    const d = storedDistribution(p, 1);
    return d && CIRCLE_MODES.includes(d.mode) ? d : OUTLINE;
}

/**
 * The radius that puts `n` marchers `interval` apart around a circle: the chord between
 * neighbors is the interval, r = i / (2 sin(π/n)). One marcher stands on the center.
 */
export function radiusFor(interval: number, n: number): number {
    if (n <= 1) return 0;
    return interval / (2 * Math.sin(Math.PI / n));
}

/** The interval that puts `n` marchers around a circle of radius `r` */
export const intervalFor = (r: number, n: number): number =>
    n <= 1 ? 2 * r : 2 * r * Math.sin(Math.PI / n);

/** The circle's radius: through its marchers in Outline, its edge in Spread */
export function radiusOf(p: CircleParams, n: number): number {
    const d = circleDistribution(p);
    return d.mode === "spread"
        ? spreadScale(UNIT_CIRCLE, n, d, p.interval)
        : radiusFor(p.interval, Math.max(1, n));
}

/** The interval that gives `p`'s circle (in its mode) a radius of `r` */
function intervalAt(p: CircleParams, r: number, n: number): number {
    const d = circleDistribution(p);
    return d.mode === "spread"
        ? r / spreadScale(UNIT_CIRCLE, n, d, 1)
        : intervalFor(r, Math.max(1, n));
}

/**
 * `after` (the circle in another mode) at the radius `before` has (#439): Spread fills the circle
 * drawn, and Outline goes round it, the interval whatever that takes. A circle with no radius
 * (one marcher) keeps its interval.
 */
export function keepingRadius(
    before: CircleParams,
    after: CircleParams,
    n: number,
): CircleParams {
    const r = radiusOf(before, n);
    if (!(r > 0)) return after;
    return { ...after, interval: intervalAt(after, r, n) };
}

/** The circle's frame: its center, the radius both ways, its turn and flip */
export function circleFrame(p: CircleParams, n: number): ShapeFrame {
    const r = radiusOf(p, n);
    return {
        center: p.center,
        halfWidth: r,
        halfDepth: r,
        rotation: p.rotation,
        flipX: p.flipX === true,
        flipY: p.flipY === true,
    };
}

export const circleRegionOf = (p: CircleParams, n: number): Region =>
    circleRegion(radiusOf(p, n));

/** The circle's spots in its own axes, from the distributor */
const localSpots = (p: CircleParams, n: number): FrameSpot[] =>
    distribute({
        region:
            circleDistribution(p).mode === "spread"
                ? UNIT_CIRCLE
                : circleRegionOf(p, n),
        n,
        distribution: circleDistribution(p),
        across: p.interval,
        deep: p.interval,
    });

/** A point in the circle's own axes, flipped, then turned and placed */
function toField(p: CircleParams, n: number, local: XY): XY {
    return frameToField(circleFrame(p, n), {
        x: p.flipX ? -local.x : local.x,
        y: p.flipY ? -local.y : local.y,
    });
}

export function circleSpots(p: CircleParams, n: number): Slot[] {
    if (n <= 0) return [];
    return localSpots(p, n).map((s) => ({
        ...toField(p, n, s),
        row: s.row,
        col: s.col,
    }));
}

/** How many sides the outline's polygon has: smooth at any size the field shows */
const OUTLINE_SIDES = 64;

/** The circle through its marchers on the field, as a closed polygon starting at the back */
export function circleOutline(p: CircleParams, n: number): XY[] {
    const frame = circleFrame(p, n);
    const r = frame.halfWidth;
    if (r <= 0) return [p.center];
    return Array.from({ length: OUTLINE_SIDES }, (_, i) => {
        const a = -Math.PI / 2 + (2 * Math.PI * i) / OUTLINE_SIDES;
        return frameToField(frame, { x: r * Math.cos(a), y: r * Math.sin(a) });
    });
}

/** The radius handle's place in the circle's own axes: on the rim, to the right */
const HANDLE_LOCAL = (r: number): XY => ({ x: r, y: 0 });

export const RADIUS_HANDLE = "radius";

export function radiusHandlePoint(p: CircleParams, n: number): XY {
    const frame = circleFrame(p, n);
    return frameToField(frame, HANDLE_LOCAL(frame.halfWidth));
}

/** The circle with its center on the half-step grid, unless snapping is off (`fine` or the Snap toggle) */
const snapped = (p: CircleParams, env: ToolEnv): CircleParams =>
    env.snap ? { ...p, center: env.gridSnap(p.center) } : p;

/**
 * `after`, `before` with a new interval, moved so the pivot stays where it was (the center by
 * default, which stays put)
 */
export function grownFromPivot(
    before: CircleParams,
    after: CircleParams,
    n: number,
    env: ToolEnv,
): CircleParams {
    const key = env.pivot ?? pivotOf(before);
    const was = pivotPoint(circleFrame(before, n), key);
    const now = pivotPoint(circleFrame(after, n), key);
    return {
        ...after,
        center: {
            x: after.center.x + was.x - now.x,
            y: after.center.y + was.y - now.y,
        },
    };
}

/**
 * The circle with `interval` field units between neighbors, in half steps (or kept as `typed`,
 * #423), grown from the pivot
 */
export function withInterval(
    p: CircleParams,
    n: number,
    interval: number,
    env: ToolEnv,
    typed = false,
): CircleParams {
    const next = snapInterval(interval, env, typed);
    if (next === p.interval) return p;
    return grownFromPivot(p, { ...p, interval: next }, n, env);
}

/**
 * The circle a drag from `from` (its center) to `to` (its rim) draws for `n` marchers: the
 * interval that puts them around that radius, in half steps (hundredths with fine), so the rim lands
 * near the cursor. Undefined for a drag too short to be a circle.
 */
export function drawCircle(
    from: XY,
    to: XY,
    n: number,
    env: ToolEnv,
): CircleParams | undefined {
    const r = Math.hypot(to.x - from.x, to.y - from.y);
    if (r < halfStep(env)) return undefined;
    return snapped(
        {
            center: from,
            interval: snapInterval(intervalFor(r, Math.max(1, n)), env),
            rotation: 0,
            distribution: OUTLINE,
        },
        env,
    );
}

/** The radius handle dragged to `to`: the interval that puts the rim there, the center kept */
export function dragRadius(
    base: CircleParams,
    n: number,
    to: XY,
    env: ToolEnv,
): CircleParams {
    const r = Math.hypot(to.x - base.center.x, to.y - base.center.y);
    const interval = snapInterval(intervalAt(base, r, n), env);
    return interval === base.interval ? base : { ...base, interval };
}

/**
 * A circle filling `frame`, as if drawn over it: centered on it, its rim as near the frame's
 * edges as half-step intervals allow, turned and flipped like the frame. A long, thin frame
 * (a line) gives the circle through its ends.
 */
export function circleInFrame(
    frame: ShapeFrame,
    n: number,
    env: ToolEnv,
): CircleParams {
    const { halfWidth: w, halfDepth: d } = frame;
    const r = Math.min(w, d) > 0 ? (w + d) / 2 : Math.max(w, d, env.stepPx);
    return {
        center: frame.center,
        interval: snapInterval(intervalFor(r, Math.max(1, n)), env),
        rotation: frame.rotation,
        distribution: OUTLINE,
        ...(frame.flipX ? { flipX: true } : {}),
        ...(frame.flipY ? { flipY: true } : {}),
    };
}

/** The circle with `frame`'s center, turn and flip; its size is its own */
export function withCircleFrame(
    p: CircleParams,
    frame: ShapeFrame,
): CircleParams {
    return {
        ...p,
        center: frame.center,
        rotation: frame.rotation,
        // Absent rather than false, so a circle that was never flipped stores without them
        flipX: frame.flipX ? true : undefined,
        flipY: frame.flipY ? true : undefined,
    };
}

/**
 * The circle moved by `delta`, its center back on the half-step grid (a circle has no corner
 * marcher to snap, and its rim is rarely on the grid). A turn, flip or scale around a pivot off
 * the center leaves the center where it lands, so the pivot stays put.
 */
export const moveCircle = (
    base: CircleParams,
    delta: XY,
    env: ToolEnv,
): CircleParams =>
    snapped(
        {
            ...base,
            center: { x: base.center.x + delta.x, y: base.center.y + delta.y },
        },
        env,
    );

/**
 * Whether `at` grabs the circle to move it: inside its rim or within half an interval of it, so
 * a small circle can be grabbed too
 */
export function insideCircle(p: CircleParams, n: number, at: XY): boolean {
    const local = fieldToFrame(circleFrame(p, n), at);
    return Math.hypot(local.x, local.y) <= radiusOf(p, n) + p.interval / 2;
}
