/**
 * The valved marching horns (docs/3d/instruments.md §3, §4): mellophone,
 * baritone, euphonium, contra and sousaphone, assembled from `hornKit`
 * parts. Each is laid out from a side view of the real instrument:
 * distances along the horn from the mouthpiece rim, heights from the bell's
 * axis, and how far each run sits to the performer's left. Only proportions
 * come from the reference pages; no image, mark or model name is used.
 *
 * Instrument frame: origin at the right hand's grip on the valves, +Z
 * toward the bell, +Y up through the valve caps, +X the performer's left.
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
import type { Piece, Vec3 } from "./mesh";
import type { Detail } from "./model";

export type { Horn };

/** A point of a layout: along the horn from the rim, up from the bell's axis, to the left. */
type Zyx = [z: number, y: number, x: number];

/**
 * A bell-front horn over an oval wrap. Lengths are meters; `z` runs from
 * the mouthpiece rim toward the bell, `y` is up from the bell's axis, `x`
 * is to the performer's left of the leadpipe.
 *
 * The tubing is one air path: mouthpiece, leadpipe (with the main tuning
 * slide in it), into the third valve, through the block, out of the first
 * valve into the wrap and the bell. Each valve has one loop of its own,
 * leaving and returning to its casing, and the loop's length is not drawn
 * by eye: it is `VALVE_SLIDE_RATIO` of `openLength`, so the valves lower
 * the horn a half step, a whole step and a step and a half.
 */
export interface OvalHorn {
    /** The open horn's sounding length for its key, rim to bell. */
    openLength: number;
    /** How far the rim sits behind the grip, and the leadpipe below the bell's axis. */
    rimBack: number;
    leadDrop: number;
    /** Mouthpiece size against a trumpet's. */
    mouthpiece: number;
    /** The bell: its flare (z, radius) from its tail to the rim, and its x. */
    bell: { x: number; flare: [number, number][] };
    /** The wrap from the bell's tail into the first valve: corners (z, y, x, bend) and radius stops. */
    wrap: { corners: [...Zyx, number?][]; radii: [number, number][] };
    /** The leadpipe from the receiver into the third valve, tuning slide included. */
    lead: { corners: [...Zyx, number?][]; radius: number };
    /**
     * The tuning slide's outer sleeves along the leadpipe, and its water
     * key. A horn whose tuning slide is in the wrap instead gives the
     * `radius` of the tube the sleeves sit on.
     */
    tuning: { sleeves: [Zyx, Zyx][]; waterKey: Zyx; radius?: number };
    /** `stem` is how far the buttons stand above the top caps (0.02 unless given). */
    valves: {
        x: number;
        z: number[];
        r: number;
        top: number;
        bottom: number;
        stem?: number;
    };
    /**
     * The first and third valves' loops: each leaves its casing sideways
     * to the plane `x`, runs along the horn (`dir` ±1 along z) and returns
     * `width` lower. How far it runs is solved from the valve's ratio.
     *
     * A loop too long to lie out straight is folded (`fold`): it runs
     * `reach` along the horn, bows down by `drop`, comes back past its own
     * casing to a crook on the other side, and returns in the plane
     * `fold.x` to the port `width` below the first. The crook's distance
     * is then what the ratio solves.
     */
    slides: Record<
        1 | 3,
        {
            y: number;
            x: number;
            dir: 1 | -1;
            width: number;
            r: number;
            fold?: { reach: number; drop: number; x: number };
        }
    >;
    /**
     * The second valve's short loop, straight out to the performer's
     * right; or, with a plane `x` and a `dir`, turned along the horn like
     * the other two.
     */
    stub: { y: number; width: number; r: number; x?: number; dir?: 1 | -1 };
    /** Braces between points. */
    braces: [Zyx, Zyx][];
    /** Ferrules on the wrap, as fractions of its length. */
    ferrules: number[];
    /**
     * The finger hook behind the valves and the ring in front of them,
     * both standing on the leadpipe: false leaves one off a horn whose
     * leadpipe is not there to carry it.
     */
    rings?: { back?: boolean; front?: boolean };
}

export function ovalHorn(h: OvalHorn, detail: Detail): Horn {
    const k = hornKit(detail);
    const axisY = 0.018 + h.leadDrop;
    const at = (z: number, y: number, x: number): Vec3 => [
        x,
        y + axisY,
        z - h.rimBack,
    ];
    const corners = (cs: [number, number, number, number?][]): Corner[] =>
        cs.map(([z, y, x, bend]) => [at(z, y, x), bend]);
    const pieces: Piece[] = [];

    // the bell, and the wrap running back from its tail
    const tail = h.bell.flare[0][0];
    pieces.push(
        k.bell(
            h.bell.flare.map(([z, r]) => [z - tail, r]),
            at(tail, 0, h.bell.x),
            [0, 0, 1],
        ),
    );
    pieces.push(
        ...k.ferrule(
            at(tail + 0.012, 0, h.bell.x),
            [0, 0, 1],
            h.bell.flare[0][1] * 1.03,
            0.016,
        ),
    );
    const wrapCorners = corners(h.wrap.corners);
    pieces.push(k.pipe(wrapCorners, h.wrap.radii, { bend: 0.03 }));
    {
        // ferrules where the wrap's sections join
        const path = bentPath(
            wrapCorners.map(([p, b]) => [p, b ?? 0.03]),
            k.segments.bend,
        );
        const radii = taper(path, h.wrap.radii);
        for (const f of h.ferrules) {
            const { p, dir } = pathAt(path, f);
            const r = radii[Math.round(f * (radii.length - 1))];
            pieces.push(...k.ferrule(p, dir, r, 0.014));
        }
    }

    // mouthpiece, receiver and leadpipe, with the main tuning slide in it
    const rim = at(0, -h.leadDrop, 0);
    const mp = k.mouthpiece(rim, [0, 0, 1], h.mouthpiece);
    pieces.push(...mp.pieces);
    const leadCorners: Corner[] = [[mp.end], ...corners(h.lead.corners)];
    pieces.push(k.pipe(leadCorners, h.lead.radius, { bend: 0.022 }));
    const tuningR = h.tuning.radius ?? h.lead.radius;
    if (k.segments.trim)
        for (const [a, b] of h.tuning.sleeves)
            pieces.push(
                k.sleeve(at(...a), at(...b), tuningR * 1.14 + 0.0003),
                ...k.ferrule(at(...a), [0, 0, 1], tuningR * 1.14, 0.004),
            );
    pieces.push(
        ...k.waterKey(
            at(...h.tuning.waterKey),
            [0, 0, -1],
            [0, -1, 0],
            tuningR,
        ),
    );

    // valves
    const v = h.valves;
    pieces.push(
        ...k.valves(
            v.z.map((z) => [v.x, z - h.rimBack] as [number, number]),
            v.r,
            v.bottom + axisY,
            v.top + axisY,
            v.stem === undefined ? {} : { stem: v.stem },
        ),
    );

    // The open horn: mouthpiece, leadpipe, the way through the block, wrap
    // and bell. The valve loops are sized from it.
    const length = (cs: Corner[], bend: number) =>
        pathLength(
            bentPath(
                cs.map(([p, b]) => [p, b ?? bend]),
                k.segments.bend,
            ),
        );
    const flare = h.bell.flare;
    const main =
        mp.end[2] -
        rim[2] +
        length(leadCorners, 0.022) +
        (v.z[2] - v.z[0]) +
        length(wrapCorners, 0.03) +
        (flare[flare.length - 1][0] - flare[0][0]);
    const valveLoops: [number, number, number] = [0, 0, 0];

    // the first and third valves' loops: each leg leaves its casing
    // sideways, turns along the horn, and the crook brings it back
    for (const n of [1, 3] as const) {
        const sl = h.slides[n];
        const z = v.z[n - 1];
        const want = h.openLength * VALVE_SLIDE_RATIO[n];
        const dx = Math.abs(sl.x - v.x);
        const elbow = Math.min(0.009, dx * 0.9);
        if (sl.fold) {
            // a folded loop: out, a bow down, back past the casing to a
            // crook that crosses to the return's plane, and home
            const f = sl.fold;
            const low = sl.y - f.drop;
            const home = sl.y - sl.width;
            const crook = Math.hypot(low - home, sl.x - f.x) / 2;
            const fold = (run: number): Corner[] => [
                [at(z, sl.y, v.x)],
                [at(z, sl.y, sl.x), elbow],
                [at(z + sl.dir * f.reach, sl.y, sl.x), f.drop / 2],
                [at(z + sl.dir * f.reach, low, sl.x), f.drop / 2],
                [at(z - sl.dir * run, low, sl.x), crook],
                [at(z - sl.dir * run, home, f.x), crook],
                [at(z, home, f.x), Math.min(0.009, Math.abs(f.x - v.x) * 0.9)],
                [at(z, home, v.x)],
            ];
            // every meter the crook moves away adds two of tubing
            const base = crook + 0.02;
            const run = base + (want - length(fold(base), 0.02)) / 2;
            const loop = fold(run);
            valveLoops[n - 1] = length(loop, 0.02);
            pieces.push(k.pipe(loop, sl.r));
            // the crook is the slide: its sleeves are on the two legs before it
            const s0 = z - sl.dir * run * 0.5;
            const s1 = z - sl.dir * (run - crook - 0.004);
            if (k.segments.trim && (s0 - s1) * sl.dir > 0.01)
                for (const [yy, xx] of [
                    [low, sl.x],
                    [home, f.x],
                ] as [number, number][])
                    pieces.push(
                        k.sleeve(
                            at(s0, yy, xx),
                            at(s1, yy, xx),
                            sl.r * 1.14 + 0.0003,
                        ),
                        ...k.ferrule(
                            at(s0, yy, xx),
                            [0, 0, 1],
                            sl.r * 1.14,
                            0.004,
                        ),
                    );
            pieces.push(
                ...k.waterKey(
                    at(z + sl.dir * f.reach * 0.55, low, sl.x),
                    [0, 0, -sl.dir],
                    [0, -1, 0],
                    sl.r,
                ),
            );
            continue;
        }
        const build = (run: number): Corner[] => [
            [at(z, sl.y, v.x)],
            [at(z, sl.y, sl.x), elbow],
            [at(z + sl.dir * run, sl.y, sl.x), sl.width / 2],
            [at(z + sl.dir * run, sl.y - sl.width, sl.x), sl.width / 2],
            [at(z, sl.y - sl.width, sl.x), elbow],
            [at(z, sl.y - sl.width, v.x)],
        ];
        // every meter of run adds two of tubing: solve the run for the length
        const base = sl.width + 0.01;
        const run = base + (want - length(build(base), 0.02)) / 2;
        const loop = build(run);
        valveLoops[n - 1] = length(loop, 0.02);
        pieces.push(k.pipe(loop, sl.r));
        const far = z + sl.dir * run;
        const s0 = z + sl.dir * run * 0.35;
        const s1 = far - sl.dir * (sl.width / 2 + 0.004);
        if (k.segments.trim && (s1 - s0) * sl.dir > 0.01)
            for (const yy of [sl.y, sl.y - sl.width])
                pieces.push(
                    k.sleeve(
                        at(s0, yy, sl.x),
                        at(s1, yy, sl.x),
                        sl.r * 1.14 + 0.0003,
                    ),
                    ...k.ferrule(
                        at(s0, yy, sl.x),
                        [0, 0, 1],
                        sl.r * 1.14,
                        0.004,
                    ),
                );
        if (n === 3)
            pieces.push(
                ...k.waterKey(
                    at(far - sl.dir * sl.width * 0.25, sl.y - sl.width, sl.x),
                    [0, 0, -sl.dir],
                    [0, -1, 0],
                    sl.r,
                ),
            );
    }
    {
        // the second valve's loop: straight out to the right and back, or
        // out to its plane and along the horn
        const st = h.stub;
        const z = v.z[1];
        const sx = st.x;
        const dir = st.dir ?? -1;
        const elbow = Math.min(0.009, Math.abs((sx ?? v.x) - v.x) * 0.9);
        const build = (run: number): Corner[] =>
            sx === undefined
                ? [
                      [at(z, st.y, v.x)],
                      [at(z, st.y, v.x - run), st.width / 2],
                      [at(z, st.y - st.width, v.x - run), st.width / 2],
                      [at(z, st.y - st.width, v.x)],
                  ]
                : [
                      [at(z, st.y, v.x)],
                      [at(z, st.y, sx), elbow],
                      [at(z + dir * run, st.y, sx), st.width / 2],
                      [at(z + dir * run, st.y - st.width, sx), st.width / 2],
                      [at(z, st.y - st.width, sx), elbow],
                      [at(z, st.y - st.width, v.x)],
                  ];
        const base = st.width + 0.01;
        const run =
            base +
            (h.openLength * VALVE_SLIDE_RATIO[2] - length(build(base), 0.02)) /
                2;
        valveLoops[1] = length(build(run), 0.02);
        pieces.push(k.pipe(build(run), st.r));
    }

    for (const [a, b] of h.braces) pieces.push(...k.brace(at(...a), at(...b)));

    // the finger hook behind the valves and the ring in front of them
    const onLead = 0.018 + h.lead.radius + 0.0095;
    if (h.rings?.back !== false)
        pieces.push(
            k.ring(
                [0, onLead, v.z[0] - h.rimBack - v.r - 0.022],
                0.011,
                -40,
                200,
                "x",
            ),
        );
    if (h.rings?.front !== false)
        pieces.push(
            k.ring(
                [0, onLead, v.z[2] - h.rimBack + v.r + 0.02],
                0.011,
                0,
                360,
                "x",
            ),
        );

    return {
        pieces,
        valves: k.casings,
        leftGrip: [
            v.x + 0.028,
            v.bottom * 0.5 + axisY,
            v.z[1] - h.rimBack - 0.06,
        ],
        rim,
        tubing: { main, valves: valveLoops },
    };
}

/**
 * The mellophone: a wide bell over one oval wrap. The leadpipe crosses in
 * front of the valves, bows down past them and loops back around the block;
 * the tuning slides are two nested U's low at the front.
 */
const MELLOPHONE: OvalHorn = {
    // in F, a fourth below the trumpet's 1.48 m
    openLength: 1.97,
    rimBack: 0.1925,
    leadDrop: 0.013,
    mouthpiece: 1.0,
    bell: {
        x: 0.05,
        // slim through the throat, opening fast at the rim (the rim's
        // plane read at the center of its ellipse in the photo)
        flare: bellFlare([0.114, 0.0105], [0.476, 0.132]),
    },
    wrap: {
        corners: [
            [0.116, 0, 0.05],
            [0.0435, 0, 0.05, 0.0705],
            [0.0435, -0.141, 0.05, 0.0705],
            [0.311, -0.141, 0.05, 0.0395],
            [0.311, -0.062, 0.043, 0.0395],
            [0.1907, -0.062, 0.043, 0.01],
            [0.1907, -0.062, 0.022],
        ],
        radii: [
            [0, 0.0105],
            [0.35, 0.0098],
            [0.7, 0.0088],
            [1, 0.0075],
        ],
    },
    lead: {
        // across the top in front of the valves, a bow down past them, back
        // along the bottom and up around the block, then out through the
        // main tuning slide low at the front and back into the third valve
        corners: [
            [0.313, -0.013, 0, 0.0525],
            [0.313, -0.118, 0, 0.0525],
            [0.165, -0.118, 0, 0.034],
            [0.165, -0.05, 0, 0.034],
            [0.27, -0.05, 0.004, 0.03],
            [0.381, -0.05, 0.022, 0.0255],
            [0.381, -0.101, 0.022, 0.0255],
            [0.25, -0.101, 0.022],
        ],
        radius: 0.0056,
    },
    tuning: {
        sleeves: [
            [
                [0.305, -0.05, 0.0098],
                [0.35, -0.05, 0.0171],
            ],
            [
                [0.275, -0.101, 0.022],
                [0.35, -0.101, 0.022],
            ],
        ],
        waterKey: [0.372, -0.101, 0.022],
    },
    valves: {
        x: 0.022,
        z: [0.1907, 0.218, 0.2455],
        r: 0.009,
        top: 0.012,
        bottom: -0.103,
    },
    slides: {
        // the third valve's long loop runs back along the far side; the
        // first valve's runs forward above it
        3: { y: -0.077, x: 0.038, dir: -1, width: 0.018, r: 0.005 },
        1: { y: -0.02, x: 0.038, dir: 1, width: 0.02, r: 0.005 },
    },
    stub: { y: -0.076, width: 0.016, r: 0.0048 },
    braces: [
        [
            [0.15, -0.013, 0.0],
            [0.15, 0, 0.04],
        ],
        [
            [0.285, -0.013, 0.0],
            [0.285, 0, 0.032],
        ],
        [
            [0.2, -0.118, 0.0],
            [0.2, -0.141, 0.042],
        ],
        [
            [0.3, -0.118, 0.0],
            [0.3, -0.141, 0.042],
        ],
        [
            [0.34, -0.101, 0.022],
            [0.325, -0.117, 0.047],
        ],
    ],
    ferrules: [0.5],
};

const OVAL: Record<"mellophone", OvalHorn> = { mellophone: MELLOPHONE };

export function marchingHorn(id: keyof typeof OVAL, detail: Detail): Horn {
    return ovalHorn(OVAL[id], detail);
}
