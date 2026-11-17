// cspell:words lerp
/**
 * The woodwinds' instruments (docs/3d/instruments.md §3, §4), built from
 * numbers; proportions follow the reference pages, nothing is copied from
 * them. Pure: no three.js. The flutes and clarinets are here, the saxes in
 * `saxophones.ts` and the shared parts in `woodwindKit.ts`.
 *
 * Instrument frame: the mouthpiece (the lips, for the flutes) is the
 * origin and +Z runs down the instrument toward its far end. Each model
 * faces the way it is played. Flute and piccolo: +Z along the tube toward
 * the foot joint, the keys and the lip plate in line on +Y (up, played),
 * the hinge rod on the player's side (−X). Clarinets and the soprano sax:
 * +Z down the body toward the bell, the keys on +Y (the front) and the reed
 * on −Y, against the lower lip; the bass clarinet's bell turns up in front
 * (+Y). Alto, tenor and bari sax: the neck runs back to the mouth along −Y
 * with the reed underneath, +Z down the body, and the body turned under the
 * neck so the bell stands in front (+Y, a little toward +X, the player's
 * left) and the pearls face the player's front-right. The hold places the
 * right hand; `leftGrip` is the left hand's point on the body.
 */
import {
    smoothLathe,
    smoothTube,
    transformPiece,
    PART_BLACK,
    PART_CHROME,
    type Piece,
    type Vec3,
} from "./mesh";
import type {
    Detail,
    InstrumentModel,
    ModelOptions,
    WoodwindModelId,
} from "./model";
import { curvedSax, sopranoSax } from "./saxophones";
import {
    add3,
    at,
    between,
    colored,
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
    type Body,
    SEGMENTS,
    WOODWIND_DIMENSIONS,
    Y_TO_NEG_Z,
} from "./woodwindKit";

export { WOODWIND_COLORS, WOODWIND_DIMENSIONS } from "./woodwindKit";
export { SAX_BELL_TILT, SAX_SHAPES } from "./saxophones";

/**
 * A flute's body keys from the barrel down: the distance below the head
 * joint's tenon on a concert flute (piccolos scale it), the angle round the
 * tube from the top line toward the far side, the cup's size against the
 * main cups, and whether it is an open-hole (French) cup. The two trill
 * cups on the player's side, C, the left hand's four, G# on the far side,
 * then the right hand's five.
 */
const FLUTE_KEYS: [number, number, number, boolean][] = [
    [0.02, -42, 0.58, false],
    [0.04, -42, 0.58, false],
    [0.062, 0, 0.8, false],
    [0.092, 0, 1, false],
    [0.115, 0, 1, true],
    [0.138, 0, 1, true],
    [0.161, 0, 1, false],
    [0.185, 38, 0.8, false],
    [0.21, 0, 1, false],
    [0.239, 0, 1, false],
    [0.262, 0, 1, true],
    [0.285, 0, 1, true],
    [0.308, 0, 1, true],
];

/**
 * Flute and piccolo: a straight silver tube from the crown behind the lips
 * to the foot. The lip plate and its embouchure hole sit in line with the
 * keys (+Y), as a flute is assembled: played, both face up. The keys hinge
 * on a long rod down the player's side (−X) with the thumb keys under the
 * tube; the G# lever and the foot joint's pinky touches and rollers reach
 * out on the far side (+X). The flute's foot joint carries its own rod and
 * three cups; the piccolo has closed cups and no foot.
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
    const rodDeg = -70;
    const rodGap = pic ? 0.0045 : 0.0058;
    const plateW = pic ? 0.0085 : 0.0125;
    const plateL = pic ? 0.012 : 0.019;
    const plateY = r + 0.0026;
    const barrel = 0.034 * scale;
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
            [r * 0.9, r * 0.94, r],
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
        // the barrel the head joint goes into, a raised ring at each end
        t.band([0, 0, headEnd + barrel / 2], r * 1.07, barrel),
        t.band([0, 0, headEnd + 0.002], r * 1.14, 0.004),
        t.band([0, 0, headEnd + barrel - 0.002], r * 1.14, 0.004),
        t.band([0, 0, end - 0.003], r * 1.08, 0.006),
        // the lip plate on its riser, an oval stretched along the tube, and its embouchure hole
        t.plate(
            [0, plateY, 0],
            [0, 1, 0],
            [0, 0, 1],
            plateW,
            plateL,
            0.0014,
            PART_CHROME,
            s.tube,
        ),
        t.plate(
            [0, plateY + 0.0014, 0],
            [0, 1, 0],
            [0, 0, 1],
            plateW * 0.42,
            plateL * 0.3,
            0.0002,
            PART_BLACK,
            s.tube,
        ),
        ...t.rodOn(
            tubeBody,
            rodDeg,
            headEnd + barrel + 0.004,
            (pic ? end - 0.012 : footStart) - 0.006,
            rodGap,
            0.07 * (pic ? 0.6 : 1),
        ),
    ];
    pieces.push(
        // the lip plate's riser: an oval chimney out of the tube (its +Z turned to +Y, stretched along Z)
        transformPiece(
            smoothTube(
                [
                    [0, 0, r * 0.6],
                    [0, 0, plateY],
                ],
                plateW * 0.55,
                s.keys,
                PART_CHROME,
                { capStart: false },
            ),
            [-1, 0, 0, 0, 0, 0, 1.35, 0, 0, 1, 0, 0, 0, 0, 0, 1],
        ),
    );
    // the body keys, each hinged on the main rod
    for (const [dz, deg, size, open] of FLUTE_KEYS) {
        const z = headEnd + dz * scale + (pic ? 0.012 : 0);
        const r0 = cr * size;
        if (!s.fine && size < 0.75) continue;
        const cup = t.cupOn(tubeBody, deg, z, r0, {
            part: PART_CHROME,
            chimney: PART_CHROME,
            hole: open && !pic ? r0 * 0.32 : 0,
        });
        pieces.push(...cup.pieces);
        if (!s.fine) continue;
        const lift = cup.h * 0.6 + 0.0008;
        pieces.push(
            t.arm(tubeBody, deg, z, lift, rodDeg, z, rodGap),
            t.sleeve(tubeBody, rodDeg, z, rodGap),
        );
        if (open && !pic) {
            // the French key's pointed arm across the cup to the ring round the hole
            const lid0 = onBody(tubeBody, deg, z, 0.0008 + cup.h + 0.0003);
            pieces.push(
                smoothTube(
                    [
                        add3(lid0, [-r0 * 1.02, 0, 0]),
                        add3(lid0, [-r0 * 0.6, 0, 0]),
                        add3(lid0, [-r0 * 0.45, 0, 0]),
                    ],
                    [0.0013, 0.0008, 0.0003],
                    s.keys - 4,
                    PART_CHROME,
                ),
            );
        }
    }
    // the thumb keys' rod underneath, a long line even from far off
    const th0 = headEnd + 0.06 * scale;
    const th1 = headEnd + 0.115 * scale;
    pieces.push(...t.rodOn(tubeBody, -150, th0, th1, rodGap));
    if (s.fine) {
        // the G# lever reaches out on the far side for the left little finger
        const zg = headEnd + 0.185 * scale + (pic ? 0.012 : 0);
        pieces.push(
            t.plate(
                onBody(tubeBody, 98, zg - 0.012 * scale, rodGap),
                radial(98),
                [0, 0, 1],
                0.003 * scale + 0.001,
                0.0085 * scale,
                0.0013,
            ),
            t.arm(tubeBody, 38, zg, 0.003, 98, zg - 0.008 * scale, rodGap),
        );
        // the trill keys' touches between the right hand's fingers, on the rod
        for (const dz of [0.25, 0.273]) {
            const z = headEnd + dz * scale + (pic ? 0.012 : 0);
            pieces.push(
                t.plate(
                    onBody(tubeBody, -40, z, rodGap + 0.0025),
                    radial(-40),
                    [0, 0, 1],
                    0.0024 * scale + 0.0006,
                    0.005 * scale,
                    0.0012,
                ),
                t.arm(tubeBody, rodDeg, z, rodGap, -40, z, rodGap + 0.0025),
            );
        }
        // the thumb's B and Bb keys underneath, on their rod
        for (const [deg, dz] of [
            [180, 0.078],
            [158, 0.098],
        ]) {
            const z = headEnd + dz * scale;
            pieces.push(
                t.plate(
                    onBody(tubeBody, deg, z, rodGap - 0.001),
                    radial(deg),
                    [0, 0, 1],
                    0.0034 * scale + 0.0008,
                    0.0078 * scale,
                    0.0013,
                ),
                t.arm(tubeBody, -150, z, rodGap, deg, z, rodGap - 0.0005),
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
            t.band([0, 0, footStart], r * 1.12, 0.012),
            ...t.rodOn(tubeBody, rodDeg, footStart + 0.01, end - 0.008, rodGap),
        );
        for (const [dz, deg, size] of [
            [0.028, 34, 0.85],
            [0.06, 0, 1],
            [0.09, 0, 1],
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
            // the D# touch and the C# and C rollers under the right little finger
            const z0 = footStart + 0.014;
            pieces.push(
                t.plate(
                    onBody(tubeBody, 96, z0, 0.004),
                    radial(96),
                    [0, 0, 1],
                    0.0034,
                    0.0075,
                    0.0013,
                ),
                t.post(tubeBody, 96, z0, 0.004),
                t.arm(
                    tubeBody,
                    96,
                    z0 + 0.004,
                    0.0045,
                    34,
                    footStart + 0.028,
                    0.003,
                ),
            );
            for (const dz of [0.027, 0.036]) {
                const z = footStart + dz;
                const c = onBody(tubeBody, 108, z, 0.0058);
                const across = mul3(radial(18), 0.0045);
                pieces.push(
                    smoothTube(
                        [sub3(c, across), add3(c, across)],
                        0.0021,
                        s.keys,
                        PART_CHROME,
                    ),
                    t.post(tubeBody, 108, z, 0.0042),
                );
            }
        }
    }
    return colored(id, options, pieces, [0, 0, first + 0.03]);
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
    const bellStart = d.length - 0.086;
    // the joints' radii: the upper narrowing from the barrel, the lower widening to the bell
    const bodyR = (z: number) =>
        z < 0.38
            ? lerp(r * 1.02, r, (z - 0.15) / 0.23)
            : lerp(r, r * 1.06, (z - 0.38) / (bellStart - 0.38));
    const b: Body = { x: 0, y: 0, rAt: bodyR };
    const gap = 0.0045;
    // the bell: a cone off the lower joint that flares only toward its rim
    const clarinetBell = flaredTube(
        s,
        [
            [0, 0, bellStart],
            [0, 0, d.length - 0.002],
        ],
        r * 1.1,
        d.bell / 2 - 0.001,
        s.fine ? 12 : 5,
        { cone: 0.4, power: 3.2, part: PART_BLACK },
    );
    const pieces: Piece[] = [
        ...t.mouthpiece([0, 0, 0.09], 0.0122),
        // barrel, upper joint, lower joint, bell and its chrome rim
        t.run(
            between([0, 0, 0.09], [0, 0, 0.15], [0, 0.5, 1]),
            [r * 1.1, r * 1.17, r * 1.1],
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
        clarinetBell.piece,
        ring(
            clarinetBell.rim,
            clarinetBell.axis,
            d.bell / 2,
            0.0018,
            s.bell,
            s.fine ? 8 : 4,
            PART_CHROME,
        ),
        ...[0.09, 0.15, 0.38, bellStart].map((z) =>
            t.band([0, 0, z], r * 1.17, 0.008),
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
    // the crook: on from the mouthpiece, up over a swan's bend and down into the body
    const neck = turtle(mpEnd, 55)
        .turn(60, 0.02, s.crook)
        .turn(-115, 0.02405, s.crook * 2)
        .toZ(0.2);
    const yb = neck.end()[1];
    const bodyEnd = 0.87;
    const bodyR = (z: number) =>
        z < 0.52 ? r : lerp(r, r * 1.08, (z - 0.52) / (bodyEnd - 0.52));
    const b: Body = { x: 0, y: yb, rAt: bodyR };
    const gap = 0.006;
    // the bell's crook: a U toward the front (+Y), opening upward
    const bow = turtle([0, yb, bodyEnd], 0)
        .line(0.012)
        .turn(180, 0.056, s.crook * 3);
    // the bell rises from the crook, leaning forward as it flares
    const bellPath = turtle(bow.end(), 180)
        .line(0.03)
        .turn(-22, 0.3, s.crook * 2)
        .line(0.06).points;
    const bell = flaredTube(
        s,
        bellPath,
        r * 1.42,
        d.bell / 2 - 0.002,
        s.fine ? 18 : 6,
        { cone: 0.45, power: 5, part: PART_CHROME },
    );
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
        t.run(bow.points, taper(bow.points, r * 1.12, r * 1.42), PART_CHROME),
        bell.piece,
        ring(
            bell.rim,
            bell.axis,
            d.bell / 2 - 0.0005,
            0.0024,
            s.bell,
            s.fine ? 8 : 4,
            PART_CHROME,
        ),
        // the ferrule where the bell goes onto the crook
        t.run(
            [bow.end(), add3(bow.end(), [0, 0, -0.014])],
            r * 1.5,
            PART_CHROME,
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
