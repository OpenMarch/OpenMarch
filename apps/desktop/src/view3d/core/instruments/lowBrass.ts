/**
 * The low marching brass (docs/3d/instruments.md §3, §4): the baritone and
 * the euphonium, both in B♭ and both built through `ovalHorn`. Each is
 * laid out from a side view of the real instrument: distances along the
 * horn from the mouthpiece rim, heights from the bell's axis, and how far
 * each run sits to the performer's left. Only proportions come from the
 * reference pages; no image, mark or model name is used.
 *
 * Unlike the mellophone, the wrap of these horns goes round twice. Read
 * from the mouthpiece: the leadpipe passes in front of the valves and comes
 * back low into the first valve; the air leaves the third valve into the
 * main tuning slide, a bow that points at the bell, runs back under the
 * valves, up around an inner bow, forward again right under the bell, and
 * only then around the big outer oval into the bell's tail. The third
 * valve's loop is too long to lie out straight, so it is folded: a bow in
 * front of the valves and a long crook back under them.
 *
 * Instrument frame: origin at the right hand's grip on the valves, +Z
 * toward the bell, +Y up through the valve caps, +X the performer's left.
 * Pure: no three.js.
 */
import { bellFlare, hornKit, type Horn } from "./hornKit";
import { ovalHorn, type OvalHorn } from "./marchingBrass";
import type { Vec3 } from "./mesh";
import type { Detail } from "./model";

/**
 * The baritone: a 10 in bell over a double oval wrap. The leadpipe runs
 * the whole length of the wrap, bows down at the front and comes back
 * along the bottom before it turns in to the first valve.
 */
const BARITONE: OvalHorn = {
    // in B♭, an octave below the trumpet's 1.48 m
    openLength: 2.9,
    rimBack: 0.2232,
    leadDrop: 0.0176,
    mouthpiece: 1.3,
    bell: {
        x: 0.076,
        // slim through the throat, opening fast at the rim (the rim's
        // plane read at the center of its ellipse in the photo)
        flare: bellFlare([0.178, 0.0176], [0.572, 0.127]),
    },
    wrap: {
        // from the bell's tail: the big bow behind the mouthpiece, back
        // along the bottom, up the big front bow and home right under the
        // bell; then the inner oval the same way round, whose front bow is
        // the main tuning slide, and across into the third valve
        corners: [
            [0.178, 0, 0.076],
            [0.0612, 0, 0.076, 0.0902],
            [0.0612, -0.1804, 0.076, 0.0902],
            [0.4169, -0.1804, 0.076, 0.0715],
            [0.4169, -0.0373, 0.076, 0.0715],
            [0.0913, -0.0373, 0.076, 0.0545],
            [0.0913, -0.1462, 0.076, 0.0545],
            [0.3847, -0.1462, 0.076, 0.0327],
            [0.3847, -0.0809, 0.076, 0.0327],
            [0.2748, -0.0809, 0.076, 0.012],
            [0.2748, -0.0809, 0.022],
        ],
        radii: [
            [0, 0.0176],
            [0.2, 0.0155],
            [0.33, 0.0135],
            [0.48, 0.0112],
            [0.61, 0.0098],
            [0.73, 0.0088],
            [0.86, 0.0078],
            [1, 0.0075],
        ],
    },
    lead: {
        // along the top past the valves, the long bow down at the front,
        // back along the bottom, and a crook across to the valves' plane
        // that turns it forward into the first valve
        corners: [
            [0.4044, -0.0176, 0, 0.0622],
            [0.4044, -0.1421, 0, 0.0622],
            [0.0964, -0.1421, 0, 0.0122],
            [0.0964, -0.1317, 0.022, 0.0122],
            [0.2167, -0.1317, 0.022],
        ],
        radius: 0.0062,
    },
    tuning: {
        // the two legs of the inner oval's front bow
        sleeves: [
            [
                [0.297, -0.0809, 0.076],
                [0.342, -0.0809, 0.076],
            ],
            [
                [0.297, -0.1462, 0.076],
                [0.342, -0.1462, 0.076],
            ],
        ],
        waterKey: [0.345, -0.1462, 0.076],
        radius: 0.0076,
    },
    valves: {
        x: 0.022,
        z: [0.2167, 0.2458, 0.2748],
        r: 0.0112,
        top: -0.002,
        bottom: -0.1535,
        stem: 0.0294,
    },
    slides: {
        // the first valve's loop lies back toward the player beside the
        // leadpipe; the third's bows out in front and folds back under
        1: { y: -0.0881, x: 0, dir: -1, width: 0.0239, r: 0.0072 },
        3: {
            y: -0.1037,
            x: 0.057,
            dir: 1,
            width: 0.018,
            r: 0.007,
            fold: { reach: 0.0664, drop: 0.0249, x: 0.041 },
        },
    },
    // out to the player's right and back along the horn, outside the first's
    stub: { y: -0.0933, width: 0.0239, r: 0.0075, x: -0.017, dir: -1 },
    braces: [
        // leadpipe to the bell's tail, and to the run under the bell
        [
            [0.19, -0.0176, 0],
            [0.19, 0, 0.076],
        ],
        [
            [0.35, -0.0176, 0],
            [0.35, -0.0373, 0.076],
        ],
        // the leadpipe's bottom run to the big oval's
        [
            [0.15, -0.1421, 0],
            [0.15, -0.1804, 0.076],
        ],
        [
            [0.32, -0.1421, 0],
            [0.32, -0.1804, 0.076],
        ],
        // the inner oval to the outer, bottom and top
        [
            [0.2, -0.1462, 0.076],
            [0.2, -0.1804, 0.076],
        ],
        [
            [0.3, -0.1462, 0.076],
            [0.3, -0.1804, 0.076],
        ],
        [
            [0.3, -0.0809, 0.076],
            [0.3, -0.0373, 0.076],
        ],
    ],
    ferrules: [0.21, 0.47, 0.74],
    rings: { back: false },
};

/**
 * The euphonium: an 11 in bell on wider tubing. Its leadpipe turns down
 * right in front of the third valve and runs back low to a crook behind
 * the block, so the big oval stands clear in front.
 */
const EUPHONIUM: OvalHorn = {
    // B♭ like the baritone; its wider bore sounds a little long for its tubing
    openLength: 2.87,
    rimBack: 0.2376,
    leadDrop: 0.0226,
    mouthpiece: 1.4,
    bell: {
        x: 0.077,
        flare: bellFlare([0.1702, 0.019], [0.587, 0.1397]),
    },
    wrap: {
        // as the baritone's: the big oval, the run under the bell, the
        // inner oval with the main tuning slide as its front bow
        corners: [
            [0.1702, 0, 0.077],
            [0.033, 0, 0.077, 0.0995],
            [0.033, -0.199, 0.077, 0.0995],
            [0.4456, -0.199, 0.077, 0.0722],
            [0.4456, -0.0545, 0.077, 0.0722],
            [0.1357, -0.0545, 0.077, 0.0559],
            [0.1357, -0.1663, 0.077, 0.0559],
            [0.391, -0.1663, 0.077, 0.0459],
            [0.391, -0.0745, 0.077, 0.0459],
            [0.2934, -0.0745, 0.077, 0.012],
            [0.2934, -0.0745, 0.022],
        ],
        radii: [
            [0, 0.019],
            [0.23, 0.0165],
            [0.38, 0.014],
            [0.53, 0.0107],
            [0.63, 0.0092],
            [0.75, 0.0082],
            [1, 0.0076],
        ],
    },
    lead: {
        // along the top, down in front of the third valve, back low past
        // the block, and a crook across that turns it forward into the first
        corners: [
            [0.2894, -0.0226, 0, 0.021],
            [0.2894, -0.133, 0, 0.015],
            [0.0665, -0.133, 0, 0.0134],
            [0.0665, -0.1177, 0.022, 0.0134],
            [0.2381, -0.1177, 0.022],
        ],
        radius: 0.0064,
    },
    tuning: {
        sleeves: [
            [
                [0.312, -0.0745, 0.077],
                [0.34, -0.0745, 0.077],
            ],
            [
                [0.312, -0.1663, 0.077],
                [0.34, -0.1663, 0.077],
            ],
        ],
        waterKey: [0.342, -0.1663, 0.077],
        radius: 0.0076,
    },
    valves: {
        x: 0.022,
        z: [0.2381, 0.2657, 0.2934],
        r: 0.0128,
        top: 0.0053,
        bottom: -0.1383,
        stem: 0.0229,
    },
    slides: {
        1: { y: -0.0819, x: 0, dir: -1, width: 0.0214, r: 0.0068 },
        3: {
            y: -0.0924,
            x: 0.059,
            dir: 1,
            width: 0.026,
            r: 0.0072,
            fold: { reach: 0.0801, drop: 0.0525, x: 0.043 },
        },
    },
    stub: { y: -0.0805, width: 0.0239, r: 0.0075, x: -0.017, dir: -1 },
    braces: [
        [
            [0.2, -0.0226, 0],
            [0.2, 0, 0.077],
        ],
        [
            [0.18, -0.133, 0],
            [0.18, -0.1663, 0.077],
        ],
        [
            [0.2, -0.1663, 0.077],
            [0.2, -0.199, 0.077],
        ],
        [
            [0.33, -0.1663, 0.077],
            [0.33, -0.199, 0.077],
        ],
        [
            [0.33, -0.0745, 0.077],
            [0.33, -0.0545, 0.077],
        ],
    ],
    ferrules: [0.22, 0.49, 0.75],
    rings: { back: false, front: false },
};

const LOW_BRASS: Record<"baritone" | "euphonium", OvalHorn> = {
    baritone: BARITONE,
    euphonium: EUPHONIUM,
};

/**
 * The small fittings `ovalHorn` has no place for: the left thumb's rest, a
 * U standing on the first valve's slide, and on the euphonium the right
 * hand's hook, which stands on the third valve's casing because the
 * leadpipe has already turned down there. In layout terms (z from the rim,
 * y from the bell's axis).
 */
const FITTINGS: Record<
    "baritone" | "euphonium",
    { rest: { z: number; y: number; r: number }; casingHook: boolean }
> = {
    baritone: { rest: { z: 0.1856, y: -0.054, r: 0.011 }, casingHook: false },
    euphonium: { rest: { z: 0.2048, y: -0.0545, r: 0.008 }, casingHook: true },
};

export function lowBrassHorn(
    id: "baritone" | "euphonium",
    detail: Detail,
): Horn {
    const h = LOW_BRASS[id];
    const horn = ovalHorn(h, detail);
    const k = hornKit(detail);
    const axisY = 0.018 + h.leadDrop;
    const at = (z: number, y: number, x: number): Vec3 => [
        x,
        y + axisY,
        z - h.rimBack,
    ];
    const f = FITTINGS[id];
    const s1 = h.slides[1];
    // the thumb rest: a U open upward, on a stem down to the slide's top leg
    const { z, y, r } = f.rest;
    horn.pieces.push(
        k.pipe(
            [
                [at(z - r, y + r, s1.x)],
                [at(z - r, y - r, s1.x), r],
                [at(z + r, y - r, s1.x), r],
                [at(z + r, y + r, s1.x)],
            ],
            0.0019,
            { caps: true },
        ),
        k.sleeve(
            at(f.rest.z, f.rest.y - f.rest.r, s1.x),
            at(f.rest.z, s1.y, s1.x),
            0.0024,
        ),
    );
    if (f.casingHook) {
        const v = h.valves;
        const r = 0.011;
        horn.pieces.push(
            k.ring(
                at(v.z[2] + v.r + r - 0.001, v.top - 0.02, v.x),
                r,
                130,
                410,
                "x",
                0.0019,
            ),
        );
    }
    return horn;
}
