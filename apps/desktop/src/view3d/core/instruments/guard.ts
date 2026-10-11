// cspell:words cofactor forestock Zaber
/**
 * The color guard's equipment (docs/3d/instruments.md §3): a 6 ft flag, a
 * swing flag, a pair of swing flags, a drill rifle and a sabre. Pure: no
 * three.js.
 *
 * Instrument frame (must agree with the `flag`, `rifle` and `sabre` holds in
 * `holds.ts`): origin at the right hand's grip, +Z along the pole, barrel or
 * blade toward its far end, +Y the silk's face, the rifle's top or the
 * blade's flat. A flag's silk hangs from the top of its pole toward +X.
 *
 * `detail` sets segment counts: "high" for the full bodies, "low" for the
 * block tier.
 */
import {
    colorPieces,
    smoothLathe,
    smoothTube,
    PART_BLACK,
    PART_CHROME,
    PART_METAL,
    PART_SILK,
    PART_WOOD,
    type Piece,
    type Vec3,
} from "./mesh";
import type {
    Detail,
    InstrumentModel,
    ModelOptions,
    GuardModelId,
} from "./model";
import { hold } from "./holds";

/**
 * Default colors by part: chrome, black, a brass hilt, the white of a drill
 * rifle. The window recolors the metal finish and the silk (the section's
 * color), so those two are placeholders.
 */
export const GUARD_COLORS: Record<number, number> = {
    [PART_METAL]: 0xd9ad4f,
    [PART_CHROME]: 0xd9dde2,
    [PART_BLACK]: 0x141416,
    [PART_WOOD]: 0xf2f2f2,
    [PART_SILK]: 0xffffff,
};

interface SegmentCounts {
    /** Rings around a pole, barrel or strap. */
    tube: number;
    /** Rings around a lathed body: stock, blade, grip. */
    lathe: number;
    /** Rings around small parts: caps, bolt, swivels. */
    small: number;
    /** A silk's grid: cells out from the pole and along it. */
    silkOut: number;
    silkAlong: number;
    /** Rings along the sabre's blade, and ridges of wire on its grip. */
    blade: number;
    ridges: number;
    /** Rings between each pair of a lofted body's stations. */
    loft: number;
}
const SEGMENTS: Record<Detail, SegmentCounts> = {
    high: {
        tube: 32,
        lathe: 48,
        small: 16,
        silkOut: 56,
        silkAlong: 36,
        blade: 40,
        ridges: 24,
        loft: 6,
    },
    low: {
        tube: 10,
        lathe: 12,
        small: 6,
        silkOut: 6,
        silkAlong: 4,
        blade: 10,
        ridges: 6,
        loft: 2,
    },
};

/** Row-major 3x3. */
type Mat3 = [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
];

function inverseTranspose(m: Mat3): Mat3 {
    const [a, b, c, d, e, f, g, h, i] = m;
    const A = e * i - f * h;
    const B = -(d * i - f * g);
    const C = d * h - e * g;
    const det = a * A + b * B + c * C;
    // the cofactor matrix over the determinant is the inverse's transpose
    return [
        A / det,
        B / det,
        C / det,
        -(b * i - c * h) / det,
        (a * i - c * g) / det,
        -(a * h - b * g) / det,
        (b * f - c * e) / det,
        -(a * f - c * d) / det,
        (a * e - b * d) / det,
    ];
}

const det3 = (m: Mat3) =>
    m[0] * (m[4] * m[8] - m[5] * m[7]) -
    m[1] * (m[3] * m[8] - m[5] * m[6]) +
    m[2] * (m[3] * m[7] - m[4] * m[6]);

/**
 * Applies `p' = M p + t` to a piece, carrying the normals through the
 * inverse transpose (so squashes and shears shade right) and flipping the
 * winding when M mirrors.
 */
function mapPiece(p: Piece, m: Mat3, t: Vec3 = [0, 0, 0]): Piece {
    const n = inverseTranspose(m);
    const out: Piece = { ...p, positions: [], normals: [], indices: [] };
    for (let i = 0; i < p.positions.length; i += 3) {
        const [x, y, z] = [
            p.positions[i],
            p.positions[i + 1],
            p.positions[i + 2],
        ];
        out.positions.push(
            m[0] * x + m[1] * y + m[2] * z + t[0],
            m[3] * x + m[4] * y + m[5] * z + t[1],
            m[6] * x + m[7] * y + m[8] * z + t[2],
        );
        const [a, b, c] = [p.normals[i], p.normals[i + 1], p.normals[i + 2]];
        const nx = n[0] * a + n[1] * b + n[2] * c;
        const ny = n[3] * a + n[4] * b + n[5] * c;
        const nz = n[6] * a + n[7] * b + n[8] * c;
        const l = Math.hypot(nx, ny, nz) || 1;
        out.normals.push(nx / l, ny / l, nz / l);
    }
    const flip = det3(m) < 0;
    for (let i = 0; i < p.indices.length; i += 3)
        if (flip)
            out.indices.push(p.indices[i], p.indices[i + 2], p.indices[i + 1]);
        else out.indices.push(p.indices[i], p.indices[i + 1], p.indices[i + 2]);
    return out;
}

/** smoothLathe's +Y axis turned onto +Z: (x, y, z) -> (x, -z, y). */
const Y_TO_Z: Mat3 = [1, 0, 0, 0, 0, -1, 0, 1, 0];
const mul = (a: Mat3, b: Mat3): Mat3 => {
    const o: number[] = [];
    for (let r = 0; r < 3; r++)
        for (let c = 0; c < 3; c++)
            o.push(
                a[r * 3] * b[c] +
                    a[r * 3 + 1] * b[3 + c] +
                    a[r * 3 + 2] * b[6 + c],
            );
    return o as Mat3;
};
const scaleXY = (sx: number, sy: number, shearYZ = 0): Mat3 => [
    sx,
    0,
    0,
    0,
    sy,
    shearYZ,
    0,
    0,
    1,
];

/**
 * A lathe along +Z: `profile` is (radius, z) pairs, the cross-section
 * scaled by `sx` and `sy` into an oval, its center dropped by `shearYZ * z`,
 * then moved by `t`. A zero radius at an end closes it to a point.
 */
function latheZ(
    profile: [number, number][],
    segments: number,
    part: number,
    sx = 1,
    sy = 1,
    t: Vec3 = [0, 0, 0],
    shearYZ = 0,
): Piece {
    return mapPiece(
        smoothLathe(profile, segments, part),
        mul(scaleXY(sx, sy, shearYZ), Y_TO_Z),
        t,
    );
}

/**
 * Replaces a piece's normals with the area-weighted average of the faces
 * around each shared vertex: smooth shading for a surface whose shape comes
 * from a displacement rather than a formula.
 */
function smoothNormals(p: Piece): Piece {
    const n = new Array<number>(p.positions.length).fill(0);
    const at = (i: number): Vec3 => [
        p.positions[i * 3],
        p.positions[i * 3 + 1],
        p.positions[i * 3 + 2],
    ];
    for (let t = 0; t < p.indices.length; t += 3) {
        const [a, b, c] = [p.indices[t], p.indices[t + 1], p.indices[t + 2]];
        const [pa, pb, pc] = [at(a), at(b), at(c)];
        const e1 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
        const e2 = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
        // the unnormalized cross product weights each face by its area
        const f = [
            e1[1] * e2[2] - e1[2] * e2[1],
            e1[2] * e2[0] - e1[0] * e2[2],
            e1[0] * e2[1] - e1[1] * e2[0],
        ];
        for (const i of [a, b, c])
            for (let k = 0; k < 3; k++) n[i * 3 + k] += f[k];
    }
    for (let i = 0; i < n.length; i += 3) {
        const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
        n[i] /= l;
        n[i + 1] /= l;
        n[i + 2] /= l;
    }
    return { ...p, normals: n };
}

/**
 * A station of a lofted body: at `z`, a cross-section from `bottom` to
 * `top` in Y and `half` either side in X, its corners rounded by `square`
 * (2 an ellipse, higher toward a rectangle).
 */
export interface Station {
    z: number;
    top: number;
    bottom: number;
    half: number;
    square: number;
}

/** Catmull-Rom through the stations: the body's section at any `z` among them. */
export function sectionAt(stations: Station[], z: number): Station {
    let i = 0;
    while (i < stations.length - 2 && stations[i + 1].z < z) i++;
    const a = stations[Math.max(i - 1, 0)];
    const b = stations[i];
    const c = stations[i + 1];
    const d = stations[Math.min(i + 2, stations.length - 1)];
    const t = Math.min(1, Math.max(0, (z - b.z) / (c.z - b.z || 1)));
    const cr = (k: keyof Station) =>
        0.5 *
        (2 * b[k] +
            (c[k] - a[k]) * t +
            (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t * t +
            (3 * b[k] - a[k] - 3 * c[k] + d[k]) * t * t * t);
    return {
        z,
        top: cr("top"),
        bottom: cr("bottom"),
        half: cr("half"),
        square: cr("square"),
    };
}

/**
 * A closed body along +Z through `stations`: `steps` rings between each
 * pair, `segments` points around each ring, smooth-shaded, with flat caps
 * at both ends. For what a lathe can't make: a drill rifle's stock is
 * flat-sided and deeper than it is wide.
 */
function loft(
    stations: Station[],
    steps: number,
    segments: number,
    part: number,
): Piece {
    const rings: Station[] = [];
    for (let i = 0; i + 1 < stations.length; i++)
        for (let k = 0; k < steps; k++)
            rings.push(
                sectionAt(
                    stations,
                    stations[i].z +
                        ((stations[i + 1].z - stations[i].z) * k) / steps,
                ),
            );
    rings.push(stations[stations.length - 1]);
    const point = (s: Station, k: number): Vec3 => {
        const a = (k / segments) * Math.PI * 2;
        const e = 2 / s.square;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        return [
            s.half * Math.sign(c) * Math.abs(c) ** e,
            (s.top + s.bottom) / 2 +
                ((s.top - s.bottom) / 2) * Math.sign(sn) * Math.abs(sn) ** e,
            s.z,
        ];
    };
    const body: Piece = { part, positions: [], normals: [], indices: [] };
    for (const s of rings)
        for (let k = 0; k < segments; k++) body.positions.push(...point(s, k));
    for (let i = 0; i + 1 < rings.length; i++)
        for (let k = 0; k < segments; k++) {
            const a = i * segments + k;
            const b = i * segments + ((k + 1) % segments);
            const c = (i + 1) * segments + ((k + 1) % segments);
            const d = (i + 1) * segments + k;
            // each ring runs counterclockwise seen from +Z: (a, b, c) faces out
            body.indices.push(a, b, c, a, c, d);
        }
    const out = smoothNormals(body);
    // flat caps on their own vertices, so the end faces keep a crisp edge
    const cap = (s: Station, dir: 1 | -1) => {
        const first = out.positions.length / 3;
        out.positions.push(0, (s.top + s.bottom) / 2, s.z);
        out.normals.push(0, 0, dir);
        for (let k = 0; k < segments; k++) {
            out.positions.push(...point(s, k));
            out.normals.push(0, 0, dir);
        }
        for (let k = 0; k < segments; k++) {
            const a = first + 1 + k;
            const b = first + 1 + ((k + 1) % segments);
            if (dir > 0) out.indices.push(first, a, b);
            else out.indices.push(first, b, a);
        }
    };
    cap(rings[0], -1);
    cap(rings[rings.length - 1], 1);
    return out;
}

/** `samples` points on a Catmull-Rom curve through `points`, ends included. */
function curve(points: Vec3[], samples: number): Vec3[] {
    const out: Vec3[] = [];
    const n = points.length - 1;
    for (let i = 0; i <= samples; i++) {
        const f = (i / samples) * n;
        const j = Math.min(Math.floor(f), n - 1);
        const t = f - j;
        const a = points[Math.max(j - 1, 0)];
        const b = points[j];
        const c = points[j + 1];
        const d = points[Math.min(j + 2, n)];
        out.push(
            [0, 1, 2].map(
                (k) =>
                    0.5 *
                    (2 * b[k] +
                        (c[k] - a[k]) * t +
                        (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t * t +
                        (3 * b[k] - a[k] - 3 * c[k] + d[k]) * t * t * t),
            ) as Vec3,
        );
    }
    return out;
}

/**
 * Bends a piece built straight along +Z into a curve toward −X: each point
 * past `base` moves by `k (z − base)²`, and its normal follows the slope.
 */
function bendX(p: Piece, base: number, k: number): Piece {
    const out: Piece = { ...p, positions: [], normals: [] };
    for (let i = 0; i < p.positions.length; i += 3) {
        const [x, y, z] = [
            p.positions[i],
            p.positions[i + 1],
            p.positions[i + 2],
        ];
        const d = Math.max(0, z - base);
        out.positions.push(x - k * d * d, y, z);
        // x' = x + f(z): the normal's z loses f'(z) times its x
        const [nx, ny, nz] = [
            p.normals[i],
            p.normals[i + 1],
            p.normals[i + 2] + 2 * k * d * p.normals[i],
        ];
        const l = Math.hypot(nx, ny, nz) || 1;
        out.normals.push(nx / l, ny / l, nz / l);
    }
    return out;
}

/**
 * How a silk hangs: `ripple` is the wave's height in +Y toward the fly
 * end and `waves` its count across the silk; `droop` lets the fly end fall
 * back down the pole (−Z), so a long silk held from one edge reads as cloth.
 */
interface Drape {
    ripple: number;
    waves: number;
    droop: number;
}

/**
 * A flag's silk: a grid of `out` by `along` cells in the XZ plane, from
 * `x0` out `width` toward +X and from `z0` up `height` along the pole,
 * hung by `drape`: still at the pole and moving more toward the fly end.
 * Shared vertices, smooth normals facing +Y (counterclockwise seen from +Y).
 */
function silk(
    width: number,
    height: number,
    drape: Drape,
    out: number,
    along: number,
    x0: number,
    z0: number,
): Piece {
    const p: Piece = {
        part: PART_SILK,
        positions: [],
        normals: [],
        indices: [],
    };
    const { ripple, waves, droop } = drape;
    // u: 0 at the pole, 1 at the fly; v: 0 at the bottom, 1 at the top
    const f = (u: number, v: number) =>
        ripple *
        Math.sin((Math.PI / 2) * Math.min(1, 3 * u)) *
        Math.sin(2 * Math.PI * waves * u + 0.6 * Math.PI * v);
    for (let j = 0; j <= along; j++)
        for (let i = 0; i <= out; i++) {
            const u = i / out;
            const v = j / along;
            // the fly end falls, its bottom corner further than its top, and
            // pulls in toward the pole by about what it falls
            const fall = droop * u * u * (1.15 - 0.3 * v);
            p.positions.push(
                x0 + u * width - 0.4 * fall * u,
                f(u, v),
                z0 + v * height - fall,
            );
        }
    const row = out + 1;
    for (let j = 0; j < along; j++)
        for (let i = 0; i < out; i++) {
            const a = j * row + i; // (x, z)
            const b = (j + 1) * row + i; // (x, z + 1)
            const c = (j + 1) * row + i + 1; // (x + 1, z + 1)
            const d = j * row + i + 1; // (x + 1, z)
            // +Z then +X from a: the cross product points +Y
            p.indices.push(a, b, c, a, c, d);
        }
    return smoothNormals(p);
}

/** A capped chrome pole along Z from `from` to `to`. */
const pole = (from: number, to: number, radius: number, s: SegmentCounts) =>
    smoothTube(
        [
            [0, 0, from],
            [0, 0, to],
        ],
        radius,
        s.tube,
        PART_CHROME,
    );

/** A black rubber end cap over a pole's end at `z`, `dir` pointing off the end. */
function endCap(z: number, dir: 1 | -1, radius: number, s: SegmentCounts) {
    const r = radius + 0.003;
    const profile: [number, number][] = [
        [radius, z - dir * 0.045],
        [r, z - dir * 0.04],
        [r, z - dir * 0.006],
        [r * 0.8, z + dir * 0.004],
        [r * 0.4, z + dir * 0.008],
        [0, z + dir * 0.009],
    ];
    // the lathe's outward winding needs the profile to run toward +Z
    return latheZ(dir > 0 ? profile : profile.reverse(), s.small, PART_BLACK);
}

/** A band of black tape around a pole at `z`. */
const tape = (z: number, radius: number, s: SegmentCounts) =>
    smoothTube(
        [
            [0, 0, z - 0.015],
            [0, 0, z + 0.015],
        ],
        radius + 0.0015,
        s.tube,
        PART_BLACK,
    );

/**
 * A pole from `butt` to `tip` with the silk hanging from its top `height`.
 * With `sleeve`, the silk's hem wraps the pole along its height, as a swing
 * flag's does.
 */
function flag(
    butt: number,
    tip: number,
    radius: number,
    width: number,
    height: number,
    drape: Drape,
    s: SegmentCounts,
    sleeve = false,
): Piece[] {
    const bottom = tip - height;
    const pieces = [
        pole(butt, tip, radius, s),
        endCap(butt, -1, radius, s),
        endCap(tip, 1, radius, s),
        silk(width, height, drape, s.silkOut, s.silkAlong, radius, bottom),
        tape(bottom + 0.015, radius, s),
        tape(tip - 0.06, radius, s),
    ];
    if (sleeve)
        pieces.push(
            smoothTube(
                [
                    [0, 0, bottom + 0.03],
                    [0, 0, tip - 0.075],
                ],
                radius + 0.003,
                s.tube,
                PART_SILK,
            ),
        );
    return pieces;
}

/** The 6 ft flag's silk: nearly flat, a low ripple across it. */
const FLAG6_DRAPE: Drape = { ripple: 0.03, waves: 1.5, droop: 0 };

/**
 * A swing flag's silk: long and light, rolling in a deep, slow wave. The
 * hold trails it back from the pole, so it doesn't droop along the pole.
 */
const SWING_DRAPE: Drape = { ripple: 0.12, waves: 1.4, droop: 0 };

/**
 * The second swing flag as the first one's mirror image through the body's
 * center plane, in the instrument frame of the `doubleSwingFlag` hold.
 * With the hold's axes R (columns +X, +Y, +Z in the body) and origin o, the
 * body mirror M = diag(−1, 1, 1) becomes `p' = Rᵀ M R p + Rᵀ (M o − o)`, and
 * Rᵀ M R = I − 2 r rᵀ for r, the body's X axis seen in the instrument frame.
 */
function leftSwingFlag(): { m: Mat3; t: Vec3 } {
    const { origin, bellAxis, capsAxis } = hold(
        "doubleSwingFlag",
        "up",
    ).instrument;
    const norm = (v: Vec3): Vec3 => {
        const l = Math.hypot(v[0], v[1], v[2]) || 1;
        return [v[0] / l, v[1] / l, v[2] / l];
    };
    // the same frame `instrumentGeometry` places the model in
    const z = norm(bellAxis);
    const d = capsAxis[0] * z[0] + capsAxis[1] * z[1] + capsAxis[2] * z[2];
    const y = norm([
        capsAxis[0] - d * z[0],
        capsAxis[1] - d * z[1],
        capsAxis[2] - d * z[2],
    ]);
    const x: Vec3 = [
        y[1] * z[2] - y[2] * z[1],
        y[2] * z[0] - y[0] * z[2],
        y[0] * z[1] - y[1] * z[0],
    ];
    const r: Vec3 = [x[0], y[0], z[0]];
    const m = [0, 1, 2].flatMap((i) =>
        [0, 1, 2].map((j) => (i === j ? 1 : 0) - 2 * r[i] * r[j]),
    ) as Mat3;
    // Rᵀ (M o − o) is Rᵀ (−2 o_x, 0, 0): −2 o_x times r
    const t: Vec3 = [
        -2 * origin[0] * r[0],
        -2 * origin[0] * r[1],
        -2 * origin[0] * r[2],
    ];
    return { m, t };
}

/** The 6 ft flag: a 1.83 m pole (butt below the hand) and a 36 by 54 in silk. */
function flag6(s: SegmentCounts): Omit<InstrumentModel, "id"> {
    return {
        pieces: flag(-0.6, 1.23, 0.012, 1.37, 0.9, FLAG6_DRAPE, s),
        leftGrip: [0, 0, -0.25],
        mouthpiece: [0, 0, 0],
    };
}

/**
 * A swing flag: a 1 m pole held in one fist at its butt end, a bare tab
 * above the hand, and a 1.5 m by 0.7 m silk sleeved along the rest of it.
 */
function swingFlag(s: SegmentCounts): Omit<InstrumentModel, "id"> {
    return {
        pieces: flag(-0.06, 0.96, 0.0125, 1.5, 0.7, SWING_DRAPE, s, true),
        leftGrip: [0, 0, -0.2],
        mouthpiece: [0, 0, 0],
    };
}

/** Two swing flags: the second the first's mirror image, riding the left hand. */
function doubleSwingFlag(s: SegmentCounts): Omit<InstrumentModel, "id"> {
    const right = swingFlag(s).pieces;
    const { m, t } = leftSwingFlag();
    const left = right.map(
        (p): Piece => ({ ...mapPiece(p, m, t), bone: "handL" }),
    );
    return {
        pieces: [...right, ...left],
        leftGrip: t,
        mouthpiece: [0, 0, 0],
    };
}

/**
 * The drill rifle's body, modeled on a spinning rifle (an Ultra Spin): a
 * flat-sided stock deeper than it is wide, its top nearly level from the
 * butt plate to a dip at the wrist where the right hand holds it (the
 * origin), rising to the receiver, then a forestock tapering to a rounded
 * octagonal muzzle. No barrel stands proud of the wood.
 */
export const RIFLE_STATIONS: Station[] = [
    { z: -0.3, top: 0.019, bottom: -0.094, half: 0.017, square: 5 },
    { z: -0.292, top: 0.024, bottom: -0.1, half: 0.021, square: 5 },
    { z: -0.2, top: 0.022, bottom: -0.086, half: 0.021, square: 5 },
    { z: -0.12, top: 0.018, bottom: -0.064, half: 0.02, square: 4.5 },
    { z: -0.06, top: 0.012, bottom: -0.044, half: 0.018, square: 4 },
    { z: -0.02, top: 0.004, bottom: -0.03, half: 0.016, square: 3.5 },
    { z: 0.02, top: 0.006, bottom: -0.027, half: 0.016, square: 3.5 },
    { z: 0.05, top: 0.02, bottom: -0.026, half: 0.018, square: 4 },
    { z: 0.1, top: 0.024, bottom: -0.026, half: 0.019, square: 4.5 },
    { z: 0.25, top: 0.022, bottom: -0.024, half: 0.018, square: 4.5 },
    { z: 0.45, top: 0.017, bottom: -0.019, half: 0.016, square: 4.5 },
    { z: 0.6, top: 0.013, bottom: -0.014, half: 0.013, square: 3 },
    { z: 0.61, top: 0.01, bottom: -0.011, half: 0.01, square: 3 },
];

/** Where the sling's swivels hang: under the butt and under the forestock. */
export const RIFLE_SWIVELS = { back: -0.255, front: 0.4 };

/** A rifle's sling: a flat strap drawn nearly straight from `back` to `front`. */
function sling(back: Vec3, front: Vec3, s: SegmentCounts): Piece {
    // The squash scales about the origin, so the path's y is pre-divided by
    // it and the squash puts the strap's ends back on the tips.
    const strapY = 0.6;
    const steps = 16;
    const path: Vec3[] = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        path.push([
            0,
            (front[1] +
                (back[1] - front[1]) * t -
                0.006 * Math.sin(Math.PI * t)) /
                strapY,
            front[2] + (back[2] - front[2]) * t,
        ]);
    }
    return mapPiece(smoothTube(path, 0.005, s.tube, PART_BLACK), [
        2.4,
        0,
        0,
        0,
        strapY,
        0,
        0,
        0,
        1,
    ]);
}

/**
 * A drill rifle, 0.91 m: the white body, a chrome bolt plate let into its
 * top with the bolt's shroud at the back, and a black sling drawn taut
 * between swivels under the butt and the forestock.
 */
function rifle(s: SegmentCounts): Omit<InstrumentModel, "id"> {
    const top = (z: number) => sectionAt(RIFLE_STATIONS, z).top;
    const bottom = (z: number) => sectionAt(RIFLE_STATIONS, z).bottom;
    // a thin plate riding the stock's top between `from` and `to`
    const plate = (
        from: number,
        to: number,
        above: number,
        below: number,
        half: number,
        part: number,
    ) =>
        loft(
            [from, (2 * from + to) / 3, (from + 2 * to) / 3, to].map((z) => ({
                z,
                top: top(z) + above,
                bottom: top(z) - below,
                half,
                square: 8,
            })),
            2,
            s.small,
            part,
        );
    const shroudY = top(0.05) + 0.004;
    const pieces: Piece[] = [
        loft(RIFLE_STATIONS, s.loft, s.tube, PART_WOOD),
        // the bolt plate, and the ejection port's dark slot in it
        plate(0.045, 0.205, 0.0025, 0.004, 0.0115, PART_CHROME),
        plate(0.1, 0.175, 0.0033, 0.001, 0.0045, PART_BLACK),
        // the bolt's shroud: a stepped chrome cylinder at the plate's back end
        smoothTube(
            [
                [0, shroudY, 0.03],
                [0, shroudY, 0.065],
            ],
            0.0085,
            s.small,
            PART_CHROME,
        ),
        smoothTube(
            [
                [0, shroudY, 0.018],
                [0, shroudY, 0.03],
            ],
            0.0065,
            s.small,
            PART_CHROME,
        ),
    ];
    // the swivels: short chrome loops from inside the wood down below it
    const swivel = (z: number): Vec3 => {
        pieces.push(
            smoothTube(
                [
                    [0, bottom(z) + 0.004, z],
                    [0, bottom(z) - 0.012, z],
                ],
                0.003,
                s.small,
                PART_CHROME,
            ),
        );
        return [0, bottom(z) - 0.012, z];
    };
    const back = swivel(RIFLE_SWIVELS.back);
    const front = swivel(RIFLE_SWIVELS.front);
    pieces.push(sling(back, front, s));
    return { pieces, leftGrip: [0, 0, 0.36], mouthpiece: [0, 0, 0] };
}

/**
 * The sabre's blade, 25 mm wide at the guard to 19 mm under a white rubber
 * tip cap, curving back toward −X 85 mm off straight at the point.
 */
function sabreBlade(s: SegmentCounts): Piece[] {
    const length = 0.8;
    const base = 0.015;
    const end = base + length;
    const k = 0.085 / (length * length);
    const rings = s.blade;
    const profile: [number, number][] = [];
    for (let i = 0; i <= rings; i++) {
        const t = i / rings;
        // 25 mm wide at the guard, 19 mm under the tip's cap
        profile.push([0.0125 - 0.003 * t, base + t * (length - 0.01)]);
    }
    profile.push([0, end]);
    const blade = latheZ(profile, s.lathe, PART_CHROME, 1, 0.16);
    const tipCap = latheZ(
        [
            [0, end - 0.045],
            [0.0105, end - 0.044],
            [0.0115, end - 0.04],
            [0.0115, end - 0.008],
            [0.009, end + 0.002],
            [0.005, end + 0.006],
            [0, end + 0.007],
        ],
        s.small,
        PART_WOOD,
        1,
        0.55,
    );
    return [bendX(blade, base, k), bendX(tipCap, base, k)];
}

/**
 * The sabre's grip: an oval black barrel from the pommel to the guard, its
 * edge side pressed into four finger grooves.
 */
function sabreGrip(s: SegmentCounts): Piece {
    const gripRings = s.ridges;
    const grip: [number, number][] = [];
    for (let i = 0; i <= gripRings; i++) {
        const t = i / gripRings;
        grip.push([
            0.0135 + 0.0015 * Math.sin(Math.PI * t),
            -0.125 + 0.117 * t,
        ]);
    }
    const plain = latheZ(grip, s.lathe, PART_BLACK, 1, 0.8);
    const grooved: Piece = { ...plain, positions: [...plain.positions] };
    for (let i = 0; i < grooved.positions.length; i += 3) {
        const x = grooved.positions[i];
        if (x <= 0) continue;
        const t = (grooved.positions[i + 2] + 0.125) / 0.117;
        const dip = 0.5 + 0.5 * Math.cos(2 * Math.PI * 4 * t);
        grooved.positions[i] = x * (1 - 0.3 * dip * Math.sin(Math.PI * t));
    }
    return smoothNormals(grooved);
}

/** A side bar from the sabre's cup into its bow, so the hilt reads as a basket. */
const sabreBar = (y: number, s: SegmentCounts) =>
    smoothTube(
        curve(
            [
                [0.035, y, 0.008],
                [0.055, y * 1.1, -0.012],
                [0.066, y * 0.7, -0.045],
            ],
            Math.ceil(s.ridges / 2),
        ),
        0.0022,
        s.small,
        PART_CHROME,
    );

/**
 * A guard sabre, modeled on a spinning sabre (a Zaber): a broad curved
 * chrome blade 0.8 m ahead of the guard, flat across Y, its edge toward +X
 * and its point capped in white rubber; a chrome cup guard and a wide
 * D-shaped knuckle bow over the fingers; a black grip 0.12 m behind the
 * origin, its finger grooves on the edge side.
 */
function sabre(s: SegmentCounts): Omit<InstrumentModel, "id"> {
    // the knuckle bow: a flat chrome band from the cup's edge out around the
    // fingers to the pommel, 24 mm wide across Y
    const bowY = 4;
    const bow = mapPiece(
        smoothTube(
            curve(
                [
                    [0.045, 0, 0.004],
                    [0.062, 0, -0.018],
                    [0.068, 0, -0.055],
                    [0.062, 0, -0.095],
                    [0.038, 0, -0.127],
                    [0.006, 0, -0.133],
                ],
                s.ridges,
            ),
            0.003,
            s.small,
            PART_CHROME,
        ),
        [1, 0, 0, 0, bowY, 0, 0, 0, 1],
    );
    const pieces: Piece[] = [
        ...sabreBlade(s),
        sabreGrip(s),
        // the ferrule where the blade meets the guard
        latheZ(
            [
                [0.0135, 0.006],
                [0.0135, 0.022],
                [0.0125, 0.026],
            ],
            s.small,
            PART_CHROME,
            1,
            0.55,
        ),
        // the cup guard: an oval chrome plate, deeper toward the edge side
        latheZ(
            [
                [0, -0.004],
                [0.026, -0.004],
                [0.032, -0.001],
                [0.033, 0.004],
                [0.028, 0.009],
                [0, 0.01],
            ],
            s.lathe,
            PART_CHROME,
            1.35,
            0.85,
            [0.012, 0, 0],
        ),
        bow,
        sabreBar(0.014, s),
        sabreBar(-0.014, s),
        // the pommel cap
        latheZ(
            [
                [0, -0.142],
                [0.007, -0.14],
                [0.012, -0.134],
                [0.0145, -0.126],
                [0.014, -0.12],
                [0.012, -0.118],
            ],
            s.lathe,
            PART_CHROME,
        ),
    ];
    return { pieces, leftGrip: [0, 0, -0.06], mouthpiece: [0, 0, 0] };
}

/** One builder per id: a new id without one is a compile error. */
const BUILDERS: Record<
    GuardModelId,
    (s: SegmentCounts) => Omit<InstrumentModel, "id">
> = { flag6, swingFlag, doubleSwingFlag, rifle, sabre };

export function guardModel(
    id: GuardModelId,
    detail: Detail = "high",
    options: ModelOptions = {},
): InstrumentModel {
    const s = SEGMENTS[detail];
    const model = BUILDERS[id](s);
    return {
        id,
        options,
        ...model,
        pieces: colorPieces(
            model.pieces,
            (part) => GUARD_COLORS[part] ?? GUARD_COLORS[PART_CHROME],
        ),
    };
}
