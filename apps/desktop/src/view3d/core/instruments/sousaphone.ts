/**
 * The sousaphone (docs/3d/instruments.md §3, §4): a contrabass tuba wound
 * into a hoop the player wears like a sash, assembled from `hornKit` parts.
 * The hoop rests on the left shoulder and hangs to the right hip; the
 * valves sit inside its lower front, the leadpipe climbs from them to the
 * lips, and a tall neck behind the left shoulder carries the bell over the
 * head. Only proportions come from the reference pages; no image, mark or
 * model name is used.
 *
 * It is laid out as it is worn, in the standing player's frame (meters, +X
 * the performer's left, +Y up, +Z forward, feet at the origin), and then
 * moved so the right hand's grip on the valve caps is the origin: that is
 * the instrument frame, +Z the way the bell faces, +Y up, +X the
 * performer's left. The pistons lean with the hoop, their caps toward the
 * right hand (up and to the performer's right), as on the real horn.
 * Pure: no three.js.
 */
import {
    bellFlare,
    bentPath,
    hornKit,
    pathAt,
    pathLength,
    taper,
    VALVE_SLIDE_RATIO,
    type Corner,
    type Horn,
} from "./hornKit";
import {
    applyMat4,
    frameAt,
    transformPiece,
    type Piece,
    type Vec3,
} from "./mesh";
import type { Detail } from "./model";

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec3): Vec3 => mul(a, 1 / (len(a) || 1));
const cross = (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
];
const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * The measured horn. Lengths are meters. Points given as [x, y, z] are in
 * the standing player's frame; valve-block points are (along, depth, row):
 * `along` up the hoop's lean from the grip, `depth` out of the hoop's plane
 * toward the caps (negative is down the casing), `row` forward along the
 * row of valves.
 */
const SOUSAPHONE = {
    // in BBb, an octave below the baritone's 2.9 m
    openLength: 5.6,
    hoop: {
        center: [0.025, 1.183, 0.063] as Vec3,
        // how far the hoop leans from upright toward the left shoulder, and
        // how far its front dips: degrees
        lean: 43,
        dip: 22,
        // the body tube winds from the valves at the lower front, down past
        // the right hip, up the back and over the left shoulder, then round
        // again outside itself: angles from the top toward the front
        from: 120,
        to: 640,
        // the centerline's radius at each end of the winding, and how far
        // the first lap sits off the last one's plane, toward the caps
        radius: [0.31, 0.4] as [number, number],
        side: 0.125,
        // bore along the winding: (fraction, radius)
        bore: [
            [0, 0.0098],
            [0.06, 0.0125],
            [0.2, 0.02],
            [0.4, 0.031],
            [0.6, 0.042],
            [0.8, 0.054],
            [1, 0.064],
        ] as [number, number][],
        // joints along the winding, as fractions of it
        ferrules: [0.2, 0.46, 0.72, 0.93],
    },
    // the neck: on from the hoop's end, up behind the left shoulder and
    // forward into the bell. Its players wear a beret, not a plumed shako
    // (owner, 2026-11-10), so the bell rides low over the beret: its center
    // about 0.34 m above the eyes and its lower rim at the brow, as side-on
    // photos of players show (2026-11-10).
    neck: {
        rise: 0.2,
        top: [0.15, 1.96, -0.21] as Vec3,
        tail: [0.15, 1.96, -0.12] as Vec3,
        bends: [0.22, 0.14] as [number, number],
        radii: [
            [0, 0.064],
            [1, 0.075],
        ] as [number, number][],
    },
    // the bell from its collar: a wide throat off the neck that opens into
    // an almost flat pancake, 26 in across
    bell: { length: 0.41, throat: 0.075, rim: 0.33, gamma: 0.8 },
    // the mouthpiece at the lips with the head up 15 degrees (`HEAD_UP`
    // and `LIPS` in holds.ts), pointing forward and a little down
    lips: [0, 1.611, 0.079] as Vec3,
    mouthpiece: { size: 1.55, dir: [0, -0.17, 0.985] as Vec3 },
    lead: {
        radius: 0.009,
        // the bits carry the leadpipe forward of the chin and turn it down
        turn: [-0.012, 1.476, 0.378] as Vec3,
        // then down behind the first valve, round the main tuning slide's
        // crook below the block and up into the casing: (along, depth, row)
        down: [0.17, -0.06, -0.097],
        crook: -0.115,
        port: -0.06,
    },
    valves: {
        // the grip (the second valve's pearl) in the hoop's plane: up its
        // lean from the center, forward, and out toward the caps
        at: [0.02, 0.215, 0.153] as Vec3,
        r: 0.019,
        top: -0.036,
        bottom: -0.2,
        stem: 0.03,
        // first valve nearest the player
        row: [-0.046, 0, 0.046],
    },
    // The first and third valves' loops leave the casing up the hoop at
    // `out`, turn below the casing's foot at `under` and come back into
    // its other side at `back` (depths); the far leg lies `across` the row
    // from the casing, so the loop shows as a stadium from the caps' side.
    // `up` is the share of the run on the upper side; the run itself is
    // solved from the valve's ratio.
    loops: {
        1: {
            out: -0.095,
            back: -0.145,
            under: -0.25,
            across: -0.045,
            up: 0.45,
        },
        3: { out: -0.095, back: -0.145, under: -0.3, across: 0.065, up: 0.28 },
    } as Record<
        1 | 3,
        { out: number; back: number; under: number; across: number; up: number }
    >,
    // the second valve's short slide, straight up the hoop and back
    stub: { out: -0.1, back: -0.146 },
    loopRadius: 0.0092,
};

export function sousaphone(detail: Detail): Horn {
    const k = hornKit(detail);
    const h = SOUSAPHONE;
    const pieces: Piece[] = [];
    // the small tubing needs fewer sides than the body's
    const slim = { sides: Math.max(6, Math.round(k.segments.tube / 2)) };

    // the hoop's plane: `up` along its lean, `front` along its dip, `out`
    // its normal, toward the caps (the performer's right and up)
    const lean = rad(h.hoop.lean);
    const dip = rad(h.hoop.dip);
    const front: Vec3 = [0, -Math.sin(dip), Math.cos(dip)];
    const up: Vec3 = [
        Math.sin(lean),
        Math.cos(lean) * Math.cos(dip),
        Math.cos(lean) * Math.sin(dip),
    ];
    const out = cross(front, up);
    const inHoop = (u: number, f: number, w: number): Vec3 =>
        add(h.hoop.center, add(mul(up, u), add(mul(front, f), mul(out, w))));
    /** Where the right hand's grip sits on the player: the instrument's origin. */
    const origin = inHoop(...h.valves.at);
    /** A valve-block point (along, depth, row) in the player's frame. */
    const block = (along: number, depth: number, row: number): Vec3 =>
        add(origin, add(mul(up, along), add(mul(out, depth), mul(front, row))));
    const length = (cs: Corner[], bend: number) =>
        pathLength(
            bentPath(
                cs.map(([p, b]) => [p, b ?? bend]),
                k.segments.bend,
            ),
        );

    // valves: built standing, then leaned with the hoop
    const v = h.valves;
    const blockFrame = frameAt(origin, out, front);
    for (const p of k.valves(
        v.row.map((z) => [0, z] as [number, number]),
        v.r,
        v.bottom,
        v.top,
        { stem: v.stem },
    ))
        pieces.push(transformPiece(p, blockFrame));

    // the body: out of the third valve and round the hoop, a lap and a half
    const steps = Math.ceil(
        ((h.hoop.to - h.hoop.from) / 360) * k.segments.bend * 7,
    );
    const wound: Vec3[] = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const a = rad(h.hoop.from + (h.hoop.to - h.hoop.from) * t);
        const r = h.hoop.radius[0] + (h.hoop.radius[1] - h.hoop.radius[0]) * t;
        wound.push(
            inHoop(Math.cos(a) * r, Math.sin(a) * r, h.hoop.side * (1 - t)),
        );
    }
    const outPort = block(0, h.lead.port, v.row[2]);
    const windStart = unit(sub(wound[1], wound[0]));
    const bodyCorners: Corner[] = [
        [outPort],
        [block(-0.05, h.lead.port, v.row[2]), 0.03],
        [sub(wound[0], mul(windStart, 0.035)), 0.03],
        ...wound.map((p): Corner => [p, 0]),
    ];
    const bodyPath = bentPath(
        bodyCorners.map(([p, b]) => [p, b ?? 0]),
        k.segments.bend,
    );
    const bodyRadii = taper(bodyPath, h.hoop.bore);
    pieces.push(k.pipe(bodyCorners, h.hoop.bore, { bend: 0 }));
    for (const f of h.hoop.ferrules) {
        const { p, dir } = pathAt(bodyPath, f);
        const r = bodyRadii[Math.round(f * (bodyRadii.length - 1))];
        pieces.push(...k.ferrule(p, dir, r, 0.012));
    }
    /** The point of the body tube's surface nearest `p`: where a brace lands. */
    const onBody = (p: Vec3): Vec3 => {
        let best = 0;
        for (let i = 1; i < bodyPath.length; i++)
            if (len(sub(bodyPath[i], p)) < len(sub(bodyPath[best], p)))
                best = i;
        return add(
            bodyPath[best],
            mul(unit(sub(p, bodyPath[best])), bodyRadii[best]),
        );
    };

    // the neck and the bell
    const end = wound[wound.length - 1];
    const endDir = unit(sub(end, wound[wound.length - 2]));
    const neckCorners: Corner[] = [
        [end],
        [add(end, mul(endDir, h.neck.rise)), h.neck.bends[0]],
        [h.neck.top, h.neck.bends[1]],
        [h.neck.tail],
    ];
    pieces.push(k.pipe(neckCorners, h.neck.radii));
    const flare = bellFlare(
        [0, h.bell.throat],
        [h.bell.length, h.bell.rim],
        h.bell.gamma,
    );
    pieces.push(k.bell(flare, h.neck.tail, [0, 0, 1]));
    // the collar the bell lifts off at, and the joint where the neck leaves the hoop
    pieces.push(
        ...k.ferrule(
            add(h.neck.tail, [0, 0, 0.02]),
            [0, 0, 1],
            h.bell.throat * 1.02,
            0.03,
        ),
        ...k.ferrule(
            end,
            endDir,
            h.hoop.bore[h.hoop.bore.length - 1][1],
            0.014,
        ),
    );

    // mouthpiece, bits and leadpipe, with the main tuning slide's crook in it
    const mp = k.mouthpiece(h.lips, h.mouthpiece.dir, h.mouthpiece.size);
    pieces.push(...mp.pieces);
    const [da, dd, dr] = h.lead.down;
    const inPort = block(0, h.lead.port, v.row[0]);
    const leadCorners: Corner[] = [
        [mp.end],
        [h.lead.turn, 0.05],
        [block(da, dd, dr), 0.045],
        [block(h.lead.crook, dd, dr), (v.row[0] - dr) / 2],
        [block(h.lead.crook, h.lead.port, v.row[0]), (v.row[0] - dr) / 2],
        [inPort],
    ];
    pieces.push(k.pipe(leadCorners, h.lead.radius, { bend: 0.03, ...slim }));
    if (k.segments.trim) {
        // the two bits, and the tuning slide's outer sleeves and water key
        const bitDir = unit(sub(h.lead.turn, mp.end));
        for (const d of [0.012, 0.05])
            pieces.push(
                ...k.ferrule(
                    add(mp.end, mul(bitDir, d)),
                    bitDir,
                    h.lead.radius * 1.15,
                    0.014,
                ),
            );
        const sleeveR = h.lead.radius * 1.14 + 0.0003;
        for (const [row, a0] of [
            [dr, h.lead.crook + 0.105],
            [v.row[0], -0.03],
        ] as [number, number][]) {
            const depth = row === dr ? dd : h.lead.port;
            pieces.push(
                k.sleeve(
                    block(a0, depth, row),
                    block(h.lead.crook + 0.03, depth, row),
                    sleeveR,
                ),
                ...k.ferrule(
                    block(a0, depth, row),
                    up,
                    h.lead.radius * 1.14,
                    0.004,
                ),
            );
        }
    }
    pieces.push(
        ...k.waterKey(
            block(h.lead.crook, (dd + h.lead.port) / 2, (v.row[0] + dr) / 2),
            front,
            mul(up, -1),
            h.lead.radius,
        ),
    );

    // The open horn: mouthpiece, leadpipe, the way through the block, the
    // winding, neck and bell. The valve loops are sized from it.
    const main =
        len(sub(mp.end, h.lips)) +
        length(leadCorners, 0.03) +
        (v.row[2] - v.row[0]) +
        pathLength(bodyPath) +
        length(neckCorners, 0.02) +
        h.bell.length;
    const valveLoops: [number, number, number] = [0, 0, 0];

    // the first and third valves' loops: out of the casing up the hoop,
    // round under the casing's foot, and back into its lower side
    for (const n of [1, 3] as const) {
        const sl = h.loops[n];
        const row = v.row[n - 1];
        const want = h.openLength * VALVE_SLIDE_RATIO[n];
        const big = Math.hypot(sl.out - sl.under, sl.across) / 2;
        const small = Math.hypot(sl.back - sl.under, sl.across) / 2;
        const build = (run: number): Corner[] => {
            const a = big + run * sl.up;
            const b = small + run * (1 - sl.up);
            return [
                [block(0, sl.out, row)],
                [block(a, sl.out, row), big],
                [block(a, sl.under, row + sl.across), big],
                [block(-b, sl.under, row + sl.across), small],
                [block(-b, sl.back, row), small],
                [block(0, sl.back, row)],
            ];
        };
        // every meter of run adds two of tubing: solve the run for the length
        const run = 0.02 + (want - length(build(0.02), 0.02)) / 2;
        const loop = build(run);
        valveLoops[n - 1] = length(loop, 0.02);
        pieces.push(k.pipe(loop, h.loopRadius, slim));
        if (k.segments.trim) {
            // the slide's outer sleeves on its upper legs
            const a = big + run * sl.up;
            const s0 = v.r + 0.012;
            const s1 = a - big - 0.004;
            if (s1 - s0 > 0.01)
                for (const [depth, r] of [
                    [sl.out, row],
                    [sl.under, row + sl.across],
                ])
                    pieces.push(
                        k.sleeve(
                            block(s0, depth, r),
                            block(s1, depth, r),
                            h.loopRadius * 1.14 + 0.0003,
                        ),
                        ...k.ferrule(
                            block(s0, depth, r),
                            up,
                            h.loopRadius * 1.14,
                            0.004,
                        ),
                    );
        }
        if (n === 3)
            pieces.push(
                ...k.waterKey(
                    block(
                        -(small + run * (1 - sl.up)) + small + 0.01,
                        sl.under,
                        row + sl.across,
                    ),
                    up,
                    mul(out, -1),
                    h.loopRadius,
                ),
            );
    }
    {
        // the second valve's slide: straight up the hoop and back
        const st = h.stub;
        const width = st.out - st.back;
        const build = (run: number): Corner[] => [
            [block(0, st.out, v.row[1])],
            [block(run, st.out, v.row[1]), width / 2],
            [block(run, st.back, v.row[1]), width / 2],
            [block(0, st.back, v.row[1])],
        ];
        const base = width + 0.03;
        const run =
            base +
            (h.openLength * VALVE_SLIDE_RATIO[2] - length(build(base), 0.02)) /
                2;
        valveLoops[1] = length(build(run), 0.02);
        pieces.push(k.pipe(build(run), h.loopRadius, slim));
    }

    // braces: the block and the leadpipe hang from the body tube
    const l1 = h.loops[1];
    const l3 = h.loops[3];
    for (const p of [
        block(0, v.bottom + 0.05, v.row[2] + v.r),
        block(0.06, l3.under, v.row[2] + l3.across),
        block(-0.07, l3.under, v.row[2] + l3.across),
        block(-0.03, l1.under, v.row[0] + l1.across),
        block(h.lead.crook + 0.04, dd, dr),
        block(da - 0.03, dd, dr),
    ])
        pieces.push(...k.brace(p, onBody(p), 0.003));
    pieces.push(
        // the leadpipe to the first valve's casing, and the loops to each other
        ...k.brace(
            block(0.03, dd, dr + h.lead.radius),
            block(0.03, dd, v.row[0] - 0.01),
            0.0025,
        ),
        ...k.brace(
            block(0.04, l1.under, v.row[0] + l1.across),
            block(0.04, l3.under, v.row[2] + l3.across),
            0.0025,
        ),
    );

    const move = (p: Piece): Piece =>
        transformPiece(p, [
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
            -origin[0],
            -origin[1],
            -origin[2],
            1,
        ]);
    // the left hand holds the body tube where it comes down the front
    const grip = pathAt(bodyPath, 0.53).p;
    return {
        pieces: pieces.map(move),
        leftGrip: sub(grip, origin),
        valves: k.casings.map((c) => {
            const at = (p: Vec3) => sub(applyMat4(blockFrame, p), origin);
            return {
                bottom: at(c.bottom),
                top: at(c.top),
                button: at(c.button),
                r: c.r,
            };
        }),
        rim: sub(h.lips, origin),
        tubing: { main, valves: valveLoops },
    };
}
