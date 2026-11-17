/**
 * The B♭ trumpet (docs/3d/instruments.md §3, §4), assembled from `hornKit`
 * parts and laid out from side, left and top views of the real instrument.
 * Only proportions come from the reference pages; no image, mark or model
 * name is used.
 *
 * The tubing is one air path: mouthpiece, leadpipe forward along the
 * performer's right of the valves, the main tuning slide's U at the front
 * turning back into the third valve, through the block, out of the first
 * valve's left side toward the player, around the back bow and forward along
 * the left side into the bell. Each valve has one loop of its own, and its
 * length is `VALVE_SLIDE_RATIO` of the horn's open length.
 *
 * Instrument frame: origin at the right hand's grip on the valves, +Z
 * toward the bell, +Y up through the valve caps, +X the performer's left.
 * Meters. Pure: no three.js.
 */
import {
    bellFlare,
    bentPath,
    hornKit,
    HORN_SEGMENTS,
    pathLength,
    VALVE_SLIDE_RATIO,
    type Corner,
    type Horn,
} from "./hornKit";
import type { Piece, Vec3 } from "./mesh";
import type { Detail } from "./model";

/**
 * The trumpet's measured numbers. Heights come from a side view at the
 * bell's true diameter: the bell's axis sits 21 mm above the leadpipe, the
 * tuning slide's lower leg 55 mm below it. Lengths along the horn are the
 * real instrument's: the valve block stands at the right hand's grip, and
 * the rim, bows and bell sit where the photos put them from it (the second
 * valve 0.24 m ahead of the rim).
 */
const TRUMPET = {
    /** The open horn's sounding length in B♭; the valve loops are sized from it. */
    openLength: 1.48,
    /** The mouthpiece rim: the rearmost point, level with the leadpipe. */
    rim: [0, 0.018, -0.197] as Vec3,
    leftGrip: [0.03, -0.012, 0.03] as Vec3,
    valves: {
        x: 0.0155,
        // first, second, third: 24 mm apart
        z: [0.02, 0.044, 0.068],
        r: 0.0095,
        top: 0.034,
        bottom: -0.0625,
        stem: 0.023,
    },
    lead: {
        // receiver to the tuning slide: the leadpipe opens out to the bore
        radii: [
            [0, 0.0052],
            [0.3, 0.006],
            [1, 0.0061],
        ] as [number, number][],
        /** The tuning slide's crook: how far forward its centerline reaches. */
        front: 0.24,
        /** The lower leg's height, where it enters the third valve. */
        low: -0.0375,
        /** The slide's outer sleeves: how far behind the crook they start and end. */
        sleeves: [0.105, 0.036] as [number, number],
        /** The brace across the slide's legs, behind the crook. */
        brace: 0.06,
    },
    bell: {
        x: 0.033,
        y: 0.039,
        rim: 0.361,
        /** The rim's radius, and the flare's length and radius at its tail. */
        radius: 0.0625,
        length: 0.2,
        throat: 0.007,
        /** The Bessel flare's exponent, matched to the side view's silhouette. */
        gamma: 0.9,
    },
    tail: {
        /** The bell tube's lower leg, leaving the first valve's left side. */
        low: -0.033,
        /** The back bow: how far back its centerline reaches. */
        back: -0.118,
        radii: [
            [0, 0.006],
            [0.45, 0.0063],
            [1, 0.007],
        ] as [number, number][],
    },
    slides: {
        // the first valve's loop runs back toward the player, legs stacked
        1: { x: 0.0155, upper: -0.0235, lower: -0.042, r: 0.0047 },
        // the third valve's runs forward on the right, its plane tipped out
        3: {
            upper: [0.0115, -0.0155] as [number, number],
            lower: [0.0005, -0.026] as [number, number],
            r: 0.0047,
        },
        // the second valve's short loop: out to the right and back
        2: { upper: -0.0235, lower: -0.042, r: 0.0045, angle: 30 },
    },
    /** Leadpipe-to-bell braces: z on the leadpipe, z and radius on the bell tube. */
    braces: [
        [-0.08, -0.029, 0.0066],
        [0.188, 0.229, 0.0092],
    ] as [number, number, number][],
};

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const along = (a: Vec3, b: Vec3, d: number): Vec3 => {
    const v = sub(b, a);
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [
        a[0] + (v[0] * d) / l,
        a[1] + (v[1] * d) / l,
        a[2] + (v[2] * d) / l,
    ];
};

export function trumpet(detail: Detail): Horn {
    const t = TRUMPET;
    const k = hornKit(detail);
    const v = t.valves;
    const [z1, z2, z3] = v.z;
    const pieces: Piece[] = [];
    const length = (cs: Corner[], bend: number) =>
        pathLength(
            bentPath(
                cs.map(([p, b]) => [p, b ?? bend]),
                // the true centerline, whatever the mesh's detail
                HORN_SEGMENTS.high.bend,
            ),
        );
    /** A brace between two tubes' center lines, ending on their walls. */
    const strut = (a: Vec3, ra: number, b: Vec3, rb: number) =>
        k.brace(along(a, b, ra * 0.85), along(b, a, rb * 0.85));

    // valves: casings, caps, stems and pearl buttons
    pieces.push(
        ...k.valves(
            v.z.map((z) => [v.x, z] as [number, number]),
            v.r,
            v.bottom,
            v.top,
            { stem: v.stem },
        ),
    );

    // mouthpiece, receiver and leadpipe; the main tuning slide is the U at
    // its front, tipped across from the leadpipe to the valves' line
    const mp = k.mouthpiece(t.rim, [0, 0, 1], 1);
    pieces.push(...mp.pieces);
    const leadY = t.rim[1];
    const crook = Math.hypot(v.x, leadY - t.lead.low) / 2;
    const lead: Corner[] = [
        [mp.end],
        [[0, leadY, t.lead.front], crook],
        [[v.x, t.lead.low, t.lead.front], crook],
        [[v.x, t.lead.low, z3]],
    ];
    pieces.push(k.pipe(lead, t.lead.radii));
    const leadR = t.lead.radii[t.lead.radii.length - 1][1];
    {
        const [s0, s1] = t.lead.sleeves.map((d) => t.lead.front - d);
        if (k.segments.trim)
            for (const [x, y] of [
                [0, leadY],
                [v.x, t.lead.low],
            ])
                pieces.push(
                    k.sleeve([x, y, s0], [x, y, s1], leadR * 1.13 + 0.0003),
                    ...k.ferrule([x, y, s0], [0, 0, 1], leadR * 1.13, 0.004),
                    ...k.ferrule([x, y, s1], [0, 0, 1], leadR * 1.13, 0.004),
                );
        const zb = t.lead.front - t.lead.brace;
        pieces.push(
            ...strut(
                [0, leadY, zb],
                leadR * 1.13,
                [v.x, t.lead.low, zb],
                leadR * 1.13,
            ),
        );
        // the water key under the crook, a third of the way round it
        const a = Math.PI / 5;
        const ux = v.x / (2 * crook);
        const uy = (t.lead.low - leadY) / (2 * crook);
        const out: Vec3 = [ux * Math.cos(a), uy * Math.cos(a), Math.sin(a)];
        pieces.push(
            ...k.waterKey(
                [
                    v.x / 2 + out[0] * crook,
                    (leadY + t.lead.low) / 2 + out[1] * crook,
                    t.lead.front - crook + out[2] * crook,
                ],
                [ux * Math.sin(a), uy * Math.sin(a), -Math.cos(a)],
                out,
                leadR,
            ),
        );
    }

    // the bell tube: out of the first valve's left side, back around the
    // bow and forward along the left into the flare
    const b = t.bell;
    const flareStart = b.rim - b.length;
    const flare = bellFlare([0, b.throat], [b.length, b.radius], b.gamma);
    const bow = (b.y - t.tail.low) / 2;
    const tail: Corner[] = [
        [[v.x, t.tail.low, z1]],
        [[b.x, t.tail.low, z1], 0.011],
        [[b.x, t.tail.low, t.tail.back], bow],
        [[b.x, b.y, t.tail.back], bow],
        [[b.x, b.y, flareStart]],
    ];
    pieces.push(
        k.pipe(tail, t.tail.radii),
        k.bell(flare, [b.x, b.y, flareStart], [0, 0, 1]),
        ...k.ferrule(
            [b.x, b.y, flareStart + 0.004],
            [0, 0, 1],
            b.throat,
            0.014,
        ),
        // where the bow's legs join the straight tubing
        ...k.ferrule([b.x, b.y, t.tail.back + bow + 0.006], [0, 0, 1], 0.0064),
        ...k.ferrule(
            [b.x, t.tail.low, t.tail.back + bow + 0.006],
            [0, 0, 1],
            0.0062,
        ),
    );
    for (const [zl, zb, rb] of t.braces)
        pieces.push(...strut([0, leadY, zl], 0.006, [b.x, b.y, zb], rb));

    // The open horn: mouthpiece, leadpipe and tuning slide, the way through
    // the block (each piston's port steps to the lower knuckles' height),
    // bell tube and flare.
    const knuckleY = v.bottom + (v.top - v.bottom) * 0.3;
    const main =
        mp.end[2] -
        t.rim[2] +
        length(lead, 0.02) +
        Math.abs(t.lead.low - knuckleY) +
        (z3 - z1) +
        Math.abs(t.tail.low - knuckleY) +
        length(tail, 0.02) +
        b.length;
    const loops: [number, number, number] = [0, 0, 0];
    /** The run that brings `build`'s loop to valve `n`'s share of the open length. */
    const solve = (
        n: 1 | 2 | 3,
        build: (run: number) => Corner[],
        base: number,
    ): Corner[] => {
        // every meter of run adds two of tubing
        const run =
            base +
            (t.openLength * VALVE_SLIDE_RATIO[n] - length(build(base), 0.02)) /
                2;
        const loop = build(run);
        loops[n - 1] = length(loop, 0.02);
        return loop;
    };
    /** The outer sleeves over a slide's two legs, from `a` to `b` along z. */
    const sleeved = (
        legs: [number, number][],
        a: number,
        b2: number,
        r: number,
    ) =>
        k.segments.trim && Math.abs(b2 - a) > 0.01
            ? legs.flatMap(([x, y]) => [
                  k.sleeve([x, y, a], [x, y, b2], r * 1.13 + 0.0003),
                  ...k.ferrule([x, y, a], [0, 0, 1], r * 1.13, 0.004),
              ])
            : [];

    {
        // first valve: straight back toward the player, with the thumb
        // saddle standing on its upper leg
        const s = t.slides[1];
        const width = s.upper - s.lower;
        const loop = solve(
            1,
            (run) => [
                [[v.x, s.upper, z1]],
                [[s.x, s.upper, z1 - run], width / 2],
                [[s.x, s.lower, z1 - run], width / 2],
                [[v.x, s.lower, z1]],
            ],
            0.04,
        );
        const far = loop[1][0][2];
        pieces.push(
            k.pipe(loop, s.r),
            ...sleeved(
                [
                    [s.x, s.upper],
                    [s.x, s.lower],
                ],
                z1 - v.r - 0.02,
                far + width / 2 + 0.003,
                s.r,
            ),
        );
        const top = s.upper + s.r * 1.13;
        const zs = z1 - 0.0235;
        pieces.push(
            k.sleeve([s.x, top - 0.001, zs], [s.x, top + 0.003, zs], 0.002),
            k.ring([s.x, top + 0.002 + 0.011, zs], 0.011, 55, 305, "x"),
        );
    }
    {
        // second valve: a short stub out to the right, angled back
        const s = t.slides[2];
        const a = (s.angle * Math.PI) / 180;
        const width = s.upper - s.lower;
        const out = (y: number, d: number): Vec3 => [
            v.x - Math.cos(a) * d,
            y,
            z2 - Math.sin(a) * d,
        ];
        const loop = solve(
            2,
            (run) => [
                [out(s.upper, 0)],
                [out(s.upper, run), width / 2],
                [out(s.lower, run), width / 2],
                [out(s.lower, 0)],
            ],
            0.025,
        );
        pieces.push(k.pipe(loop, s.r));
    }
    {
        // third valve: forward on the right, each leg leaving the casing
        // through a knuckle; the finger ring stands on the upper leg and
        // the water key hangs under the crook
        const s = t.slides[3];
        const [ux, uy] = s.upper;
        const [lx, ly] = s.lower;
        const width = Math.hypot(ux - lx, uy - ly);
        const knuckle = v.r + 0.008;
        const loop = solve(
            3,
            (run) => [
                [[v.x, uy, z3]],
                [[ux, uy, z3 + knuckle], 0.008],
                [[ux, uy, z3 + run], width / 2],
                [[lx, ly, z3 + run], width / 2],
                [[lx, ly, z3 + knuckle], 0.008],
                [[v.x, ly, z3]],
            ],
            0.06,
        );
        const far = loop[2][0][2];
        pieces.push(
            k.pipe(loop, s.r),
            ...sleeved(
                [s.upper, s.lower],
                z3 + knuckle + 0.02,
                far - width / 2 - 0.003,
                s.r,
            ),
            ...k.waterKey(
                [lx, ly, far - width / 2 - 0.009],
                [0, 0, -1],
                [0, -1, 0],
                s.r * 1.13,
            ),
        );
        const top = uy + s.r * 1.13;
        const zr = z3 + knuckle + 0.032;
        pieces.push(
            k.sleeve([ux, top - 0.001, zr], [ux, top + 0.0025, zr], 0.002),
            k.ring([ux, top + 0.002 + 0.0105, zr], 0.0105, 0, 360, "x"),
        );
    }

    // the little finger's hook on the leadpipe, ahead of the third valve
    pieces.push(
        k.ring(
            [0, leadY + 0.006 + 0.011, z3 + v.r + 0.02],
            0.011,
            -40,
            200,
            "x",
        ),
    );

    return {
        pieces,
        leftGrip: t.leftGrip,
        valves: k.casings,
        rim: t.rim,
        tubing: { main, valves: loops },
    };
}
