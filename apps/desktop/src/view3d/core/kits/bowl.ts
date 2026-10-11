import {
    BufferGeometry,
    Float32BufferAttribute,
    Vector3,
    type Vector3Tuple,
} from "three";
import { ft } from "../environment/units";
import type { SeatRow } from "../types";

/**
 * Continuous seating bowls (P2.4), ported from the reference demo's
 * `bowlOutline`, `ringBand` and `bandMesh`. Framework-free; meters.
 *
 * A bowl is a rounded rectangle around the field. Every row is the same
 * outline offset outward by a distance `d`, so all rings share one point
 * count and two rings can be joined with quads (`ringBand`). Treads, risers,
 * back walls and soffits are bands between rings, built as a few meshes.
 */

/** Points on one ring; the ring is closed (the last point joins the first). */
export type Ring = Vector3[];

/** Returns the ring at outward offset `d` meters, at height `y`. */
export type BowlOutline = (d: number, y: number) => Ring;

export interface BowlOutlineOptions {
    /** Center of the rounded rectangle. */
    centerX: number;
    centerZ: number;
    /** Inner half-extents (offset 0), meters. */
    halfX: number;
    halfZ: number;
    /** Corner radius at offset 0. Clamped to the half-extents. */
    cornerRadius: number;
}

/** Points per straight along X and along Z, and per corner arc (from the demo). */
const NX = 28;
const NZ = 14;
const NA = 16;

/** Number of points on every ring of a bowl outline. */
export const RING_POINTS = 2 * NX + 2 * NZ + 4 * NA;

/**
 * A rounded-rectangle outline. Points run front straight (+Z, from side 1 to
 * side 2), side-2 end, back straight, side-1 end, with no repeated point.
 */
export function bowlOutline(options: BowlOutlineOptions): BowlOutline {
    const { centerX: cx, centerZ: cz } = options;
    const rc = Math.max(
        0,
        Math.min(options.cornerRadius, options.halfX, options.halfZ),
    );
    const sx = options.halfX - rc;
    const sz = options.halfZ - rc;
    return (d, y) => {
        const r = rc + d;
        const pts: Ring = [];
        const arc = (ax: number, az: number, a0: number, a1: number) => {
            for (let j = 0; j < NA; j++) {
                const a = a0 + ((a1 - a0) * j) / NA;
                pts.push(
                    new Vector3(
                        cx + ax + r * Math.cos(a),
                        y,
                        cz + az + r * Math.sin(a),
                    ),
                );
            }
        };
        for (let i = 0; i < NX; i++)
            pts.push(new Vector3(cx - sx + (2 * sx * i) / NX, y, cz + sz + r));
        arc(sx, sz, Math.PI / 2, 0);
        for (let i = 0; i < NZ; i++)
            pts.push(new Vector3(cx + sx + r, y, cz + sz - (2 * sz * i) / NZ));
        arc(sx, -sz, 0, -Math.PI / 2);
        for (let i = 0; i < NX; i++)
            pts.push(new Vector3(cx + sx - (2 * sx * i) / NX, y, cz - sz - r));
        arc(-sx, -sz, -Math.PI / 2, -Math.PI);
        for (let i = 0; i < NZ; i++)
            pts.push(new Vector3(cx - sx - r, y, cz - sz + (2 * sz * i) / NZ));
        arc(-sx, sz, Math.PI, Math.PI / 2);
        return pts;
    };
}

/**
 * Signed horizontal distance from the outline at offset 0: negative inside
 * the bowl floor, positive in the stands. Useful for placing and checking
 * cameras and seats.
 */
export function outlineOffset(
    options: BowlOutlineOptions,
    x: number,
    z: number,
): number {
    const rc = Math.max(
        0,
        Math.min(options.cornerRadius, options.halfX, options.halfZ),
    );
    // Signed distance to a rounded box with half-extents (halfX, halfZ).
    const qx = Math.abs(x - options.centerX) - (options.halfX - rc);
    const qz = Math.abs(z - options.centerZ) - (options.halfZ - rc);
    const outside = Math.hypot(Math.max(qx, 0), Math.max(qz, 0));
    const inside = Math.min(Math.max(qx, qz), 0);
    return outside + inside - rc;
}

/** Two rings to join, and how many meters of ring one texture tile spans. */
export interface RingPair {
    a: Ring;
    b: Ring;
    tile?: number;
}

/**
 * Appends quads between two closed rings with matching point counts. `u`
 * runs along the ring in units of `tile` meters; `v` runs from `a` (0) to
 * `b` (1).
 */
export function ringBand(
    a: Ring,
    b: Ring,
    pos: number[],
    uv: number[],
    tile: number,
): void {
    if (a.length !== b.length) throw new Error("ringBand: ring sizes differ");
    let u = 0;
    for (let i = 0; i < a.length; i++) {
        const j = (i + 1) % a.length;
        const seg = a[i].distanceTo(a[j]);
        const p = a[i];
        const q = a[j];
        const r = b[j];
        const s = b[i];
        const u0 = u / tile;
        const u1 = (u + seg) / tile;
        pos.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z);
        pos.push(p.x, p.y, p.z, r.x, r.y, r.z, s.x, s.y, s.z);
        uv.push(u0, 0, u1, 0, u1, 1, u0, 0, u1, 1, u0, 1);
        u += seg;
    }
}

/** Default texture tile along a band: 40 ft, as in the demo. */
export const DEFAULT_BAND_TILE = ft(40);

/** One non-indexed geometry holding every band in `pairs`. */
export function bandGeometry(pairs: RingPair[]): BufferGeometry {
    const pos: number[] = [];
    const uv: number[] = [];
    for (const { a, b, tile } of pairs)
        ringBand(a, b, pos, uv, tile ?? DEFAULT_BAND_TILE);
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    return geo;
}

/** One tier of rows. Offsets are outline offsets; heights are meters. */
export interface BowlTier {
    /** Outline offset of the tier's front edge. */
    offset: number;
    rows: number;
    /** Tread depth. */
    depth: number;
    /** Height step between rows. */
    rise: number;
    /** Tread height of the first row. */
    base: number;
    /** Height of the tier's front edge below the first tread (0 = floor). */
    bottom: number;
    /** Put this tier's front riser in `fascia` instead of `risers`. */
    fascia?: boolean;
    /** Crowd side for this tier's seat rows. */
    side?: SeatRow["side"];
}

/** Where a built tier ends. */
export interface BuiltTier extends BowlTier {
    /** Outline offset of the back edge. */
    back: number;
    /** Tread height of the last row. */
    top: number;
}

export interface BowlTiersOptions {
    /** Height of the back wall above the last tread. Default 4 ft. */
    rim?: number;
    /** How far a raised tier's soffit drops toward the back. Default 6 ft. */
    soffitDrop?: number;
    /** Seat height above the tread for seat rows. Default 1.35 ft. */
    seatHeight?: number;
    /** Riser texture tile along the fascia. Default 60 ft. */
    fasciaTile?: number;
}

export interface BowlTiers {
    tiers: BuiltTier[];
    /** Every tread. */
    treads: RingPair[];
    /** Risers, back walls and soffits. */
    risers: RingPair[];
    /** Front risers of tiers marked `fascia`. */
    fascia: RingPair[];
    /** One closed seat row per tread, at seat height. */
    seatRows: SeatRow[];
}

/**
 * Builds the rings for stacked tiers that follow `outline`. Each row is a
 * riser from the previous tread height up to its own, then a tread `depth`
 * deep. Each tier gets a back wall down to the floor, and a raised tier
 * (`bottom > 0`) gets a soffit underneath.
 */
export function bowlTiers(
    outline: BowlOutline,
    tiers: BowlTier[],
    options: BowlTiersOptions = {},
): BowlTiers {
    const rim = options.rim ?? ft(4);
    const soffitDrop = options.soffitDrop ?? ft(6);
    const seatHeight = options.seatHeight ?? ft(1.35);
    const fasciaTile = options.fasciaTile ?? ft(60);
    const out: BowlTiers = {
        tiers: [],
        treads: [],
        risers: [],
        fascia: [],
        seatRows: [],
    };
    for (const t of tiers) {
        let prevH = t.bottom;
        for (let i = 0; i < t.rows; i++) {
            const o = t.offset + i * t.depth;
            const h = t.base + i * t.rise;
            const front = outline(o, h);
            if (t.fascia && i === 0)
                out.fascia.push({
                    a: outline(o, prevH),
                    b: front,
                    tile: fasciaTile,
                });
            else out.risers.push({ a: outline(o, prevH), b: front });
            out.treads.push({ a: front, b: outline(o + t.depth, h) });
            out.seatRows.push({
                points: outline(o + t.depth * 0.45, h + seatHeight).map(
                    (p): Vector3Tuple => [p.x, p.y, p.z],
                ),
                closed: true,
                depth: t.depth,
                side: t.side ?? "neutral",
            });
            prevH = h;
        }
        const back = t.offset + t.rows * t.depth;
        const top = t.base + (t.rows - 1) * t.rise;
        out.risers.push({ a: outline(back, top + rim), b: outline(back, 0) });
        if (t.bottom > 0)
            out.risers.push({
                a: outline(t.offset, t.bottom),
                b: outline(back, t.bottom - soffitDrop),
            });
        out.tiers.push({ ...t, back, top });
    }
    return out;
}
