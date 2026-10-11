// cspell:words lerp
/**
 * The woodwinds' instruments (docs/3d/instruments.md §3, §4), built from
 * numbers in the manner of `brass.ts`; proportions follow the reference
 * pages, nothing is copied from them. Pure: no three.js.
 *
 * Instrument frame: the mouthpiece (the lips, for the flutes) is the
 * origin, +Z runs down the instrument toward its far end and +Y toward the
 * keys. Flute and piccolo: +Z along the tube toward the foot joint.
 * Clarinets and the soprano sax: +Z down the body toward the bell. Alto,
 * tenor and bari sax: +Z down the neck and body toward the bow; the bell
 * then turns back up along −Z, offset toward +X, its flare leaning toward
 * +Y. Held in front with the keys forward, the bell sits on the player's
 * left of the body tube, as front-on photos of marching saxes show. The
 * hold places the right hand; `leftGrip` is the left hand's point on the
 * body.
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
    clarinet: { length: 0.66, bore: 0.017, bell: 0.07 },
    bassClarinet: { length: 1.0, bore: 0.024, bell: 0.18 },
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

interface SegmentCounts {
    tube: number;
    keys: number;
    bell: number;
    crook: number;
    /** The near level of detail: small keys, posts, screws and pearls. */
    fine: boolean;
}
const SEGMENTS: Record<Detail, SegmentCounts> = {
    high: { tube: 24, keys: 12, bell: 48, crook: 10, fine: true },
    low: { tube: 8, keys: 5, bell: 12, crook: 4, fine: false },
};

const translate = (v: Vec3): Mat4 => [
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
const Y_TO_Z: Mat4 = [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1];
const Y_TO_NEG_Z: Mat4 = [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1];
const at = (p: Piece, v: Vec3) => transformPiece(p, translate(v));
/** Stretches a piece along its own Z before it is placed (an oval from a round lathe). */
const stretchZ = (p: Piece, k: number) =>
    transformPiece(p, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, k, 0, 0, 0, 0, 1]);

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const add3 = (a: Vec3, b: Vec3): Vec3 => [
    a[0] + b[0],
    a[1] + b[1],
    a[2] + b[2],
];
const sub3 = (a: Vec3, b: Vec3): Vec3 => [
    a[0] - b[0],
    a[1] - b[1],
    a[2] - b[2],
];
const mul3 = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const unit3 = (a: Vec3): Vec3 => mul3(a, 1 / (Math.hypot(...a) || 1));
const dist3 = (a: Vec3, b: Vec3) => Math.hypot(...sub3(a, b));
/** A point moved by a transform. */
const apply = (m: Mat4, v: Vec3): Vec3 => [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
];

/** Points between `a` and `b` at fractions `ts`. */
function between(a: Vec3, b: Vec3, ts: number[]): Vec3[] {
    return ts.map(
        (k): Vec3 => [
            lerp(a[0], b[0], k),
            lerp(a[1], b[1], k),
            lerp(a[2], b[2], k),
        ],
    );
}

/** Distances from the start along `path`, point by point. */
function along(path: Vec3[]): number[] {
    const d = [0];
    for (let i = 1; i < path.length; i++)
        d.push(d[i - 1] + dist3(path[i], path[i - 1]));
    return d;
}

/** Radii tapering from `r0` to `r1` by distance along `path`. */
function taper(path: Vec3[], r0: number, r1: number): number[] {
    const d = along(path);
    const total = d[d.length - 1] || 1;
    return d.map((x) => lerp(r0, r1, x / total));
}

/** The point and unit tangent at fraction `k` of the length of `path`. */
function pointAlong(path: Vec3[], k: number): { p: Vec3; t: Vec3 } {
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
function turtle(start: Vec3, headingDeg: number) {
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
interface Body {
    x: number;
    y: number;
    rAt: (z: number) => number;
}

/** The outward unit direction at `deg` around a body's axis. */
const radial = (deg: number): Vec3 => {
    const a = (deg * Math.PI) / 180;
    return [Math.sin(a), Math.cos(a), 0];
};
/** The point `off` above a body's surface at `deg`, `z`. */
const onBody = (b: Body, deg: number, z: number, off = 0): Vec3 => {
    const n = radial(deg);
    const d = b.rAt(z) + off;
    return [b.x + n[0] * d, b.y + n[1] * d, z];
};

/**
 * Builders bound to one detail level. `k` scales the wire of the key work
 * (rods, arms, posts) to the instrument's size.
 */
function tools(s: SegmentCounts, k = 1) {
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
    ) =>
        place(
            stretchZ(
                smoothLathe(
                    [
                        [0, t],
                        [rx * 0.8, t],
                        [rx, t * 0.5],
                        [rx * 0.85, 0],
                        [0, 0],
                    ],
                    s.keys,
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
            smoothLathe(
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
                smoothLathe(
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
                smoothLathe(
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
                    smoothLathe(
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
        const pieces = [
            ...c.pieces,
            smoothTube(
                [[b.x + n[0] * depth, b.y + n[1] * depth, z], seat],
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
    ) => {
        const pieces = [
            thin(onBody(b, deg, z0, gap), onBody(b, deg, z1, gap), 0.0014 * k),
            post(b, deg, z0 + 0.004 * k, gap),
            post(b, deg, z1 - 0.004 * k, gap),
        ];
        const n = Math.floor((z1 - z0) / span);
        if (s.fine)
            for (let i = 1; i < n; i++)
                pieces.push(post(b, deg, lerp(z0, z1, i / n), gap));
        return pieces;
    };
    /** A hinge sleeve on a rod at `z`: the key's barrel turning on it. */
    const sleeve = (
        b: Body,
        deg: number,
        z: number,
        gap: number,
        length = 0.012,
    ) =>
        thin(
            onBody(b, deg, z - (length / 2) * k, gap),
            onBody(b, deg, z + (length / 2) * k, gap),
            0.0022 * k,
        );
    /**
     * A guard arching over a big cup at `deg`, `z`: three hoops across
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
        const rise = 0.004 + 0.006 + 0.002;
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
        const wire = 0.0014 * k;
        return [
            ...[-0.7, 0, 0.7].map((f) =>
                smoothTube(hoop(f * r), wire, Math.max(4, s.keys - 4), part),
            ),
            smoothTube(
                [apply(m, [0, rise, -0.7 * r]), apply(m, [0, rise, 0.7 * r])],
                wire,
                Math.max(4, s.keys - 4),
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
type Tools = ReturnType<typeof tools>;

function colored(
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
 * A flute's body keys from the head joint down: the distance below the
 * tenon on a concert flute's body (piccolos scale it), the angle round the
 * tube, the cup's size against the main cups, and whether it is an
 * open-hole (French) cup. C#, C, B, A and G under the left hand, G# and
 * the closed G, the two trill keys, then F, F# and the right hand's E and D.
 */
const FLUTE_KEYS: [number, number, number, boolean][] = [
    [0.035, -20, 0.75, false],
    [0.07, 0, 1, false],
    [0.088, 0, 1, false],
    [0.105, 0, 1, true],
    [0.14, 0, 1, true],
    [0.165, -42, 0.85, false],
    [0.19, 0, 1, false],
    [0.207, -50, 0.65, false],
    [0.224, -50, 0.65, false],
    [0.247, 0, 1, true],
    [0.272, 0, 1, false],
    [0.297, 0, 1, true],
    [0.325, 0, 1, true],
];

/**
 * Flute and piccolo: a straight silver tube from the crown behind the
 * lips to the foot, the lip plate on the player's side (−Y), the keys on
 * top (+Y) hinged on a long rod toward +X, the trill keys and the G# turned
 * toward −X on their own rod, the thumb keys underneath. The flute's foot
 * joint carries its own rod, three cups and the pinky's rollers; the
 * piccolo has closed cups and no foot.
 */
function flute(
    id: "piccolo" | "flute",
    detail: Detail,
    options: ModelOptions,
): InstrumentModel {
    const d = WOODWIND_DIMENSIONS[id];
    const s = SEGMENTS[detail];
    const pic = id === "piccolo";
    const t = tools(s, pic ? 0.75 : 1);
    const r = d.bore;
    const crown = pic ? -0.03 : -0.045;
    const end = crown + d.length;
    const headEnd = crown + (pic ? 0.11 : 0.21);
    const footStart = pic ? end : end - 0.12;
    const first = headEnd + (pic ? 0.03 : 0.04);
    const tubeBody: Body = { x: 0, y: 0, rAt: () => r };
    const scale = pic ? 0.6 : 1;
    const cr = pic ? 0.0047 : 0.0085;
    const rodDeg = 70;
    const rodGap = pic ? 0.0045 : 0.0058;
    const plateW = pic ? 0.0085 : 0.0115;
    const plateL = pic ? 0.011 : 0.0155;
    const plateY = -(r + 0.0022);
    const crownCap = smoothLathe(
        [
            [r * 1.1, -0.002],
            [r * 1.12, 0.004],
            [r * 1.02, 0.0055],
            [r * 0.65, 0.0075],
            [r * 0.35, 0.009],
            [r * 0.42, 0.0105],
            [r * 0.25, 0.0122],
            [0, 0.013],
        ],
        s.tube,
        PART_CHROME,
    );
    const pieces: Piece[] = [
        t.run(
            [
                [0, 0, crown],
                [0, 0, 0],
                [0, 0, headEnd],
            ],
            [r * 0.88, r * 0.94, r],
            PART_CHROME,
        ),
        t.run(
            [
                [0, 0, headEnd],
                [0, 0, footStart],
            ],
            r,
            PART_CHROME,
            pic,
        ),
        // the crown, its finial behind the lips
        at(transformPiece(crownCap, Y_TO_NEG_Z), [0, 0, crown]),
        // the tenon ring at the head joint
        t.band([0, 0, headEnd], r * 1.12, 0.014),
        t.band([0, 0, end - 0.004], r * 1.08, 0.008),
        // the lip plate on its riser, an oval stretched along the tube, and its embouchure hole
        t.plate([0, plateY, 0], [0, -1, 0], [0, 0, 1], plateW, plateL, 0.0012),
        t.plate(
            [0, plateY - 0.0012, 0],
            [0, -1, 0],
            [0, 0, 1],
            plateW * 0.4,
            plateL * 0.37,
            0.0002,
            PART_BLACK,
        ),
        ...t.rodOn(
            tubeBody,
            rodDeg,
            headEnd + 0.025 * scale,
            (pic ? end - 0.012 : footStart) - 0.006,
            rodGap,
        ),
    ];
    pieces.push(
        // the lip plate's riser: an oval chimney out of the tube (its +Z turned to −Y, stretched along Z)
        transformPiece(
            smoothTube(
                [
                    [0, 0, r * 0.6],
                    [0, 0, -plateY],
                ],
                plateW * 0.5,
                s.keys,
                PART_CHROME,
                { capStart: false },
            ),
            [1, 0, 0, 0, 0, 0, 1.3, 0, 0, -1, 0, 0, 0, 0, 0, 1],
        ),
    );
    // the body keys, each hinged on the main rod or the trill keys' rod
    const sideRod: [number, number] = [
        headEnd + 0.15 * scale,
        headEnd + 0.24 * scale,
    ];
    for (const [dz, deg, size, open] of FLUTE_KEYS) {
        const z = headEnd + dz * scale;
        const r0 = cr * size;
        if (!s.fine && size < 0.75) continue;
        const cup = t.cupOn(tubeBody, deg, z, r0, {
            part: PART_CHROME,
            chimney: PART_CHROME,
            hole: open && !pic ? r0 * 0.32 : 0,
        });
        pieces.push(...cup.pieces);
        if (!s.fine) continue;
        const toSide = deg < -30;
        const hinge = toSide ? -rodDeg : rodDeg;
        const lift = cup.h * 0.6 + 0.0008;
        pieces.push(
            t.arm(tubeBody, deg, z, lift, hinge, z, rodGap),
            t.sleeve(tubeBody, hinge, z, rodGap),
        );
        if (open && !pic) {
            // the French key's pointed arm across the cup to the ring round the hole
            const lid0 = onBody(tubeBody, deg, z, 0.0008 + cup.h + 0.0003);
            pieces.push(
                smoothTube(
                    [
                        add3(lid0, [r0 * 1.02, 0, 0]),
                        add3(lid0, [r0 * 0.6, 0, 0]),
                        add3(lid0, [r0 * 0.45, 0, 0]),
                    ],
                    [0.0011 * scale + 0.0002, 0.0008, 0.0003],
                    s.keys - 4,
                    PART_CHROME,
                ),
            );
        }
    }
    // the trill keys' rod and the thumb keys' rod underneath, long lines even from far off
    const th0 = headEnd + 0.06 * scale;
    const th1 = headEnd + 0.105 * scale;
    pieces.push(...t.rodOn(tubeBody, 150, th0, th1, rodGap));
    pieces.push(...t.rodOn(tubeBody, -rodDeg, sideRod[0], sideRod[1], rodGap));
    if (s.fine) {
        // the G# lever and the trill keys' touches reach round toward −X
        for (const dz of [0.165, 0.207, 0.224]) {
            const z = headEnd + dz * scale + 0.006 * scale;
            pieces.push(
                t.plate(
                    onBody(tubeBody, -100, z, rodGap + 0.001),
                    radial(-100),
                    [0, 0, 1],
                    0.0028 * scale,
                    0.0055 * scale,
                    0.0012,
                ),
                t.arm(tubeBody, -rodDeg, z, rodGap, -100, z, rodGap + 0.001),
            );
        }
        // the thumb's B and Bb keys underneath, on their rod
        for (const [deg, dz] of [
            [180, 0.075],
            [-158, 0.09],
        ]) {
            const z = headEnd + dz * scale;
            pieces.push(
                t.plate(
                    onBody(tubeBody, deg, z, rodGap - 0.001),
                    radial(deg),
                    [0, 0, 1],
                    0.0032 * scale,
                    0.0075 * scale,
                    0.0013,
                ),
                t.arm(tubeBody, 150, z, rodGap, deg, z, rodGap - 0.0005),
            );
        }
    }
    if (!pic) {
        // the foot joint: its tube, tenon ring, rod, three cups and the rollers
        pieces.push(
            t.run(
                [
                    [0, 0, footStart],
                    [0, 0, end],
                ],
                r,
                PART_CHROME,
                true,
            ),
            t.band([0, 0, footStart], r * 1.12, 0.014),
            ...t.rodOn(
                tubeBody,
                rodDeg,
                footStart + 0.009,
                end - 0.006,
                rodGap,
            ),
        );
        for (const [dz, deg, size] of [
            [0.024, -35, 0.85],
            [0.06, 0, 1],
            [0.095, 0, 1],
        ]) {
            const z = footStart + dz;
            const cup = t.cupOn(tubeBody, deg, z, cr * size, {
                part: PART_CHROME,
                chimney: PART_CHROME,
            });
            pieces.push(...cup.pieces);
            if (s.fine)
                pieces.push(
                    t.arm(
                        tubeBody,
                        deg,
                        z,
                        cup.h * 0.6 + 0.0008,
                        rodDeg,
                        z,
                        rodGap,
                    ),
                    t.sleeve(tubeBody, rodDeg, z, rodGap),
                );
        }
        if (s.fine) {
            // the D# touch and the C# and C rollers under the right pinky
            const z0 = footStart + 0.013;
            pieces.push(
                t.plate(
                    onBody(tubeBody, -95, z0, 0.004),
                    radial(-95),
                    [0, 0, 1],
                    0.003,
                    0.0065,
                    0.0012,
                ),
                t.post(tubeBody, -95, z0, 0.004),
                t.arm(
                    tubeBody,
                    -95,
                    z0 + 0.004,
                    0.0045,
                    -35,
                    footStart + 0.024,
                    0.003,
                ),
            );
            for (const dz of [0.025, 0.034]) {
                const z = footStart + dz;
                const c = onBody(tubeBody, -105, z, 0.0058);
                const across = mul3(radial(-15), 0.0045);
                pieces.push(
                    smoothTube(
                        [sub3(c, across), add3(c, across)],
                        0.0021,
                        s.keys,
                        PART_CHROME,
                    ),
                    t.post(tubeBody, -105, z, 0.0042),
                );
            }
        }
    }
    return colored(id, options, pieces, [0, 0, first + 0.03]);
}

/**
 * Keys on a body: cups at (z, angle, radius), each hinged by an arm to the
 * rod of `rods` nearest round the body that spans its z; the rods' sleeves
 * where the keys turn on them. `rings` are open tone holes with ring keys.
 */
function keyWork(
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
    }: {
        cups: [number, number, number][];
        rings?: [number, number, number][];
        rods: [number, number, number][];
        gap: number;
        part: number;
        chimney: number;
        pearls?: number[];
    },
): Piece[] {
    const pieces: Piece[] = [];
    for (const [deg, z0, z1] of rods)
        pieces.push(...t.rodOn(b, deg, z0, z1, gap));
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
                t.sleeve(b, rd, z, gap),
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

/**
 * The clarinet: a black mouthpiece with its reed and two-screw ligature,
 * the barrel, upper and lower joints with chrome tenon rings, and a black
 * bell with a chrome rim. Ring keys round the open tone holes on the front
 * (+Y), chrome cups and rods round the sides, the thumb ring and the
 * register key behind (−Y), the trill keys toward −X, the left pinky's
 * long rod keys down the +X side and the thumb rest under the lower joint.
 */
function clarinet(detail: Detail, options: ModelOptions): InstrumentModel {
    const d = WOODWIND_DIMENSIONS.clarinet;
    const s = SEGMENTS[detail];
    const t = tools(s);
    const r = d.bore;
    const bellStart = d.length - 0.08;
    // the joints' radii: the upper narrowing from the barrel, the lower widening to the bell
    const bodyR = (z: number) =>
        z < 0.38
            ? lerp(r * 1.02, r, (z - 0.15) / 0.23)
            : lerp(r, r * 1.06, (z - 0.38) / (bellStart - 0.38));
    const b: Body = { x: 0, y: 0, rAt: bodyR };
    const gap = 0.0045;
    const pieces: Piece[] = [
        ...t.mouthpiece([0, 0, 0.09], 0.0135),
        // barrel, upper joint, lower joint, bell and its chrome rim
        t.run(
            between([0, 0, 0.09], [0, 0, 0.15], [0, 0.5, 1]),
            [r * 1.12, r * 1.16, r * 1.12],
            PART_BLACK,
        ),
        t.run(
            between([0, 0, 0.15], [0, 0, 0.38], [0, 1]),
            [r * 1.02, r],
            PART_BLACK,
        ),
        t.run(
            between([0, 0, 0.38], [0, 0, bellStart], [0, 1]),
            [r, r * 1.06],
            PART_BLACK,
        ),
        t.bell(r * 1.06, d.bell / 2, 0.08, [0, 0, bellStart], PART_BLACK),
        t.run(
            arc([0, 0, d.length], d.bell / 2, 0, 360, s.crook * 3, "z"),
            0.002,
            PART_CHROME,
        ),
        ...[0.09, 0.15, 0.38, bellStart].map((z) =>
            t.band([0, 0, z], r * 1.16, 0.008),
        ),
        ...keyWork(t, b, {
            // the throat Ab, C#/G#, the trill keys' cups, the slivers and the four low cups
            cups: [
                [0.168, -35, 0.0055],
                [0.3, 35, 0.0065],
                ...(s.fine
                    ? ([
                          [0.208, -58, 0.0045],
                          [0.224, -58, 0.0045],
                          [0.24, -58, 0.0045],
                          [0.256, -58, 0.0045],
                          [0.462, -38, 0.0068],
                          [0.497, -38, 0.0068],
                      ] as [number, number, number][])
                    : []),
                [0.532, 38, 0.0078],
                [0.548, -18, 0.0082],
                [0.563, 22, 0.0085],
            ],
            rings: [
                [0.215, 0, 0.0068],
                [0.25, 0, 0.0068],
                [0.285, 0, 0.0068],
                [0.44, 0, 0.0068],
                [0.48, 0, 0.0068],
                [0.52, 0, 0.0068],
            ],
            rods: [
                [50, 0.16, 0.372],
                [-88, 0.2, 0.27],
                [50, 0.39, 0.53],
                [-62, 0.45, 0.572],
                [75, 0.33, 0.372],
                [75, 0.388, 0.572],
            ],
            gap,
            part: PART_CHROME,
            chimney: PART_BLACK,
        }),
    ];
    if (s.fine) {
        // the throat A key's touch on top, the bridge key across the middle tenon
        pieces.push(
            t.plate(
                onBody(b, 15, 0.162, 0.003),
                radial(15),
                [0, 0, 1],
                0.004,
                0.008,
                0.0013,
            ),
            t.arm(b, 15, 0.166, 0.003, 50, 0.166, gap),
            t.plate(
                onBody(b, 28, 0.374, 0.0045),
                radial(28),
                [0, 0, 1],
                0.0035,
                0.007,
                0.0012,
            ),
            t.plate(
                onBody(b, 28, 0.386, 0.0035),
                radial(28),
                [0, 0, 1],
                0.0035,
                0.007,
                0.0012,
            ),
            t.arm(b, 28, 0.372, 0.0045, 50, 0.366, gap),
            t.arm(b, 28, 0.388, 0.0035, 50, 0.395, gap),
        );
        // the trill keys' touches beside the right hand's knuckles
        for (const z of [0.216, 0.232, 0.248, 0.264])
            pieces.push(
                t.plate(
                    onBody(b, -75, z, 0.006),
                    radial(-75),
                    [0, 0, 1],
                    0.0028,
                    0.0065,
                    0.0012,
                ),
                t.arm(b, -88, z, gap, -75, z, 0.006),
            );
        // the left pinky's touches at the foot of the upper joint, the right pinky's on the lower
        for (const [deg, z, rd] of [
            [92, 0.338, 75],
            [92, 0.354, 75],
            [-78, 0.538, -62],
            [-78, 0.554, -62],
        ])
            pieces.push(
                t.plate(
                    onBody(b, deg, z, 0.006),
                    radial(deg),
                    [0, 0, 1],
                    0.0032,
                    0.0075,
                    0.0013,
                ),
                t.arm(b, rd, z, gap, deg, z, 0.006),
                t.sleeve(b, rd, z, gap),
            );
        // the thumb ring behind and the register key: its pad up the back, its touch above the ring
        pieces.push(
            t.loop(onBody(b, 180, 0.212, 0.0005), [0, -1, 0], 0.0068, 0.0011),
            ...t.rodOn(b, -128, 0.172, 0.205, gap),
            ...t.cupOn(b, -150, 0.176, 0.005, {
                part: PART_CHROME,
                chimney: PART_BLACK,
            }).pieces,
            t.arm(b, -150, 0.176, 0.003, -128, 0.18, gap),
            t.plate(
                onBody(b, -165, 0.2, 0.0035),
                radial(-165),
                [0, 0, 1],
                0.003,
                0.0065,
                0.0012,
            ),
            t.arm(b, -165, 0.196, 0.0035, -128, 0.19, gap),
        );
        // the thumb rest: a saddle on two posts under the lower joint, its lip toward the bell
        pieces.push(
            t.post(b, 180, 0.414, 0.006),
            t.post(b, 180, 0.428, 0.006),
            t.plate(
                onBody(b, 180, 0.421, 0.006),
                [0, -1, 0],
                [0, 0, 1],
                0.0065,
                0.012,
                0.0015,
            ),
            t.thin(
                onBody(b, 180, 0.432, 0.007),
                onBody(b, 180, 0.434, 0.015),
                0.0016,
            ),
        );
    } else {
        pieces.push(t.thin([0, -r, 0.42], [0, -r - 0.012, 0.42], 0.004));
    }
    return colored("clarinet", options, pieces, [0, 0, 0.24]);
}

/**
 * The bass clarinet: a chrome crook to a long black body in two joints,
 * then a chrome upturned bell and a peg. Covered cups up the front, rods
 * down both sides, the neck's register key, the thumb key and thumb rest
 * behind, and big low cups toward the crook.
 */
function bassClarinet(detail: Detail, options: ModelOptions): InstrumentModel {
    const d = WOODWIND_DIMENSIONS.bassClarinet;
    const s = SEGMENTS[detail];
    const t = tools(s, 1.25);
    const r = d.bore;
    const mpEnd = turtle([0, 0, 0], 55).line(0.085).end();
    const neck = turtle(mpEnd, 55).line(0.04).turn(-55, 0.05, s.crook).toZ(0.2);
    const yb = neck.end()[1];
    const bodyEnd = 0.87;
    const bodyR = (z: number) =>
        z < 0.52 ? r : lerp(r, r * 1.08, (z - 0.52) / (bodyEnd - 0.52));
    const b: Body = { x: 0, y: yb, rAt: bodyR };
    const gap = 0.006;
    // the bell's crook: a U toward the front (+Y), opening upward
    const bow = turtle([0, yb, bodyEnd], 0)
        .turn(180, 0.06, s.crook * 2)
        .line(0.04);
    const cups: [number, number, number][] = [
        // left hand: covered cups for the fingers, the throat and trill keys beside them
        [0.29, 0, 0.012],
        [0.33, 0, 0.012],
        [0.37, 0, 0.012],
        [0.25, -30, 0.009],
        [0.31, 40, 0.009],
        [0.42, 35, 0.011],
        // right hand
        [0.6, 0, 0.013],
        [0.645, 0, 0.013],
        [0.69, 0, 0.013],
        [0.57, -40, 0.01],
        [0.72, 40, 0.012],
        // the low cups toward the crook
        [0.77, -30, 0.015],
        [0.8, 25, 0.016],
        [0.83, -10, 0.016],
    ];
    if (s.fine)
        cups.push(
            [0.268, -55, 0.007],
            [0.285, -55, 0.007],
            [0.302, -55, 0.007],
            [0.46, -40, 0.01],
            [0.665, -45, 0.01],
        );
    const pieces: Piece[] = [
        ...t.mouthpiece(mpEnd, 0.016),
        t.run(neck.points, taper(neck.points, 0.012, 0.016), PART_CHROME),
        t.run(between([0, yb, 0.2], [0, yb, 0.52], [0, 1]), r, PART_BLACK),
        t.run(
            between([0, yb, 0.52], [0, yb, bodyEnd], [0, 1]),
            [r, r * 1.08],
            PART_BLACK,
        ),
        ...[0.2, 0.52, bodyEnd].map((z) => t.band([0, yb, z], r * 1.15, 0.012)),
        t.run(bow.points, taper(bow.points, r * 1.1, r * 1.5), PART_CHROME),
        t.bell(r * 1.5, d.bell / 2, 0.13, bow.end(), PART_CHROME, true),
        // the peg under the crook
        t.thin(
            [0, yb + 0.06, bodyEnd + 0.06],
            [0, yb + 0.06, d.length - 0.002],
            0.004,
        ),
        ...keyWork(t, b, {
            cups,
            rods: [
                [55, 0.23, 0.5],
                [-60, 0.24, 0.5],
                [55, 0.55, 0.85],
                [-60, 0.56, 0.85],
                [95, 0.36, 0.84],
            ],
            gap,
            part: PART_CHROME,
            chimney: PART_BLACK,
        }),
    ];
    if (s.fine) {
        const nk = pointAlong(neck.points, 0.3);
        const up: Vec3 = [0, nk.t[2], -nk.t[1]];
        const nr = lerp(0.012, 0.016, 0.3);
        const nk2 = pointAlong(neck.points, 0.85);
        const up2: Vec3 = [0, nk2.t[2], -nk2.t[1]];
        pieces.push(
            // the bell's rim bead and the peg's socket
            t.loop(
                add3(bow.end(), [0, 0, -0.13]),
                [0, 0, -1],
                d.bell / 2,
                0.0025,
            ),
            t.band([0, yb + 0.06, bodyEnd + 0.075], 0.007, 0.02),
            // the neck's register key: its pad on top of the crook, the arm down to the body's lever
            ...t.lid(add3(nk.p, mul3(up, nr + 0.0008)), up, 0.0065, PART_CHROME)
                .pieces,
            t.thin(
                add3(nk.p, mul3(up, nr * 0.6)),
                add3(nk.p, mul3(up, nr + 0.001)),
                0.0045,
                PART_CHROME,
            ),
            smoothTube(
                [
                    add3(nk.p, mul3(up, nr + 0.003)),
                    add3(pointAlong(neck.points, 0.55).p, mul3(up, nr + 0.004)),
                    add3(nk2.p, mul3(up2, nr + 0.004)),
                    onBody(b, 0, 0.215, gap),
                ],
                0.0014,
                s.keys - 4,
                PART_CHROME,
            ),
            t.post(b, 0, 0.215, gap),
            // the thumb key and the register touch behind the upper joint
            t.loop(onBody(b, 180, 0.27, 0.0005), [0, -1, 0], 0.008, 0.0013),
            ...t.rodOn(b, -130, 0.24, 0.29, gap),
            t.plate(
                onBody(b, -165, 0.255, 0.004),
                radial(-165),
                [0, 0, 1],
                0.004,
                0.009,
                0.0014,
            ),
            t.arm(b, -165, 0.255, 0.004, -130, 0.255, gap),
            // the thumb rest under the lower joint
            t.post(b, 180, 0.555, 0.008),
            t.post(b, 180, 0.575, 0.008),
            t.plate(
                onBody(b, 180, 0.565, 0.008),
                [0, -1, 0],
                [0, 0, 1],
                0.008,
                0.015,
                0.002,
            ),
        );
        // the pinkies' touches on both sides
        for (const [deg, z, rd] of [
            [100, 0.47, 95],
            [100, 0.49, 95],
            [-82, 0.74, -60],
            [-82, 0.76, -60],
        ])
            pieces.push(
                t.plate(
                    onBody(b, deg, z, 0.009),
                    radial(deg),
                    [0, 0, 1],
                    0.004,
                    0.009,
                    0.0015,
                ),
                t.arm(b, rd, z, gap, deg, z, 0.009),
            );
    }
    return colored("bassClarinet", options, pieces, [0, yb, 0.35]);
}

/**
 * A sax's key work on its body from `top` to `bot` (the bow, or the
 * soprano's bell): the two stacks of pad cups up the front with pearls on
 * the six main keys, the palm keys at the top of the left (+X) side, the
 * table keys for the left pinky behind them, the side keys for the right
 * hand on −X, the low Eb and C cups under their guards, the long rods with
 * their posts, and behind the body (−Y) the octave key's thumb touch, the
 * left thumb rest, the strap ring and the right thumb hook. `cs(k)` is a
 * main cup's radius at fraction `k` of the way down.
 */
function saxKeys(
    t: Tools,
    b: Body,
    top: number,
    bot: number,
    cs: (k: number) => number,
    gap: number,
): Piece[] {
    const z = (k: number) => lerp(top, bot, k);
    const keys: [number, number, number, boolean][] = [
        // left hand: C, B, the bis, A, G, then G#
        [0.13, -30, 0.7, false],
        [0.2, 0, 1, true],
        [0.24, 38, 0.55, false],
        [0.28, 0, 1, true],
        [0.36, 0, 1, true],
        [0.42, 55, 0.85, false],
        // right hand: F#, the side keys' cups, F, E and D
        [0.47, 40, 0.85, false],
        [0.48, -62, 0.6, false],
        [0.535, -62, 0.7, false],
        [0.59, -62, 0.75, false],
        [0.53, 0, 1, true],
        [0.62, 0, 1, true],
        [0.71, 0, 1, true],
        // the low Eb and C under the guards
        [0.84, -55, 1.05, false],
        [0.9, 18, 1.12, false],
        // the palm keys: D, Eb and F
        [0.03, 105, 0.5, false],
        [0.07, 105, 0.5, false],
        [0.11, 105, 0.5, false],
    ];
    const used = keys.filter(([, , size]) => t.fine || size >= 0.85);
    const pieces = keyWork(t, b, {
        cups: used.map(([k, deg, size]): [number, number, number] => [
            z(k),
            deg,
            cs(k) * size,
        ]),
        pearls: used.flatMap(([, , , pearl], i) => (pearl ? [i] : [])),
        rods: [
            [45, z(0.06), z(0.4)],
            [-45, z(0.46), z(0.8)],
            [100, z(0.36), z(0.97)],
            [-100, z(0.44), z(0.95)],
            ...(t.fine
                ? ([[92, z(0), z(0.15)]] as [number, number, number][])
                : []),
        ],
        gap,
        part: PART_METAL,
        chimney: PART_METAL,
    });
    if (!t.fine) return pieces;
    const sc = cs(0.5) / 0.0135;
    const touch = (
        deg: number,
        k: number,
        off: number,
        rx: number,
        rz: number,
        rodDeg: number,
    ) => [
        t.plate(
            onBody(b, deg, z(k), off),
            radial(deg),
            [0, 0, 1],
            rx * sc,
            rz * sc,
            0.0016,
            PART_METAL,
        ),
        t.arm(b, rodDeg, z(k), gap, deg, z(k), off, PART_METAL),
    ];
    // the palm keys' touches, the table keys, the side keys and the front F
    for (const k of [0.035, 0.075, 0.115])
        pieces.push(...touch(72, k, 0.009, 0.0045, 0.009, 92));
    for (const k of [0.38, 0.41, 0.44])
        pieces.push(...touch(124, k, 0.007, 0.005, 0.008, 100));
    for (const k of [0.47, 0.52, 0.58])
        pieces.push(...touch(-78, k, 0.01, 0.004, 0.011, -100));
    pieces.push(...touch(10, 0.14, 0.007, 0.004, 0.008, 45));
    // the guards over the low Eb and C
    pieces.push(
        ...t.guard(b, -55, z(0.84), cs(0.84) * 1.05),
        ...t.guard(b, 18, z(0.9), cs(0.9) * 1.12),
    );
    // behind: the octave key's rod and thumb touch, the left thumb rest, the strap ring, the right thumb hook
    const back = (k: number, off: number) => onBody(b, 180, z(k), off);
    pieces.push(
        ...t.rodOn(b, 180, z(0) + 0.008, z(0.12), gap),
        t.plate(
            back(0.11, 0.005),
            [0, -1, 0],
            [0, 0, 1],
            0.006 * sc,
            0.009 * sc,
            0.0016,
            PART_METAL,
        ),
        t.post(b, 172, z(0.18), 0.004, PART_METAL),
        t.plate(
            onBody(b, 172, z(0.18), 0.004),
            radial(172),
            [0, 0, 1],
            0.0065 * sc,
            0.0065 * sc,
            0.0025,
            PART_BLACK,
        ),
        t.post(b, 180, z(0.3), 0.004, PART_METAL),
        t.loop(back(0.3, 0.004 + 0.005 * sc), [1, 0, 0], 0.005 * sc, 0.0013),
        t.plate(
            back(0.62, 0.0005),
            [0, -1, 0],
            [0, 0, 1],
            0.005 * sc,
            0.009 * sc,
            0.0015,
            PART_METAL,
        ),
        smoothTube(
            [
                back(0.62, 0.001),
                back(0.62, 0.012 * sc),
                onBody(b, 180, z(0.62) + 0.008 * sc, 0.015 * sc),
                onBody(b, 180, z(0.62) + 0.014 * sc, 0.011 * sc),
            ],
            0.0028 * sc,
            t.fine ? 10 : 6,
            PART_BLACK,
        ),
    );
    return pieces;
}

/** The straight soprano: a conical brass tube from the mouthpiece to a small bell. */
function sopranoSax(detail: Detail, options: ModelOptions): InstrumentModel {
    const d = WOODWIND_DIMENSIONS.sopranoSax;
    const s = SEGMENTS[detail];
    const t = tools(s);
    const flareAt = d.length - 0.1;
    const body = between(
        [0, 0, 0.06],
        [0, 0, flareAt],
        [0, 0.25, 0.5, 0.75, 1],
    );
    const rAt = (z: number) => lerp(0.012, 0.03, (z - 0.06) / (flareAt - 0.06));
    const b: Body = { x: 0, y: 0, rAt };
    const gap = 0.0045;
    const cs = (k: number) => lerp(0.0085, 0.0125, k);
    const pieces: Piece[] = [
        ...t.mouthpiece([0, 0, 0.06], 0.012),
        t.run(body, taper(body, 0.012, 0.03), PART_METAL),
        t.bell(0.03, d.bell / 2, 0.1, [0, 0, flareAt], PART_METAL),
        // the cork-lined top and its ring, where the mouthpiece goes on
        t.band([0, 0, 0.066], 0.0135, 0.008, PART_METAL),
        ...saxKeys(t, b, 0.09, flareAt - 0.035, cs, gap),
        // the low B and Bb by the bell
        ...keyWork(t, b, {
            cups: [
                [flareAt - 0.014, 40, 0.0125],
                [flareAt - 0.014, -32, 0.012],
            ],
            rods: [],
            gap,
            part: PART_METAL,
            chimney: PART_METAL,
        }),
    ];
    if (s.fine) {
        // the octave key's pad near the top, on the back rod's end
        const c = t.cupOn(b, 150, 0.084, 0.004);
        pieces.push(
            ...c.pieces,
            t.arm(
                b,
                150,
                0.084,
                c.h * 0.6 + 0.0008,
                180,
                0.092,
                gap,
                PART_METAL,
            ),
            t.arm(
                b,
                100,
                flareAt - 0.034,
                gap,
                62,
                flareAt - 0.014,
                0.003,
                PART_METAL,
            ),
            t.arm(
                b,
                -100,
                flareAt - 0.034,
                gap,
                -50,
                flareAt - 0.014,
                0.003,
                PART_METAL,
            ),
        );
    }
    return colored("sopranoSax", options, pieces, [0, 0, 0.18]);
}

interface SaxShape {
    /** The mouthpiece's heading from +Z toward +Y, and its length. */
    mpHeading: number;
    mpLength: number;
    /** The neck: a straight run, then turns as [degrees, radius] down to +Z. */
    neckLine: number;
    neck: [number, number][];
    /** Bari only: the drop below the neck, then two U turns (radii) with a rise between. */
    loop?: { drop: number; radii: [number, number]; rise: number };
    bodyTop: number;
    /** Body radius at the top and at the bow. */
    rTop: number;
    rBow: number;
    /** Bow width between the body's and the bell's axes. */
    bowWidth: number;
    /** The bell's straight rise above the bow, then its flare. */
    bellRise: number;
    flare: number;
    keys: number;
}

export const SAX_SHAPES: Record<"altoSax" | "tenorSax" | "bariSax", SaxShape> =
    {
        altoSax: {
            mpHeading: 55,
            mpLength: 0.07,
            neckLine: 0.02,
            neck: [[-55, 0.08]],
            bodyTop: 0.2,
            rTop: 0.02,
            rBow: 0.045,
            bowWidth: 0.11,
            bellRise: 0.16,
            flare: 0.14,
            keys: 18,
        },
        tenorSax: {
            mpHeading: 50,
            mpLength: 0.085,
            neckLine: 0.02,
            // the tenor's neck rises a little before it bends down: an S
            neck: [
                [25, 0.07],
                [-75, 0.1],
            ],
            bodyTop: 0.25,
            rTop: 0.024,
            rBow: 0.052,
            bowWidth: 0.13,
            bellRise: 0.2,
            flare: 0.16,
            keys: 19,
        },
        bariSax: {
            mpHeading: 90,
            mpLength: 0.1,
            // a long straight neck out from the lips, so the body hangs as far
            // in front of the player as the alto's does
            neckLine: 0.18,
            neck: [[-90, 0.07]],
            loop: { drop: 0.2, radii: [0.05, 0.07], rise: 0.07 },
            bodyTop: 0.2,
            rTop: 0.032,
            rBow: 0.068,
            bowWidth: 0.17,
            bellRise: 0.22,
            flare: 0.2,
            keys: 20,
        },
    };

/** The neck (and the bari's loop, folding back toward the player) down to the top of the body. */
function saxTop(shape: SaxShape, s: SegmentCounts) {
    const mpEnd = turtle([0, 0, 0], shape.mpHeading).line(shape.mpLength).end();
    const neck = turtle(mpEnd, shape.mpHeading).line(shape.neckLine);
    for (const [deg, radius] of shape.neck) neck.turn(deg, radius, s.crook);
    if (!shape.loop) {
        neck.toZ(shape.bodyTop);
        return {
            mpEnd,
            neck: neck.points,
            loop: [] as Vec3[],
            top: neck.end(),
        };
    }
    const { drop, radii, rise } = shape.loop;
    neck.line(drop);
    const loop = turtle(neck.end(), neck.heading())
        .turn(-180, radii[0], s.crook * 2)
        .line(rise)
        .turn(180, radii[1], s.crook * 2);
    return { mpEnd, neck: neck.points, loop: loop.points, top: loop.end() };
}

/** How far a curved sax's bell flare leans from straight up toward the keys' side. */
export const SAX_BELL_TILT = (25 * Math.PI) / 180;

/** Turns a piece about the line through `p` parallel to X, by `angle` from −Z toward +Y. */
function tiltTowardY(piece: Piece, p: Vec3, angle: number): Piece {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    // columns: X, Y (y·c + z·s), Z (−y·s + z·c); then p − R·p
    return transformPiece(piece, [
        1,
        0,
        0,
        0,
        0,
        c,
        s,
        0,
        0,
        -s,
        c,
        0,
        0,
        p[1] - (c * p[1] - s * p[2]),
        p[2] - (s * p[1] + c * p[2]),
        1,
    ]);
}

/**
 * Alto, tenor and bari: neck, conical body, the bow in pieces, and the bell
 * back up. The neck carries the octave key (its pad on top near the
 * mouthpiece, the arm along the neck to a ring the body's lever lifts) and
 * goes into the body's receiver; the low B, Bb and C# cups ride the bell's
 * tube on a rod linked across to the body's long rod; a guard ring hugs
 * the bottom of the bow.
 */
function curvedSax(
    id: "altoSax" | "tenorSax" | "bariSax",
    detail: Detail,
    options: ModelOptions,
): InstrumentModel {
    const d = WOODWIND_DIMENSIONS[id];
    const sh = SAX_SHAPES[id];
    const s = SEGMENTS[detail];
    const sc = Math.sqrt(d.bell / 0.12);
    const t = tools(s, 1.2 * sc);
    const { mpEnd, neck, loop, top } = saxTop(sh, s);
    const yb = top[1];
    const w = sh.bowWidth;
    const bowZ = d.length - w / 2 - sh.rBow;
    const body = between(top, [0, yb, bowZ], [0, 0.25, 0.5, 0.75, 1]);
    const rBell = sh.rBow * 1.08;
    const bellBase = bowZ - sh.bellRise;
    const neckTop = sh.rTop * 0.55;
    const neckEnd = sh.rTop * (loop.length ? 0.8 : 1);
    const rAt = (z: number) =>
        lerp(sh.rTop, sh.rBow, (z - top[2]) / (bowZ - top[2]));
    const b: Body = { x: 0, y: yb, rAt };
    const bellTube: Body = {
        x: w,
        y: yb,
        rAt: (z) => lerp(rBell, rBell * 1.1, (bowZ - z) / sh.bellRise),
    };
    const gap = 0.005 * sc;
    const cs = (k: number) => lerp(0.011, 0.017, k) * sc;
    const pieces: Piece[] = [
        ...t.mouthpiece(mpEnd, sh.rTop * 0.75),
        t.run(neck, taper(neck, neckTop, neckEnd)),
        // the cork where the mouthpiece meets the neck
        t.run(
            between(neck[0], neck[1], [
                0,
                Math.min(0.5, 0.022 / dist3(neck[0], neck[1])),
            ]),
            neckTop * 1.12,
            PART_WOOD,
            true,
        ),
        t.run(body, taper(body, sh.rTop, sh.rBow)),
        // the bell tube runs on up inside the leaning flare, so the joint
        // stays closed on the side the lean lifts
        t.run(
            [
                [w, yb, bowZ],
                [w, yb, bellBase],
                [
                    w,
                    yb,
                    bellBase - rBell * 1.1 * Math.sin(SAX_BELL_TILT) - 0.004,
                ],
            ],
            [rBell, rBell * 1.1, rBell * 1.04],
        ),
        // the flare leans toward the keys, so the bell opens forward and up
        tiltTowardY(
            t.bell(
                rBell * 1.1,
                d.bell / 2,
                sh.flare,
                [w, yb, bellBase],
                PART_METAL,
                true,
            ),
            [w, yb, bellBase],
            SAX_BELL_TILT,
        ),
        t.band([0, yb, bowZ - 0.01], sh.rBow * 1.06, 0.012, PART_METAL),
        // the brace from body to bell
        t.thin(
            [sh.rBow * 0.8, yb, bowZ - 0.12],
            [w - rBell * 0.9, yb, bowZ - 0.12],
            0.004,
            PART_METAL,
        ),
        ...saxKeys(t, b, top[2], bowZ, cs, gap),
        // the low B, Bb and C# on the bell's tube, hinged on its rod
        ...keyWork(t, bellTube, {
            cups: [
                [bowZ - 0.036 * sc, 0, cs(1) * 1.1],
                [bowZ - 0.082 * sc, 12, cs(1) * 1.05],
                [bowZ - 0.125 * sc, -30, cs(1) * 0.95],
            ],
            rods: [[-58, bowZ - 0.145 * sc, bowZ - 0.012]],
            gap,
            part: PART_METAL,
            chimney: PART_METAL,
        }),
    ];
    if (loop.length) pieces.push(t.run(loop, taper(loop, neckEnd, sh.rTop)));
    // the bow in 30° pieces, so no piece of it is wider than the bell; each
    // piece's ends square to the curve, so they meet without a seam
    const bow = arc([w / 2, yb, bowZ], w / 2, -90, 90, 12, "y");
    const tangent = (deg: number): Vec3 => {
        const a = (deg * Math.PI) / 180;
        return [Math.cos(a), 0, -Math.sin(a)];
    };
    for (let i = 0; i + 2 < bow.length; i += 2) {
        const part = bow.slice(i, i + 3);
        const [r0, r1] = [i / 12, (i + 2) / 12].map((k) =>
            lerp(sh.rBow, rBell, k),
        );
        pieces.push(
            smoothTube(part, taper(part, r0, r1), s.tube, PART_METAL, {
                capStart: false,
                capEnd: false,
                startTangent: tangent(-90 + 15 * i),
                endTangent: tangent(-60 + 15 * i),
            }),
        );
    }
    if (s.fine) {
        const zLink = bowZ - 0.02;
        const neckR = (f: number) => lerp(neckTop, neckEnd, f);
        const topSide = (f: number) => {
            const { p, t: tan } = pointAlong(neck, f);
            const up: Vec3 = [0, tan[2], -tan[1]];
            return {
                p,
                tan,
                up,
                at: (off: number) => add3(p, mul3(up, neckR(f) + off)),
            };
        };
        const pad = topSide(0.3);
        const ring = topSide(0.85);
        const ringR = neckR(0.85) + 0.003 * sc;
        const ringBack = sub3(ring.p, mul3(ring.up, ringR));
        // where the body's octave lever meets the ring: the body's back, or the bari's loop
        let lever = onBody(b, 180, top[2] + 0.012, gap);
        if (loop.length) {
            const radii = taper(loop, neckEnd, sh.rTop);
            let best = 0;
            loop.forEach((q, i) => {
                if (dist3(q, ringBack) < dist3(loop[best], ringBack)) best = i;
            });
            lever = add3(
                loop[best],
                mul3(unit3(sub3(ringBack, loop[best])), radii[best]),
            );
        }
        const end = neck[neck.length - 1];
        const endTan = unit3(sub3(end, neck[neck.length - 2]));
        const receiver = neckEnd * 1.18;
        const padCup = t.lid(pad.at(0.0008), pad.up, 0.006 * sc);
        pieces.push(
            // the octave key: pad and its tone hole, arm along the top of the neck, ring, the body's lever
            ...padCup.pieces,
            t.thin(
                pad.at(-neckR(0.3) * 0.4),
                pad.at(0.001),
                0.0045 * sc,
                PART_METAL,
            ),
            smoothTube(
                [0.3, 0.45, 0.6, 0.75, 0.85].map((f) =>
                    topSide(f).at(
                        f === 0.85 ? 0.003 * sc : 0.0035 * sc + 0.002,
                    ),
                ),
                0.0013 * sc,
                s.keys - 4,
                PART_METAL,
            ),
            t.loop(ring.p, ring.tan, ringR, 0.0013 * sc, PART_METAL, ring.up),
            t.thin(ringBack, lever, 0.0014 * sc, PART_METAL),
            // the receiver round the neck's end and its tenon screw
            smoothTube(
                [
                    sub3(end, mul3(endTan, 0.008)),
                    add3(end, mul3(endTan, 0.004)),
                ],
                receiver,
                s.tube,
                PART_METAL,
            ),
            t.thin(
                add3(sub3(end, mul3(endTan, 0.002)), [receiver - 0.001, 0, 0]),
                add3(sub3(end, mul3(endTan, 0.002)), [receiver + 0.006, 0, 0]),
                0.0028,
            ),
            // the link from the body's long rod across to the bell keys' rod
            t.thin(
                onBody(b, 100, zLink, gap),
                onBody(bellTube, -58, zLink, gap),
                0.0014 * 1.2 * sc,
            ),
            // the guard ring round the bottom of the bow
            smoothTube(
                [
                    [w / 2 - 0.012 * sc, yb, bowZ + w / 2],
                    [w / 2 + 0.012 * sc, yb, bowZ + w / 2],
                ],
                lerp(sh.rBow, rBell, 0.5) * 1.07,
                s.tube,
                PART_METAL,
            ),
        );
    }
    return colored(id, options, pieces, [0, yb, top[2] + 0.12]);
}

export function woodwindModel(
    id: WoodwindModelId,
    detail: Detail = "high",
    options: ModelOptions = {},
): InstrumentModel {
    switch (id) {
        case "piccolo":
        case "flute":
            return flute(id, detail, options);
        case "clarinet":
            return clarinet(detail, options);
        case "bassClarinet":
            return bassClarinet(detail, options);
        case "sopranoSax":
            return sopranoSax(detail, options);
        case "altoSax":
        case "tenorSax":
        case "bariSax":
            return curvedSax(id, detail, options);
    }
}
