import type { ToolEnv } from "../tool/toolKind";
import type { XY } from "../types";
import type { Distribution, DistributionMode } from "./distribution";
import type { LayoutRow, ResolvedLayout } from "./layouts";

/**
 * A closed kind's region (spec #385), in the kind's own frame: x across, y deep (back to front),
 * from the frame's center, before any turn or flip. The distributor reads its shape and
 * proportions; every mode spaces the spots by interval, so the size follows the count rather than
 * the region (the region's size is the shape as it stands now).
 */
export interface Region {
    /** Whether a frame point is inside or on the edge */
    contains(p: XY): boolean;
    /**
     * How far a frame point is inside the edge (negative outside). Worked out with + − × ÷ and
     * `Math.sqrt` only, so a seeded layout that reads it is the same in every engine.
     */
    edgeDistance(p: XY): number;
    readonly area: number;
    /** How far it is round the edge */
    readonly perimeter: number;
    /** The region's shape and size, the same for the same region: what a layout is cached by */
    readonly key: string;
    readonly bounds: {
        readonly left: number;
        readonly top: number;
        readonly right: number;
        readonly bottom: number;
    };
    /** The edge as a closed polygon (the first point not repeated), back-left first, clockwise */
    readonly outline: readonly XY[];
    /** Which outline points are corners: Outline puts a spot on each (#390). None for a circle */
    readonly corners: readonly number[];
}

/** What a closed kind declares so the host can fill it (spec #385, story 38) */
export interface ClosedShape<P> {
    /**
     * For a kind closed only sometimes (a Line, #529): whether this shape is closed now. Read
     * through `closedOf` (`modes.ts`); always closed when absent.
     */
    when?(params: P, n: number): boolean;
    /** The modes it can be filled in, in the mode switch's order; the switch hides with one */
    readonly modes: readonly DistributionMode[];
    /** Its region as it stands, for `n` spots */
    region(params: P, n: number): Region;
    /**
     * How it is filled now: `params.distribution`, read with the kind's defaults (no
     * distribution reads as Files)
     */
    distribution(params: P, n: number): Distribution;
    /**
     * Its intervals side to side and front to back, in field units, as the distributor spaces
     * it. The host reads them to find an outline's spots between corners, so the gap can be
     * picked on the field (#390); a kind without corners can leave it out.
     */
    intervals?(params: P): { readonly across: number; readonly deep: number };
    /** The distribution switching to `mode` starts with (a box's Files keeps its file count) */
    startMode(params: P, n: number, mode: DistributionMode): Distribution;
    /**
     * The shape evened out in the frame it has now: the params, the same ones when it's as even
     * as it gets, or undefined where it doesn't apply (owner on #459: an outline's "Even out")
     */
    evenOut?(params: P, n: number, env: ToolEnv): P | undefined;
    /**
     * The params filled in `distribution`, stored in `params.distribution`. The kind keeps its
     * own numbers in step (a box's file count) and grows from the host's pivot.
     */
    withDistribution(
        params: P,
        n: number,
        distribution: Distribution,
        env: ToolEnv,
    ): P;
    /**
     * A kind whose Files mode offers the layout picker (#387, the box): the catalogue for a
     * count, and the layout the shape is laid out in now. Absent for kinds without layouts.
     */
    readonly layouts?: {
        catalogue(n: number): readonly LayoutRow[];
        /** The layout as laid out for `n`; null outside Files */
        resolved(params: P, n: number): ResolvedLayout | null;
    };
}

/** A rectangle `halfWidth` × `halfDepth` either side of the center, its four corners */
export function rectRegion(halfWidth: number, halfDepth: number): Region {
    const w = Math.abs(halfWidth);
    const d = Math.abs(halfDepth);
    return {
        contains: (p) => Math.abs(p.x) <= w + 1e-9 && Math.abs(p.y) <= d + 1e-9,
        edgeDistance: (p) => Math.min(w - Math.abs(p.x), d - Math.abs(p.y)),
        area: 4 * w * d,
        perimeter: 4 * (w + d),
        key: `rect ${w} ${d}`,
        bounds: { left: -w, top: -d, right: w, bottom: d },
        outline: [
            { x: -w, y: -d },
            { x: w, y: -d },
            { x: w, y: d },
            { x: -w, y: d },
        ],
        corners: [0, 1, 2, 3],
    };
}

/** How many points the circle's outline polygon has: smooth enough to draw and to test against */
const CIRCLE_SIDES = 64;

/** A circle of radius `r` around the center: no corners */
export function circleRegion(radius: number): Region {
    const r = Math.abs(radius);
    return {
        contains: (p) => Math.sqrt(p.x * p.x + p.y * p.y) <= r + 1e-9,
        edgeDistance: (p) => r - Math.sqrt(p.x * p.x + p.y * p.y),
        area: Math.PI * r * r,
        perimeter: 2 * Math.PI * r,
        key: `circle ${r}`,
        bounds: { left: -r, top: -r, right: r, bottom: r },
        // From the back, clockwise on the field (toward +x first)
        outline: Array.from({ length: CIRCLE_SIDES }, (_, i) => {
            const a = -Math.PI / 2 + (2 * Math.PI * i) / CIRCLE_SIDES;
            return { x: r * Math.cos(a), y: r * Math.sin(a) };
        }),
        corners: [],
    };
}

/**
 * Any closed polygon `outline` (frame points, not repeated at the end), with `corners` the
 * indices Outline puts a spot on: an L, a band, whatever a kind draws. The distributor's Spread
 * fills any of them.
 */
export function polygonRegion(
    outline: readonly XY[],
    corners: readonly number[] = outline.map((_, i) => i),
): Region {
    const count = outline.length;
    const edges = outline.map(
        (a, i) => [a, outline[(i + 1) % count]!] as const,
    );
    let twiceArea = 0;
    let perimeter = 0;
    for (const [a, b] of edges) {
        twiceArea += a.x * b.y - b.x * a.y;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        perimeter += Math.sqrt(dx * dx + dy * dy);
    }
    const contains = (p: XY) => {
        // Even-odd crossings of a ray toward +x
        let inside = false;
        for (const [a, b] of edges) {
            const aAbove = a.y > p.y;
            const bAbove = b.y > p.y;
            if (
                aAbove !== bAbove &&
                p.x < a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y)
            )
                inside = !inside;
        }
        return inside;
    };
    const toEdge = (p: XY) => {
        let best = Infinity;
        for (const [a, b] of edges) {
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const len = dx * dx + dy * dy;
            const t =
                len > 0
                    ? Math.max(
                          0,
                          Math.min(
                              1,
                              ((p.x - a.x) * dx + (p.y - a.y) * dy) / len,
                          ),
                      )
                    : 0;
            const ex = a.x + t * dx - p.x;
            const ey = a.y + t * dy - p.y;
            best = Math.min(best, ex * ex + ey * ey);
        }
        return Math.sqrt(best);
    };
    const xs = outline.map((p) => p.x);
    const ys = outline.map((p) => p.y);
    return {
        // On the edge counts as inside, to a hair of the outline's size, so a spot on the
        // boundary counts the same on every side whatever the float error
        contains: (p) =>
            contains(p) || toEdge(p) <= 1e-9 * Math.max(1, perimeter),
        edgeDistance: (p) => (contains(p) ? toEdge(p) : -toEdge(p)),
        area: Math.abs(twiceArea) / 2,
        perimeter,
        key: `polygon ${outline.map((p) => `${p.x},${p.y}`).join(" ")}`,
        bounds: {
            left: Math.min(...xs),
            top: Math.min(...ys),
            right: Math.max(...xs),
            bottom: Math.max(...ys),
        },
        outline,
        corners,
    };
}
