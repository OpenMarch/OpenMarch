/**
 * Mesh primitives for the 3D View's instruments (docs/3d/instruments.md
 * §4): small flat-shaded pieces, built from numbers. A piece is a triangle
 * list with one uniform-shader part id. Pure: no three.js.
 *
 * Frames: whatever the caller uses; the instrument models use the
 * instrument frame (origin at the right-hand grip, +Z toward the bell,
 * +Y up with the valve caps).
 */

export type Vec3 = [number, number, number];
/** Column-major 4x4, as three.js stores it. */
export type Mat4 = number[];

export interface Piece {
    part: number;
    positions: number[];
    normals: number[];
    indices: number[];
    /** Optional linear RGB per vertex (3 numbers each), from `colorPieces`. */
    colors?: number[];
    /** The bone this piece rides, when not the model's default. */
    bone?: "handR" | "handL" | "spine002";
}

/** Part ids for instruments: the metal in the look's finish, chrome, and black hardware. */
export const PART_METAL = 16;
export const PART_CHROME = 18;
export const PART_SHELL = 19;
export const PART_HEAD = 20;
export const PART_BLACK = 22;
export const PART_WOOD = 23;
/** A flag's silk, colored like the section. */
export const PART_SILK = 24;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: Vec3): Vec3 => {
    const l = len(a) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
};
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** Appends a flat triangle (own vertices, face normal) to a piece. */
function face(p: Piece, a: Vec3, b: Vec3, c: Vec3): void {
    const n = norm(cross(sub(b, a), sub(c, a)));
    const first = p.positions.length / 3;
    for (const v of [a, b, c]) {
        p.positions.push(v[0], v[1], v[2]);
        p.normals.push(n[0], n[1], n[2]);
    }
    p.indices.push(first, first + 1, first + 2);
}

function quad(p: Piece, a: Vec3, b: Vec3, c: Vec3, d: Vec3): void {
    face(p, a, b, c);
    face(p, a, c, d);
}

/** A ring of `segments` points of `radius` around `center` in the plane of unit vectors `u`, `v`. */
function ring(
    center: Vec3,
    u: Vec3,
    v: Vec3,
    radius: number,
    segments: number,
): Vec3[] {
    const out: Vec3[] = [];
    for (let i = 0; i < segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        out.push(
            add(
                center,
                add(
                    scale(u, Math.cos(a) * radius),
                    scale(v, Math.sin(a) * radius),
                ),
            ),
        );
    }
    return out;
}

/** Joins two rings of equal length with outward-facing quads. */
function strip(p: Piece, r0: Vec3[], r1: Vec3[]): void {
    const n = r0.length;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        quad(p, r0[i], r1[i], r1[j], r0[j]);
    }
}

/** A fan closing a ring at `center`; `flip` winds it the other way. */
function cap(p: Piece, r: Vec3[], center: Vec3, flip: boolean): void {
    const n = r.length;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        if (flip) face(p, center, r[j], r[i]);
        else face(p, center, r[i], r[j]);
    }
}

/**
 * Revolves `profile` (radius, height) pairs about +Y. A zero radius at
 * either end becomes a point; otherwise that end is closed with a flat cap.
 */
export function lathe(
    profile: [number, number][],
    segments: number,
    part: number,
): Piece {
    const p: Piece = { part, positions: [], normals: [], indices: [] };
    const u: Vec3 = [1, 0, 0];
    const v: Vec3 = [0, 0, -1]; // u × v = +Y: outward winding
    const rings = profile.map(([r, y]) => ring([0, y, 0], u, v, r, segments));
    for (let k = 0; k + 1 < profile.length; k++) {
        const [ra, ya] = profile[k];
        const [rb, yb] = profile[k + 1];
        if (ra === 0 && rb === 0) continue;
        if (ra === 0) cap(p, rings[k + 1], [0, ya, 0], yb > ya);
        else if (rb === 0) cap(p, rings[k], [0, yb, 0], yb < ya);
        else strip(p, rings[k], rings[k + 1]);
    }
    const [r0, y0] = profile[0];
    const [rn, yn] = profile[profile.length - 1];
    if (r0 > 0) cap(p, rings[0], [0, y0, 0], yn > y0);
    if (rn > 0) cap(p, rings[rings.length - 1], [0, yn, 0], yn < y0);
    return p;
}

/**
 * Sweeps a circle of `radius` along `path` with parallel-transport frames,
 * so a bend doesn't twist the tube, and caps both ends.
 */
export function tube(
    path: Vec3[],
    radius: number,
    segments: number,
    part: number,
): Piece {
    const p: Piece = { part, positions: [], normals: [], indices: [] };
    if (path.length < 2) return p;
    // tangent at each point: average of the neighboring segment directions
    const tangents: Vec3[] = path.map((_, i) => {
        const prev = i > 0 ? norm(sub(path[i], path[i - 1])) : null;
        const next =
            i + 1 < path.length ? norm(sub(path[i + 1], path[i])) : null;
        return norm(prev && next ? add(prev, next) : (prev ?? next)!);
    });
    // first frame: any unit vector not parallel to the tangent
    let u = norm(
        cross(
            tangents[0],
            Math.abs(tangents[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0],
        ),
    );
    const rings: Vec3[][] = [];
    for (let i = 0; i < path.length; i++) {
        if (i > 0) {
            // transport u: remove its component along the new tangent
            u = norm(sub(u, scale(tangents[i], dot(u, tangents[i]))));
        }
        const v = cross(tangents[i], u);
        // widen the ring at a corner so the tube keeps its radius through the bend
        const widen =
            i > 0 && i + 1 < path.length
                ? 1 /
                  Math.max(
                      0.5,
                      dot(tangents[i], norm(sub(path[i + 1], path[i]))),
                  )
                : 1;
        rings.push(ring(path[i], u, v, radius * widen, segments));
    }
    for (let i = 0; i + 1 < rings.length; i++) strip(p, rings[i], rings[i + 1]);
    cap(p, rings[0], path[0], true);
    cap(p, rings[rings.length - 1], path[path.length - 1], false);
    return p;
}

export function cylinder(
    radius: number,
    from: Vec3,
    to: Vec3,
    segments: number,
    part: number,
): Piece {
    return tube([from, to], radius, segments, part);
}

export function transformPiece(p: Piece, m: Mat4): Piece {
    const out: Piece = {
        part: p.part,
        positions: [],
        normals: [],
        indices: [...p.indices],
    };
    for (let i = 0; i < p.positions.length; i += 3) {
        const [x, y, z] = [
            p.positions[i],
            p.positions[i + 1],
            p.positions[i + 2],
        ];
        out.positions.push(
            m[0] * x + m[4] * y + m[8] * z + m[12],
            m[1] * x + m[5] * y + m[9] * z + m[13],
            m[2] * x + m[6] * y + m[10] * z + m[14],
        );
        const [nx, ny, nz] = [p.normals[i], p.normals[i + 1], p.normals[i + 2]];
        const n = norm([
            m[0] * nx + m[4] * ny + m[8] * nz,
            m[1] * nx + m[5] * ny + m[9] * nz,
            m[2] * nx + m[6] * ny + m[10] * nz,
        ]);
        out.normals.push(n[0], n[1], n[2]);
    }
    return out;
}

export function translateY(p: Piece, dy: number): Piece {
    return transformPiece(p, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, dy, 0, 1]);
}

export function triangleCount(pieces: Piece[]): number {
    return pieces.reduce((n, p) => n + p.indices.length / 3, 0);
}

export function bounds(pieces: Piece[]): { min: Vec3; max: Vec3 } {
    const min: Vec3 = [Infinity, Infinity, Infinity];
    const max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const p of pieces)
        for (let i = 0; i < p.positions.length; i += 3)
            for (let k = 0; k < 3; k++) {
                min[k] = Math.min(min[k], p.positions[i + k]);
                max[k] = Math.max(max[k], p.positions[i + k]);
            }
    return { min, max };
}

// ---- Smooth primitives: shared ring vertices and per-vertex normals ----

/** The two unit vectors of a ring's plane for a tangent, transported from `prevU`. */
function frame(t: Vec3, prevU: Vec3 | null): [Vec3, Vec3] {
    let u = prevU
        ? sub(prevU, scale(t, dot(prevU, t)))
        : cross(t, Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]);
    if (len(u) < 1e-6)
        u = cross(t, Math.abs(t[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1]);
    u = norm(u);
    return [u, cross(t, u)];
}

/**
 * Sweeps a circle along `path` with one ring of shared vertices per point,
 * radial normals (smooth shading) and a radius per point when `radii` is an
 * array (a conical bore). Caps are fans with axial normals.
 */
export function smoothTube(
    path: Vec3[],
    radii: number | number[],
    segments: number,
    part: number,
    {
        capStart = true,
        capEnd = true,
        startTangent,
        endTangent,
    }: {
        capStart?: boolean;
        capEnd?: boolean;
        /** Square the first or last ring to these directions (pieces of one curve then meet without gaps). */
        startTangent?: Vec3;
        endTangent?: Vec3;
    } = {},
): Piece {
    const p: Piece = { part, positions: [], normals: [], indices: [] };
    const n = path.length;
    if (n < 2) return p;
    const r = (i: number) =>
        Array.isArray(radii) ? radii[Math.min(i, radii.length - 1)] : radii;
    const tangents: Vec3[] = path.map((_, i) => {
        const prev = i > 0 ? norm(sub(path[i], path[i - 1])) : null;
        const next = i + 1 < n ? norm(sub(path[i + 1], path[i])) : null;
        return norm(prev && next ? add(prev, next) : (prev ?? next)!);
    });
    if (startTangent) tangents[0] = norm(startTangent);
    if (endTangent) tangents[n - 1] = norm(endTangent);
    let u: Vec3 | null = null;
    for (let i = 0; i < n; i++) {
        const [ui, vi] = frame(tangents[i], u);
        u = ui;
        const widen =
            i > 0 && i + 1 < n
                ? 1 /
                  Math.max(
                      0.5,
                      dot(tangents[i], norm(sub(path[i + 1], path[i]))),
                  )
                : 1;
        for (let k = 0; k < segments; k++) {
            const a = (k / segments) * Math.PI * 2;
            const dir = norm(
                add(scale(ui, Math.cos(a)), scale(vi, Math.sin(a))),
            );
            const pt = add(path[i], scale(dir, r(i) * widen));
            p.positions.push(pt[0], pt[1], pt[2]);
            p.normals.push(dir[0], dir[1], dir[2]);
        }
    }
    for (let i = 0; i + 1 < n; i++)
        for (let k = 0; k < segments; k++) {
            const a = i * segments + k;
            const b = i * segments + ((k + 1) % segments);
            const c = (i + 1) * segments + ((k + 1) % segments);
            const d = (i + 1) * segments + k;
            // outward: (u, v, t) is right-handed, so a -> b runs counterclockwise seen from outside
            p.indices.push(a, b, c, a, c, d);
        }
    const capAt = (ring: number, center: Vec3, axis: Vec3, flip: boolean) => {
        const ci = p.positions.length / 3;
        p.positions.push(center[0], center[1], center[2]);
        p.normals.push(axis[0], axis[1], axis[2]);
        for (let k = 0; k < segments; k++) {
            const a = ring * segments + k;
            const b = ring * segments + ((k + 1) % segments);
            if (flip) p.indices.push(ci, b, a);
            else p.indices.push(ci, a, b);
        }
    };
    if (capStart) capAt(0, path[0], scale(tangents[0], -1), true);
    if (capEnd) capAt(n - 1, path[n - 1], tangents[n - 1], false);
    return p;
}

/**
 * Revolves `profile` about +Y with shared ring vertices; normals follow the
 * profile's slope, so a flare shades smoothly. Open at both ends.
 */
export function smoothLathe(
    profile: [number, number][],
    segments: number,
    part: number,
): Piece {
    const p: Piece = { part, positions: [], normals: [], indices: [] };
    const m = profile.length;
    for (let i = 0; i < m; i++) {
        const [r, y] = profile[i];
        // slope: (dr, dy) along the profile; the normal is (dy, -dr) in (r, y)
        const [r0, y0] = profile[Math.max(i - 1, 0)];
        const [r1, y1] = profile[Math.min(i + 1, m - 1)];
        const dr = r1 - r0;
        const dy = y1 - y0;
        const l = Math.hypot(dr, dy) || 1;
        const nr = dy / l;
        const ny = -dr / l;
        for (let k = 0; k < segments; k++) {
            const a = (k / segments) * Math.PI * 2;
            const cx = Math.cos(a);
            const cz = -Math.sin(a);
            p.positions.push(r * cx, y, r * cz);
            const nn = norm([nr * cx, ny, nr * cz]);
            p.normals.push(nn[0], nn[1], nn[2]);
        }
    }
    for (let i = 0; i + 1 < m; i++)
        for (let k = 0; k < segments; k++) {
            const a = i * segments + k;
            const b = i * segments + ((k + 1) % segments);
            const c = (i + 1) * segments + ((k + 1) % segments);
            const d = (i + 1) * segments + k;
            p.indices.push(a, b, c, a, c, d);
        }
    return p;
}

/**
 * The transform that turns +Y to the direction `up` and +Z toward
 * `forward` (made perpendicular to `up`; any perpendicular when the two are
 * parallel), +X completing a right-handed frame, then moves to `origin`.
 * For placing a piece built about +Y (a lathe) on a surface.
 */
export function frameAt(origin: Vec3, up: Vec3, forward: Vec3): Mat4 {
    const y = norm(up);
    let z = sub(forward, scale(y, dot(forward, y)));
    if (len(z) < 1e-9 * Math.max(len(forward), 1))
        z = cross(Math.abs(y[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], y);
    z = norm(z);
    const x = cross(y, z);
    return [
        x[0],
        x[1],
        x[2],
        0,
        y[0],
        y[1],
        y[2],
        0,
        z[0],
        z[1],
        z[2],
        0,
        origin[0],
        origin[1],
        origin[2],
        1,
    ];
}

/**
 * Points on a circle of `radius` about `center` in the plane normal to
 * `axis`, from `fromDeg` to `toDeg`. About "x": 0° is +Y, 90° is +Z. About
 * "y": 0° is +Z, 90° is +X. About "z": 0° is +X, 90° is +Y.
 */
export function arc(
    center: Vec3,
    radius: number,
    fromDeg: number,
    toDeg: number,
    steps: number,
    axis: "x" | "y" | "z",
): Vec3[] {
    const out: Vec3[] = [];
    for (let i = 0; i <= steps; i++) {
        const a = ((fromDeg + ((toDeg - fromDeg) * i) / steps) * Math.PI) / 180;
        const c = Math.cos(a) * radius;
        const s = Math.sin(a) * radius;
        const d: Vec3 =
            axis === "x" ? [0, c, s] : axis === "y" ? [s, 0, c] : [c, s, 0];
        out.push(add(center, d));
    }
    return out;
}

/**
 * A U-shaped slide path: out from `start` along unit `dir` for `length`, a
 * 180 degree crook of `width` toward unit `across`, and back. The crook's
 * far point lies beyond the legs' ends; no point repeats.
 */
export function uPath(
    start: Vec3,
    dir: Vec3,
    across: Vec3,
    length: number,
    width: number,
    steps: number,
): Vec3[] {
    const d = norm(dir);
    const a = norm(across);
    const legEnd = add(start, scale(d, length));
    const center = add(legEnd, scale(a, width / 2));
    const out: Vec3[] = [start, legEnd];
    for (let i = 1; i < steps; i++) {
        const t = (i / steps) * Math.PI;
        out.push(
            add(
                center,
                add(
                    scale(a, -Math.cos(t) * (width / 2)),
                    scale(d, Math.sin(t) * (width / 2)),
                ),
            ),
        );
    }
    const back = add(legEnd, scale(a, width));
    out.push(back, add(start, scale(a, width)));
    return out;
}

/**
 * A bell flare from `throat` to `rim` over `length`: slow at the throat and
 * fast at the rim, ending in a rolled bead. (radius, distance) pairs.
 */
export function bellProfile(
    throat: number,
    rim: number,
    length: number,
    steps = 14,
): [number, number][] {
    const out: [number, number][] = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const r =
            throat +
            (rim - throat) * ((Math.exp(3.2 * t) - 1) / (Math.exp(3.2) - 1));
        out.push([r, length * t]);
    }
    // rim bead: a small roll outward and back
    const bead = Math.max(rim * 0.03, 0.002);
    out.push(
        [rim + bead * 0.6, length + bead * 0.4],
        [rim + bead * 0.8, length - bead * 0.2],
        [rim - bead * 0.2, length - bead * 0.4],
    );
    return out;
}

/** sRGB hex to linear RGB, as three's Color does. */
function linear(hex: number): Vec3 {
    const f = (c: number) => {
        const x = c / 255;
        return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    };
    return [f((hex >> 16) & 255), f((hex >> 8) & 255), f(hex & 255)];
}

/** Fills each piece's per-vertex colors from its part. */
export function colorPieces(
    pieces: Piece[],
    colorOfPart: (part: number) => number,
): Piece[] {
    return pieces.map((p) => {
        const [r, g, b] = linear(colorOfPart(p.part));
        const colors: number[] = [];
        for (let i = 0; i < p.positions.length / 3; i++) colors.push(r, g, b);
        return { ...p, colors };
    });
}
