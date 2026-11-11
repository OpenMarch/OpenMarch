/**
 * The parts every brass horn is assembled from (docs/3d/instruments.md §4):
 * tubing bent through filleted corners, bells lathed from a flare table,
 * piston valves, slides with their sleeves, braces, water keys and a
 * mouthpiece. Everything is smooth-shaded and built at a detail's segment
 * counts, so a horn's high and low meshes come from the same numbers.
 * Meters, in whatever frame the caller uses. Pure: no three.js.
 */
import {
    frameAt,
    smoothLathe,
    smoothTube,
    transformPiece,
    PART_CHROME,
    PART_METAL,
    PART_WOOD,
    type Piece,
    type Vec3,
} from "./mesh";
import type { Detail } from "./model";

/** Ring and path resolution for one detail level. */
export interface HornSegments {
    /** Sides of a main tube's ring. */
    tube: number;
    /** Sides of a thin part's ring: braces, stems, small slides. */
    thin: number;
    /** Sides of a bell's ring. */
    bell: number;
    /** Rings along a bell's flare. */
    flare: number;
    /** Points on a quarter turn of a bend. */
    bend: number;
    /** Whether the small trim is built: ferrules, flanges, water keys. */
    trim: boolean;
}

export const HORN_SEGMENTS: Record<Detail, HornSegments> = {
    high: { tube: 16, thin: 8, bell: 56, flare: 30, bend: 7, trim: true },
    low: { tube: 7, thin: 4, bell: 20, flare: 11, bend: 3, trim: false },
};

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec3): Vec3 => mul(a, 1 / (len(a) || 1));
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => add(a, mul(sub(b, a), t));

/** A corner of a tube's centerline, and the radius its bend is rounded to. */
export type Corner = [point: Vec3, bend?: number];

/**
 * The centerline through `corners` with each interior corner rounded to a
 * circular arc of its bend radius (shortened where the neighboring runs are
 * too short for it), as tubing is bent: straight runs joined by true bows.
 */
export function bentPath(corners: Corner[], bend: number): Vec3[] {
    const pts = corners.map((c) => c[0]);
    const out: Vec3[] = [pts[0]];
    // how much of each run the corner before it has already used
    let used = 0;
    for (let i = 1; i + 1 < pts.length; i++) {
        const d1 = unit(sub(pts[i], pts[i - 1]));
        const d2 = unit(sub(pts[i + 1], pts[i]));
        const turn = Math.acos(Math.max(-1, Math.min(1, dot(d1, d2))));
        const inLen = len(sub(pts[i], pts[i - 1])) - used;
        const outLen = len(sub(pts[i + 1], pts[i]));
        if (turn < 1e-3) {
            out.push(pts[i]);
            used = 0;
            continue;
        }
        const want = corners[i][1] ?? 0;
        const half = Math.tan(turn / 2);
        // a U's two corners share the run between them: each takes half
        const nextIsCorner = i + 2 < pts.length;
        const room = Math.min(inLen, nextIsCorner ? outLen / 2 : outLen);
        const r = Math.min(want, (room * 0.999) / half);
        if (r < 1e-5) {
            out.push(pts[i]);
            used = 0;
            continue;
        }
        const t = r * half;
        const n = unit(sub(d2, mul(d1, dot(d1, d2))));
        const center = add(sub(pts[i], mul(d1, t)), mul(n, r));
        // a wide bow needs more points to stay round
        const fine = r > 0.045 ? 1.8 : 1;
        const steps = Math.max(
            2,
            Math.ceil((turn / (Math.PI / 2)) * bend * fine),
        );
        for (let s = 0; s <= steps; s++) {
            const a = (turn * s) / steps;
            out.push(
                add(
                    center,
                    add(mul(n, -Math.cos(a) * r), mul(d1, Math.sin(a) * r)),
                ),
            );
        }
        used = t;
    }
    out.push(pts[pts.length - 1]);
    // drop points that all but repeat: where a U's two quarter turns meet
    // they end a hair apart, and two rings that close cross each other
    const kept: Vec3[] = [];
    for (const p of out)
        if (kept.length === 0 || len(sub(p, kept[kept.length - 1])) > 4e-4)
            kept.push(p);
    return kept;
}

/** A radius at each point of `path`: `stops` are (fraction of length, radius). */
export function taper(path: Vec3[], stops: [number, number][]): number[] {
    const at: number[] = [0];
    for (let i = 1; i < path.length; i++)
        at.push(at[i - 1] + len(sub(path[i], path[i - 1])));
    const total = at[at.length - 1] || 1;
    return at.map((d) => {
        const f = d / total;
        for (let k = 0; k + 1 < stops.length; k++) {
            const [fa, ra] = stops[k];
            const [fb, rb] = stops[k + 1];
            if (f <= fb || k + 2 === stops.length) {
                const t = Math.max(0, Math.min(1, (f - fa) / (fb - fa || 1)));
                return ra + (rb - ra) * t;
            }
        }
        return stops[stops.length - 1][1];
    });
}

/** The length of a centerline. */
export function pathLength(path: Vec3[]): number {
    let d = 0;
    for (let i = 1; i < path.length; i++) d += len(sub(path[i], path[i - 1]));
    return d;
}

/**
 * How much tubing each valve adds, as a fraction of the horn's open
 * length: the second valve lowers it a half step, the first a whole step,
 * the third a step and a half (equal temperament: 2^(n/12) − 1).
 */
export const VALVE_SLIDE_RATIO: Record<1 | 2 | 3, number> = {
    1: 2 ** (2 / 12) - 1,
    2: 2 ** (1 / 12) - 1,
    3: 2 ** (3 / 12) - 1,
};

/**
 * One piston valve as built: its casing's axis from the bottom cap to the
 * top cap, the casing's radius, and the center of its finger button.
 */
export interface ValveCasing {
    bottom: Vec3;
    top: Vec3;
    button: Vec3;
    r: number;
}

/**
 * What a horn builder returns: its pieces, where the hands and lips go,
 * and the tubing it is made of, so a test can hold it to its pitch.
 */
export interface Horn {
    pieces: Piece[];
    leftGrip: Vec3;
    /** The piston valves, first to third: where the hands find them. */
    valves: ValveCasing[];
    /** The mouthpiece rim's center. */
    rim: Vec3;
    /**
     * Centerline lengths, meters: the open horn from the mouthpiece rim to
     * the bell's rim, and each valve's own loop (first, second, third).
     */
    tubing: { main: number; valves: [number, number, number] };
}

/** The point a fraction `f` of the way along `path`, and its direction. */
export function pathAt(path: Vec3[], f: number): { p: Vec3; dir: Vec3 } {
    const at: number[] = [0];
    for (let i = 1; i < path.length; i++)
        at.push(at[i - 1] + len(sub(path[i], path[i - 1])));
    const want = at[at.length - 1] * Math.max(0, Math.min(1, f));
    for (let i = 1; i < path.length; i++)
        if (want <= at[i] || i + 1 === path.length) {
            const t = (want - at[i - 1]) / (at[i] - at[i - 1] || 1);
            return {
                p: lerp(path[i - 1], path[i], t),
                dir: unit(sub(path[i], path[i - 1])),
            };
        }
    return { p: path[0], dir: [0, 0, 1] };
}

/**
 * A brass bell's flare as a table of (distance, radius) for `flareProfile`
 * or a horn's spec: from the bell tube's start (`tail`) to the rim. A real
 * bell is not a cone. It stays slim through a long throat and opens fast in
 * its last few centimeters, the rim turned almost flat: a Bessel horn,
 * radius ∝ (distance left to a point just past the rim)^−γ. The curve is
 * fixed by the two ends, so only they are read off a photo; γ near 0.75
 * suits bell-front horns, and a higher γ opens earlier.
 *
 * Read the rim's distance at the rim's PLANE. In a product photo taken a
 * little from the front the rim shows as an ellipse, and its plane is at
 * the ellipse's center, not its far edge.
 */
export function bellFlare(
    tail: [distance: number, radius: number],
    rim: [distance: number, radius: number],
    gamma = 0.75,
    samples = 18,
): [number, number][] {
    const [z0, r0] = tail;
    const [z1, r1] = rim;
    const length = z1 - z0;
    // how far past the rim the curve's pole lies, so the tail has its radius
    const q = (r0 / r1) ** (1 / gamma);
    const pole = (q * length) / (1 - q);
    const out: [number, number][] = [];
    for (let i = 0; i <= samples; i++) {
        // samples crowd toward the rim, where the curve turns
        const z = z0 + length * (1 - (1 - i / samples) ** 2);
        out.push([z, r1 * (pole / (z1 - z + pole)) ** gamma]);
    }
    return out;
}

/**
 * A bell's profile as (radius, distance) pairs for `smoothLathe`, from its
 * flare `table` of (distance, radius) samples read off a side view: a smooth
 * curve through the samples (in log radius, so the flare stays a horn's),
 * with rings crowded toward the rim where it turns fastest, ending in the
 * rolled bead of a real bell's rim.
 */
export function flareProfile(
    table: [number, number][],
    rings: number,
): [number, number][] {
    const d = table.map((t) => t[0]);
    const y = table.map((t) => Math.log(t[1]));
    const n = table.length;
    // tangents by finite differences, clamped so the curve never dips
    const m = d.map((_, i) => {
        if (i === 0) return (y[1] - y[0]) / (d[1] - d[0]);
        if (i === n - 1) return (y[i] - y[i - 1]) / (d[i] - d[i - 1]);
        const a = (y[i] - y[i - 1]) / (d[i] - d[i - 1]);
        const b = (y[i + 1] - y[i]) / (d[i + 1] - d[i]);
        return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
    });
    const radius = (x: number) => {
        let k = 0;
        while (k + 2 < n && x > d[k + 1]) k++;
        const h = d[k + 1] - d[k];
        const t = Math.max(0, Math.min(1, (x - d[k]) / h));
        const t2 = t * t;
        const t3 = t2 * t;
        return Math.exp(
            (2 * t3 - 3 * t2 + 1) * y[k] +
                (t3 - 2 * t2 + t) * h * m[k] +
                (-2 * t3 + 3 * t2) * y[k + 1] +
                (t3 - t2) * h * m[k + 1],
        );
    };
    const start = d[0];
    const length = d[n - 1] - start;
    const out: [number, number][] = [];
    for (let i = 0; i <= rings; i++) {
        const u = i / rings;
        const x = start + length * (1 - (1 - u) ** 2.2);
        out.push([radius(x), x]);
    }
    const rim = table[n - 1][1];
    const end = d[n - 1];
    const bead = 0.0025 + rim * 0.012;
    out.push(
        [rim + bead * 0.7, end + bead * 0.15],
        [rim + bead * 1.1, end - bead * 0.45],
        [rim + bead * 0.7, end - bead * 1.05],
        [rim + bead * 0.1, end - bead * 0.9],
    );
    return out;
}

/** The parts of a horn, built at one detail level. */
export function hornKit(detail: Detail) {
    const s = HORN_SEGMENTS[detail];
    /** Every valve `valves` has built, in the order it built them. */
    const casings: ValveCasing[] = [];
    /** A lathe built about +Y, stood at `origin` with +Y turned to `axis`. */
    const stand = (piece: Piece, origin: Vec3, axis: Vec3): Piece =>
        transformPiece(
            piece,
            frameAt(
                origin,
                axis,
                Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1],
            ),
        );
    /** A lathe of (radius, distance) pairs from `origin` along `axis`. */
    const turned = (
        profile: [number, number][],
        origin: Vec3,
        axis: Vec3,
        part: number,
        sides = s.tube,
    ) => stand(smoothLathe(profile, sides, part), origin, unit(axis));

    /**
     * Tubing through `corners`, each bend rounded to `bend` unless the
     * corner names its own, at one radius or tapering through `radii`
     * stops of (fraction of length, radius).
     */
    const pipe = (
        corners: Corner[],
        radii: number | [number, number][],
        {
            bend = 0.02,
            part = PART_METAL,
            sides,
            caps = false,
        }: {
            bend?: number;
            part?: number;
            sides?: number;
            caps?: boolean;
        } = {},
    ): Piece => {
        const path = bentPath(
            corners.map(([p, b]) => [p, b ?? bend]),
            s.bend,
        );
        const r = typeof radii === "number" ? radii : taper(path, radii);
        const widest = typeof r === "number" ? r : Math.max(...r);
        return smoothTube(
            path,
            r,
            sides ?? (widest < 0.005 ? s.thin : s.tube),
            part,
            { capStart: caps, capEnd: caps },
        );
    };

    /** A short closed cylinder: a sleeve, ferrule or collar. */
    const sleeve = (a: Vec3, b: Vec3, r: number, part = PART_METAL): Piece =>
        smoothTube([a, b], r, r < 0.005 ? s.thin : s.tube, part);

    /** A ferrule around a tube of radius `r` at `p`, lying along `dir`. */
    const ferrule = (p: Vec3, dir: Vec3, r: number, length = 0.012): Piece[] =>
        s.trim
            ? [
                  sleeve(
                      sub(p, mul(unit(dir), length / 2)),
                      add(p, mul(unit(dir), length / 2)),
                      r * 1.1 + 0.0004,
                  ),
              ]
            : [];

    /**
     * A bell along `axis` from `origin`: `table` is its flare, (distance
     * from the origin, radius). Open at both ends; drawn two-sided.
     */
    const bell = (
        table: [number, number][],
        origin: Vec3,
        axis: Vec3,
        part = PART_METAL,
    ): Piece =>
        turned(flareProfile(table, s.flare), origin, axis, part, s.bell);

    /**
     * A U slide: out from `from` along `dir` for `length`, across `width`
     * toward `across` and back, with the outer sleeves real slides have
     * over the last `sleeves` of each leg's length.
     */
    const slide = (
        from: Vec3,
        dir: Vec3,
        across: Vec3,
        length: number,
        width: number,
        r: number,
        { sleeves = 0.45, part = PART_METAL } = {},
    ): Piece[] => {
        const d = unit(dir);
        const a = unit(across);
        const far = add(from, mul(d, length));
        const back = add(from, mul(a, width));
        const out: Piece[] = [
            pipe([[from], [far], [add(far, mul(a, width))], [back]], r, {
                bend: width / 2,
                part,
            }),
        ];
        if (s.trim && sleeves > 0)
            for (const leg of [from, back]) {
                const a0 = add(leg, mul(d, length * (1 - sleeves) * 0.6));
                const a1 = add(leg, mul(d, length - width / 2));
                if (dot(sub(a1, a0), d) > 0.004)
                    out.push(sleeve(a0, a1, r * 1.13 + 0.0003, part));
            }
        return out;
    };

    /** A brace rod from `a` to `b`, with a flange where it meets each tube. */
    const brace = (a: Vec3, b: Vec3, r = 0.0022): Piece[] => {
        const d = unit(sub(b, a));
        const out = [sleeve(a, b, r)];
        if (s.trim)
            out.push(
                sleeve(a, add(a, mul(d, 0.002)), r * 1.9),
                sleeve(sub(b, mul(d, 0.002)), b, r * 1.9),
            );
        return out;
    };

    /**
     * Piston valves standing along +Y at each of `at` (x, z): the casing
     * from `bottom` to `top`, its caps, the stem, and the finger button
     * with its pearl. `r` is the casing's radius.
     */
    const valves = (
        at: [number, number][],
        r: number,
        bottom: number,
        top: number,
        { stem = 0.02 } = {},
    ): Piece[] => {
        const out: Piece[] = [];
        for (const [x, z] of at) {
            const o: Vec3 = [x, 0, z];
            casings.push({
                bottom: [x, bottom, z],
                top: [x, top, z],
                button: [x, top + stem + 0.0045, z],
                r,
            });
            out.push(
                sleeve([x, bottom, z], [x, top, z], r),
                // top cap: a knurled collar with a domed lid
                turned(
                    [
                        [r * 1.02, top - 0.007],
                        [r * 1.14, top - 0.006],
                        [r * 1.14, top + 0.003],
                        [r * 1.02, top + 0.0055],
                        [r * 0.5, top + 0.007],
                        [r * 0.3, top + 0.007],
                    ],
                    o,
                    [0, 1, 0],
                    PART_CHROME,
                ),
                // bottom cap
                turned(
                    [
                        [r * 1.02, bottom + 0.006],
                        [r * 1.13, bottom + 0.005],
                        [r * 1.13, bottom - 0.004],
                        [r * 0.85, bottom - 0.008],
                        [r * 0.3, bottom - 0.0095],
                        [0.0001, bottom - 0.0095],
                    ],
                    o,
                    [0, 1, 0],
                    PART_CHROME,
                ),
                sleeve(
                    [x, top + 0.006, z],
                    [x, top + stem, z],
                    Math.max(r * 0.24, 0.0018),
                    PART_CHROME,
                ),
                // finger button: a dished rim around a pearl
                turned(
                    [
                        [0.0001, top + stem - 0.001],
                        [r * 0.62, top + stem - 0.001],
                        [r * 0.86, top + stem + 0.0015],
                        [r * 0.86, top + stem + 0.0045],
                        [r * 0.7, top + stem + 0.005],
                    ],
                    o,
                    [0, 1, 0],
                    PART_CHROME,
                ),
                sleeve(
                    [x, top + stem + 0.003, z],
                    [x, top + stem + 0.0058, z],
                    r * 0.7,
                    PART_WOOD,
                ),
            );
        }
        // the knuckles joining neighboring casings
        for (let i = 0; i + 1 < at.length; i++) {
            const [xa, za] = at[i];
            const [xb, zb] = at[i + 1];
            for (const f of [0.3, 0.62])
                out.push(
                    sleeve(
                        [xa, bottom + (top - bottom) * f, za],
                        [xb, bottom + (top - bottom) * f, zb],
                        r * 0.52,
                    ),
                );
        }
        return out;
    };

    /**
     * A mouthpiece with its rim at `rim`, pointing along `dir` into the
     * horn, `k` times a trumpet's, and the receiver it sits in. Returns the
     * pieces and where the leadpipe starts.
     */
    const mouthpiece = (
        rim: Vec3,
        dir: Vec3,
        k: number,
    ): { pieces: Piece[]; end: Vec3 } => {
        const d = unit(dir);
        const pieces = [
            turned(
                [
                    [0.0035 * k, 0.014 * k],
                    [0.0072 * k, 0.005 * k],
                    [0.0086 * k, 0.0008 * k],
                    [0.0112 * k, 0],
                    [0.0134 * k, 0.0022 * k],
                    [0.0136 * k, 0.006 * k],
                    [0.0126 * k, 0.014 * k],
                    [0.0098 * k, 0.027 * k],
                    [0.0066 * k, 0.037 * k],
                    [0.0052 * k, 0.044 * k],
                    [0.0056 * k, 0.05 * k],
                    [0.005 * k, 0.056 * k],
                    [0.0054 * k, 0.082 * k],
                ],
                rim,
                d,
                PART_CHROME,
            ),
            // the receiver: a sleeve with a raised ring at its mouth
            sleeve(
                add(rim, mul(d, 0.066 * k)),
                add(rim, mul(d, 0.105 * k)),
                0.0068 * k,
            ),
        ];
        if (s.trim)
            pieces.push(
                sleeve(
                    add(rim, mul(d, 0.066 * k)),
                    add(rim, mul(d, 0.071 * k)),
                    0.0079 * k,
                ),
            );
        return { pieces, end: add(rim, mul(d, 0.1 * k)) };
    };

    /** A water key on a tube at `p`: the nipple below it and the sprung lever. */
    const waterKey = (p: Vec3, along: Vec3, out: Vec3, r: number): Piece[] => {
        if (!s.trim) return [];
        const a = unit(along);
        const o = unit(out);
        const base = add(p, mul(o, r));
        const post = add(p, mul(a, 0.016));
        const tip = add(base, mul(o, 0.0045));
        return [
            // the nipple and its cork cup
            sleeve(base, add(base, mul(o, 0.003)), 0.0027),
            sleeve(add(base, mul(o, 0.003)), tip, 0.0034, PART_CHROME),
            // the lever from the cup over its post to the thumb end
            sleeve(
                tip,
                add(add(post, mul(o, r + 0.0045)), mul(a, 0.012)),
                0.0011,
                PART_CHROME,
            ),
            sleeve(
                add(post, mul(o, r * 0.5)),
                add(post, mul(o, r + 0.0045)),
                0.0016,
            ),
        ];
    };

    /** A finger ring or hook: an arc of rod standing on a tube. */
    const ring = (
        center: Vec3,
        radius: number,
        fromDeg: number,
        toDeg: number,
        plane: "x" | "y" | "z",
        r = 0.0017,
    ): Piece => {
        const steps = Math.max(
            4,
            Math.round((Math.abs(toDeg - fromDeg) / 90) * s.bend),
        );
        const path: Vec3[] = [];
        for (let i = 0; i <= steps; i++) {
            const t =
                ((fromDeg + ((toDeg - fromDeg) * i) / steps) * Math.PI) / 180;
            const c = Math.cos(t) * radius;
            const q = Math.sin(t) * radius;
            path.push(
                add(
                    center,
                    plane === "x"
                        ? [0, c, q]
                        : plane === "y"
                          ? [q, 0, c]
                          : [c, q, 0],
                ),
            );
        }
        return smoothTube(path, r, s.thin, PART_METAL);
    };

    return {
        segments: s,
        casings,
        pipe,
        sleeve,
        ferrule,
        bell,
        slide,
        brace,
        valves,
        mouthpiece,
        waterKey,
        ring,
        turned,
    };
}

export type HornKit = ReturnType<typeof hornKit>;
