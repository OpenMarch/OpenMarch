/**
 * The contra: a shoulder-carried, bell-front marching tuba in BBb
 * (docs/3d/instruments.md §3, §4), assembled from `hornKit` parts. It is
 * laid out from side and three-quarter views of the real instrument: one
 * huge loop running back over the left shoulder with the bell on top, a
 * second loop nested inside it, a third and thinnest one beside that, and
 * the three valves standing low at the front beside the loops, their long
 * slides folded back along the horn.
 *
 * The tubing is one air path: mouthpiece, leadpipe (around the main tuning
 * slide's crook), into the third valve, through the block, out of the
 * first valve into the thin loop, the second loop, the front bow, the
 * bottom tube, the back bow and the bell. Each valve has one loop of its
 * own, and its length is not drawn by eye: it is `VALVE_SLIDE_RATIO` of
 * the open horn as built (about 5.5 m: BBb), so the valves lower it a half
 * step, a whole step and a step and a half. Only proportions come from the
 * reference pages; no image, mark or model name is used.
 *
 * Instrument frame: origin at the right hand's grip on the valve caps, +Z
 * toward the bell, +Y up through the caps, +X the performer's left. Meters.
 * Pure: no three.js.
 */
import {
    bellFlare,
    bentPath,
    hornKit,
    pathLength,
    taper,
    VALVE_SLIDE_RATIO,
    type Corner,
    type Horn,
} from "./hornKit";
import {
    smoothTube,
    PART_CHROME,
    PART_METAL,
    type Piece,
    type Vec3,
} from "./mesh";
import type { Detail } from "./model";

/**
 * The planes the tubing lies in, as x: the valves and the first valve's
 * slide stand at the grip, the third valve's slide hugs the casings, the
 * two big loops share one plane beside them and the thin first loop lies
 * on their far side.
 */
const X = { valves: 0, third: 0.025, loop: 0.05, thin: 0.092 };

/**
 * A contra's tubing runs from a finger's width to a forearm's, so each
 * weight is swept at its own resolution: ring sides and points per quarter
 * bend, at each detail level.
 */
type Weight = "thin" | "mid" | "big";
const RINGS: Record<Detail, Record<Weight, [sides: number, bend: number]>> = {
    high: { thin: [8, 5], mid: [14, 7], big: [20, 9] },
    low: { thin: [5, 2], mid: [7, 3], big: [10, 4] },
};

const SPEC = {
    /**
     * The mouthpiece rim's center; it faces the performer, the cup opens
     * along +Z. It sits 0.12 m behind the valves, so they stand in front
     * of the face, as photos of players show (2026-11-10).
     */
    rim: [-0.1, -0.03, -0.12] as Vec3,
    /** The leadpipe: forward from the receiver, around the main tuning slide's crook, back into the third valve. */
    lead: {
        crookZ: 0.19,
        /** The return leg: x and y. */
        back: [-0.04, -0.064] as [number, number],
        radii: [0.0062, 0.0085] as [number, number],
    },
    valves: {
        /** First (nearest the performer) to third, along z. */
        z: [-0.035, 0, 0.035] as [number, number, number],
        r: 0.014,
        top: 0.01,
        bottom: -0.09,
        /** The height the air crosses the block at. */
        port: -0.06,
    },
    /** The valve tubing's radius, and the slides'. */
    bore: 0.0095,
    slide: 0.0075,
    /**
     * Each slide's two legs (y) where they leave the casing: the first runs
     * back from its casing, the third back past the block, the second
     * forward. The long two climb `rise` once clear of the block.
     */
    slides: {
        1: [-0.036, -0.066] as [number, number],
        2: [-0.014, -0.04] as [number, number],
        3: [-0.014, -0.036] as [number, number],
    },
    rise: { 1: 0.015, 3: 0.028 },
    /** The second slide's plane, on the performer's side of the block. */
    secondX: -0.034,
    /**
     * The thin first loop: back along the bottom at the ports' height,
     * around its bow at `backZ`, forward along the top, and down a slanted
     * front bow at `frontZ` into the second loop's plane.
     */
    thin: { topFront: 0.045, topBack: 0.058, backZ: -0.69, frontZ: -0.09 },
    /** The inner runs' height along the bottom, and where the thin loop hands over. */
    innerBottom: -0.08,
    handoverZ: -0.25,
    /** The second loop: its bow's corner z, and its top run falling from there to the front bow. */
    second: { backZ: -0.6985, topBack: 0.068, topFront: 0.038 },
    /** The front bow's corner z, where the second loop turns down into the outer one. */
    frontZ: 0.064,
    /** The outer loop: the bottom tube's height, the back bow's corner z. */
    outer: { bottom: -0.14, backZ: -0.768 },
    /**
     * The bell: its tail's and rim's centers (y, z) and radii, the rim read
     * at its plane, and the Bessel flare's exponent between them.
     */
    bell: {
        tail: [0.147, -0.577] as [number, number],
        rim: [0.19, 0.245] as [number, number],
        radii: [0.053, 0.2445] as [number, number],
        gamma: 0.8,
    },
};

export function contra(detail: Detail): Horn {
    const k = hornKit(detail);
    const s = SPEC;
    const v = s.valves;
    const pieces: Piece[] = [];

    /** Lays a tube through `corners` and returns its centerline's length. */
    const lay = (
        weight: Weight,
        corners: Corner[],
        radii: number | [number, number][],
        bend = 0.02,
    ): number => {
        const [sides, steps] = RINGS[detail][weight];
        // a U's two arcs meet a hair apart; one ring there, not two that cross
        const path = bentPath(
            corners.map(([p, b]) => [p, b ?? bend]),
            steps,
        ).filter(
            (p, i, all) =>
                i === 0 ||
                i + 1 === all.length ||
                Math.hypot(
                    p[0] - all[i - 1][0],
                    p[1] - all[i - 1][1],
                    p[2] - all[i - 1][2],
                ) > 5e-4,
        );
        const r =
            typeof radii === "number"
                ? path.map(() => radii)
                : taper(path, radii);
        pieces.push(
            smoothTube(path, r, sides, PART_METAL, {
                capStart: false,
                capEnd: false,
            }),
        );
        return pathLength(path);
    };
    /** A ferrule band around a tube of radius `r` at `p`, at a weight's ring count. */
    const band = (
        p: Vec3,
        dir: Vec3,
        r: number,
        length: number,
        weight: Weight,
    ): Piece[] =>
        k.segments.trim
            ? [
                  k.turned(
                      [
                          [r, -length / 2],
                          [r * 1.035 + 0.0012, -length / 2 + 0.0015],
                          [r * 1.035 + 0.0012, length / 2 - 0.0015],
                          [r, length / 2],
                      ],
                      p,
                      dir,
                      PART_METAL,
                      RINGS[detail][weight][0],
                  ),
              ]
            : [];

    // ---- mouthpiece and leadpipe -------------------------------------
    // a tuba's mouthpiece: a deep wide cup on a short shank
    const rim = s.rim;
    const along = (d: number): Vec3 => [rim[0], rim[1], rim[2] + d];
    pieces.push(
        k.turned(
            [
                [0.0045, 0.034],
                [0.012, 0.02],
                [0.0158, 0.006],
                [0.0168, 0.0012],
                [0.0195, 0],
                [0.0228, 0.003],
                [0.0232, 0.009],
                [0.0222, 0.02],
                [0.0185, 0.034],
                [0.012, 0.046],
                [0.0085, 0.054],
                [0.0078, 0.07],
                [0.0068, 0.09],
            ],
            rim,
            [0, 0, 1],
            PART_CHROME,
        ),
        // the receiver, with a raised ring at its mouth
        k.sleeve(along(0.07), along(0.115), 0.0088),
    );
    if (k.segments.trim)
        pieces.push(k.sleeve(along(0.07), along(0.076), 0.0101));
    const mouthpieceLength = 0.09;
    const [bx, by] = s.lead.back;
    const z3 = v.z[2];
    let main =
        mouthpieceLength +
        lay(
            "thin",
            [
                [along(mouthpieceLength)],
                [[rim[0], rim[1], s.lead.crookZ], 0.04],
                [[bx, by, s.lead.crookZ], 0.04],
                [[bx, by, z3], 0.016],
                [[X.valves, v.port, z3]],
            ],
            [
                [0, s.lead.radii[0]],
                [1, s.lead.radii[1]],
            ],
        );
    if (k.segments.trim) {
        // the main tuning slide's outer sleeves on both legs of its crook
        const r = s.lead.radii[1] * 1.12 + 0.0003;
        pieces.push(
            k.sleeve([bx, by, z3 + 0.045], [bx, by, s.lead.crookZ - 0.04], r),
            ...k.ferrule([bx, by, z3 + 0.045], [0, 0, 1], r, 0.005),
            k.sleeve(along(0.118), [rim[0], rim[1], s.lead.crookZ - 0.04], r),
        );
    }
    pieces.push(
        ...k.waterKey(
            [bx, by, s.lead.crookZ - 0.03],
            [0, 0, -1],
            [0, -1, 0],
            s.lead.radii[1],
        ),
    );

    // ---- valves ------------------------------------------------------
    pieces.push(
        ...k.valves(
            v.z.map((z) => [X.valves, z] as [number, number]),
            v.r,
            v.bottom,
            v.top,
        ),
    );
    // the thumb ring behind the first valve
    pieces.push(
        k.ring([X.valves, -0.006, v.z[0] - v.r - 0.0095], 0.011, 0, 360, "y"),
    );
    // through the block, third valve to first
    main += v.z[2] - v.z[0];

    // ---- the wrap: three nested loops, thin to huge ------------------
    const z1 = v.z[0];
    const A = X.loop;
    const B = X.thin;
    const t = s.thin;
    const yIn = s.innerBottom;
    // out of the first valve across to the far plane, back along the
    // bottom, around, forward along the top and down its own front bow
    main += lay(
        "thin",
        [
            [[X.valves, v.port, z1]],
            [[B, v.port, z1], 0.02],
            [[B, v.port, t.backZ], 0.08],
            [[B, t.topBack, t.backZ], 0.08],
            [[B, t.topFront, t.frontZ], 0.08],
            [[A, yIn, t.frontZ], 0.08],
            [[A, yIn, s.handoverZ]],
        ],
        [
            [0, s.bore],
            [1, 0.0115],
        ],
    );
    // the second loop: back along the bottom, up around its bow and
    // forward under the bell
    const sec = s.second;
    const topAt = (z: number) =>
        sec.topBack +
        ((sec.topFront - sec.topBack) * (z - sec.backZ)) /
            (s.frontZ - sec.backZ);
    const joinZ = -0.3;
    main += lay(
        "mid",
        [
            [[A, yIn, s.handoverZ]],
            [[A, yIn, sec.backZ], 0.08],
            [[A, sec.topBack, sec.backZ], 0.08],
            [[A, topAt(joinZ), joinZ]],
        ],
        [
            [0, 0.0115],
            [1, 0.019],
        ],
    );
    // down the front bow and back along the bottom, growing all the way
    const o = s.outer;
    const [tailY, tailZ] = s.bell.tail;
    main += lay(
        "big",
        [
            [[A, topAt(joinZ), joinZ]],
            [[A, sec.topFront, s.frontZ], 0.1],
            [[A, o.bottom, s.frontZ], 0.1],
            [[A, o.bottom, tailZ]],
        ],
        [
            [0, 0.019],
            [0.25, 0.023],
            [0.5, 0.03],
            [0.8, 0.038],
            [1, 0.04],
        ],
    );
    // the bell: tilted a few degrees up from its tail to its rim
    const [rimY, rimZ] = s.bell.rim;
    const tail: Vec3 = [A, tailY, tailZ];
    const bellLength = Math.hypot(rimY - tailY, rimZ - tailZ);
    const axis: Vec3 = [
        0,
        (rimY - tailY) / bellLength,
        (rimZ - tailZ) / bellLength,
    ];
    const axisY = (z: number) => tailY + ((z - tailZ) * axis[1]) / axis[2];
    // the big back bow up to the bell's tail
    main += lay(
        "big",
        [
            [[A, o.bottom, tailZ]],
            [[A, o.bottom, o.backZ], 0.15],
            [[A, axisY(o.backZ), o.backZ], 0.15],
            [tail],
        ],
        [
            [0, 0.04],
            [0.5, 0.047],
            [1, 0.053],
        ],
    );
    const flare = bellFlare(
        [0, s.bell.radii[0]],
        [bellLength, s.bell.radii[1]],
        s.bell.gamma,
    );
    pieces.push(k.bell(flare, tail, axis));
    main += bellLength;
    // ferrules where the wrap's sections join
    pieces.push(
        ...band([A, yIn, s.handoverZ], [0, 0, 1], 0.0115, 0.014, "thin"),
        ...band([A, topAt(joinZ), joinZ], [0, 0, 1], 0.019, 0.018, "mid"),
        ...band([A, o.bottom, tailZ], [0, 0, 1], 0.04, 0.03, "big"),
        ...band([A, o.bottom, -0.08], [0, 0, 1], 0.0318, 0.02, "big"),
        ...band(
            [A, tailY + axis[1] * 0.01, tailZ + axis[2] * 0.01],
            axis,
            0.0535,
            0.036,
            "big",
        ),
    );

    // ---- valve slides: one loop each, sized from the open horn -------
    const loops: [number, number, number] = [0, 0, 0];
    const solve = (
        n: 1 | 2 | 3,
        build: (run: number) => Corner[],
        base: number,
    ): { run: number } => {
        const measure = (run: number) =>
            pathLength(
                bentPath(
                    build(run).map(([p, b]) => [p, b ?? 0.02]),
                    k.segments.bend,
                ),
            );
        // every meter of run adds two of tubing
        const run = base + (main * VALVE_SLIDE_RATIO[n] - measure(base)) / 2;
        loops[n - 1] = lay("thin", build(run), s.slide);
        return { run };
    };
    /** The outer sleeves on a slide's two legs, from z `a` to z `b`. */
    const sleeves = (x: number, ys: [number, number], a: number, b: number) => {
        if (!k.segments.trim || Math.abs(b - a) < 0.012) return;
        const r = s.slide * 1.13 + 0.0003;
        for (const y of ys)
            pieces.push(
                k.sleeve([x, y, a], [x, y, b], r),
                ...k.ferrule([x, y, a], [0, 0, 1], r, 0.005),
            );
    };
    {
        // first valve: straight back from its casing, in the valves' plane
        const [yu, yl] = s.slides[1];
        const w = (yu - yl) / 2;
        const up = s.rise[1];
        const { run } = solve(
            1,
            (run) => [
                [[X.valves, yu, z1]],
                [[X.valves, yu, z1 - 0.025], 0.03],
                [[X.valves, yu + up, z1 - 0.075], 0.03],
                [[X.valves, yu + up, z1 - run], w],
                [[X.valves, yl + up, z1 - run], w],
                [[X.valves, yl + up, z1 - 0.075], 0.03],
                [[X.valves, yl, z1 - 0.025], 0.03],
                [[X.valves, yl, z1]],
            ],
            0.3,
        );
        sleeves(
            X.valves,
            [yu + up, yl + up],
            z1 - run * 0.45,
            z1 - run + w + 0.004,
        );
    }
    {
        // second valve: out to the performer's side and forward
        const [yu, yl] = s.slides[2];
        const w = (yu - yl) / 2;
        const x = s.secondX;
        const { run } = solve(
            2,
            (run) => [
                [[X.valves, yu, 0]],
                [[x, yu, 0], 0.012],
                [[x, yu, run], w],
                [[x, yl, run], w],
                [[x, yl, 0], 0.012],
                [[X.valves, yl, 0]],
            ],
            0.1,
        );
        sleeves(x, s.slides[2], run * 0.45, run - w - 0.004);
    }
    {
        // third valve: out toward the loops and back past the block
        const [yu, yl] = s.slides[3];
        const w = (yu - yl) / 2;
        const x = X.third;
        const up = s.rise[3];
        const { run } = solve(
            3,
            (run) => [
                [[X.valves, yu, z3]],
                [[x, yu, z3], 0.011],
                [[x, yu, z1 - 0.03], 0.03],
                [[x, yu + up, z1 - 0.085], 0.03],
                [[x, yu + up, z3 - run], w],
                [[x, yl + up, z3 - run], w],
                [[x, yl + up, z1 - 0.085], 0.03],
                [[x, yl, z1 - 0.03], 0.03],
                [[x, yl, z3], 0.011],
                [[X.valves, yl, z3]],
            ],
            0.3,
        );
        sleeves(x, [yu + up, yl + up], z3 - run * 0.5, z3 - run + w + 0.004);
        pieces.push(
            ...k.waterKey(
                [x, yl + up, z3 - run + 0.02],
                [0, 0, 1],
                [0, -1, 0],
                s.slide,
            ),
        );
    }

    // ---- braces ------------------------------------------------------
    /** The bell's radius at z, a little inside its wall. */
    const bellR = (z: number) => {
        const d = (z - tailZ) / axis[2];
        for (let i = 0; i + 1 < flare.length; i++)
            if (d <= flare[i + 1][0]) {
                const f = (d - flare[i][0]) / (flare[i + 1][0] - flare[i][0]);
                return (
                    (flare[i][1] + (flare[i + 1][1] - flare[i][1]) * f) * 0.95
                );
            }
        return flare[flare.length - 1][1];
    };
    const [s1u, s1l] = s.slides[1].map((y) => y + s.rise[1]);
    const [s3u, s3l] = s.slides[3].map((y) => y + s.rise[3]);
    const braces: [Vec3, Vec3][] = [
        // the second loop's top run to the bell above it
        ...[-0.5, -0.2].map(
            (z) =>
                [
                    [A, topAt(z), z],
                    [A, axisY(z) - bellR(z), z],
                ] as [Vec3, Vec3],
        ),
        // the thin loop to the second, top and bottom
        [
            [A, topAt(-0.42), -0.42],
            [B, topAt(-0.42) - 0.008, -0.42],
        ],
        [
            [A, yIn, -0.42],
            [B, v.port, -0.42],
        ],
        [
            [A, yIn, -0.2],
            [B, v.port, -0.2],
        ],
        // the inner bottom run to the bottom tube
        [
            [A, yIn, -0.5],
            [A, o.bottom, -0.5],
        ],
        // the valve block to the bottom tube and to the front bow
        [
            [X.valves, -0.078, 0],
            [A - 0.012, o.bottom + 0.02, 0],
        ],
        [
            [bx, by, 0.0625],
            [A, by, 0.0625],
        ],
        // the slides to each other and to the loop beside them
        [
            [X.valves, s1l, -0.3],
            [A, yIn, -0.3],
        ],
        [
            [X.valves, s1u, -0.2],
            [X.third, s3l, -0.2],
        ],
        [
            [X.valves, s1u, -0.12],
            [X.valves, s1l, -0.12],
        ],
        [
            [X.third, s3u, -0.3],
            [X.third, s3l, -0.3],
        ],
        // the receiver to the second slide, the second slide to the leadpipe
        [
            [rim[0], rim[1], rim[2] + 0.1],
            [s.secondX, s.slides[2][0], rim[2] + 0.1],
        ],
        [
            [s.secondX, s.slides[2][1], 0.09],
            [bx, by, 0.09],
        ],
    ];
    for (const [a, b] of braces) pieces.push(...k.brace(a, b));

    return {
        pieces,
        leftGrip: [A, o.bottom, -0.3],
        valves: k.casings,
        rim,
        tubing: { main, valves: loops },
    };
}
