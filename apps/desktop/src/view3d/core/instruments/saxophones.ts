// cspell:words lerp
/**
 * The saxophones (docs/3d/instruments.md §3, §4): the straight soprano and
 * the curved alto, tenor and baritone. Proportions follow the reference
 * pages; nothing is copied from them. Pure: no three.js.
 *
 * Frame: the mouthpiece tip is the origin, +Z runs down the body toward the
 * bow and +Y toward the keys. A curved sax's bell turns back up along −Z on
 * the +X side of the body, its flare leaning toward +Y.
 */
import {
    smoothTube,
    transformPiece,
    PART_BLACK,
    PART_METAL,
    PART_WOOD,
    type Piece,
    type Vec3,
} from "./mesh";
import type { Detail, InstrumentModel, ModelOptions } from "./model";
import {
    add3,
    between,
    colored,
    dist3,
    flaredTube,
    keyWork,
    lerp,
    mul3,
    onBody,
    pointAlong,
    radial,
    ring,
    sub3,
    taper,
    tools,
    turtle,
    unit3,
    type Body,
    type SegmentCounts,
    type Tools,
    SEGMENTS,
    WOODWIND_DIMENSIONS,
} from "./woodwindKit";

const dot3 = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * A sax's bow: half a torus in the plane of X and Z about `center`, from
 * the body's foot (−X side) round the bottom to the bell's, its tube
 * widening from `r0` to `r1`. Built as one surface with exact normals and
 * cut into `groups` pieces that share their end rings, so it shades as one
 * tube and no piece is wider than the bell.
 */
function bowPieces(
    center: Vec3,
    R: number,
    r0: number,
    r1: number,
    steps: number,
    sides: number,
    groups: number,
    fromDeg = -90,
    toDeg = 90,
): Piece[] {
    const per = steps / groups;
    const out: Piece[] = [];
    for (let g = 0; g < groups; g++) {
        const p: Piece = {
            part: PART_METAL,
            positions: [],
            normals: [],
            indices: [],
        };
        for (let j = 0; j <= per; j++) {
            const f = (g * per + j) / steps;
            const a = lerp(fromDeg, toDeg, f) * (Math.PI / 180);
            const e: Vec3 = [Math.sin(a), 0, Math.cos(a)];
            const r = lerp(r0, r1, f);
            for (let k = 0; k < sides; k++) {
                const th = (k / sides) * Math.PI * 2;
                const dir: Vec3 = [
                    e[0] * Math.sin(th),
                    Math.cos(th),
                    e[2] * Math.sin(th),
                ];
                p.positions.push(
                    center[0] + e[0] * R + dir[0] * r,
                    center[1] + dir[1] * r,
                    center[2] + e[2] * R + dir[2] * r,
                );
                p.normals.push(dir[0], dir[1], dir[2]);
            }
        }
        for (let j = 0; j < per; j++)
            for (let k = 0; k < sides; k++) {
                const a = j * sides + k;
                const b = j * sides + ((k + 1) % sides);
                const c = (j + 1) * sides + ((k + 1) % sides);
                const d = (j + 1) * sides + k;
                p.indices.push(a, b, c, a, c, d);
            }
        out.push(p);
    }
    return out;
}

/** A cubic Bézier from `p0` to `p3` through controls `p1`, `p2`, in `n` steps. */
function bezier(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, n: number): Vec3[] {
    const out: Vec3[] = [];
    for (let i = 0; i <= n; i++) {
        const t = i / n;
        const u = 1 - t;
        out.push(
            [0, 1, 2].map(
                (k) =>
                    u * u * u * p0[k] +
                    3 * u * u * t * p1[k] +
                    3 * u * t * t * p2[k] +
                    t * t * t * p3[k],
            ) as Vec3,
        );
    }
    return out;
}

/**
 * A sax's key work on its body from `top` to `bot` (the bow, or the
 * soprano's bell): the two stacks of pad cups up the front with pearls on
 * the six main keys, the palm keys at the top of the left (+X) side, the
 * table keys for the left pinky below them, the side keys for the right
 * hand on −X with their long rods, the low Eb and C cups under their
 * guards, and behind the body (−Y) the octave key's thumb touch, the left
 * thumb rest, the strap ring and the right thumb hook. `cs(k)` is a main
 * cup's radius at fraction `k` of the way down. Keys, rods and posts are
 * the body's own metal, as on a lacquered or plated horn.
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
        // left hand: high C, B, the bis, A and G, then G# toward the bell
        [0.135, 0, 0.78, false],
        [0.2, 0, 0.9, true],
        [0.238, 42, 0.45, false],
        [0.275, 0, 0.95, true],
        [0.35, 0, 1, true],
        [0.425, 45, 0.8, false],
        // right hand: F#, F, E and D
        [0.47, 0, 0.85, false],
        [0.55, 0, 1, true],
        [0.635, 0, 1, true],
        [0.72, 0, 1, true],
        // the low Eb and C under the guards
        [0.82, -62, 0.92, false],
        [0.905, 14, 1.12, false],
        // the side keys' cups: high E, side C and Bb
        [0.12, -72, 0.46, false],
        [0.3, -80, 0.5, false],
        [0.365, -80, 0.5, false],
        // the palm keys: D, Eb and F
        [0.03, 100, 0.5, false],
        [0.068, 100, 0.5, false],
        [0.105, 100, 0.5, false],
    ];
    const used = keys.filter(([, , size]) => t.fine || size >= 0.78);
    const pieces = keyWork(t, b, {
        cups: used.map(([k, deg, size]): [number, number, number] => [
            z(k),
            deg,
            cs(k) * size,
        ]),
        pearls: used.flatMap(([, , , pearl], i) => (pearl ? [i] : [])),
        rods: [
            [-42, z(0.1), z(0.4)],
            [-42, z(0.44), z(0.77)],
            [112, z(0.38), z(0.97)],
            [-100, z(0.09), z(0.62)],
            ...(t.fine
                ? ([
                      [92, z(0), z(0.15)],
                      [-82, z(0.76), z(0.96)],
                      [-116, z(0.26), z(0.66)],
                  ] as [number, number, number][])
                : []),
        ],
        gap,
        part: PART_METAL,
        chimney: PART_METAL,
        rodPart: PART_METAL,
    });
    if (!t.fine) return pieces;
    const sc = cs(0.5) / 0.0145;
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
        pieces.push(...touch(70, k, 0.01, 0.0045, 0.009, 92));
    for (const k of [0.455, 0.485, 0.515])
        pieces.push(...touch(84, k, 0.008, 0.0055, 0.007, 112));
    for (const k of [0.47, 0.525, 0.58])
        pieces.push(...touch(-76, k, 0.011, 0.004, 0.011, -100));
    pieces.push(...touch(12, 0.085, 0.006, 0.004, 0.007, -42));
    // the guards over the low Eb and C
    pieces.push(
        ...t.guard(b, -62, z(0.82), cs(0.82) * 0.92),
        ...t.guard(b, 14, z(0.905), cs(0.905) * 1.12),
    );
    // behind: the octave key's rod and thumb touch, the left thumb rest, the strap ring, the right thumb hook
    const back = (k: number, off: number) => onBody(b, 180, z(k), off);
    pieces.push(
        ...t.rodOn(b, 180, z(0) + 0.008, z(0.12), gap, 0.12, PART_METAL),
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
        t.loop(
            back(0.3, 0.004 + 0.005 * sc),
            [1, 0, 0],
            0.005 * sc,
            0.0013,
            PART_METAL,
        ),
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
            10,
            PART_BLACK,
        ),
    );
    return pieces;
}

/**
 * The straight soprano: a mouthpiece on a short cork, a slim cone and a
 * gentle bell with a rolled rim, the stacks up the front and the low B and
 * Bb cups on the bell's flare.
 */
export function sopranoSax(
    detail: Detail,
    options: ModelOptions,
): InstrumentModel {
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
    const bell = flaredTube(
        s,
        [
            [0, 0, flareAt],
            [0, 0, d.length - 0.003],
        ],
        0.03,
        d.bell / 2,
        s.fine ? 12 : 5,
        { cone: 0.3, power: 4 },
    );
    const pieces: Piece[] = [
        ...t.mouthpiece([0, 0, 0.06], 0.012),
        t.run(body, taper(body, 0.012, 0.03), PART_METAL),
        bell.piece,
        ring(
            bell.rim,
            bell.axis,
            d.bell / 2 + 0.001,
            0.002,
            s.bell,
            s.fine ? 8 : 4,
        ),
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
                112,
                flareAt - 0.036,
                gap,
                62,
                flareAt - 0.014,
                0.003,
                PART_METAL,
            ),
            t.arm(
                b,
                -82,
                flareAt - 0.036,
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
    /** The mouthpiece's heading from +Z toward +Y, its length and its radius. */
    mpHeading: number;
    mpLength: number;
    mpRadius: number;
    /** The neck: a straight run, then turns as [degrees, radius] down to +Z. */
    neckLine: number;
    neck: [number, number][];
    /**
     * Bari only: the body runs on up past the neck to a top bow, down a
     * short tube beside itself (−X) and through a small crook to the
     * receiver, where the neck comes over from the mouthpiece. `yb` is the
     * body's axis, `bowTop` the top bow's center height, `r1` and `r2` the
     * two crooks' radii, `drop` the short tube's foot and `receiver` the
     * receiver's top.
     */
    pigtail?: {
        yb: number;
        bowTop: number;
        r1: number;
        drop: number;
        r2: number;
        receiver: number;
    };
    bodyTop: number;
    /** Body radius at the top and at the bow. */
    rTop: number;
    rBow: number;
    /** Bow width between the body's and the bell's axes. */
    bowWidth: number;
    /** The bell's straight rise above the bow, then its flare. */
    bellRise: number;
    flare: number;
    /** Cups on the bell's tube: low B and Bb, and the bari's low A. */
    bellKeys: number;
}

export const SAX_SHAPES: Record<"altoSax" | "tenorSax" | "bariSax", SaxShape> =
    {
        altoSax: {
            mpHeading: 55,
            mpLength: 0.07,
            mpRadius: 0.0125,
            neckLine: 0.02,
            neck: [[-55, 0.08]],
            bodyTop: 0.2,
            rTop: 0.0145,
            rBow: 0.031,
            bowWidth: 0.088,
            bellRise: 0.14,
            flare: 0.12,
            bellKeys: 2,
        },
        tenorSax: {
            mpHeading: 50,
            mpLength: 0.085,
            mpRadius: 0.014,
            neckLine: 0.02,
            // the tenor's neck rises a little before it bends down: an S
            neck: [
                [25, 0.07],
                [-75, 0.1],
            ],
            bodyTop: 0.25,
            rTop: 0.0165,
            rBow: 0.037,
            bowWidth: 0.105,
            bellRise: 0.19,
            flare: 0.15,
            bellKeys: 2,
        },
        bariSax: {
            mpHeading: 90,
            mpLength: 0.1,
            mpRadius: 0.016,
            neckLine: 0,
            neck: [],
            // the body's axis sits where the alto's does under the sax hold
            pigtail: {
                yb: 0.11,
                bowTop: 0.1,
                r1: 0.033,
                drop: 0.15,
                r2: 0.031,
                receiver: 0.112,
            },
            bodyTop: 0.2,
            rTop: 0.024,
            rBow: 0.05,
            bowWidth: 0.135,
            bellRise: 0.4,
            flare: 0.2,
            bellKeys: 3,
        },
    };

/**
 * The neck from the mouthpiece to the top of the body, and for the bari the
 * coil the body's top makes on its way to the neck's receiver.
 */
function saxTop(shape: SaxShape, s: SegmentCounts) {
    const mpEnd = turtle([0, 0, 0], shape.mpHeading).line(shape.mpLength).end();
    const pig = shape.pigtail;
    if (!pig) {
        const neck = turtle(mpEnd, shape.mpHeading).line(shape.neckLine);
        for (const [deg, radius] of shape.neck) neck.turn(deg, radius, s.crook);
        neck.toZ(shape.bodyTop);
        return {
            mpEnd,
            neck: neck.points,
            coil: [] as Vec3[],
            top: neck.end(),
        };
    }
    const { yb, bowTop, r1, drop, r2, receiver } = pig;
    const top: Vec3 = [0, yb, shape.bodyTop];
    const x1 = -2 * r1;
    const n = s.crook * 2;
    const coil: Vec3[] = [[x1, yb + 2 * r2, receiver]];
    // the small crook at the foot, back toward the body's line
    for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI;
        coil.push([x1, yb + r2 + r2 * Math.cos(a), drop + r2 * Math.sin(a)]);
    }
    // the top bow across to the body
    for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI;
        coil.push([-r1 - r1 * Math.cos(a), yb, bowTop - r1 * Math.sin(a)]);
    }
    coil.push(top);
    const end = coil[0];
    const neck = bezier(
        mpEnd,
        add3(mpEnd, [0, 0.055, -0.014]),
        add3(end, [0, 0, -0.085]),
        end,
        s.crook * 3,
    );
    return { mpEnd, neck, coil, top };
}

/** How far a curved sax's bell flare leans from straight up toward +Y, the front as it is played. */
export const SAX_BELL_TILT = (25 * Math.PI) / 180;

/**
 * How a curved sax's body is turned about its own axis under the neck, as
 * it is played: the neck runs straight back to the mouth, the bell stands
 * in front of the body tube a little to the player's left, and the pearls
 * face the player's front-right where the fingers curl onto them. The body
 * is built with its keys toward +Y and its bell toward +X, then turned by
 * this angle (radians) from +X toward +Y, so the bell ends 25° left of
 * straight ahead and the keys 65° right of it.
 */
export const SAX_BODY_TURN = (65 * Math.PI) / 180;

/** A point of a curved sax's body, as built (keys +Y, bell +X), turned into the instrument frame. */
export function saxTurned(p: Vec3, yb: number): Vec3 {
    const c = Math.cos(SAX_BODY_TURN);
    const s = Math.sin(SAX_BODY_TURN);
    const y = p[1] - yb;
    return [p[0] * c - y * s, yb + p[0] * s + y * c, p[2]];
}

/**
 * Alto, tenor and bari: neck, conical body, a true U bow and the bell back
 * up beside the body, flaring to a rolled rim and leaning toward the keys.
 * The neck carries the octave key (its pad on top near the mouthpiece, the
 * arm along the neck to a ring at the tenon) and goes into the body's
 * receiver with its tightening screw; the low B and Bb cups (and the bari's
 * low A) ride the bell's tube under their guards, on a rod linked across to
 * the body's long rod; a brace ties the bell to the body, ferrules ring the
 * bow's two ends and a guard ring its bottom.
 */
export function curvedSax(
    id: "altoSax" | "tenorSax" | "bariSax",
    detail: Detail,
    options: ModelOptions,
): InstrumentModel {
    const d = WOODWIND_DIMENSIONS[id];
    const sh = SAX_SHAPES[id];
    const s = SEGMENTS[detail];
    const sc = Math.sqrt(d.bell / 0.12);
    const t = tools(s, 1.2 * sc);
    const { mpEnd, neck, coil, top } = saxTop(sh, s);
    const yb = top[1];
    const w = sh.bowWidth;
    const bowZ = d.length - w / 2 - sh.rBow;
    const body = between(top, [0, yb, bowZ], [0, 0.25, 0.5, 0.75, 1]);
    const rBell = sh.rBow * 1.08;
    const neckTop = sh.mpRadius * 0.62;
    const neckEnd = coil.length ? sh.mpRadius * 0.95 : sh.rTop * 0.93;
    const rAt = (z: number) =>
        lerp(sh.rTop, sh.rBow, Math.max(0, (z - top[2]) / (bowZ - top[2])));
    const b: Body = { x: 0, y: yb, rAt };
    // the bell: straight up from the bow, then leaning toward the keys as it flares
    const tiltDeg = (SAX_BELL_TILT * 180) / Math.PI;
    const lean = Math.min(sh.bellRise * 0.8, 0.13 * sc);
    // the lean is toward the front once the body is turned: here, mostly
    // away from the body and a little toward the keys
    const [lc, ls] = [Math.cos(SAX_BODY_TURN), Math.sin(SAX_BODY_TURN)];
    const bellPath = turtle([w, yb, bowZ], 180)
        .line(sh.bellRise - lean)
        .turn(-tiltDeg, (lean + sh.flare * 0.35) / SAX_BELL_TILT, s.crook * 3)
        .line(sh.flare * 0.65)
        .points.map(
            (p): Vec3 => [w + (p[1] - yb) * ls, yb + (p[1] - yb) * lc, p[2]],
        );
    const bell = flaredTube(
        s,
        bellPath,
        rBell,
        d.bell / 2 - 0.002,
        s.fine ? 22 : 8,
    );
    // the bell's ring nearest a height: its center and radius there
    const bellAt = (z: number) => {
        let best = 0;
        bell.pts.forEach((p, i) => {
            if (Math.abs(p[2] - z) < Math.abs(bell.pts[best][2] - z)) best = i;
        });
        const other = Math.min(
            bell.pts.length - 1,
            Math.max(0, bell.pts[best][2] > z ? best + 1 : best - 1),
        );
        const span = bell.pts[other][2] - bell.pts[best][2];
        const f = span ? (z - bell.pts[best][2]) / span : 0;
        return {
            x: lerp(bell.pts[best][0], bell.pts[other][0], f),
            y: lerp(bell.pts[best][1], bell.pts[other][1], f),
            r: lerp(bell.radii[best], bell.radii[other], f),
        };
    };
    const bellR = (z: number) => bellAt(z).r;
    const bellTube: Body = {
        x: w,
        y: yb,
        rAt: bellR,
        axis: (z) => [bellAt(z).x, bellAt(z).y],
    };
    const gap = 0.005 * sc;
    const cs = (k: number) => lerp(0.011, 0.018, k) * sc;
    // what stays with the neck, in line with the mouth
    const fixed: Piece[] = [
        ...t.mouthpiece(mpEnd, sh.mpRadius),
        smoothTube(
            neck,
            taper(neck, neckTop, neckEnd),
            s.fine ? 16 : s.tube,
            PART_METAL,
            {
                capStart: false,
                capEnd: false,
            },
        ),
        // the cork where the mouthpiece meets the neck
        t.run(
            between(neck[0], neck[1], [
                0,
                Math.min(0.9, 0.02 / dist3(neck[0], neck[1])),
            ]),
            neckTop * 1.14,
            PART_WOOD,
            true,
        ),
    ];
    // the body, as built: keys toward +Y, bell toward +X
    const pieces: Piece[] = [
        t.run(body, taper(body, sh.rTop, sh.rBow)),
        bell.piece,
        // the rolled rim
        ring(
            bell.rim,
            bell.axis,
            d.bell / 2 - 0.0005,
            0.0022 * sc,
            s.bell,
            s.fine ? 8 : 4,
        ),
        // ferrules where the bow meets the body and the bell
        t.band([0, yb, bowZ - 0.004], sh.rBow * 1.05, 0.012, PART_METAL),
        t.band([w, yb, bowZ - 0.004], rBell * 1.05, 0.012, PART_METAL),
        ...saxKeys(t, b, top[2], bowZ, cs, gap),
    ];
    if (coil.length) {
        const rc = taper(coil, neckEnd * 1.06, sh.rTop);
        fixed.push(
            smoothTube(coil, rc, s.fine ? 16 : s.tube, PART_METAL, {
                capStart: false,
                capEnd: false,
            }),
        );
    }
    // the bow, cut so no piece of it is wider than the bell
    pieces.push(
        ...bowPieces(
            [w / 2, yb, bowZ],
            w / 2,
            sh.rBow,
            rBell,
            s.fine ? 24 : 12,
            s.tube,
            s.fine ? 6 : 3,
        ),
    );
    // the low B and Bb (and the bari's low A) on the bell's tube, facing
    // the keys' side and a little toward the body, hinged on the bell's rod
    const bellDeg = -22;
    const rodDeg = -78;
    const cupR = Math.min(cs(1) * 1.3, rBell * 0.72);
    const fractions = sh.bellKeys === 3 ? [0.16, 0.4, 0.64] : [0.24, 0.68];
    const bellCups = fractions.map((f) => bowZ - sh.bellRise * f);
    const rodTop = bowZ - sh.bellRise * (sh.bellKeys === 3 ? 0.76 : 0.92);
    pieces.push(
        ...keyWork(t, bellTube, {
            cups: bellCups.map((z): [number, number, number] => [
                z,
                bellDeg,
                cupR,
            ]),
            rods: [[rodDeg, rodTop, bowZ - 0.012]],
            gap,
            part: PART_METAL,
            chimney: PART_METAL,
            rodPart: PART_METAL,
        }),
    );
    // the brace from body to bell: a rod with a flange on each tube
    const zBrace = bowZ - sh.bellRise * (sh.bellKeys === 3 ? 0.88 : 0.5);
    const braceA: Vec3 = [rAt(zBrace) - 0.001, yb, zBrace];
    const braceB: Vec3 = [bellAt(zBrace).x - bellR(zBrace) + 0.002, yb, zBrace];
    pieces.push(t.thin(braceA, braceB, 0.0038 * sc, PART_METAL));
    if (s.fine) {
        pieces.push(
            t.thin(braceA, add3(braceA, [0.003, 0, 0]), 0.009 * sc, PART_METAL),
            t.thin(
                add3(braceB, [-0.003, 0, 0]),
                braceB,
                0.009 * sc,
                PART_METAL,
            ),
            ...bellCups.flatMap((z) => t.guard(bellTube, bellDeg, z, cupR)),
        );
        const zLink = bowZ - 0.02;
        const neckR = (f: number) => lerp(neckTop, neckEnd, f);
        // the outside of the neck's bend: up and away from the player
        const topSide = (f: number) => {
            const { p, t: tan } = pointAlong(neck, f);
            const ref: Vec3 = [0, 0.45, -0.9];
            const up = unit3(sub3(ref, mul3(tan, dot3(ref, tan))));
            return {
                p,
                tan,
                up,
                at: (off: number) => add3(p, mul3(up, neckR(f) + off)),
            };
        };
        const pad = topSide(0.28);
        const ringAt = topSide(0.84);
        const ringR = neckR(0.84) + 0.003 * sc;
        const end = neck[neck.length - 1];
        const endTan = unit3(sub3(end, neck[neck.length - 2]));
        const receiver = neckEnd * 1.2;
        const padCup = t.lid(pad.at(0.0008), pad.up, 0.006 * sc);
        const screw = add3(end, mul3(endTan, 0.004));
        fixed.push(
            // the octave key: pad and its pip, the arm along the top of the neck on its saddle, the ring at the tenon
            ...padCup.pieces,
            t.thin(
                pad.at(-neckR(0.28) * 0.4),
                pad.at(0.001),
                0.0042 * sc,
                PART_METAL,
            ),
            smoothTube(
                [0.28, 0.42, 0.56, 0.7, 0.84].map((f) =>
                    topSide(f).at(
                        f === 0.84 ? 0.003 * sc : 0.0035 * sc + 0.002,
                    ),
                ),
                0.0013 * sc,
                6,
                PART_METAL,
            ),
            t.thin(
                topSide(0.56).at(-0.001),
                topSide(0.56).at(0.0035 * sc + 0.002),
                0.002 * sc,
                PART_METAL,
            ),
            t.loop(
                ringAt.p,
                ringAt.tan,
                ringR,
                0.0013 * sc,
                PART_METAL,
                ringAt.up,
            ),
            // the receiver round the neck's end, its collar and tightening screw
            smoothTube(
                [
                    sub3(end, mul3(endTan, 0.012)),
                    add3(end, mul3(endTan, 0.014)),
                ],
                receiver,
                s.tube,
                PART_METAL,
            ),
            smoothTube(
                [
                    add3(end, mul3(endTan, 0.001)),
                    add3(end, mul3(endTan, 0.007)),
                ],
                receiver * 1.1,
                s.tube,
                PART_METAL,
            ),
            t.thin(
                add3(screw, [receiver - 0.001, 0, 0]),
                add3(screw, [receiver + 0.007 * sc, 0, 0]),
                0.002 * sc,
                PART_METAL,
            ),
            t.thin(
                add3(screw, [receiver + 0.007 * sc, 0, 0]),
                add3(screw, [receiver + 0.0095 * sc, 0, 0]),
                0.0042 * sc,
                PART_METAL,
            ),
        );
        pieces.push(
            // the link from the body's long rod across to the bell keys' rod
            t.thin(
                onBody(b, 112, zLink, gap),
                onBody(bellTube, rodDeg, zLink, gap),
                0.0014 * 1.2 * sc,
                PART_METAL,
            ),
            // the guard ring round the bottom of the bow
            ...bowPieces(
                [w / 2, yb, bowZ],
                w / 2,
                lerp(sh.rBow, rBell, 0.5) * 1.045,
                lerp(sh.rBow, rBell, 0.5) * 1.045,
                2,
                s.tube,
                1,
                -7,
                7,
            ),
        );
        if (!coil.length)
            // the body's octave lever up to the neck's ring
            fixed.push(
                t.thin(
                    sub3(ringAt.p, mul3(ringAt.up, ringR)),
                    saxTurned(onBody(b, 180, top[2] + 0.012, gap), yb),
                    0.0014 * sc,
                    PART_METAL,
                ),
            );
    }
    const [tc, ts] = [Math.cos(SAX_BODY_TURN), Math.sin(SAX_BODY_TURN)];
    const turn = [
        tc,
        ts,
        0,
        0,
        -ts,
        tc,
        0,
        0,
        0,
        0,
        1,
        0,
        yb * ts,
        yb * (1 - tc),
        0,
        1,
    ];
    return colored(
        id,
        options,
        [...fixed, ...pieces.map((p) => transformPiece(p, turn))],
        [0, yb, top[2] + 0.12],
    );
}
