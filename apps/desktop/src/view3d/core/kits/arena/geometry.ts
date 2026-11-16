import {
    BoxGeometry,
    BufferGeometry,
    Color,
    Float32BufferAttribute,
    Matrix4,
    Quaternion,
    Vector3,
    type Vector3Tuple,
} from "three";
import type { Ring } from "../bowl";

/**
 * Geometry helpers for the arena kit: merged boxes with vertex colors (so a
 * whole set of props draws as one mesh), and seat sections cut from bowl
 * rings so aisles line up from row to row.
 */

export interface BoxSpec {
    /** Center. */
    p: Vector3Tuple;
    /** Size along the box's own x, y and z. */
    s: Vector3Tuple;
    /** Rotation about +Y in radians. */
    ry?: number;
    /** Rotation about the box's own +X, applied before `ry`. */
    rx?: number;
    color?: number;
}

const unit = new BoxGeometry(1, 1, 1).toNonIndexed();
const unitPos = unit.getAttribute("position");
const unitNorm = unit.getAttribute("normal");
const unitUv = unit.getAttribute("uv");

/**
 * One non-indexed geometry holding every box, with a `color` attribute when
 * any box has a color (others are white). Use with `vertexColors: true`.
 */
export function mergedBoxes(boxes: BoxSpec[]): BufferGeometry {
    const n = unitPos.count;
    const pos = new Float32Array(boxes.length * n * 3);
    const nor = new Float32Array(boxes.length * n * 3);
    const uv = new Float32Array(boxes.length * n * 2);
    const col = new Float32Array(boxes.length * n * 3);
    const m = new Matrix4();
    const q = new Quaternion();
    const qx = new Quaternion();
    const v = new Vector3();
    const c = new Color();
    const yAxis = new Vector3(0, 1, 0);
    const xAxis = new Vector3(1, 0, 0);
    boxes.forEach((b, k) => {
        q.setFromAxisAngle(yAxis, b.ry ?? 0);
        qx.setFromAxisAngle(xAxis, b.rx ?? 0);
        q.multiply(qx);
        m.compose(v.set(...b.p), q, new Vector3(...b.s));
        c.setHex(b.color ?? 0xffffff);
        for (let i = 0; i < n; i++) {
            const o = (k * n + i) * 3;
            v.fromBufferAttribute(unitPos, i).applyMatrix4(m);
            pos[o] = v.x;
            pos[o + 1] = v.y;
            pos[o + 2] = v.z;
            v.fromBufferAttribute(unitNorm, i).applyQuaternion(q);
            nor[o] = v.x;
            nor[o + 1] = v.y;
            nor[o + 2] = v.z;
            col[o] = c.r;
            col[o + 1] = c.g;
            col[o + 2] = c.b;
            uv[(k * n + i) * 2] = unitUv.getX(i);
            uv[(k * n + i) * 2 + 1] = unitUv.getY(i);
        }
    });
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
    geo.setAttribute("normal", new Float32BufferAttribute(nor, 3));
    geo.setAttribute("uv", new Float32BufferAttribute(uv, 2));
    geo.setAttribute("color", new Float32BufferAttribute(col, 3));
    return geo;
}

/** The point at fractional index `f` along a closed ring. */
export function ringAt(ring: Ring, f: number): Vector3 {
    const n = ring.length;
    const w = ((f % n) + n) % n;
    const i = Math.floor(w);
    return ring[i].clone().lerp(ring[(i + 1) % n], w - i);
}

/**
 * Unit direction along a closed ring at fractional index `f`, and the
 * horizontal normal pointing toward `center` (into the bowl).
 */
export function ringFrame(
    ring: Ring,
    f: number,
    center: { x: number; z: number },
): { point: Vector3; tangent: Vector3; inward: Vector3 } {
    const point = ringAt(ring, f);
    const tangent = ringAt(ring, f + 0.5)
        .sub(ringAt(ring, f - 0.5))
        .setY(0)
        .normalize();
    const inward = new Vector3(-tangent.z, 0, tangent.x);
    if (inward.x * (center.x - point.x) + inward.z * (center.z - point.z) < 0)
        inward.negate();
    return { point, tangent, inward };
}

/** Rotation about +Y that turns a box's +Z face toward `dir`. */
export const yawToward = (dir: { x: number; z: number }): number =>
    Math.atan2(dir.x, dir.z);

/**
 * The open polyline of a ring between fractional indices `f0` and `f1`
 * (f0 < f1, may pass the ring's end), trimmed by `trim` meters at both ends.
 * Returns an empty list when the trimmed section would be shorter than
 * `minLength`.
 */
export function ringSection(
    ring: Ring,
    f0: number,
    f1: number,
    trim: number,
    minLength = 0.6,
): Vector3[] {
    const pts: Vector3[] = [ringAt(ring, f0)];
    for (let i = Math.floor(f0) + 1; i < f1; i++) pts.push(ringAt(ring, i));
    pts.push(ringAt(ring, f1));
    return trimPolyline(pts, trim, minLength);
}

/** Polyline length. */
export function polylineLength(pts: Vector3[]): number {
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += pts[i - 1].distanceTo(pts[i]);
    return len;
}

/** Cuts `trim` meters off both ends; empty when too little is left. */
export function trimPolyline(
    pts: Vector3[],
    trim: number,
    minLength = 0.6,
): Vector3[] {
    const len = polylineLength(pts);
    if (len - 2 * trim < minLength) return [];
    return slicePolyline(pts, trim, len - trim);
}

/** The part of a polyline between arc lengths `a` and `b`. */
export function slicePolyline(pts: Vector3[], a: number, b: number): Vector3[] {
    const out: Vector3[] = [];
    let s = 0;
    for (let i = 1; i < pts.length; i++) {
        const p = pts[i - 1];
        const q = pts[i];
        const seg = p.distanceTo(q);
        const s1 = s + seg;
        if (s1 >= a && s <= b && seg > 1e-9) {
            const t0 = Math.max(0, (a - s) / seg);
            const t1 = Math.min(1, (b - s) / seg);
            if (out.length === 0) out.push(p.clone().lerp(q, t0));
            out.push(p.clone().lerp(q, t1));
        }
        s = s1;
    }
    return out;
}

/**
 * Splits a polyline where it enters any of `holes` (axis-aligned XZ boxes),
 * so seats stop at a tunnel. Pieces shorter than `minLength` are dropped.
 */
export function cutPolyline(
    pts: Vector3[],
    holes: { minX: number; maxX: number; minZ: number; maxZ: number }[],
    minLength = 0.6,
): Vector3[][] {
    if (holes.length === 0) return pts.length > 1 ? [pts] : [];
    // Resample at 0.25 m so the cut lands close to the hole's edge.
    const len = polylineLength(pts);
    const steps = Math.max(1, Math.ceil(len / 0.25));
    const dense: Vector3[] = [];
    for (let k = 0; k <= steps; k++) {
        const at = (len * k) / steps;
        const piece = slicePolyline(pts, at, at);
        if (piece.length) dense.push(piece[0]);
    }
    const inside = (p: Vector3) =>
        holes.some(
            (h) => p.x > h.minX && p.x < h.maxX && p.z > h.minZ && p.z < h.maxZ,
        );
    const pieces: Vector3[][] = [];
    let cur: Vector3[] = [];
    for (const p of dense) {
        if (inside(p)) {
            if (cur.length > 1) pieces.push(cur);
            cur = [];
        } else cur.push(p);
    }
    if (cur.length > 1) pieces.push(cur);
    return pieces.filter((p) => polylineLength(p) >= minLength);
}

/**
 * Appends a vertical strip between `pts` raised by `y0` and by `y1` to the
 * position, uv and color arrays. U is arc length divided by `tile` plus
 * `uOffset`; V runs 0 (bottom) to 1 (top).
 */
export function pushStrip(
    pts: Vector3[],
    y0: number,
    y1: number,
    tile: number,
    color: Color,
    out: { pos: number[]; uv: number[]; col: number[] },
    uOffset = 0,
): void {
    let u = 0;
    for (let i = 1; i < pts.length; i++) {
        const p = pts[i - 1];
        const q = pts[i];
        const seg = p.distanceTo(q);
        const u0 = u / tile + uOffset;
        const u1 = (u + seg) / tile + uOffset;
        out.pos.push(
            p.x,
            p.y + y0,
            p.z,
            q.x,
            q.y + y0,
            q.z,
            q.x,
            q.y + y1,
            q.z,
            p.x,
            p.y + y0,
            p.z,
            q.x,
            q.y + y1,
            q.z,
            p.x,
            p.y + y1,
            p.z,
        );
        out.uv.push(u0, 0, u1, 0, u1, 1, u0, 0, u1, 1, u0, 1);
        for (let k = 0; k < 6; k++) out.col.push(color.r, color.g, color.b);
        u += seg;
    }
}

/** Geometry from `pushStrip` arrays. */
export function stripGeometry(out: {
    pos: number[];
    uv: number[];
    col: number[];
}): BufferGeometry {
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(out.pos, 3));
    geo.setAttribute("uv", new Float32BufferAttribute(out.uv, 2));
    geo.setAttribute("color", new Float32BufferAttribute(out.col, 3));
    geo.computeVertexNormals();
    return geo;
}
