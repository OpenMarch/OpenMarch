// cspell:words verts Rodrigues
/**
 * The shako's upright feather plume, built procedurally (no asset). It is
 * modeled on a French upright plume: a dense column about 1.6 shakos tall,
 * made of many small curled feathers laid like shingles, each at its own
 * angle, with a tufted, rounded top.
 *
 * - `high`: a dark, lumpy core under 64 feather cards. Each card has its own
 *   size, tilt, twist, curl and seed; the shader (`plumeSet.ts`) cuts a
 *   feather out of each card and varies its brightness and barbs by seed.
 * - `low`: the same column as one lumpy solid with no cards, so it needs no
 *   alpha test.
 *
 * Both are fixed shapes from fixed seeds (the owner picked these two,
 * 2026-11-10), so every build draws the same plume. Normals point out from
 * the plume's axis, as fur shading does, so the feathers light as one soft
 * volume instead of as separate flat cards.
 *
 * The plume's frame: origin at the socket on top of the shako, +Y up, +Z
 * toward the marcher's front, in metres. It leans back {@link PLUME_LEAN_DEG}.
 */

export type PlumeTier = "high" | "low";

/** How far the plume leans back from vertical, degrees. */
export const PLUME_LEAN_DEG = 8;

/** The plume's height above the socket before the lean, metres. */
export const PLUME_HEIGHT = 0.3;

/** Non-indexed triangles: every attribute has one entry per vertex. */
export interface PlumeGeometryData {
    position: Float32Array;
    normal: Float32Array;
    /** Height up the plume: 0 at the socket, 1 at the top. */
    height: Float32Array;
    /** On a card, (across from -1 to 1, along from 0 to 1); (0, 0) on the core. */
    uv: Float32Array;
    /** 1 on a feather card, 0 on the core. */
    card: Float32Array;
    /** A card's seed in [0, 1), the same on all its vertices. */
    seed: Float32Array;
    /** A brightness factor baked per face. */
    shade: Float32Array;
    triangles: number;
}

type Vec3 = [number, number, number];

interface Vertex {
    p: Vec3;
    t: number;
    uv?: [number, number];
    card?: number;
    seed?: number;
    shade?: number;
}

/** A small deterministic generator (a 32-bit LCG), so a seed gives one shape. */
function rng(seed: number): () => number {
    let s = seed >>> 0;
    return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

const add = (a: Vec3, b: Vec3, k = 1): Vec3 => [
    a[0] + b[0] * k,
    a[1] + b[1] * k,
    a[2] + b[2] * k,
];
const norm = (a: Vec3): Vec3 => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** `v` turned about the unit axis `k` by `a` radians (Rodrigues). */
function rot(v: Vec3, k: Vec3, a: number): Vec3 {
    const c = Math.cos(a);
    const s = Math.sin(a);
    const d = v[0] * k[0] + v[1] * k[1] + v[2] * k[2];
    const x = cross(k, v);
    return [
        v[0] * c + x[0] * s + k[0] * d * (1 - c),
        v[1] * c + x[1] * s + k[1] * d * (1 - c),
        v[2] * c + x[2] * s + k[2] * d * (1 - c),
    ];
}

class Builder {
    readonly verts: Vertex[] = [];
    tri(a: Vertex, b: Vertex, c: Vertex, shade?: number): void {
        for (const v of [a, b, c])
            this.verts.push(shade === undefined ? v : { ...v, shade });
    }
}

/**
 * The column's outline: its radius at `t` (0 to 1 of the height), a little
 * fuller near the top, then a rounded dome.
 */
function profile(t: number, base: number, mid: number, top: number): number {
    if (t < 0.75)
        return (
            base +
            (top - base) * Math.pow(t / 0.75, 0.7) +
            (mid - (base + top) / 2) * Math.sin((Math.PI * t) / 0.75)
        );
    const u = (t - 0.75) / 0.25;
    return top * Math.sqrt(Math.max(0, 1 - u * u));
}

interface Column {
    H: number;
    base: number;
    mid: number;
    top: number;
}

/**
 * A lumpy faceted core: every vertex pushed in or out at random so the
 * outline is irregular, and every face its own shade.
 */
function core(
    b: Builder,
    R: () => number,
    c: Column & {
        sides: number;
        rows: number;
        noise: number;
        shade: number;
        shadeJitter: number;
    },
): void {
    const { H, sides, rows, base, mid, top, noise, shade, shadeJitter } = c;
    const ring: Vertex[][] = [];
    for (let k = 0; k <= rows; k++) {
        const t = -0.04 + (k / rows) * 0.9;
        const pts: Vertex[] = [];
        for (let j = 0; j < sides; j++) {
            const a = ((j + R() * 0.6 + (k % 2) * 0.5) / sides) * Math.PI * 2;
            const r =
                profile(Math.max(0, t), base, mid, top) *
                (1 + (k ? noise * (R() * 2 - 1) : 0));
            pts.push({
                p: [
                    Math.sin(a) * r,
                    t * H + (k ? ((R() - 0.5) * 0.25 * H) / rows : 0),
                    Math.cos(a) * r,
                ],
                t,
            });
        }
        ring.push(pts);
    }
    const S = () => shade * (1 - shadeJitter + R() * shadeJitter * 2);
    for (let k = 0; k < rows; k++)
        for (let j = 0; j < sides; j++) {
            const A = ring[k];
            const B = ring[k + 1];
            const j1 = (j + 1) % sides;
            b.tri(A[j], A[j1], B[j], S());
            b.tri(A[j1], B[j1], B[j], S());
        }
    // a tufted top: the apex a little off centre and proud
    const apex: Vertex = {
        p: [(R() - 0.5) * 0.02, H * (0.98 + R() * 0.03), (R() - 0.5) * 0.02],
        t: 1,
    };
    const T = ring[rows];
    for (let j = 0; j < sides; j++) b.tri(T[j], T[(j + 1) % sides], apex, S());
}

/**
 * One feather card rooted at `root`, growing along `dir`, faced outward
 * (`out`) and curling further outward toward its tip over `segs` segments.
 */
function feather(
    b: Builder,
    f: {
        root: Vec3;
        dir: Vec3;
        out: Vec3;
        len: number;
        w: number;
        curl: number;
        twist: number;
        segs: number;
        seed: number;
        H: number;
    },
): void {
    const side = rot(norm(cross(f.dir, f.out)), f.dir, f.twist);
    const bendAxis = norm(cross(f.dir, f.out));
    const rows: [Vertex, Vertex][] = [];
    let p = f.root;
    let d = f.dir;
    for (let i = 0; i <= f.segs; i++) {
        const s = i / f.segs;
        const hw =
            f.w *
            (0.55 + 0.45 * Math.sin(Math.PI * Math.min(0.9, 0.2 + s * 0.8)));
        const t = Math.min(1, p[1] / f.H);
        rows.push([
            { p: add(p, side, -hw), t, uv: [-1, s], card: 1, seed: f.seed },
            { p: add(p, side, hw), t, uv: [1, s], card: 1, seed: f.seed },
        ]);
        if (i < f.segs) {
            p = add(p, d, f.len / f.segs);
            d = norm(rot(d, bendAxis, -f.curl / f.segs));
        }
    }
    for (let i = 0; i < f.segs; i++) {
        b.tri(rows[i][0], rows[i][1], rows[i + 1][1]);
        b.tri(rows[i][0], rows[i + 1][1], rows[i + 1][0]);
    }
}

/**
 * Feathers scattered over the column, stratified in height and angle with
 * jitter, so the coverage is even but nothing lines up. Near the top they
 * stand more upright, longer and more curled: the tuft.
 */
function plumage(
    b: Builder,
    R: () => number,
    c: Column & { n: number; len: number; w: number; segs: number },
): void {
    const { H, n, base, mid, top, len, w, segs } = c;
    const rows = Math.max(3, Math.round(Math.sqrt(n * 0.55)));
    const perRow = Math.ceil(n / rows);
    let made = 0;
    for (let r = 0; r < rows && made < n; r++)
        for (let k = 0; k < perRow && made < n; k++, made++) {
            const t = Math.min(0.97, (r + 0.1 + R() * 0.8) / rows);
            const az = ((k + R() * 0.8 + r * 0.37) / perRow) * Math.PI * 2;
            const out: Vec3 = [Math.sin(az), 0, Math.cos(az)];
            const rad = profile(t, base, mid, top);
            const nearTop = Math.max(0, (t - 0.72) / 0.28);
            // shingles lean out a little on the sides, less on top
            const tilt = (0.12 + R() * 0.33) * (1 - nearTop * 0.5);
            const tangent: Vec3 = [Math.cos(az), 0, -Math.sin(az)];
            const dir = norm(
                add(
                    [
                        out[0] * Math.sin(tilt),
                        Math.cos(tilt),
                        out[2] * Math.sin(tilt),
                    ],
                    tangent,
                    (R() - 0.5) * 0.7,
                ),
            );
            const root: Vec3 = [
                out[0] * rad * 0.7,
                Math.max(-0.01, t * H * 0.94 - len * 0.35),
                out[2] * rad * 0.7,
            ];
            const L = len * (0.75 + R() * 0.55) * (1 + nearTop * 0.25);
            feather(b, {
                root,
                dir,
                out,
                H,
                len: L,
                w: w * (0.75 + R() * 0.5),
                curl: 0.3 + R() * 0.7 + nearTop * 0.9,
                twist: (R() - 0.5) * 0.9,
                segs,
                seed: R(),
            });
        }
}

const COLUMN: Column = { H: PLUME_HEIGHT, base: 0.05, mid: 0.064, top: 0.068 };

/** The two tiers: the shapes and the seeds the owner picked (lab "High #2" and round 2's Low). */
const BUILD: Record<PlumeTier, () => { b: Builder; blend: number }> = {
    high: () => {
        const b = new Builder();
        const R = rng(110);
        core(b, R, {
            ...COLUMN,
            base: 0.042,
            mid: 0.052,
            top: 0.054,
            sides: 6,
            rows: 3,
            noise: 0.1,
            shade: 0.74,
            shadeJitter: 0.08,
        });
        plumage(b, R, { ...COLUMN, n: 64, len: 0.085, w: 0.034, segs: 2 });
        return { b, blend: 0.35 };
    },
    low: () => {
        const b = new Builder();
        const R = rng(3);
        core(b, R, {
            ...COLUMN,
            sides: 8,
            rows: 4,
            noise: 0.14,
            shade: 1,
            shadeJitter: 0.07,
        });
        return { b, blend: 0.12 };
    },
};

/**
 * Fur-style normals: mostly the direction out from the plume's axis (a
 * capsule from near the socket to near the top), plus `blend` of the face's
 * own normal turned to face outward, for a little definition.
 */
function volumeNormal(p: Vec3, face: Vec3, H: number, blend: number): Vec3 {
    const cy = Math.min(Math.max(p[1], 0.06 * H), 0.72 * H);
    const v = norm([p[0], (p[1] - cy) * 1.4, p[2]]);
    const dot = face[0] * v[0] + face[1] * v[1] + face[2] * v[2];
    const n: Vec3 = dot < 0 ? [-face[0], -face[1], -face[2]] : face;
    return norm(add(v, n, blend));
}

/** A plume tier's triangles, leaned back and ready for a `BufferGeometry`. */
export function plumeGeometryData(tier: PlumeTier): PlumeGeometryData {
    const { b, blend } = BUILD[tier]();
    const verts = b.verts;
    const n = verts.length;
    const out: PlumeGeometryData = {
        position: new Float32Array(n * 3),
        normal: new Float32Array(n * 3),
        height: new Float32Array(n),
        uv: new Float32Array(n * 2),
        card: new Float32Array(n),
        seed: new Float32Array(n),
        shade: new Float32Array(n),
        triangles: n / 3,
    };
    const lean = (-PLUME_LEAN_DEG * Math.PI) / 180;
    const c = Math.cos(lean);
    const s = Math.sin(lean);
    // about +X: a negative angle takes the top toward -Z, the back
    const tilt = (v: Vec3): Vec3 => [
        v[0],
        v[1] * c - v[2] * s,
        v[1] * s + v[2] * c,
    ];
    for (let i = 0; i < n; i += 3) {
        const [a, bb, cc] = [verts[i], verts[i + 1], verts[i + 2]];
        const face = norm(cross(sub(bb.p, a.p), sub(cc.p, a.p)));
        for (let k = 0; k < 3; k++) {
            const v = verts[i + k];
            const j = i + k;
            const p = tilt(v.p);
            const nn = tilt(volumeNormal(v.p, face, PLUME_HEIGHT, blend));
            out.position.set(p, j * 3);
            out.normal.set(nn, j * 3);
            out.height[j] = v.t;
            out.uv[j * 2] = v.uv?.[0] ?? 0;
            out.uv[j * 2 + 1] = v.uv?.[1] ?? 0;
            out.card[j] = v.card ?? 0;
            out.seed[j] = v.seed ?? 0;
            out.shade[j] = v.shade ?? 1;
        }
    }
    return out;
}
