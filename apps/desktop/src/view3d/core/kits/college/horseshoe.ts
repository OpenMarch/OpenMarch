/**
 * Horseshoe layout for the college kit. Framework-free math; meters.
 *
 * The seating follows a path around the field at "offset 0" (the face of the
 * field wall): the front sideline straight (+Z, running toward side 2), a
 * corner arc, the side-2 end, a second arc and the back sideline straight
 * running back toward side 1. The side-1 end is open; both straights stop at
 * `openX`. A point at path length `s` and outward offset `d` is the base
 * point pushed `d` meters along the outward normal, so every row is a
 * parallel curve and the aisles in the corners run radially.
 */

export interface HorseshoeSpec {
    /** Center of the rounded rectangle the path follows. */
    cx: number;
    cz: number;
    /** Half extents of the path (the field wall), meters. */
    halfX: number;
    halfZ: number;
    /** Corner radius at offset 0. Clamped to the half extents. */
    radius: number;
    /** World x where both straights stop at the open side-1 end. */
    openX: number;
}

export type SegmentKind = "front" | "arc1" | "end" | "arc2" | "back";

export interface Segment {
    kind: SegmentKind;
    /** Path length where the segment starts and ends. */
    s0: number;
    s1: number;
}

/** A point on the path at offset 0 with its outward unit normal. */
export interface Station {
    x: number;
    z: number;
    nx: number;
    nz: number;
    segment: SegmentKind;
}

export interface Horseshoe {
    spec: HorseshoeSpec;
    /** Corner radius after clamping. */
    radius: number;
    length: number;
    segments: Segment[];
    at(s: number): Station;
    /** World x, z of path length `s` pushed `d` meters outward. */
    point(s: number, d: number): [number, number];
    /** The segment that contains `s` (the later one at a junction). */
    segmentAt(s: number): Segment;
}

export function horseshoe(spec: HorseshoeSpec): Horseshoe {
    const r = Math.max(1, Math.min(spec.radius, spec.halfX, spec.halfZ));
    const sx = spec.halfX - r;
    const sz = spec.halfZ - r;
    const { cx, cz } = spec;
    const frontLen = Math.max(0, cx + sx - spec.openX);
    const arcLen = (r * Math.PI) / 2;
    const lens: [SegmentKind, number][] = [
        ["front", frontLen],
        ["arc1", arcLen],
        ["end", 2 * sz],
        ["arc2", arcLen],
        ["back", frontLen],
    ];
    const segments: Segment[] = [];
    let acc = 0;
    for (const [kind, len] of lens) {
        segments.push({ kind, s0: acc, s1: acc + len });
        acc += len;
    }
    const length = acc;

    const segmentAt = (s: number): Segment => {
        for (let i = segments.length - 1; i >= 0; i--)
            if (s >= segments[i].s0 - 1e-9) return segments[i];
        return segments[0];
    };

    const at = (sIn: number): Station => {
        const s = Math.min(length, Math.max(0, sIn));
        const seg = segmentAt(s);
        const t = s - seg.s0;
        switch (seg.kind) {
            case "front":
                return {
                    x: spec.openX + t,
                    z: cz + spec.halfZ,
                    nx: 0,
                    nz: 1,
                    segment: seg.kind,
                };
            case "arc1": {
                const a = Math.PI / 2 - t / r;
                return arcStation(cx + sx, cz + sz, r, a, seg.kind);
            }
            case "end":
                return {
                    x: cx + spec.halfX,
                    z: cz + sz - t,
                    nx: 1,
                    nz: 0,
                    segment: seg.kind,
                };
            case "arc2": {
                const a = -t / r;
                return arcStation(cx + sx, cz - sz, r, a, seg.kind);
            }
            default:
                return {
                    x: cx + sx - t,
                    z: cz - spec.halfZ,
                    nx: 0,
                    nz: -1,
                    segment: seg.kind,
                };
        }
    };

    return {
        spec,
        radius: r,
        length,
        segments,
        at,
        point(s, d) {
            const p = at(s);
            return [p.x + p.nx * d, p.z + p.nz * d];
        },
        segmentAt,
    };
}

function arcStation(
    ox: number,
    oz: number,
    r: number,
    a: number,
    segment: SegmentKind,
): Station {
    const nx = Math.cos(a);
    const nz = Math.sin(a);
    return { x: ox + r * nx, z: oz + r * nz, nx, nz, segment };
}

const isArc = (kind: SegmentKind) => kind === "arc1" || kind === "arc2";

/** Largest angle between samples on an arc, radians. */
const ARC_STEP = (4 * Math.PI) / 180;

/**
 * Path lengths in `[a, b]` to sample at: the ends, every segment junction
 * inside the range, every `extra` value inside it, and enough points on arcs
 * to keep them smooth. Sorted, without duplicates.
 */
export function samplesBetween(
    hs: Horseshoe,
    a: number,
    b: number,
    extra: number[] = [],
): number[] {
    const out = [a, b];
    for (const seg of hs.segments) {
        if (seg.s0 > a && seg.s0 < b) out.push(seg.s0);
        if (!isArc(seg.kind)) continue;
        const lo = Math.max(a, seg.s0);
        const hi = Math.min(b, seg.s1);
        if (hi <= lo) continue;
        const step = ARC_STEP * hs.radius;
        for (let s = seg.s0 + step; s < seg.s1; s += step)
            if (s > lo && s < hi) out.push(s);
    }
    for (const s of extra) if (s > a && s < b) out.push(s);
    out.sort((p, q) => p - q);
    return out.filter((s, i) => i === 0 || s - out[i - 1] > 1e-6);
}

/** One seating section: the seats run from `a` to `b` (path length). */
export interface Section {
    a: number;
    b: number;
    segment: SegmentKind;
    /** Index along the whole path range, for colors and picking. */
    index: number;
}

export interface SectionOptions {
    /** Seats per section, measured along the row, meters. Default 10.5. */
    seatWidth?: number;
    /** Aisle width, meters. Default 1.3. */
    aisle?: number;
    /** Offset where corner widths are measured (mid-tier). */
    refOffset: number;
}

/**
 * Splits `[from, to]` into seating sections with an aisle between each pair
 * and half an aisle at each end. Sections never straddle segment junctions.
 * On arcs the widths are measured at `refOffset`, so corner sections are
 * wedges that are about as wide as the straight ones at mid-tier.
 */
export function sections(
    hs: Horseshoe,
    from: number,
    to: number,
    options: SectionOptions,
): Section[] {
    const seatWidth = options.seatWidth ?? 10.5;
    const aisle = options.aisle ?? 1.3;
    const out: Section[] = [];
    for (const seg of hs.segments) {
        const lo = Math.max(from, seg.s0);
        const hi = Math.min(to, seg.s1);
        if (hi - lo < 1e-6) continue;
        // Path length at offset 0 maps to (r + d) / r meters at offset d.
        const scale = isArc(seg.kind)
            ? (hs.radius + options.refOffset) / hs.radius
            : 1;
        const len = (hi - lo) * scale;
        const n = Math.max(1, Math.round(len / (seatWidth + aisle)));
        const w = (hi - lo) / n;
        const half = Math.min(aisle / scale / 2, w * 0.2);
        for (let k = 0; k < n; k++) {
            out.push({
                a: lo + k * w + half,
                b: lo + (k + 1) * w - half,
                segment: seg.kind,
                index: out.length,
            });
        }
    }
    return out;
}
