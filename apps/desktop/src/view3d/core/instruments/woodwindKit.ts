// cspell:words lerp
/**
 * The parts every woodwind is assembled from (docs/3d/instruments.md §4):
 * dimensions, small vector helpers, a turtle for bent tubes, places on a
 * body's surface, and the key work (cups on tone holes, rods on posts,
 * arms, touches, guards, the reed mouthpiece) built at one detail level.
 * Pure: no three.js.
 */
import {
    arc,
    bellProfile,
    colorPieces,
    frameAt,
    smoothLathe,
    smoothTube,
    transformPiece,
    PART_BLACK,
    PART_CHROME,
    PART_METAL,
    PART_WOOD,
    type Mat4,
    type Piece,
    type Vec3,
} from "./mesh";
import type {
    Detail,
    InstrumentModel,
    ModelOptions,
    WoodwindModelId,
} from "./model";

/**
 * Overall length along +Z (crown to foot, or mouthpiece tip to the bottom of
 * the bow), the bore at the top of the body (a radius) and the bell's rim
 * diameter: meters.
 */
export const WOODWIND_DIMENSIONS: Record<
    WoodwindModelId,
    { length: number; bore: number; bell: number }
> = {
    piccolo: { length: 0.32, bore: 0.0075, bell: 0.015 },
    flute: { length: 0.67, bore: 0.0095, bell: 0.019 },
    clarinet: { length: 0.66, bore: 0.0145, bell: 0.076 },
    bassClarinet: { length: 1.0, bore: 0.022, bell: 0.15 },
    sopranoSax: { length: 0.65, bore: 0.012, bell: 0.09 },
    altoSax: { length: 0.65, bore: 0.02, bell: 0.12 },
    tenorSax: { length: 0.8, bore: 0.024, bell: 0.14 },
    bariSax: { length: 1.0, bore: 0.032, bell: 0.19 },
};

/** Default colors by part: gold lacquer, chrome, black and cork. The window recolors the lacquer. */
export const WOODWIND_COLORS: Record<number, number> = {
    [PART_METAL]: 0xd9ad4f,
    [PART_CHROME]: 0xd9dde2,
    [PART_BLACK]: 0x141416,
    [PART_WOOD]: 0x5b3a1a,
};

export interface SegmentCounts {
    tube: number;
    keys: number;
    bell: number;
    crook: number;
    /** The near level of detail: small keys, posts, screws and pearls. */
    fine: boolean;
}
export const SEGMENTS: Record<Detail, SegmentCounts> = {
    high: { tube: 20, keys: 12, bell: 48, crook: 10, fine: true },
    low: { tube: 10, keys: 6, bell: 16, crook: 5, fine: false },
};

export const translate = (v: Vec3): Mat4 => [
    1,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    1,
    0,
    v[0],
    v[1],
    v[2],
    1,
];
/** A lathe's +Y turned to +Z, or to −Z for a bell that opens upward. */
export const Y_TO_Z: Mat4 = [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1];
export const Y_TO_NEG_Z: Mat4 = [
    1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1,
];
export const at = (p: Piece, v: Vec3) => transformPiece(p, translate(v));
/** Stretches a piece along its own Z before it is placed (an oval from a round lathe). */
export const stretchZ = (p: Piece, k: number) =>
    transformPiece(p, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, k, 0, 0, 0, 0, 1]);

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const add3 = (a: Vec3, b: Vec3): Vec3 => [
    a[0] + b[0],
    a[1] + b[1],
    a[2] + b[2],
];
export const sub3 = (a: Vec3, b: Vec3): Vec3 => [
    a[0] - b[0],
    a[1] - b[1],
    a[2] - b[2],
];
export const mul3 = (a: Vec3, k: number): Vec3 => [
    a[0] * k,
    a[1] * k,
    a[2] * k,
];
export const unit3 = (a: Vec3): Vec3 => mul3(a, 1 / (Math.hypot(...a) || 1));
export const dist3 = (a: Vec3, b: Vec3) => Math.hypot(...sub3(a, b));
/** A point moved by a transform. */
export const apply = (m: Mat4, v: Vec3): Vec3 => [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
];

/** Points between `a` and `b` at fractions `ts`. */
export function between(a: Vec3, b: Vec3, ts: number[]): Vec3[] {
    return ts.map(
        (k): Vec3 => [
            lerp(a[0], b[0], k),
            lerp(a[1], b[1], k),
            lerp(a[2], b[2], k),
        ],
    );
}

/** Distances from the start along `path`, point by point. */
export function along(path: Vec3[]): number[] {
    const d = [0];
    for (let i = 1; i < path.length; i++)
        d.push(d[i - 1] + dist3(path[i], path[i - 1]));
    return d;
}

/** Radii tapering from `r0` to `r1` by distance along `path`. */
export function taper(path: Vec3[], r0: number, r1: number): number[] {
    const d = along(path);
    const total = d[d.length - 1] || 1;
    return d.map((x) => lerp(r0, r1, x / total));
}

/** The point and unit tangent at fraction `k` of the length of `path`. */
export function pointAlong(path: Vec3[], k: number): { p: Vec3; t: Vec3 } {
    const d = along(path);
    const goal = k * d[d.length - 1];
    let i = 1;
    while (i < path.length - 1 && d[i] < goal) i++;
    const f = (goal - d[i - 1]) / (d[i] - d[i - 1] || 1);
    return {
        p: between(path[i - 1], path[i], [Math.min(Math.max(f, 0), 1)])[0],
        t: unit3(sub3(path[i], path[i - 1])),
    };
}

/**
 * A path drawn by heading and turns in the plane of +Z and +Y: heading 0°
 * is +Z, 90° is +Y. A positive turn swings the heading toward +Y.
 */
export function turtle(start: Vec3, headingDeg: number) {
    const dir = (deg: number): Vec3 => {
        const r = (deg * Math.PI) / 180;
        return [0, Math.sin(r), Math.cos(r)];
    };
    const move = (p: Vec3, d: Vec3, k: number): Vec3 => [
        p[0] + d[0] * k,
        p[1] + d[1] * k,
        p[2] + d[2] * k,
    ];
    let p = start;
    let h = headingDeg;
    const points: Vec3[] = [start];
    const t = {
        points,
        end: () => p,
        heading: () => h,
        line(length: number) {
            p = move(p, dir(h), length);
            points.push(p);
            return t;
        },
        /** Straight on until z reaches `z` (heading 0°). */
        toZ(z: number) {
            return t.line(z - p[2]);
        },
        turn(deg: number, radius: number, steps: number) {
            const side = Math.sign(deg) * 90;
            const center = move(p, dir(h + side), radius);
            for (let i = 1; i <= steps; i++)
                points.push(
                    move(center, dir(h + (deg * i) / steps + side), -radius),
                );
            h += deg;
            p = points[points.length - 1];
            return t;
        },
    };
    return t;
}

/**
 * A straight stretch of an instrument's body: its axis parallel to Z
 * through (`x`, `y`), its outside radius by z. Places on it are given by
 * an angle around the axis, 0° on the keys' side (+Y) and 90° toward +X,
 * and a height off the surface.
 */
export interface Body {
    x: number;
    y: number;
    rAt: (z: number) => number;
    /** The axis's (x, y) at `z`, for a tube that leans a little: a sax's bell. */
    axis?: (z: number) => [number, number];
}

/** A body's axis at `z`. */
export const axisAt = (b: Body, z: number): [number, number] =>
    b.axis ? b.axis(z) : [b.x, b.y];

/** The outward unit direction at `deg` around a body's axis. */
export const radial = (deg: number): Vec3 => {
    const a = (deg * Math.PI) / 180;
    return [Math.sin(a), Math.cos(a), 0];
};
/** The point `off` above a body's surface at `deg`, `z`. */
export const onBody = (b: Body, deg: number, z: number, off = 0): Vec3 => {
    const n = radial(deg);
    const d = b.rAt(z) + off;
    const [x, y] = axisAt(b, z);
    return [x + n[0] * d, y + n[1] * d, z];
};

/**
 * Builders bound to one detail level. `k` scales the wire of the key work
 * (rods, arms, posts) to the instrument's size.
 */
/**
 * A lathe whose profile is written from the top's center out and down the
 * side (a cap, a dome, a plate): `smoothLathe` faces a profile's right-hand
 * side, so the profile is turned end for end to face out.
 */
export const capLathe = (
    profile: [number, number][],
    segments: number,
    part: number,
): Piece => smoothLathe([...profile].reverse(), segments, part);

export function tools(s: SegmentCounts, k = 1) {
    const run = (
        path: Vec3[],
        r: number | number[],
        part = PART_METAL,
        caps = false,
    ) => smoothTube(path, r, s.tube, part, { capStart: caps, capEnd: caps });
    const thin = (a: Vec3, b: Vec3, r: number, part = PART_CHROME) =>
        smoothTube([a, b], r, s.keys, part);
    /** A sleeve around the +Z axis through `p`. */
    const band = (p: Vec3, r: number, width: number, part = PART_CHROME) =>
        smoothTube(
            [
                [p[0], p[1], p[2] - width / 2],
                [p[0], p[1], p[2] + width / 2],
            ],
            r,
            s.tube,
            part,
        );
    /** A piece built about +Y set at `origin`, its +Y along `up` and its +Z toward `forward`. */
    const place = (
        p: Piece,
        origin: Vec3,
        up: Vec3,
        forward: Vec3 = [0, 0, 1],
    ) => transformPiece(p, frameAt(origin, up, forward));
    /** A closed loop of wire: a circle of `radius` about `center`, square to `normal`. */
    const loop = (
        center: Vec3,
        normal: Vec3,
        radius: number,
        wire: number,
        part = PART_CHROME,
        forward: Vec3 = [0, 0, 1],
    ) => {
        const m = frameAt(center, normal, forward);
        const pts = arc([0, 0, 0], radius, 0, 360, s.crook * 2, "y").map((v) =>
            apply(m, v),
        );
        const t0 = unit3(sub3(pts[1], pts[pts.length - 2]));
        return smoothTube(pts, wire, Math.max(4, s.keys - 4), part, {
            capStart: false,
            capEnd: false,
            startTangent: t0,
            endTangent: t0,
        });
    };
    /** A key's touch or plate: an oval `rx` across and `rz` along, `t` thick, lying on `up`. */
    const plate = (
        origin: Vec3,
        up: Vec3,
        forward: Vec3,
        rx: number,
        rz: number,
        t: number,
        part = PART_CHROME,
        sides = s.keys,
    ) =>
        place(
            stretchZ(
                capLathe(
                    [
                        [0, t],
                        [rx * 0.8, t],
                        [rx, t * 0.5],
                        [rx * 0.85, 0],
                        [0, 0],
                    ],
                    sides,
                    part,
                ),
                rz / rx,
            ),
            origin,
            up,
            forward,
        );
    /** A pearl touch: a low dome of radius `r` standing on `up`. */
    const pearl = (origin: Vec3, up: Vec3, r: number) =>
        place(
            capLathe(
                [
                    [0, r * 0.55],
                    [r * 0.5, r * 0.5],
                    [r * 0.85, r * 0.32],
                    [r, 0.0004],
                    [r * 0.9, 0],
                ],
                s.keys,
                PART_CHROME,
            ),
            origin,
            up,
        );
    /**
     * A key cup of radius `r` on its tone hole: a domed lid with the black
     * pad's edge under it, its pad seat at `origin` facing `up`. An open
     * (French) cup has a hole of radius `hole` through its middle, dark
     * where the tone hole shows.
     */
    const lid = (
        origin: Vec3,
        up: Vec3,
        r: number,
        part = PART_METAL,
        hole = 0,
    ) => {
        const h = Math.min(0.004, r * 0.42);
        const rim: [number, number][] = [
            [r * 0.9, h * 0.85],
            [r, h * 0.45],
            [r, 0],
            [r * 0.85, 0],
        ];
        const profile: [number, number][] = hole
            ? [
                  [hole, h * 0.3],
                  [hole, h * 0.8],
                  [hole * 1.35, h],
                  [r * 0.6, h],
                  ...rim,
              ]
            : [[0, h], [r * 0.55, h], ...rim];
        const out = [
            place(
                capLathe(
                    s.fine
                        ? profile
                        : [
                              [hole, h],
                              [r, h],
                              [r, 0],
                          ],
                    s.keys,
                    part,
                ),
                origin,
                up,
            ),
            place(
                capLathe(
                    [
                        [r * 0.85, 0],
                        [r * 0.9, -0.0012],
                    ],
                    s.keys,
                    PART_BLACK,
                ),
                origin,
                up,
            ),
        ];
        if (hole)
            out.push(
                place(
                    capLathe(
                        [
                            [0, h * 0.3],
                            [hole, h * 0.3],
                        ],
                        s.keys,
                        PART_BLACK,
                    ),
                    origin,
                    up,
                ),
            );
        return { pieces: out, top: add3(origin, mul3(unit3(up), h)), h };
    };
    /**
     * A key cup on a body at `deg`, `z`, seated just off the surface on a
     * short chimney (the tone hole) that rises out of the wall, so the cup
     * never floats over the curve; `chimney` is the wall's part.
     */
    const cupOn = (
        b: Body,
        deg: number,
        z: number,
        r: number,
        {
            part = PART_METAL,
            chimney = PART_METAL,
            hole = 0,
            pearl: pearlR = 0,
        }: {
            part?: number;
            chimney?: number;
            hole?: number;
            pearl?: number;
        } = {},
    ) => {
        const R = b.rAt(z);
        const n = radial(deg);
        const seat = onBody(b, deg, z, 0.0008);
        const cr = Math.min(r * 0.8, R * 0.8);
        const depth = Math.sqrt(Math.max(R * R - cr * cr, 0)) * 0.97;
        const c = lid(seat, n, r, part, hole);
        const [ax, ay] = axisAt(b, z);
        const pieces = [
            ...c.pieces,
            smoothTube(
                [[ax + n[0] * depth, ay + n[1] * depth, z], seat],
                cr,
                s.keys,
                chimney,
                { capStart: false },
            ),
        ];
        if (pearlR && s.fine) pieces.push(pearl(c.top, n, pearlR));
        return { pieces, top: c.top, h: c.h };
    };
    /**
     * A key's arm: a wire hugging a body from (`deg0`, `z0`, `off0` off the
     * surface) round to (`deg1`, `z1`, `off1`), so it never cuts the body.
     */
    const arm = (
        b: Body,
        deg0: number,
        z0: number,
        off0: number,
        deg1: number,
        z1: number,
        off1: number,
        part = PART_CHROME,
        r = 0.0011 * k,
    ) => {
        // the short way round
        const to = deg0 + ((((deg1 - deg0 + 180) % 360) + 360) % 360) - 180;
        const steps = Math.max(1, Math.ceil(Math.abs(to - deg0) / 12));
        const pts: Vec3[] = [];
        for (let i = 0; i <= steps; i++) {
            const f = i / steps;
            pts.push(
                onBody(
                    b,
                    lerp(deg0, to, f),
                    lerp(z0, z1, f),
                    lerp(off0, off1, f),
                ),
            );
        }
        return smoothTube(pts, r, Math.max(4, s.keys - 4), part);
    };
    /** A post standing from a body's surface at `deg`, `z` out to `gap`. */
    const post = (
        b: Body,
        deg: number,
        z: number,
        gap: number,
        part = PART_CHROME,
    ) =>
        thin(
            onBody(b, deg, z, 0.0005),
            onBody(b, deg, z, gap),
            0.0018 * k,
            part,
        );
    /**
     * A hinge rod along a body from `z0` to `z1`, `gap` off the surface at
     * `deg`, on posts at its ends (and every `span` between, near detail).
     */
    const rodOn = (
        b: Body,
        deg: number,
        z0: number,
        z1: number,
        gap: number,
        span = 0.12,
        part = PART_CHROME,
    ) => {
        const pieces = [
            thin(
                onBody(b, deg, z0, gap),
                onBody(b, deg, z1, gap),
                0.0014 * k,
                part,
            ),
            post(b, deg, z0 + 0.004 * k, gap, part),
            post(b, deg, z1 - 0.004 * k, gap, part),
        ];
        const n = Math.floor((z1 - z0) / span);
        if (s.fine)
            for (let i = 1; i < n; i++)
                pieces.push(post(b, deg, lerp(z0, z1, i / n), gap, part));
        return pieces;
    };
    /** A hinge sleeve on a rod at `z`: the key's barrel turning on it. */
    const sleeve = (
        b: Body,
        deg: number,
        z: number,
        gap: number,
        length = 0.012,
        part = PART_CHROME,
    ) =>
        thin(
            onBody(b, deg, z - (length / 2) * k, gap),
            onBody(b, deg, z + (length / 2) * k, gap),
            0.0022 * k,
            part,
        );
    /**
     * A guard arching over a big cup at `deg`, `z`: two hoops across
     * and a ridge along their tops, feet set into the body.
     */
    const guard = (
        b: Body,
        deg: number,
        z: number,
        r: number,
        part = PART_METAL,
    ) => {
        const R = b.rAt(z);
        const g = r * 1.3;
        const seat = R + 0.0008;
        const foot = Math.sqrt(Math.max(R * R - g * g, 0)) - 0.001 - seat;
        const rise = 0.0105;
        const m = frameAt(onBody(b, deg, z, 0.0008), radial(deg), [0, 0, 1]);
        const hoop = (dz: number): Vec3[] => {
            const pts: Vec3[] = [[-g, foot, dz]];
            for (let i = 0; i <= 8; i++) {
                const a = (i / 8) * Math.PI;
                pts.push([-g * Math.cos(a), rise * Math.sin(a), dz]);
            }
            pts.push([g, foot, dz]);
            return pts.map((v) => apply(m, v));
        };
        const wire = 0.0012 * k;
        return [
            ...[-0.62, 0.62].map((f) =>
                smoothTube(hoop(f * r), wire, Math.max(4, s.keys - 6), part),
            ),
            smoothTube(
                [apply(m, [0, rise, -0.62 * r]), apply(m, [0, rise, 0.62 * r])],
                wire,
                Math.max(4, s.keys - 6),
                part,
            ),
        ];
    };
    /** A flaring bell along +Z from `base` (or along −Z when `up`). */
    const bell = (
        throat: number,
        rim: number,
        length: number,
        base: Vec3,
        part = PART_METAL,
        up = false,
    ) =>
        at(
            transformPiece(
                smoothLathe(bellProfile(throat, rim, length), s.bell, part),
                up ? Y_TO_NEG_Z : Y_TO_Z,
            ),
            base,
        );
    /**
     * A black reed mouthpiece from its tip at the origin to `end`, radius
     * `r`, with the cane reed on its table (the side toward the lower lip,
     * square to the mouthpiece in the plane of Y and Z) and a chrome
     * ligature whose two screws sit on the reed's side.
     */
    const mouthpiece = (end: Vec3, r: number) => {
        const a = unit3(end);
        const reedSide: Vec3 = [0, -a[2], a[1]];
        const L = Math.hypot(...end);
        const ax = (f: number): Vec3 => mul3(a, f * L);
        const pieces = [
            run(
                between([0, 0, 0], end, [0, 0.15, 0.7, 1]),
                [r * 0.45, r * 0.8, r, r],
                PART_BLACK,
                true,
            ),
            run(between([0, 0, 0], end, [0.45, 0.68]), r * 1.08, PART_CHROME),
        ];
        if (s.fine) {
            pieces.push(
                // the reed on the table, from just short of the tip past the ligature
                plate(
                    add3(ax(0.42), mul3(reedSide, r * 0.78)),
                    reedSide,
                    a,
                    r * 0.6,
                    L * 0.4,
                    0.0012,
                    PART_WOOD,
                ),
            );
            for (const f of [0.5, 0.63]) {
                const c = add3(ax(f), mul3(reedSide, r * 1.08 + 0.0022));
                const across: Vec3 = [1, 0, 0];
                pieces.push(
                    thin(
                        add3(c, mul3(across, -0.0075)),
                        add3(c, mul3(across, 0.0075)),
                        0.0017,
                    ),
                    thin(
                        add3(c, mul3(across, 0.0075)),
                        add3(c, mul3(across, 0.0095)),
                        0.0034,
                    ),
                );
            }
        }
        return pieces;
    };
    return {
        run,
        thin,
        band,
        place,
        loop,
        plate,
        pearl,
        lid,
        cupOn,
        arm,
        post,
        rodOn,
        sleeve,
        guard,
        bell,
        mouthpiece,
        fine: s.fine,
    };
}
export type Tools = ReturnType<typeof tools>;

export function colored(
    id: WoodwindModelId,
    options: ModelOptions,
    pieces: Piece[],
    leftGrip: Vec3,
): InstrumentModel {
    return {
        id,
        options,
        pieces: colorPieces(
            pieces,
            (part) => WOODWIND_COLORS[part] ?? WOODWIND_COLORS[PART_METAL],
        ),
        leftGrip,
        mouthpiece: [0, 0, 0],
    };
}

/**
 * Keys on a body: cups at (z, angle, radius), each hinged by an arm to the
 * rod of `rods` nearest round the body that spans its z; the rods' sleeves
 * where the keys turn on them. `rings` are open tone holes with ring keys.
 */
export function keyWork(
    t: Tools,
    b: Body,
    {
        cups,
        rings = [],
        rods,
        gap,
        part,
        chimney,
        pearls = [],
        rodPart = PART_CHROME,
    }: {
        cups: [number, number, number][];
        rings?: [number, number, number][];
        rods: [number, number, number][];
        gap: number;
        part: number;
        chimney: number;
        pearls?: number[];
        rodPart?: number;
    },
): Piece[] {
    const pieces: Piece[] = [];
    for (const [deg, z0, z1] of rods)
        pieces.push(...t.rodOn(b, deg, z0, z1, gap, 0.12, rodPart));
    const hinge = (deg: number, z: number) => {
        let best: number | null = null;
        for (const [rd, z0, z1] of rods)
            if (
                z >= z0 &&
                z <= z1 &&
                (best === null || Math.abs(rd - deg) < Math.abs(best - deg))
            )
                best = rd;
        return best;
    };
    cups.forEach(([z, deg, r], i) => {
        const cup = t.cupOn(b, deg, z, r, {
            part,
            chimney,
            pearl: pearls.includes(i) ? r * 0.42 : 0,
        });
        pieces.push(...cup.pieces);
        const rd = hinge(deg, z);
        if (t.fine && rd !== null && rd !== deg)
            pieces.push(
                t.arm(b, deg, z, cup.h * 0.6 + 0.0008, rd, z, gap, part),
                t.sleeve(b, rd, z, gap, 0.012, rodPart),
            );
    });
    for (const [z, deg, r] of rings) {
        const n = radial(deg);
        pieces.push(t.loop(onBody(b, deg, z, 0.0005), n, r, 0.0011));
        const rd = hinge(deg + 25, z);
        if (t.fine && rd !== null)
            pieces.push(
                t.arm(b, deg + (r / b.rAt(z)) * 57, z, 0.0008, rd, z, gap),
                t.sleeve(b, rd, z, gap),
            );
    }
    return pieces;
}

/** A closed ring of wire about `center`, square to `normal`: a bell's rolled rim. */
export function ring(
    center: Vec3,
    normal: Vec3,
    radius: number,
    wire: number,
    steps: number,
    sides: number,
    part = PART_METAL,
): Piece {
    const m = frameAt(center, normal, [1, 0, 0]);
    const pts = arc([0, 0, 0], radius, 0, 360, steps, "y").map((v) =>
        apply(m, v),
    );
    const t0 = unit3(sub3(pts[1], pts[pts.length - 2]));
    return smoothTube(pts, wire, sides, part, {
        capStart: false,
        capEnd: false,
        startTangent: t0,
        endTangent: t0,
    });
}

/**
 * A sax bell swept along `path`: a slow cone from `r0` that flares to `r1`
 * over the last of its length, as a sax's bell does. Returns the tube, the
 * rings' centers and radii (to seat keys and braces on it) and the rim's
 * center and axis.
 */
export function flaredTube(
    s: SegmentCounts,
    path: Vec3[],
    r0: number,
    r1: number,
    rings: number,
    {
        cone = 0.42,
        power = 7,
        part = PART_METAL,
    }: { cone?: number; power?: number; part?: number } = {},
) {
    const fs = Array.from(
        { length: rings + 1 },
        (_, i) => 1 - (1 - i / rings) ** 1.5,
    );
    const pts = fs.map((f) => pointAlong(path, f).p);
    const radii = fs.map(
        (f) => r0 + (r1 - r0) * (cone * f + (1 - cone) * f ** power),
    );
    const axis = unit3(sub3(path[path.length - 1], path[path.length - 2]));
    const piece = smoothTube(pts, radii, s.bell, part, {
        capStart: false,
        capEnd: false,
        startTangent: unit3(sub3(path[1], path[0])),
        endTangent: axis,
    });
    return { piece, pts, radii, rim: pts[pts.length - 1], axis };
}
