import { type Color, type Vector3Tuple } from "three";
import { SIGN_RIBBON } from "../../environment";
import type { SeatRow } from "../../types";
import {
    samplesBetween,
    sections as splitSections,
    type Horseshoe,
    type Section,
    type SegmentKind,
} from "./horseshoe";
import { MeshBuilder, type P3 } from "./meshBuilder";

/**
 * Seating tiers that follow the horseshoe path (college kit). One tier is a
 * stack of rows over a path range; each row is a riser and a tread, with a
 * strip of seat backs per section, and the aisles between sections are left
 * bare. Seat rows are emitted per section, so the crowd's own aisle gaps
 * never land in the middle of a painted section (sections are narrower than
 * the crowd's 18-person run).
 */

export interface VomitorySpec {
    /** First row cut out for the portal. */
    row: number;
    /** Rows cut out. */
    rows: number;
    /** Portal width, meters. */
    width: number;
    /** A portal in every `every`-th section of the listed segments. */
    every: number;
    segments: SegmentKind[];
}

export interface CollegeTier {
    id: string;
    /** Path range the tier covers. */
    from: number;
    to: number;
    /** Outward offset of the tier's front edge. */
    offset: number;
    rows: number;
    depth: number;
    rise: number;
    /** Tread height of the first row. */
    base: number;
    /** Height of the front edge's foot (0 = the floor). */
    bottom: number;
    side: SeatRow["side"];
    /** What the front riser is: the signage ribbon or plain concrete. */
    front: "ribbon" | "riser";
    /** Parapet above the last tread. Default 1.2 m. */
    rim?: number;
    /** How far a raised tier's soffit drops toward the back. Default 1.8 m. */
    soffitDrop?: number;
    vomitories?: VomitorySpec;
}

export interface BuiltTier extends CollegeTier {
    /** Offset of the back edge. */
    back: number;
    /** Tread height of the last row. */
    top: number;
    sections: Section[];
    /** Tread height of row `i`. */
    rowHeight(i: number): number;
    /** Offset of row `i`'s front edge. */
    rowOffset(i: number): number;
}

/** Where the different surfaces of the seating go (one draw call each). */
export interface SeatingBuckets {
    /** Risers, treads, aisles and portals: concrete with vertex colors. */
    seating: MeshBuilder;
    /** Seat-back strips; `u` in seat widths. */
    seatBacks: MeshBuilder;
    /** Field wall and fascias, on the shared signage ribbon. */
    ribbon: MeshBuilder;
    /** Soffits, end caps and rear parapets; meters / `PANEL_TILE`. */
    structure: MeshBuilder;
}

export const PANEL_TILE = 12;
/** One seat (and its texture repeat) along a row. */
export const SEAT_PITCH = 0.55;
/** Seated eye or crowd seat height above the tread. */
export const SEAT_HEIGHT = 0.41;
/** Seat-back strip: from the tread to this height, leaning back. */
const BACK_HEIGHT = 0.82;

export interface TierStyle {
    /** Seat color for a section and row. */
    seatColor(section: Section, row: number): Color;
    tread: Color;
    aisle: Color;
    portal: Color;
    /** False leaves the seat backs out (the low path). */
    seatBacks?: boolean;
    /** Path length where a ribbon ad lands: the 50 yard line. */
    ribbonCenter: number;
    /**
     * Seats held back from the crowd (the band block). Their rows go to
     * `reserved` instead of `seatRows`.
     */
    reserve?(section: Section, row: number): boolean;
    /** Crowd side for a section; defaults to the tier's `side`. */
    side?(section: Section): SeatRow["side"];
}

export interface TierOutput {
    tier: BuiltTier;
    seatRows: SeatRow[];
    reserved: SeatRow[];
}

/** A tier's seating sections (corner widths measured at mid-tier). */
export function tierSections(hs: Horseshoe, spec: CollegeTier): Section[] {
    return splitSections(hs, spec.from, spec.to, {
        refOffset: spec.offset + (spec.rows * spec.depth) / 2,
    });
}

export function buildTier(
    hs: Horseshoe,
    spec: CollegeTier,
    buckets: SeatingBuckets,
    style: TierStyle,
): TierOutput {
    const rim = spec.rim ?? 1.2;
    const drop = spec.soffitDrop ?? 1.8;
    const back = spec.offset + spec.rows * spec.depth;
    const top = spec.base + (spec.rows - 1) * spec.rise;
    const rowHeight = (i: number) => spec.base + i * spec.rise;
    const rowOffset = (i: number) => spec.offset + i * spec.depth;
    const secs = tierSections(hs, spec);
    const tier: BuiltTier = {
        ...spec,
        back,
        top,
        sections: secs,
        rowHeight,
        rowOffset,
    };
    const P = (s: number, d: number, y: number): P3 => {
        const [x, z] = hs.point(s, d);
        return [x, y, z];
    };

    // Portals: per section, the s range cut out and the rows it spans.
    const portals = new Map<number, [number, number]>();
    const v = spec.vomitories;
    if (v) {
        let k = 0;
        for (const sec of secs) {
            if (!v.segments.includes(sec.segment)) continue;
            if (k++ % v.every !== Math.floor(v.every / 2)) continue;
            const mid = (sec.a + sec.b) / 2;
            const half = Math.min(v.width / 2, (sec.b - sec.a) / 3);
            portals.set(sec.index, [mid - half, mid + half]);
        }
    }
    const inPortalRows = (i: number) => !!v && i >= v.row && i < v.row + v.rows;
    const portalAt = (s: number): boolean => {
        for (const [a, b] of portals.values()) if (s > a && s < b) return true;
        return false;
    };
    const sectionAt = (s: number) => secs.find((x) => s > x.a && s < x.b);

    const edges = secs.flatMap((x) => [x.a, x.b]);
    const portalEdges = [...portals.values()].flat();
    const seatRows: SeatRow[] = [];
    const reserved: SeatRow[] = [];

    for (let i = 0; i < spec.rows; i++) {
        const o = rowOffset(i);
        const h = rowHeight(i);
        const prevH = i === 0 ? spec.bottom : h - spec.rise;
        const cutRow = inPortalRows(i);
        const samples = samplesBetween(
            hs,
            spec.from,
            spec.to,
            cutRow ? [...edges, ...portalEdges] : edges,
        );
        const colorAt = (k: number) => {
            const mid = (samples[k] + samples[k + 1]) / 2;
            if (cutRow && portalAt(mid)) return style.portal;
            return sectionAt(mid) ? style.tread : style.aisle;
        };
        const riserA = samples.map((s) => P(s, o, prevH));
        const riserB = samples.map((s) => P(s, o, h));
        if (i === 0 && spec.front === "ribbon") {
            // The ribbon's first ad, the OpenMarch logo, lands on the 50.
            const tile = (h - prevH) * SIGN_RIBBON.tileHeights;
            buckets.ribbon.strip(riserA, riserB, {
                tile,
                u0:
                    -SIGN_RIBBON.firstAd * tile -
                    (style.ribbonCenter - spec.from),
                vA: 0,
                vB: 1,
                flipU: true,
            });
        } else {
            buckets.seating.strip(riserA, riserB, {
                tile: 4,
                vA: prevH / 4,
                vB: h / 4,
                color: colorAt,
            });
        }
        buckets.seating.strip(
            samples.map((s) => P(s, o, h)),
            samples.map((s) => P(s, o + spec.depth, h)),
            { tile: 4, vA: 0, vB: spec.depth / 4, color: colorAt },
        );

        for (const sec of secs) {
            const cut = cutRow ? portals.get(sec.index) : undefined;
            const pieces: [number, number][] = cut
                ? [
                      [sec.a, cut[0] - 0.25],
                      [cut[1] + 0.25, sec.b],
                  ]
                : [[sec.a, sec.b]];
            const keep = style.reserve?.(sec, i) ?? false;
            const color = style.seatColor(sec, i);
            for (const [a, b] of pieces) {
                if (b - a < SEAT_PITCH) continue;
                const ss = samplesBetween(hs, a, b);
                if (style.seatBacks !== false) {
                    buckets.seatBacks.strip(
                        ss.map((s) => P(s, o + spec.depth * 0.62, h + 0.02)),
                        ss.map((s) =>
                            P(s, o + spec.depth * 0.76, h + BACK_HEIGHT),
                        ),
                        { tile: SEAT_PITCH, color: () => color },
                    );
                }
                const row: SeatRow = {
                    points: ss.map(
                        (s): Vector3Tuple =>
                            P(s, o + spec.depth * 0.45, h + SEAT_HEIGHT),
                    ),
                    closed: false,
                    depth: spec.depth,
                    side: style.side?.(sec) ?? spec.side,
                };
                (keep ? reserved : seatRows).push(row);
            }
        }
    }

    // Portal side walls and the lip across the front of each opening.
    if (v) {
        const floor = rowHeight(v.row - 1);
        const d0 = rowOffset(v.row);
        const d1 = rowOffset(v.row + v.rows);
        const lipTop = floor + 1.0;
        const roofTop = rowHeight(v.row + v.rows - 1) + 1.0;
        for (const [a, b] of portals.values()) {
            for (const s of [a, b]) {
                buckets.seating.polygon(
                    [
                        [d0, floor],
                        [d1, floor],
                        [d1, roofTop],
                        [d0, lipTop],
                    ],
                    ([d, y]) => P(s, d, y),
                    4,
                    style.tread,
                );
            }
            const ss = samplesBetween(hs, a, b);
            buckets.seating.strip(
                ss.map((s) => P(s, d0, floor)),
                ss.map((s) => P(s, d0, lipTop)),
                { tile: 4, color: () => style.tread },
            );
        }
    }

    // The rear parapet (the outside walls are `exterior.ts`), soffit and caps.
    const all = samplesBetween(hs, spec.from, spec.to);
    const backFoot = spec.bottom > 0 ? spec.bottom - drop : top - 1;
    buckets.structure.strip(
        all.map((s) => P(s, back, top + rim)),
        all.map((s) => P(s, back, backFoot)),
        { tile: PANEL_TILE, vA: (top + rim) / PANEL_TILE, vB: 0 },
    );
    if (spec.bottom > 0) {
        buckets.structure.strip(
            all.map((s) => P(s, spec.offset, spec.bottom)),
            all.map((s) => P(s, back, backFoot)),
            {
                tile: PANEL_TILE,
                vA: 0,
                vB: (back - spec.offset) / PANEL_TILE,
            },
        );
    }
    const profile: [number, number][] = [[spec.offset, spec.bottom]];
    for (let i = 0; i < spec.rows; i++) {
        profile.push([rowOffset(i), rowHeight(i)]);
        profile.push([rowOffset(i) + spec.depth, rowHeight(i)]);
    }
    profile.push([back, top + rim], [back, spec.bottom > 0 ? backFoot : 0]);
    if (spec.bottom <= 0) profile.push([spec.offset, 0]);
    // The first profile point repeats when the front foot is on the floor.
    const contour = profile.filter(
        (p, i) =>
            i === 0 ||
            Math.hypot(p[0] - profile[i - 1][0], p[1] - profile[i - 1][1]) >
                1e-6,
    );
    if (
        Math.hypot(
            contour[0][0] - contour[contour.length - 1][0],
            contour[0][1] - contour[contour.length - 1][1],
        ) < 1e-6
    )
        contour.pop();
    for (const s of [spec.from, spec.to]) {
        buckets.structure.polygon(contour, ([d, y]) => P(s, d, y), PANEL_TILE);
    }

    return { tier, seatRows, reserved };
}
