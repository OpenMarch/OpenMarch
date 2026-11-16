/**
 * Silk Cut outlines (docs/3d/props-spec.md §3 "Artwork size and templates",
 * owner decisions Q39 to Q44 of 2026-10-12): the shape of every catalog silk
 * Cut, as lines and cubic Bezier curves, so the Artwork template's shape mask, the
 * "content outside cut" check and the 3D silk all come from one outline.
 *
 * Figures come from `research/silk-cuts.md` (2026-10-12), which traced the
 * vendors' shape images at the catalog size. Outlines are in inches at the
 * catalog size; `silkCutPath` returns one in meters at any header × fly.
 *
 * Coordinates: the origin is the top of the pole edge, x runs along the fly
 * (away from the pole, which is on the left) and y runs down the header. A
 * path starts at (0, 0) and its last segment ends at (0, header); the pole
 * edge, a straight line back up to (0, 0), closes it.
 *
 * Plain TypeScript only: this module lives under `view3d/core/`, so it must
 * not import React, React Three Fiber, drei, Electron or the database.
 */
// cspell:words teardrop mccormick
import { catalogDims, type CatalogEntryOf, type DimsByKind } from "./catalog";
import { fromMeters, lengthOf, type Length } from "./units";

/** A point in the path's unit: x along the fly, y down the header. */
export type CutPoint = readonly [x: number, y: number];

export type CutSegment =
    | { readonly type: "line"; readonly to: CutPoint }
    | {
          readonly type: "cubic";
          readonly c1: CutPoint;
          readonly c2: CutPoint;
          readonly to: CutPoint;
      };

/**
 * A closed outline from (0, 0), the top of the pole edge. The last segment
 * ends at (0, header); the straight pole edge back to (0, 0) is implied,
 * unless `pole` gives it.
 */
export interface CutPath {
    readonly segments: readonly CutSegment[];
    /**
     * A pole edge with notches in it (Wings, Snake): its segments from
     * (0, header) back up toward (0, 0), the last straight run to (0, 0)
     * implied. Absent for a straight pole edge.
     */
    readonly pole?: readonly CutSegment[];
}

/**
 * The research's shape families (research/silk-cuts.md "The six families"),
 * then the owner's chart's shapes that fit none of them (fork #973).
 */
export type SilkCutFamily =
    | "curve"
    | "swing"
    | "teardrop"
    | "superSwing"
    | "hangingSwing"
    | "arc"
    | "curvedTail"
    | "rainbow"
    | "distressed"
    | "rounded"
    | "curvedAngle"
    | "wings"
    | "snake";

/** How far the traced shape can be trusted. */
export type CutConfidence = "high" | "medium" | "low";

export interface SilkCutShape {
    /** `"default"` for a Cut's own shape, else the alternative's id. */
    readonly id: string;
    readonly family: SilkCutFamily;
    /**
     * In inches at the catalog size. Absent for the curve family, whose
     * outline follows the size and the sag (`curveCutPath`).
     */
    readonly path?: CutPath;
    readonly confidence: CutConfidence;
    /**
     * The shape is read from a single vendor photo and may differ from the
     * vendor's real pattern (owner Q42); its template says so.
     */
    readonly fromVendorPhoto?: true;
    /**
     * The shape is traced from the owner's reference chart, which has no
     * sizes, so its size is an estimate; its template says so.
     */
    readonly fromShapeChart?: true;
    /** Search-only names, vendors' included; never shown (Q44). */
    readonly aliases?: readonly string[];
}

export interface SilkCut extends SilkCutShape {
    readonly catalogId: string;
    /** Other shapes sold under the same name and size; never the default. */
    readonly alternatives?: readonly SilkCutShape[];
}

// ---------------------------------------------------------------- data

const L = (x: number, y: number): CutSegment => ({ type: "line", to: [x, y] });
const C = (
    c1x: number,
    c1y: number,
    c2x: number,
    c2y: number,
    x: number,
    y: number,
): CutSegment => ({
    type: "cubic",
    c1: [c1x, c1y],
    c2: [c2x, c2y],
    to: [x, y],
});
const path = (...segments: CutSegment[]): CutPath => ({ segments });
/** A traced shape from the owner's chart (fork #973). */
const chart = (
    catalogId: string,
    family: SilkCutFamily,
    p: CutPath,
): SilkCut => ({
    catalogId,
    id: "default",
    family,
    path: p,
    confidence: "low",
    fromShapeChart: true,
});
/** Circle arcs as cubics: the control arm per unit radius. */
const KAPPA = 0.5523;

const curve = (catalogId: string): SilkCut => ({
    catalogId,
    id: "default",
    family: "curve",
    confidence: "medium",
});

/**
 * The 13 catalog Cuts, keyed by catalog id. Owner decisions: pole silks are
 * true rectangles unless given a sag (Q40); the swing has a flat bottom, with
 * the sagging variant kept as an alternative (Q41); the traced hanging shapes
 * are the starting set, the photo-only ones marked (Q42).
 */
export const SILK_CUTS: Readonly<Record<string, SilkCut>> = Object.fromEntries(
    (
        [
            curve("silk-5ft-30x46"),
            curve("silk-5.5ft-33x50"),
            curve("silk-6ft-36x54"),
            curve("silk-7ft-42x60"),
            curve("silk-standard-36x56"),
            curve("silk-oversized-42x67"),
            {
                catalogId: "silk-teardrop-44x74",
                id: "default",
                family: "teardrop",
                // The fly reaches 74 at about y = 40; the tip hangs to 79⅝
                // (traced 79.6, rounded to the catalog's ⅛ in).
                path: path(
                    C(52.7, 0, 88.8, 23.4, 68.1, 79.625),
                    C(58.5, 51.5, 29.5, 43.2, 0, 44),
                ),
                confidence: "medium",
            },
            {
                catalogId: "silk-swing-44x66",
                id: "default",
                family: "swing",
                // Flat bottom, top fly corner rounded all the way down.
                path: path(C(36.6, 0, 62.6, 0, 66, 44), L(0, 44)),
                confidence: "low",
                fromVendorPhoto: true,
                alternatives: [
                    {
                        id: "sagging-bottom",
                        family: "swing",
                        // McCormick's Shape SA, its fly scaled from 70 to
                        // 66 in and its first control point lowered to the
                        // header line, so the top starts level like the
                        // other outlines. The bottom sags to 57.5 in.
                        path: path(
                            C(38.06, 0, 75.01, 11.49, 63.96, 57.52),
                            C(46.38, 45.68, 23.81, 40.44, 0, 44),
                        ),
                        confidence: "low",
                        fromVendorPhoto: true,
                        aliases: ["Shape SA (McCormick's)"],
                    },
                ],
            },
            {
                catalogId: "silk-super-swing-44x84",
                id: "default",
                family: "superSwing",
                // A D with a flat foot below the pole end.
                path: path(
                    C(50.9, 0, 87.9, 30.1, 56.4, 84),
                    L(6.5, 84),
                    C(32, 70.7, 31.7, 43.4, 0, 44),
                ),
                confidence: "medium",
            },
            {
                catalogId: "silk-oversized-swing-56x84",
                id: "default",
                family: "hangingSwing",
                // The tip hangs 42 in below the pole end; S-curved inner edge.
                path: path(
                    C(40.5, 0, 70.8, 32.4, 48.4, 71.9),
                    C(43.8, 77, 39.5, 81, 33.3, 84),
                    C(43.9, 57.9, 27.6, 40.9, 0, 42),
                ),
                confidence: "medium",
            },
            {
                catalogId: "silk-arc-45x96",
                id: "default",
                family: "arc",
                path: path(
                    C(17.5, 0, 33.1, 5, 47.8, 12.3),
                    C(77.4, 27, 80.9, 59.3, 77.5, 96),
                    C(67.5, 64.2, 28.4, 44.5, 0, 45),
                ),
                confidence: "low",
                fromVendorPhoto: true,
            },
            {
                catalogId: "silk-narrow-arc-44x94",
                id: "default",
                family: "arc",
                path: path(
                    C(39.3, 0, 86, 10.7, 94, 56),
                    C(65.5, 45, 33.5, 42.8, 0, 44),
                ),
                confidence: "low",
                fromVendorPhoto: true,
            },
            {
                catalogId: "silk-super-arc-54x100",
                id: "default",
                family: "arc",
                path: path(
                    C(63.5, 0, 101.5, 23, 100, 87),
                    C(72.4, 51.1, 42.3, 49.7, 0, 54),
                ),
                confidence: "low",
                fromVendorPhoto: true,
            },
            // The owner's chart (fork #973), traced and sized at the chart's
            // scale. Each lowest point is a segment's end on a ⅛ in, so the
            // catalog depth is exact.
            chart(
                "silk-curved-tail-36x62",
                "curvedTail",
                // The top hooks back into a notch; the bottom sweeps out
                // to the tail's point.
                path(
                    L(8.4, 0),
                    C(33.88, 0.51, 48.27, 5.29, 56.44, 16.09),
                    C(57.16, 17.04, 57.72, 17.85, 57.68, 17.88),
                    C(57.65, 17.91, 56.74, 17.51, 55.66, 16.98),
                    C(51.45, 14.92, 46.7, 14.19, 44.35, 15.26),
                    C(41.29, 16.65, 40.01, 20.15, 41.49, 23.09),
                    C(42.27, 24.66, 46.04, 28.43, 48.71, 30.31),
                    C(56.67, 35.91, 60.08, 41.11, 61.67, 50.1),
                    C(62.06, 52.29, 62.35, 54.22, 62.31, 54.375),
                    C(62.11, 54.375, 60.14, 52.59, 57.78, 50.26),
                    C(55.07, 47.59, 52.61, 45.38, 51.54, 44.68),
                    C(42.92, 39.02, 30.53, 36.58, 8.28, 36.15),
                    L(0, 36),
                ),
            ),
            chart(
                "silk-rainbow-36x56",
                "rainbow",
                // A curved top, a straight fly edge slanting back to a
                // point, and a curved bottom.
                path(
                    L(8.35, 0),
                    C(22.95, 0, 30.63, 1.62, 40.67, 6.8),
                    C(49.01, 11.11, 53.14, 14.64, 55.67, 19.61),
                    L(56.17, 20.61),
                    L(49.79, 30.71),
                    C(46.27, 36.26, 42.31, 42.55, 40.99, 44.69),
                    C(39.67, 46.82, 38.53, 48.57, 38.46, 48.625),
                    C(38.38, 48.57, 37.77, 48.02, 37.1, 47.33),
                    C(33.82, 43.99, 25.8, 39.79, 19.17, 37.94),
                    C(15.41, 36.89, 7.76, 36, 2.55, 36),
                    L(0, 36),
                ),
            ),
            chart(
                "silk-distressed-36x56",
                "distressed",
                // The standard curve, its fly edge torn into a zigzag.
                path(
                    L(5.22, 0),
                    C(14.37, 0, 27.49, 1.41, 37.01, 3.43),
                    C(39.03, 3.86, 41.5, 4.65, 44.53, 5.86),
                    L(49.05, 7.64),
                    L(47.92, 7.82),
                    C(47.3, 7.91, 45.3, 8, 43.48, 8.01),
                    C(40.24, 8.03, 39.38, 8.24, 40.38, 8.77),
                    C(40.83, 9.02, 47.59, 10.53, 48.26, 10.54),
                    C(48.95, 10.55, 47.71, 11.03, 46.99, 11.03),
                    C(46.06, 11.04, 45.66, 11.49, 46.22, 11.9),
                    C(46.44, 12.06, 47.98, 12.51, 49.65, 12.91),
                    C(51.32, 13.31, 52.69, 13.72, 52.69, 13.81),
                    C(52.69, 13.98, 51.94, 14.08, 46.94, 14.64),
                    C(43.08, 15.06, 43.21, 15.55, 47.42, 16.55),
                    C(48.73, 16.87, 49.89, 17.2, 50, 17.3),
                    C(50.11, 17.4, 48.59, 17.62, 46.62, 17.78),
                    C(41.24, 18.23, 41.33, 18.55, 47.17, 19.72),
                    C(49.38, 20.17, 50.87, 20.57, 50.62, 20.66),
                    C(50.37, 20.75, 49.98, 20.89, 49.74, 20.97),
                    C(48.92, 21.23, 50.01, 21.71, 53.18, 22.47),
                    C(55.08, 22.93, 56.2, 23.31, 56.2, 23.51),
                    C(56.2, 23.69, 55.91, 23.83, 55.56, 23.83),
                    C(53.82, 23.83, 53.67, 24.68, 55.26, 25.5),
                    C(55.67, 25.71, 55.95, 25.92, 55.9, 25.98),
                    C(55.84, 26.03, 53.51, 25.84, 50.72, 25.56),
                    C(43.38, 24.81, 43.04, 25.21, 49.33, 27.23),
                    C(51.32, 27.86, 52.94, 28.45, 52.94, 28.52),
                    C(52.94, 28.6, 52.22, 28.59, 51.34, 28.5),
                    C(50.11, 28.38, 49.67, 28.42, 49.45, 28.7),
                    C(49.2, 29, 49.75, 29.35, 52.74, 30.83),
                    L(56.32, 32.61),
                    L(53.06, 32.55),
                    C(48.94, 32.47, 48.66, 32.85, 52, 33.99),
                    C(53.2, 34.4, 54.19, 34.82, 54.19, 34.92),
                    C(54.19, 35.02, 52.95, 35.14, 51.43, 35.18),
                    C(49.89, 35.22, 48.66, 35.36, 48.65, 35.49),
                    C(48.63, 35.62, 50.16, 36.42, 52.03, 37.26),
                    C(53.9, 38.1, 55.52, 38.87, 55.62, 38.97),
                    C(55.72, 39.07, 53.88, 39.12, 51.55, 39.08),
                    C(48.87, 39.04, 47.26, 39.1, 47.2, 39.26),
                    C(47.16, 39.4, 49.1, 40.19, 51.53, 41.02),
                    C(53.96, 41.85, 55.95, 42.58, 55.94, 42.65),
                    C(55.94, 42.72, 55.64, 42.92, 55.26, 43.09),
                    C(54.68, 43.36, 54.35, 43.33, 52.99, 42.87),
                    C(51.17, 42.27, 50.48, 42.48, 51.3, 43.4),
                    C(51.57, 43.69, 51.66, 43.875, 51.52, 43.875),
                    C(51.33, 43.875, 50.79, 43.62, 49.76, 43.14),
                    C(41.01, 39.05, 25.95, 36.5, 8.66, 36.16),
                    L(0, 36),
                ),
            ),
            chart(
                "silk-rounded-36x54",
                "rounded",
                // A rounded fly end with a soft notch in it, its bottom
                // bellying down.
                path(
                    L(6.05, 0),
                    C(10.86, 0, 27.2, 1.33, 32.73, 2.67),
                    C(40.49, 4.55, 47.78, 8.4, 49.35, 11.45),
                    C(50.16, 13.03, 49.75, 15.42, 48.48, 16.56),
                    C(48.24, 16.77, 47.27, 17.32, 46.31, 17.78),
                    C(42.69, 19.54, 42.63, 20.26, 45.83, 23.85),
                    C(50.17, 28.72, 52.37, 32.83, 53.74, 38.62),
                    C(54.58, 42.15, 54.25, 44.92, 52.86, 46.16),
                    C(52.45, 46.52, 51.96, 46.75, 51.24, 46.75),
                    C(49.59, 46.75, 46.73, 45.66, 40.95, 43.09),
                    C(36.63, 41.18, 34.35, 40.4, 29.19, 39.09),
                    C(20.55, 36.9, 16.19, 36.32, 6.92, 36.14),
                    L(0, 36),
                ),
            ),
            chart(
                "silk-oversized-curved-angle-34x88",
                "curvedAngle",
                // A D-shaped top swinging down to a point far below the
                // pole, the inner edge a straight line back to the pole.
                path(
                    L(14.21, 0),
                    C(29.37, 0, 29.42, 0, 33.4, 1.28),
                    C(47.03, 5.65, 55.35, 21.29, 53.69, 39.44),
                    C(51.98, 58.1, 42.15, 74.44, 25.55, 86.26),
                    C(24.56, 86.96, 23.71, 87.5, 23.66, 87.5),
                    C(23.61, 87.5, 23.27, 86.84, 22.89, 85.99),
                    C(21.37, 82.53, 20.45, 80.43, 17.62, 73.93),
                    C(13.66, 64.85, 9.38, 55.01, 6.44, 48.22),
                    C(5.11, 45.16, 3.16, 40.71, 2.09, 38.33),
                    L(0, 34),
                ),
            ),
            chart(
                "silk-wings-72x36",
                "wings",
                // A half circle on its straight edge, which has two sleeve
                // notches and a round neck notch in its middle.
                {
                    segments: [
                        C(36 * KAPPA, 0, 36, 36 - 36 * KAPPA, 36, 36),
                        C(36, 36 + 36 * KAPPA, 36 * KAPPA, 72, 0, 72),
                    ],
                    pole: [
                        L(0, 61),
                        L(2.5, 61),
                        L(2.5, 55.5),
                        L(0, 55.5),
                        L(0, 44.5),
                        C(8.5 * KAPPA, 44.5, 8.5, 36 + 8.5 * KAPPA, 8.5, 36),
                        C(8.5, 36 - 8.5 * KAPPA, 8.5 * KAPPA, 27.5, 0, 27.5),
                        L(0, 16.5),
                        L(2.5, 16.5),
                        L(2.5, 11),
                        L(0, 11),
                    ],
                },
            ),
            chart(
                "silk-snake-36x117",
                "snake",
                // A long rectangle with a notch in its pole edge.
                {
                    segments: [L(116.75, 0), L(116.75, 36), L(0, 36)],
                    pole: [L(0, 23.5), L(4, 23.5), L(4, 12.25), L(0, 12.25)],
                },
            ),
        ] satisfies SilkCut[]
    ).map((cut) => [cut.catalogId, cut]),
);

/** Shown on the template of a Cut whose shape is read from a vendor photo (Q42). */
export const CUT_FROM_VENDOR_PHOTO_NOTE =
    "Shape from vendor photo: confirm the cut with your flag maker before printing.";

/** Shown on the template of a Cut traced from the owner's chart, which has no sizes. */
export const CUT_FROM_SHAPE_CHART_NOTE =
    "Shape traced from a reference chart and its size estimated: confirm the cut and size with your flag maker before printing.";

/** The research's suggested sag for curve-family Cuts: a quarter of the header (Q40). */
export const RECOMMENDED_SAG_FRACTION = 0.25;

/**
 * The recommended sag preset for a header: a quarter of it (9 in on a 36 in
 * header). A preset value only; the default sag is 0.
 */
export function recommendedSilkSag(header: Length): Length {
    return header.typed !== undefined
        ? lengthOf(fromMeters(header.m, "in") * RECOMMENDED_SAG_FRACTION, "in")
        : { m: header.m * RECOMMENDED_SAG_FRACTION };
}

export function silkCut(catalogId: string): SilkCut | undefined {
    return SILK_CUTS[catalogId];
}

/** A Cut's shape: its default, or the named alternative. */
export function silkCutShape(
    catalogId: string,
    variant = "default",
): SilkCutShape | undefined {
    const cut = SILK_CUTS[catalogId];
    if (!cut) return undefined;
    if (variant === "default") return cut;
    return cut.alternatives?.find((a) => a.id === variant);
}

// ---------------------------------------------------------------- paths

/**
 * The curve family's outline (research/silk-cuts.md "Curve"): top edge the
 * parabola y = sag·(x / fly)², bottom edge the same shifted down by the
 * header, fly edge vertical. A sag of 0 gives the true rectangle.
 */
export function curveCutPath(header: number, fly: number, sag = 0): CutPath {
    if (!(sag > 0)) return path(L(fly, 0), L(fly, header), L(0, header));
    return path(
        C(fly / 3, 0, (2 * fly) / 3, sag / 3, fly, sag),
        L(fly, header + sag),
        C((2 * fly) / 3, header + sag / 3, fly / 3, header, 0, header),
    );
}

export function scaleCutPath(p: CutPath, sx: number, sy: number): CutPath {
    const s = ([x, y]: CutPoint): CutPoint => [x * sx, y * sy];
    const scale = (segments: readonly CutSegment[]): CutSegment[] =>
        segments.map((seg) =>
            seg.type === "line"
                ? { type: "line", to: s(seg.to) }
                : {
                      type: "cubic",
                      c1: s(seg.c1),
                      c2: s(seg.c2),
                      to: s(seg.to),
                  },
        );
    return {
        segments: scale(p.segments),
        ...(p.pole ? { pole: scale(p.pole) } : {}),
    };
}

/** Where a cubic's coordinate has its extremes, for t in (0, 1). */
function cubicExtremaT(a: number, b: number, c: number, d: number): number[] {
    // derivative / 3: (b - a)(1-t)² + 2(c - b)t(1-t) + (d - c)t²
    const p = b - a;
    const q = c - b;
    const r = d - c;
    const A = p - 2 * q + r;
    const B = 2 * (q - p);
    const Cq = p;
    const roots: number[] = [];
    if (Math.abs(A) < 1e-12) {
        if (Math.abs(B) > 1e-12) roots.push(-Cq / B);
    } else {
        const disc = B * B - 4 * A * Cq;
        if (disc >= 0) {
            const sq = Math.sqrt(disc);
            roots.push((-B + sq) / (2 * A), (-B - sq) / (2 * A));
        }
    }
    return roots.filter((t) => t > 0 && t < 1);
}

function cubicAt(
    a: CutPoint,
    b: CutPoint,
    c: CutPoint,
    d: CutPoint,
    t: number,
): CutPoint {
    const u = 1 - t;
    const w0 = u * u * u;
    const w1 = 3 * u * u * t;
    const w2 = 3 * u * t * t;
    const w3 = t * t * t;
    return [
        w0 * a[0] + w1 * b[0] + w2 * c[0] + w3 * d[0],
        w0 * a[1] + w1 * b[1] + w2 * c[1] + w3 * d[1],
    ];
}

export interface CutBounds {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
}

/** The exact bounding box of a path, curves included. */
export function cutPathBounds(p: CutPath): CutBounds {
    let minX = 0;
    let minY = 0;
    let maxX = 0;
    let maxY = 0;
    const add = ([x, y]: CutPoint) => {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    };
    let at: CutPoint = [0, 0];
    for (const seg of [...p.segments, ...(p.pole ?? [])]) {
        add(seg.to);
        if (seg.type === "cubic") {
            const ts = [
                ...cubicExtremaT(at[0], seg.c1[0], seg.c2[0], seg.to[0]),
                ...cubicExtremaT(at[1], seg.c1[1], seg.c2[1], seg.to[1]),
            ];
            for (const t of ts) add(cubicAt(at, seg.c1, seg.c2, seg.to, t));
        }
        at = seg.to;
    }
    return { minX, minY, maxX, maxY };
}

/** The header a path closes on: the y where its last segment meets the pole. */
export function cutPathHeader(p: CutPath): number {
    return p.segments[p.segments.length - 1].to[1];
}

/**
 * A path flattened to a polygon: (0, 0) first, then (0, header), then any
 * notched pole edge's points; not closed (the pole edge's last straight run
 * closes it). Each cubic becomes `samplesPerCurve` chords.
 */
export function sampleCutPath(p: CutPath, samplesPerCurve = 48): CutPoint[] {
    const out: CutPoint[] = [[0, 0]];
    let at: CutPoint = [0, 0];
    for (const seg of [...p.segments, ...(p.pole ?? [])]) {
        if (seg.type === "cubic")
            for (let i = 1; i < samplesPerCurve; i++)
                out.push(
                    cubicAt(at, seg.c1, seg.c2, seg.to, i / samplesPerCurve),
                );
        out.push(seg.to);
        at = seg.to;
    }
    return out;
}

/** A path as SVG path data, closed by the pole edge. */
export function cutPathData(p: CutPath, digits = 4): string {
    const n = (v: number) => String(Number(v.toFixed(digits)));
    const pt = ([x, y]: CutPoint) => `${n(x)} ${n(y)}`;
    return [
        "M 0 0",
        ...[...p.segments, ...(p.pole ?? [])].map((seg) =>
            seg.type === "line"
                ? `L ${pt(seg.to)}`
                : `C ${pt(seg.c1)} ${pt(seg.c2)} ${pt(seg.to)}`,
        ),
        "Z",
    ].join(" ");
}

export interface SilkCutOptions {
    /** A curve-family Cut's sag; defaults to the dims' `sag`, else 0 (Q40). */
    readonly sag?: Length;
    /** An alternative shape's id (`SilkCut.alternatives`). */
    readonly variant?: string;
}

/**
 * A Cut's outline in meters at a silk size. A traced shape is stretched to
 * the size's fly (its widest point lands exactly on the fly) and scaled with
 * the header, so its depth follows; at the catalog size it lands on the
 * catalog depth. A curve-family Cut is drawn from the size and sag.
 */
export function silkCutPath(
    catalogId: string,
    dims: DimsByKind<Length>["silk"],
    options: SilkCutOptions = {},
): CutPath {
    const shape = silkCutShape(catalogId, options.variant);
    if (!shape)
        throw new Error(
            `${catalogId}: no silk Cut${options.variant ? ` "${options.variant}"` : ""}`,
        );
    if (!shape.path) {
        const sag = options.sag ?? dims.sag;
        return curveCutPath(dims.header.m, dims.fly.m, sag?.m ?? 0);
    }
    const traced = shape.path;
    const sx = dims.fly.m / cutPathBounds(traced).maxX;
    const sy = dims.header.m / cutPathHeader(traced);
    return scaleCutPath(traced, sx, sy);
}

/** A catalog Cut's outline in meters at its catalog size. */
export function catalogSilkCutPath(
    entry: CatalogEntryOf<"silk">,
    options: SilkCutOptions = {},
): CutPath {
    return silkCutPath(entry.id, catalogDims(entry), options);
}
