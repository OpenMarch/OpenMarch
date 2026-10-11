// cspell:words spocks
/**
 * The battery's drums and cymbals (docs/3d/instruments.md §3, §4). Pure: no
 * three.js. Proportions follow side-view reference photos; nothing is
 * copied from them.
 *
 * Frames (they agree with `holds.ts`, which places the instrument frame on
 * the body: +Z the hold's bell axis, +Y its caps axis, +X = Y × Z):
 * - snare, tenors: origin at the top of the drum on the carrier, +Z up
 *   (the head's normal), +Y forward, so +X is the performer's right; the
 *   shells hang along −Z. They ride the chest (`spine002`).
 * - bass: origin at the drum's center, +Z the heads' axis toward the
 *   performer's left, +Y up, so +X points back at the player, where the
 *   carrier plate is. It rides the chest.
 * - cymbals: one plate in each hand, vertical, facing each other across X.
 *
 * Every piece, whichever bone it rides, is built in the instrument frame:
 * the window places the whole model by the hold and then carries each
 * piece on its bone. So sticks, mallets and cymbals are built at the hold's
 * hand grips, read from `holds.ts`, along each hand's fingers.
 */
import {
    arc,
    colorPieces,
    cylinder,
    smoothLathe,
    smoothTube,
    transformPiece,
    PART_BLACK,
    PART_CHROME,
    PART_HEAD,
    PART_METAL,
    PART_SHELL,
    PART_WOOD,
    type Mat4,
    type Piece,
    type Vec3,
} from "./mesh";
import { hold, type HoldFamily } from "./holds";
import type {
    BatteryModelId,
    Detail,
    InstrumentModel,
    ModelOptions,
} from "./model";

const IN = 0.0254;

/** The marching bass sizes, inches across the head, smallest first. */
export const BASS_SIZES_IN = [18, 20, 22, 24, 26, 28, 30, 32] as const;

/**
 * Sizes for a bass line of `count` drums, spread evenly over
 * `BASS_SIZES_IN`, smallest first. One drum gets the middle size; past
 * eight, sizes repeat.
 */
export function bassSizesFor(count: number): number[] {
    const n = Math.max(0, Math.floor(count));
    if (n === 0) return [];
    const last = BASS_SIZES_IN.length - 1;
    if (n === 1) return [BASS_SIZES_IN[Math.floor(BASS_SIZES_IN.length / 2)]];
    return Array.from(
        { length: n },
        (_, i) => BASS_SIZES_IN[Math.round((i * last) / (n - 1))],
    );
}

/** Default colors by part. The window recolors the shell (section) and the metal (finish). */
export const BATTERY_COLORS: Record<number, number> = {
    [PART_SHELL]: 0xffffff,
    [PART_HEAD]: 0xe9e6dc,
    [PART_CHROME]: 0xd9dde2,
    [PART_BLACK]: 0x141416,
    [PART_WOOD]: 0xd8b98a,
    [PART_METAL]: 0xc9a24a,
};

interface SegmentCounts {
    /** Around a shell and a head. */
    round: number;
    /** Points along a hoop. */
    hoop: number;
    /** Around a hoop's tube. */
    hoopRing: number;
    /** Around a lug, a rod, a bar. */
    small: number;
    /** Around a stick or a mallet. */
    stick: number;
    /** Rings in a head's profile, center to rim. */
    headRings: number;
}

const SEGMENTS: Record<Detail, SegmentCounts> = {
    high: {
        round: 64,
        hoop: 64,
        hoopRing: 10,
        small: 10,
        stick: 12,
        headRings: 4,
    },
    low: { round: 20, hoop: 20, hoopRing: 5, small: 5, stick: 5, headRings: 2 },
};
/** Six drums on one carrier: coarser rings so the set keeps the budget. */
const TENOR_SEGMENTS: Record<Detail, SegmentCounts> = {
    high: {
        round: 48,
        hoop: 40,
        hoopRing: 8,
        small: 7,
        stick: 10,
        headRings: 3,
    },
    low: { round: 14, hoop: 12, hoopRing: 4, small: 4, stick: 4, headRings: 1 },
};

// ---- small vector and matrix helpers ----

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
];
const unit = (a: Vec3): Vec3 => scale(a, 1 / (Math.hypot(...a) || 1));

/** A matrix taking the lathe's +Y to unit `dir`, with its origin at `at`. */
function alongAxis(dir: Vec3, at: Vec3): Mat4 {
    const y = unit(dir);
    const x = unit(cross(y, Math.abs(y[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
    const z = cross(x, y);
    return [...x, 0, ...y, 0, ...z, 0, ...at, 1];
}
/** A lathe along +Z, its base at `at`. */
const upZ = (p: Piece, at: Vec3) => transformPiece(p, alongAxis([0, 0, 1], at));

/** The hold's instrument axes in the body's rest frame. */
function axes(family: HoldFamily) {
    const h = hold(family, "up");
    const z = unit(h.instrument.bellAxis);
    const caps = h.instrument.capsAxis;
    const y = unit(sub(caps, scale(z, dot(caps, z))));
    const x = cross(y, z);
    return { h, x, y, z };
}

/** A matrix taking body rest-frame points into the hold's instrument frame. */
function bodyToFrame(family: HoldFamily): Mat4 {
    const { h, x, y, z } = axes(family);
    const o = h.instrument.origin;
    return [
        x[0],
        y[0],
        z[0],
        0,
        x[1],
        y[1],
        z[1],
        0,
        x[2],
        y[2],
        z[2],
        0,
        -dot(x, o),
        -dot(y, o),
        -dot(z, o),
        1,
    ];
}

/** The hold's hand grips and finger directions, in the instrument frame. */
function hands(family: HoldFamily) {
    const { h, x, y, z } = axes(family);
    const toFrame = (v: Vec3): Vec3 => [dot(v, x), dot(v, y), dot(v, z)];
    const grip = (wrist: Vec3, fingers: Vec3): Vec3 =>
        toFrame(sub(add(wrist, scale(fingers, 0.07)), h.instrument.origin));
    return {
        right: {
            grip: grip(h.right.wrist, h.right.fingers),
            fingers: toFrame(h.right.fingers),
        },
        left: {
            grip: grip(h.left.wrist, h.left.fingers),
            fingers: toFrame(h.left.fingers),
        },
    };
}

// ---- builders ----

interface DrumSpec {
    diameter: number;
    depth: number;
    lugs: number;
    /** A second head and hoop at the bottom (snare, bass); tenors are open below. */
    bottom: boolean;
}

/**
 * A drum along +Z: the shell from z = −depth to 0 at the origin, chrome
 * hoops and heads at the ends, lugs and tension rods around the shell.
 */
function drum(spec: DrumSpec, s: SegmentCounts): Piece[] {
    const r = spec.diameter / 2;
    const d = spec.depth;
    const out: Piece[] = [
        upZ(
            smoothLathe(
                [
                    [r, 0],
                    [r, d * 0.5],
                    [r, d],
                ],
                s.round,
                PART_SHELL,
            ),
            [0, 0, -d],
        ),
    ];
    // a head: a disc from the center to the rim, a little proud of the shell
    const headProfile = (h: number, up: boolean): [number, number][] => {
        const rings: [number, number][] = [[0, h]];
        for (let i = 1; i <= s.headRings; i++)
            rings.push([(r * 0.97 * i) / s.headRings, h]);
        rings.push([r + 0.003, h - (up ? 0.004 : -0.004)]);
        // traversed rim to center the normals face +Y; center to rim, −Y
        return up ? rings.reverse() : rings;
    };
    const hoop = (z: number) =>
        smoothTube(
            arc([0, 0, z], r + 0.004, 0, 360, s.hoop, "z"),
            0.006,
            s.hoopRing,
            PART_CHROME,
            { capStart: false, capEnd: false },
        );
    out.push(
        upZ(
            smoothLathe(headProfile(0.001, true), s.round, PART_HEAD),
            [0, 0, 0],
        ),
        hoop(0.004),
    );
    if (spec.bottom)
        out.push(
            upZ(smoothLathe(headProfile(-0.001, false), s.round, PART_HEAD), [
                0,
                0,
                -d,
            ]),
            hoop(-d - 0.004),
        );
    // lugs: a casing on the shell and rods to the hoops
    const lr = r + 0.012;
    for (let i = 0; i < spec.lugs; i++) {
        const a = ((i + 0.5) / spec.lugs) * Math.PI * 2;
        const x = Math.cos(a) * lr;
        const y = Math.sin(a) * lr;
        const top = -Math.min(0.04, d * 0.15);
        const low = spec.bottom ? -d - top : top - Math.min(0.07, d * 0.3);
        out.push(
            smoothTube(
                [
                    [x, y, low],
                    [x, y, top],
                ],
                0.0065,
                s.small,
                PART_CHROME,
            ),
            smoothTube(
                [
                    [x, y, top],
                    [x, y, 0.009],
                ],
                0.0028,
                s.small,
                PART_CHROME,
            ),
        );
        if (spec.bottom)
            out.push(
                smoothTube(
                    [
                        [x, y, -d - 0.009],
                        [x, y, low],
                    ],
                    0.0028,
                    s.small,
                    PART_CHROME,
                ),
            );
    }
    return out;
}

const moved = (pieces: Piece[], at: Vec3) =>
    pieces.map((p) =>
        transformPiece(p, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, ...at, 1]),
    );

/**
 * A wooden stick 0.41 long through the hand's grip along `dir`: the butt
 * 0.12 behind the grip (the fulcrum sits a third of the way up), the bead
 * tip 0.29 ahead.
 */
function stick(
    grip: Vec3,
    dir: Vec3,
    bone: "handR" | "handL",
    s: SegmentCounts,
) {
    const u = unit(dir);
    const len = 0.41;
    const butt = add(grip, scale(u, -STICK_BUTT));
    const at = (t: number) => add(butt, scale(u, t * len));
    const shaft = smoothTube(
        [at(0), at(0.6), at(0.92), at(0.985)],
        [0.008, 0.008, 0.0045, 0.0035],
        s.stick,
        PART_WOOD,
    );
    const bead = transformPiece(
        smoothLathe(sphereProfile(0.0065, 6), s.stick, PART_WOOD),
        alongAxis(u, at(0.985)),
    );
    return [shaft, bead].map((p) => ({ ...p, bone }));
}
/** How far a stick's butt runs behind the grip. */
export const STICK_BUTT = 0.12;

/** (radius, height) pairs of a sphere of `r`, bottom pole to top pole. */
function sphereProfile(r: number, steps: number): [number, number][] {
    const out: [number, number][] = [];
    for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * Math.PI;
        out.push([Math.sin(t) * r, -Math.cos(t) * r]);
    }
    return out;
}

/**
 * Where the carrier's J-bars leave the belly plate, in the body's rest
 * frame (+X the performer's left), one per side.
 */
const PLATE_MOUNT: Vec3 = [0.06, 1.07, 0.19];

/**
 * A shoulder-hoop carrier, built in the body's rest frame and returned in
 * the hold's instrument frame: two chrome hoops from the belly plate up
 * over the shoulders (whose tops sit at 1.46 on every body) and down the
 * back, padded where they sit, a black plate on the belly, and chrome
 * J-bars from the plate to `drumMounts` (instrument frame, the first on the
 * performer's right). Clearances come from the seven body meshes: chests
 * reach z 0.17, upper backs z −0.19.
 */
function vestCarrier(
    family: HoldFamily,
    drumMounts: [Vec3, Vec3],
    s: SegmentCounts,
): Piece[] {
    const body: Piece[] = [];
    for (const side of [-1, 1]) {
        const at = (x: number, y: number, z: number): Vec3 => [side * x, y, z];
        body.push(
            smoothTube(
                [
                    at(0.085, 1.06, 0.19),
                    at(0.095, 1.28, 0.19),
                    at(0.11, 1.4, 0.158),
                    at(0.12, 1.465, 0.09),
                    at(0.125, 1.497, 0),
                    at(0.125, 1.472, -0.1),
                    at(0.125, 1.37, -0.205),
                    at(0.125, 1.26, -0.195),
                ],
                0.009,
                s.small,
                PART_CHROME,
            ),
            smoothTube(
                [
                    at(0.12, 1.45, 0.11),
                    at(0.125, 1.497, 0),
                    at(0.125, 1.472, -0.1),
                    at(0.125, 1.43, -0.16),
                ],
                0.02,
                s.small,
                PART_BLACK,
            ),
        );
    }
    // the plate: a flattened tube, 0.18 wide and 0.025 thick, on the belly
    const plate = smoothTube(
        [
            [0, 0, 0],
            [0, 0.26, 0],
        ],
        0.09,
        s.round / 2,
        PART_BLACK,
    );
    body.push(
        transformPiece(
            plate,
            [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0.14, 0, 0, 1.04, 0.18, 1],
        ),
    );
    const toFrame = bodyToFrame(family);
    const point = (v: Vec3): Vec3 => {
        const m = toFrame;
        return [
            m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
            m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
            m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
        ];
    };
    const bars = drumMounts.map((end, i) => {
        const side = i === 0 ? -1 : 1;
        const start = point([
            side * PLATE_MOUNT[0],
            PLATE_MOUNT[1],
            PLATE_MOUNT[2],
        ]);
        return smoothTube(
            [start, add(scale(start, 0.5), scale(end, 0.5)), end],
            0.008,
            s.small,
            PART_CHROME,
        );
    });
    return [...body.map((p) => transformPiece(p, toFrame)), ...bars];
}

const finish = (
    id: BatteryModelId,
    pieces: Piece[],
    extra: Partial<InstrumentModel> = {},
): InstrumentModel => ({
    id,
    pieces: colorPieces(
        pieces,
        (part) => BATTERY_COLORS[part] ?? BATTERY_COLORS[PART_CHROME],
    ),
    leftGrip: [0, 0, 0],
    mouthpiece: [0, 0, 0],
    ...extra,
});

/** Sticks for a drum family: along each hand's fingers, tipped down toward the heads. */
function sticks(family: HoldFamily, s: SegmentCounts): Piece[] {
    const h = hands(family);
    const down: Vec3 = [0, 0, -0.22];
    return [
        ...stick(h.right.grip, add(h.right.fingers, down), "handR", s),
        ...stick(h.left.grip, add(h.left.fingers, down), "handL", s),
    ];
}

/** The marching snare: 14 by 12 inches, ten lugs, on a carrier. */
function snare(detail: Detail, options: ModelOptions): InstrumentModel {
    const s = SEGMENTS[detail];
    const r = 0.356 / 2;
    const d = 0.305;
    // the J-bars meet the shell's back (instrument −Y) 0.08 either side
    const back = -Math.sqrt(r * r - 0.08 * 0.08) - 0.006;
    const pieces: Piece[] = [
        ...drum({ diameter: 0.356, depth: d, lugs: 10, bottom: true }, s),
        ...vestCarrier(
            "snare",
            [
                [0.08, back, -0.07],
                [-0.08, back, -0.07],
            ],
            s,
        ),
        ...sticks("snare", s),
    ];
    return finish("snare", pieces, { bone: "spine002", options });
}

/**
 * Sixes, after a Dynasty six-drum set seen from above: instrument +X is the
 * performer's right and +Y forward, with the belly 0.23 behind the origin.
 * The two shots (6 and 8 inch) sit in the middle nearest the player, just
 * in front of the carrier bracket; drums 1 (10) and 2 (12) sit in front of
 * them, and drums 3 (13) and 4 (14) wrap round at the player's sides. The
 * shells nearly touch and every head is level.
 */
const TENOR_DRUMS: { inches: number; x: number; y: number; depth: number }[] = [
    { inches: 13, x: -0.36, y: -0.03, depth: 0.28 },
    { inches: 10, x: -0.14, y: 0.17, depth: 0.25 },
    { inches: 6, x: -0.085, y: -0.04, depth: 0.16 },
    { inches: 8, x: 0.1, y: -0.04, depth: 0.18 },
    { inches: 12, x: 0.16, y: 0.22, depth: 0.27 },
    { inches: 14, x: 0.39, y: -0.04, depth: 0.29 },
];

function tenors(detail: Detail, options: ModelOptions): InstrumentModel {
    const s = TENOR_SEGMENTS[detail];
    const pieces: Piece[] = [];
    for (const t of TENOR_DRUMS)
        pieces.push(
            ...moved(
                drum(
                    {
                        diameter: t.inches * IN,
                        depth: t.depth,
                        lugs: t.inches < 10 ? 4 : 6,
                        bottom: false,
                    },
                    s,
                ),
                [t.x, t.y, 0],
            ),
        );
    // the rack under the heads: a bracket post at the back center, a bar
    // across behind the shots to the outer drums, and a bar out to the
    // front pair
    const z = -0.07;
    const at = (i: number, dx: number, dy: number): Vec3 => [
        TENOR_DRUMS[i].x + dx,
        TENOR_DRUMS[i].y + dy,
        z,
    ];
    const post: Vec3 = [0, -0.155, z];
    pieces.push(
        cylinder(
            0.022,
            [0, -0.155, z - 0.1],
            [0, -0.155, 0.01],
            s.small,
            PART_BLACK,
        ),
        smoothTube(
            [
                at(0, 0.17, -0.06),
                at(2, 0, -0.085),
                post,
                at(3, 0, -0.105),
                at(5, -0.18, -0.06),
            ],
            0.009,
            s.small,
            PART_CHROME,
        ),
        smoothTube(
            [post, [0.0, 0.05, z], at(1, 0.13, 0), at(1, 0.13, 0.04)],
            0.008,
            s.small,
            PART_CHROME,
        ),
        smoothTube(
            [[0.0, 0.05, z], at(4, -0.155, 0), at(4, -0.155, 0.04)],
            0.008,
            s.small,
            PART_CHROME,
        ),
        ...vestCarrier(
            "tenors",
            [
                [0.03, -0.15, z],
                [-0.03, -0.15, z],
            ],
            s,
        ),
        ...sticks("tenors", s),
    );
    return finish("tenors", pieces, { bone: "spine002", options });
}

/**
 * The bass drum's back (the shell toward the player, instrument +X) sits
 * here, just in front of the carrier plate, whatever its size.
 */
const BASS_BACK = 0.14;

/**
 * How far forward of the hold's origin a bass drum's axis sits, along
 * instrument −X (forward, away from the player).
 */
export const bassForward = (inches: number) => (inches * IN) / 2 - BASS_BACK;

/** The mallet's head center from the grip, and the head's radius. */
const MALLET_REACH = 0.375;
const MALLET_HEAD = 0.045;
/** The mallet head's center sits this far outside the drum head's plane. */
const MALLET_OFF_HEAD = 0.025;

/** No bass drum's top rises above this, over the hold's origin (1.6 m on the body). */
const BASS_TOP = 0.6;

/**
 * A marching bass on its side, carried high: heads along ±Z, the carrier
 * at +X (the player). Every size keeps its back at the carrier, so bigger
 * drums reach further forward. The hands sit at the hips below the drum's
 * center; each drum hangs where its center is one mallet length up and
 * forward from the grips, its top no higher than 1.6 m. Where that cap
 * brings the center closer than a mallet's length, the mallet runs back
 * through the hand, its butt behind the fist.
 */
function bass(detail: Detail, options: ModelOptions): InstrumentModel {
    const inches = options.bassInches ?? 26;
    const s = SEGMENTS[detail];
    const diameter = inches * IN;
    const d = 0.356;
    const ax = -bassForward(inches);
    const h = hands("bass");
    const g = h.right.grip;
    const off = Math.abs(g[2]) - (d / 2 + MALLET_OFF_HEAD);
    const rho = Math.sqrt(Math.max(MALLET_REACH ** 2 - off * off, 0));
    const ay = Math.min(
        g[1] + Math.sqrt(Math.max(rho * rho - (ax - g[0]) ** 2, 0)),
        BASS_TOP - diameter / 2,
    );
    const pieces: Piece[] = [
        ...moved(drum({ diameter, depth: d, lugs: 10, bottom: true }, s), [
            ax,
            ay,
            d / 2,
        ]),
        ...vestCarrier(
            "bass",
            [
                [BASS_BACK + 0.006, ay + 0.06, -0.08],
                [BASS_BACK + 0.006, ay + 0.06, 0.08],
            ],
            s,
        ),
    ];
    // mallets: the head on the drum head's center, just outside its plane,
    // the shaft back through the grip to its full length
    for (const [side, bone, sign] of [
        [h.right, "handR", -1],
        [h.left, "handL", 1],
    ] as const) {
        const g = side.grip;
        const head: Vec3 = [ax, ay, sign * (d / 2 + MALLET_OFF_HEAD)];
        const dir = unit(sub(head, g));
        pieces.push(
            {
                ...smoothTube(
                    [
                        sub(head, scale(dir, MALLET_REACH)),
                        sub(head, scale(dir, 0.04)),
                    ],
                    0.012,
                    s.stick,
                    PART_WOOD,
                ),
                bone,
            },
            {
                ...transformPiece(
                    smoothLathe(
                        sphereProfile(MALLET_HEAD, 10),
                        s.stick * 2,
                        PART_BLACK,
                    ),
                    alongAxis(dir, head),
                ),
                bone,
            },
        );
    }
    return finish("bass", pieces, {
        bone: "spine002",
        options: { ...options, bassInches: inches },
    });
}

/**
 * A crash cymbal's profile, (radius, height): the underside from the
 * center out, the edge, then the top back in, so the normals face out on
 * both sides. The bell (radius 0.06, 0.03 high) rises toward +Y.
 */
function cymbalProfile(detail: Detail): [number, number][] {
    const R = 0.457 / 2;
    const bellR = 0.06;
    const bellH = 0.03;
    const bow = 0.022;
    const th = 0.0025;
    const bellSteps = detail === "high" ? 5 : 2;
    const bowSteps = detail === "high" ? 9 : 5;
    const top: [number, number][] = [];
    for (let i = 0; i <= bellSteps; i++) {
        const r = (i / bellSteps) * bellR;
        top.push([r, bow + bellH * Math.cos(((r / bellR) * Math.PI) / 2)]);
    }
    for (let i = 1; i <= bowSteps; i++) {
        const t = i / bowSteps;
        top.push([bellR + (R - bellR) * t, bow * (1 - t) ** 1.3]);
    }
    const under = top.map(([r, y]): [number, number] => [
        r === 0 ? 0 : Math.max(r - th * 0.3, 0),
        y - th,
    ]);
    return [...under, ...top.reverse()];
}

/** Two 18 inch crash cymbals, one in each hand, inside faces toward each other. */
function cymbals(detail: Detail, options: ModelOptions): InstrumentModel {
    const s = SEGMENTS[detail];
    const h = hands("cymbals");
    const profile = cymbalProfile(detail);
    const plate = (grip: Vec3, bell: Vec3, bone: "handR" | "handL"): Piece => ({
        // the strap holds the bell against the palm: the plate sits just inside the grip
        ...transformPiece(
            smoothLathe(profile, s.round, PART_METAL),
            alongAxis(bell, sub(grip, scale(bell, 0.03))),
        ),
        bone,
    });
    // the right hand is at −X, the left at +X (the cymbals' frame keeps +X the performer's left)
    return finish(
        "cymbals",
        [
            plate(h.right.grip, [-1, 0, 0], "handR"),
            plate(h.left.grip, [1, 0, 0], "handL"),
        ],
        { options },
    );
}

export function batteryModel(
    id: BatteryModelId,
    detail: Detail = "high",
    options: ModelOptions = {},
): InstrumentModel {
    switch (id) {
        case "snare":
            return snare(detail, options);
        case "tenors":
            return tenors(detail, options);
        case "bass":
            return bass(detail, {
                ...options,
                bassInches: options.bassInches ?? 26,
            });
        case "cymbals":
            return cymbals(detail, options);
    }
}
