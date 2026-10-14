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
 * ends at (0, header); the straight pole edge back to (0, 0) is implied.
 */
export interface CutPath {
    readonly segments: readonly CutSegment[];
}

/** The research's shape families (research/silk-cuts.md "The six families"). */
export type SilkCutFamily =
    | "curve"
    | "swing"
    | "teardrop"
    | "superSwing"
    | "hangingSwing"
    | "arc";

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
        ] satisfies SilkCut[]
    ).map((cut) => [cut.catalogId, cut]),
);

/** Shown on the template of a Cut whose shape is read from a vendor photo (Q42). */
export const CUT_FROM_VENDOR_PHOTO_NOTE =
    "Shape from vendor photo: confirm the cut with your flag maker before printing.";

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
    return {
        segments: p.segments.map((seg) =>
            seg.type === "line"
                ? { type: "line", to: s(seg.to) }
                : {
                      type: "cubic",
                      c1: s(seg.c1),
                      c2: s(seg.c2),
                      to: s(seg.to),
                  },
        ),
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
    for (const seg of p.segments) {
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
 * A path flattened to a polygon: (0, 0) first, (0, header) last, not closed
 * (the pole edge closes it). Each cubic becomes `samplesPerCurve` chords.
 */
export function sampleCutPath(p: CutPath, samplesPerCurve = 48): CutPoint[] {
    const out: CutPoint[] = [[0, 0]];
    let at: CutPoint = [0, 0];
    for (const seg of p.segments) {
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
        ...p.segments.map((seg) =>
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
