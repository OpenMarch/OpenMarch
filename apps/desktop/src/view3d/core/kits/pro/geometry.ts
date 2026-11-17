import {
    BufferGeometry,
    Color,
    Float32BufferAttribute,
    InstancedMesh,
    Matrix4,
    Quaternion,
    Vector3,
    type BoxGeometry,
    type Material,
    type Vector3Tuple,
} from "three";
import type { SeatRow } from "../../types";
import { RING_PARTS, RING_POINTS, type Ring } from "../bowl";

/**
 * Geometry helpers for the pro dome: partial ring bands, instanced box
 * "members" (steel, hangers, portals) and seat rows split into sections.
 */

/** The four sides of the roof, named by the axis and sign they face. */
export type RoofSide = "xn" | "xp" | "zn" | "zp";

/** Segment ranges (`[from, to)`, into a bowl ring) belonging to each roof side. */
export function roofSideRanges(): Record<RoofSide, [number, number][]> {
    const out: Record<RoofSide, [number, number][]> = {
        xn: [],
        xp: [],
        zn: [],
        zp: [],
    };
    const order: RoofSide[] = ["zp", "xp", "zn", "xn"];
    let i = 0;
    let turn = 0;
    for (const part of RING_PARTS) {
        const from = i;
        i += part.segments;
        if (part.kind !== "arc") {
            out[order[turn]].push([from, i]);
            continue;
        }
        // A corner splits between the side before it and the side after it.
        const mid = from + part.segments / 2;
        out[order[turn]].push([from, mid]);
        turn = (turn + 1) % 4;
        out[order[turn]].push([mid, i]);
    }
    return out;
}

export interface SliceOptions {
    /** Meters of ring per texture tile. */
    tile?: number;
    v0?: number;
    v1?: number;
    /** Vertex color (linear 0..1). Only used by builders in `tinted` mode. */
    tint?: [number, number, number];
    /**
     * Maps the texture in plan instead of along the ring: `u` from world x
     * and `v` from world z, relative to (x, z), one tile per `tile` meters.
     */
    planar?: { tile: number; x: number; z: number };
}

/** Accumulates non-indexed triangles with UVs, like `bandGeometry`. */
export class BandBuilder {
    readonly pos: number[] = [];
    readonly uv: number[] = [];
    readonly color: number[] = [];

    constructor(private readonly tinted = false) {}

    /**
     * Quads between rings `a` and `b` over segments `i0` to `i1 - 1` (ring
     * points wrap). `u` runs along the ring in units of `tile` meters,
     * starting at the ring's point 0 so slices of one ring line up; `v` runs
     * from `v0` at `a` to `v1` at `b`.
     */
    slice(
        a: Ring,
        b: Ring,
        i0: number,
        i1: number,
        {
            tile = 12,
            v0 = 0,
            v1 = 1,
            tint = [1, 1, 1],
            planar,
        }: SliceOptions = {},
    ): this {
        const n = a.length;
        let u = 0;
        for (let i = 0; i < i0; i++) u += a[i % n].distanceTo(a[(i + 1) % n]);
        for (let s = i0; s < i1; s++) {
            const i = s % n;
            const j = (s + 1) % n;
            const seg = a[i].distanceTo(a[j]);
            const [p, q, r, t] = [a[i], a[j], b[j], b[i]];
            const u0 = u / tile;
            const u1 = (u + seg) / tile;
            const tri = (
                a0: Vector3,
                a1: Vector3,
                a2: Vector3,
                uvs: number[],
            ) => {
                // A corner of a zero-radius ring gives zero-area triangles.
                if (
                    a0.distanceToSquared(a1) < 1e-10 ||
                    a1.distanceToSquared(a2) < 1e-10 ||
                    a2.distanceToSquared(a0) < 1e-10
                )
                    return;
                this.pos.push(a0.x, a0.y, a0.z, a1.x, a1.y, a1.z);
                this.pos.push(a2.x, a2.y, a2.z);
                if (planar)
                    for (const c of [a0, a1, a2])
                        this.uv.push(
                            (c.x - planar.x) / planar.tile,
                            (c.z - planar.z) / planar.tile,
                        );
                else this.uv.push(...uvs);
                if (this.tinted)
                    for (let k = 0; k < 3; k++) this.color.push(...tint);
            };
            tri(p, q, r, [u0, v0, u1, v0, u1, v1]);
            tri(p, r, t, [u0, v0, u1, v1, u0, v1]);
            u += seg;
        }
        return this;
    }

    build(): BufferGeometry {
        const geo = new BufferGeometry();
        geo.setAttribute("position", new Float32BufferAttribute(this.pos, 3));
        geo.setAttribute("uv", new Float32BufferAttribute(this.uv, 2));
        if (this.tinted)
            geo.setAttribute(
                "color",
                new Float32BufferAttribute(this.color, 3),
            );
        geo.computeVertexNormals();
        return geo;
    }
}

const Y = new Vector3(0, 1, 0);

/**
 * Boxes collected as instances of one unit box, so a whole roof of steel,
 * the board hangers, speakers and tunnel portals are one draw call. Each box
 * has its own color (`instanceColor`).
 */
export class Members {
    private readonly matrices: Matrix4[] = [];
    private readonly colors: Color[] = [];
    private readonly m = new Matrix4();
    private readonly q = new Quaternion();

    get count(): number {
        return this.matrices.length;
    }

    /** A beam from `p` to `q`, `w` wide and `h` tall (h defaults to w). */
    beam(p: Vector3, q: Vector3, w: number, color: number, h = w): this {
        const dir = new Vector3().subVectors(q, p);
        const len = dir.length();
        if (len < 1e-6) return this;
        dir.divideScalar(len);
        // Keep the beam's "up" vertical where possible, so chords read flat.
        const side = new Vector3().crossVectors(Y, dir);
        if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
        side.normalize();
        const up = new Vector3().crossVectors(dir, side);
        this.m.makeBasis(side, up, dir);
        this.q.setFromRotationMatrix(this.m);
        const mid = new Vector3().addVectors(p, q).multiplyScalar(0.5);
        this.push(mid, this.q, new Vector3(w, h, len), color);
        return this;
    }

    /** A box (rotated by `yaw` about +Y) centered on `center`. */
    box(center: Vector3, size: Vector3Tuple, color: number, yaw = 0): this {
        this.q.setFromAxisAngle(Y, yaw);
        this.push(center, this.q, new Vector3(...size), color);
        return this;
    }

    /**
     * A flat Warren truss from `a` to `b` (top chord), `depth` deep, with a
     * vertical and a diagonal every `bay` meters.
     */
    truss(
        a: Vector3,
        b: Vector3,
        depth: number,
        bay: number,
        chord: number,
        web: number,
        color: number,
    ): this {
        const span = a.distanceTo(b);
        const bays = Math.max(1, Math.round(span / bay));
        const down = new Vector3(0, -depth, 0);
        const at = (t: number) => new Vector3().lerpVectors(a, b, t);
        this.beam(a, b, chord, color);
        this.beam(a.clone().add(down), b.clone().add(down), chord, color);
        for (let i = 0; i <= bays; i++) {
            const top = at(i / bays);
            this.beam(top, top.clone().add(down), web, color);
            if (i < bays) {
                const next = at((i + 1) / bays);
                const flip = i % 2 === 0;
                this.beam(
                    flip ? top : top.clone().add(down),
                    flip ? next.clone().add(down) : next,
                    web,
                    color,
                );
            }
        }
        return this;
    }

    private push(p: Vector3, q: Quaternion, s: Vector3, color: number) {
        this.matrices.push(new Matrix4().compose(p, q, s));
        this.colors.push(new Color(color));
    }

    build(box: BoxGeometry, material: Material, name: string): InstancedMesh {
        const mesh = new InstancedMesh(box, material, Math.max(1, this.count));
        mesh.name = name;
        this.matrices.forEach((mat, i) => {
            mesh.setMatrixAt(i, mat);
            mesh.setColorAt(i, this.colors[i]);
        });
        mesh.count = this.count;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.computeBoundingBox();
        return mesh;
    }
}

/** Along-path positions on an open polyline. */
function cumulative(points: Vector3Tuple[]): number[] {
    const out = [0];
    for (let i = 1; i < points.length; i++) {
        const [ax, ay, az] = points[i - 1];
        const [bx, by, bz] = points[i];
        out.push(out[i - 1] + Math.hypot(bx - ax, by - ay, bz - az));
    }
    return out;
}

/** The part of an open polyline between path lengths `from` and `to`. */
export function slicePolyline(
    points: Vector3Tuple[],
    from: number,
    to: number,
): Vector3Tuple[] {
    const s = cumulative(points);
    const at = (d: number): Vector3Tuple => {
        let i = 1;
        while (i < s.length - 1 && s[i] < d) i++;
        const t = s[i] > s[i - 1] ? (d - s[i - 1]) / (s[i] - s[i - 1]) : 0;
        const [ax, ay, az] = points[i - 1];
        const [bx, by, bz] = points[i];
        return [ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t];
    };
    const out: Vector3Tuple[] = [at(from)];
    for (let i = 0; i < points.length; i++)
        if (s[i] > from && s[i] < to) out.push(points[i]);
    out.push(at(to));
    return out;
}

/** Path length of an open polyline. */
export function polylineLength(points: Vector3Tuple[]): number {
    const s = cumulative(points);
    return s[s.length - 1];
}

export interface SectionSplit {
    /** Point index where each section starts (from `ringSections`). */
    starts: number[];
    /** Meters left empty at each end of a section (half an aisle). */
    halfAisle: number;
    /** Sections with a tunnel gap in this row, and the gap's width. */
    gaps?: { sections: Set<number>; width: number };
}

/**
 * Splits one closed seat row (a ring of `RING_POINTS` points) into open rows,
 * one per seating section, leaving the aisles (and tunnels) empty, so the
 * crowd shows the bowl's aisles.
 */
export function splitSeatRow(row: SeatRow, split: SectionSplit): SeatRow[] {
    if (row.points.length !== RING_POINTS)
        throw new Error("splitSeatRow: expected a bowl ring");
    const out: SeatRow[] = [];
    const { starts, halfAisle, gaps } = split;
    starts.forEach((start, k) => {
        const end = k + 1 < starts.length ? starts[k + 1] : RING_POINTS;
        const pts: Vector3Tuple[] = [];
        for (let i = start; i <= end; i++)
            pts.push(row.points[i % RING_POINTS]);
        const len = polylineLength(pts);
        const keep = (a: number, b: number) => {
            if (b - a < 0.6) return;
            out.push({
                ...row,
                points: slicePolyline(pts, a, b),
                closed: false,
            });
        };
        if (gaps?.sections.has(k)) {
            keep(halfAisle, (len - gaps.width) / 2);
            keep((len + gaps.width) / 2, len - halfAisle);
        } else keep(halfAisle, len - halfAisle);
    });
    return out;
}
