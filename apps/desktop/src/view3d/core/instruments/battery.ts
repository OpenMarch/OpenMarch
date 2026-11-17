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
    band,
    box,
    colorPieces,
    cylinder,
    ribbon,
    smoothLathe,
    smoothTube,
    transformPiece,
    PART_ALUMINUM,
    PART_BLACK,
    PART_BRONZE,
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

/**
 * The marching bass sizes, inches across the head, smallest first: what
 * Yamaha (MB-8300) and Pearl (Championship Maple) sell, 14 to 32 in 2 in
 * steps, every one 14 in deep.
 */
export const BASS_SIZES_IN = [14, 16, 18, 20, 22, 24, 26, 28, 30, 32] as const;

/**
 * The smallest size a line of `count` drums reaches down to. Real lines
 * run 18 to 32 in (high schools mostly 18 to 28); only a line too long to
 * give every drum its own size there reaches down to 16 in, then 14 in.
 */
function smallestFor(count: number): number {
    if (count <= 5) return 18;
    if (count === 6) return 16;
    return 14;
}

/**
 * Sizes for a bass line of `count` drums, smallest first: spread evenly
 * from the smallest size the line reaches (`smallestFor`) to 32 in. One
 * drum gets the middle of 18 to 32 in; past ten, sizes repeat. The show
 * stores no size: the drill writer never picks one.
 */
export function bassSizesFor(count: number): number[] {
    const n = Math.max(0, Math.floor(count));
    if (n === 0) return [];
    const sizes = BASS_SIZES_IN.filter((s) => s >= smallestFor(n));
    const last = sizes.length - 1;
    if (n === 1) return [sizes[Math.floor(sizes.length / 2)]];
    return Array.from(
        { length: n },
        (_, i) => sizes[Math.round((i * last) / (n - 1))],
    );
}

/**
 * Default colors by part. The window recolors the shell (section). Heads
 * are smooth white; hoops, lugs and carriers satin aluminum; cymbals
 * brilliant bronze whatever the brass line's finish.
 */
export const BATTERY_COLORS: Record<number, number> = {
    [PART_SHELL]: 0xffffff,
    [PART_HEAD]: 0xf2f1ed,
    [PART_CHROME]: 0xd9dde2,
    [PART_ALUMINUM]: 0xc6cad0,
    [PART_BLACK]: 0x141416,
    [PART_WOOD]: 0xd8b98a,
    [PART_METAL]: 0xc9a24a,
    [PART_BRONZE]: 0xdcaa5c,
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
    /** Small hardware (bolt heads, lug casings) is drawn up close only. */
    fine: boolean;
}

const SEGMENTS: Record<Detail, SegmentCounts> = {
    high: {
        round: 64,
        hoop: 64,
        hoopRing: 10,
        small: 10,
        stick: 12,
        headRings: 4,
        fine: true,
    },
    low: {
        round: 20,
        hoop: 20,
        hoopRing: 5,
        small: 5,
        stick: 5,
        headRings: 2,
        fine: false,
    },
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
        fine: true,
    },
    low: {
        round: 14,
        hoop: 12,
        hoopRing: 4,
        small: 4,
        stick: 4,
        headRings: 1,
        fine: false,
    },
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
//
// The drums follow current high-tension marching drums (Yamaha's
// MS-9400 snares, MQ-8300 multi-toms and MB-8300 basses, 2026-11-15):
// tall flat hoops, the snare's shell floating inside its hardware on long
// tube lugs, tenor shells cut away toward the player, and basses with
// wood hoops, claw hooks and long tension rods. No maker's badge or logo.

/** A flat hoop about +Z, `z0` to `z1` (see `band`). */
const hoopZ = (
    r0: number,
    r1: number,
    z0: number,
    z1: number,
    segments: number,
    part: number,
    inner = true,
) =>
    band(r0, r1, z0, z1, segments, part, { inner }).map((p) =>
        upZ(p, [0, 0, 0]),
    );

/**
 * A drum head at height `z` across radius `r`, facing +Z (`up`) or −Z: a
 * disc a little proud of the shell, its collar turning down over the edge.
 */
function drumHead(r: number, z: number, up: boolean, s: SegmentCounts): Piece {
    const h = up ? 0.001 : -0.001;
    const rings: [number, number][] = [[0, h]];
    for (let i = 1; i <= s.headRings; i++)
        rings.push([(r * 0.97 * i) / s.headRings, h]);
    rings.push([r + 0.003, h - (up ? 0.004 : -0.004)]);
    // traversed rim to center the normals face +Y; center to rim, −Y
    return upZ(smoothLathe(up ? rings.reverse() : rings, s.round, PART_HEAD), [
        0,
        0,
        z,
    ]);
}

/** Unit radial and tangent directions at `angle` round +Z. */
const radial = (angle: number): [Vec3, Vec3] => [
    [Math.cos(angle), Math.sin(angle), 0],
    [-Math.sin(angle), Math.cos(angle), 0],
];
const onRing = (angle: number, radius: number, z: number): Vec3 => [
    Math.cos(angle) * radius,
    Math.sin(angle) * radius,
    z,
];
/** A box at `angle`, half extents (radial, tangent, along Z). */
const radialBox = (
    angle: number,
    radius: number,
    z: number,
    half: Vec3,
    part: number,
) => {
    const [u, v] = radial(angle);
    return box(onRing(angle, radius, z), half, part, u, v);
};

/** Evenly spaced lug angles, half a step off +X so a gap faces each axis. */
const lugAngles = (n: number) =>
    Array.from({ length: n }, (_, i) => ((i + 0.5) / n) * Math.PI * 2);

/**
 * A high-tension top hoop: a tall rim standing above the head and a flange
 * out to the tension bolts, whose heads sit on it.
 */
function topHoop(
    r: number,
    lugs: number[],
    boltDown: number,
    part: number,
    s: SegmentCounts,
): Piece[] {
    const out = [
        ...hoopZ(r - 0.004, r + 0.006, -0.008, 0.014, s.round, part),
        ...hoopZ(r + 0.006, r + 0.026, -0.008, -0.001, s.round, part, false),
    ];
    for (const a of lugs) {
        out.push(
            cylinder(
                0.0028,
                onRing(a, r + 0.017, boltDown),
                onRing(a, r + 0.017, 0.006),
                s.small,
                PART_CHROME,
            ),
        );
        if (s.fine)
            out.push(
                cylinder(
                    0.0058,
                    onRing(a, r + 0.017, -0.001),
                    onRing(a, r + 0.017, 0.009),
                    6,
                    PART_CHROME,
                ),
            );
    }
    return out;
}

/**
 * The marching snare, 14 by 12 in, after Yamaha's MS-9400 series: the shell
 * floats inside the hardware. A tall top hoop over a tension frame, ten
 * long tube lugs from the frame to the bottom, a bottom hoop on four feet,
 * the strainer at the player's right, the butt plate at the left and the
 * carrier mount at the back (−Y).
 */
function snareDrum(s: SegmentCounts): Piece[] {
    const r = SNARE_R;
    const d = SNARE_DEPTH;
    const lugs = lugAngles(10);
    const out: Piece[] = [
        upZ(
            smoothLathe(
                [
                    [r, 0],
                    [r, d * 0.5],
                    [r, d - 0.02],
                ],
                s.round,
                PART_SHELL,
            ),
            [0, 0, -d + 0.006],
        ),
        drumHead(r, 0, true, s),
        drumHead(r, -d, false, s),
        ...topHoop(r, lugs, -0.05, PART_ALUMINUM, s),
        // the tension frame the tube lugs hang from
        ...hoopZ(r + 0.002, r + 0.028, -0.056, -0.036, s.round, PART_ALUMINUM),
        // the bottom hoop
        ...hoopZ(
            r - 0.004,
            r + 0.006,
            -d - 0.014,
            -d + 0.006,
            s.round,
            PART_ALUMINUM,
        ),
        ...hoopZ(
            r + 0.006,
            r + 0.026,
            -d - 0.014,
            -d - 0.007,
            s.round,
            PART_ALUMINUM,
            false,
        ),
    ];
    for (const a of lugs) {
        const lr = r + 0.017;
        out.push(
            cylinder(
                0.0065,
                onRing(a, lr, -d + 0.07),
                onRing(a, lr, -0.056),
                s.small,
                PART_ALUMINUM,
            ),
            cylinder(
                0.0095,
                onRing(a, lr, -d + 0.045),
                onRing(a, lr, -d + 0.07),
                s.small,
                PART_ALUMINUM,
            ),
            cylinder(
                0.0028,
                onRing(a, lr, -d - 0.008),
                onRing(a, lr, -d + 0.045),
                s.small,
                PART_CHROME,
            ),
        );
    }
    out.push(...snareFittings(r, d, s));
    return out;
}
/**
 * The snare's fittings: four feet under the bottom hoop, the strainer and
 * its lever at +X (the player's right), the butt plate at −X, and the
 * carrier mount bar across the back on two posts.
 */
function snareFittings(r: number, d: number, s: SegmentCounts): Piece[] {
    const out: Piece[] = [];
    for (const a of lugAngles(4))
        out.push(
            cylinder(
                0.008,
                onRing(a, r + 0.014, -d - 0.042),
                onRing(a, r + 0.014, -d - 0.014),
                s.small,
                PART_BLACK,
            ),
        );
    // strainer and lever at +X (the player's right), butt plate at −X
    out.push(
        radialBox(0, r + 0.034, -d + 0.05, [0.012, 0.02, 0.038], PART_ALUMINUM),
        radialBox(0, r + 0.05, -d + 0.1, [0.005, 0.011, 0.034], PART_BLACK),
        radialBox(
            Math.PI,
            r + 0.034,
            -d + 0.035,
            [0.01, 0.018, 0.026],
            PART_ALUMINUM,
        ),
        // the carrier mount: a bar across the back, on two posts
        radialBox(
            -Math.PI / 2,
            r + 0.03,
            SNARE_MOUNT_Z,
            [0.012, 0.1, 0.024],
            PART_ALUMINUM,
        ),
        box(
            [0.06, -(r + 0.006), SNARE_MOUNT_Z],
            [0.008, 0.014, 0.012],
            PART_ALUMINUM,
        ),
        box(
            [-0.06, -(r + 0.006), SNARE_MOUNT_Z],
            [0.008, 0.014, 0.012],
            PART_ALUMINUM,
        ),
    );
    return out;
}
const SNARE_R = 0.356 / 2;
const SNARE_DEPTH = 0.305;
/** Where the snare's carrier mount bar sits, below the tension frame. */
const SNARE_MOUNT_Z = -0.095;

/**
 * A tenor drum, open below, after Yamaha's MQ-8300: the shell is cut away
 * toward `toward` (the player), so it runs `depth` deep on the far side
 * and about half that on the near side, a tall chrome top hoop with its
 * bolts, and short lug casings under the hoop.
 */
function tenorDrum(
    diameter: number,
    depth: number,
    toward: [number, number],
    s: SegmentCounts,
): Piece[] {
    const r = diameter / 2;
    const n = s.round;
    const shell: Piece = {
        part: PART_SHELL,
        positions: [],
        normals: [],
        indices: [],
    };
    for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        // the cut: a plane, level at the far half, rising toward the player
        const t = c * toward[0] + sn * toward[1];
        const cut = Math.min(Math.max((t + 0.25) / 1.25, 0), 1);
        const bottom = -depth * (1 - 0.48 * cut);
        shell.positions.push(c * r, sn * r, -0.006, c * r, sn * r, bottom);
        shell.normals.push(c, sn, 0, c, sn, 0);
        const top = 2 * k;
        const next = 2 * ((k + 1) % n);
        shell.indices.push(top, top + 1, next + 1, top, next + 1, next);
    }
    const lugs = lugAngles(diameter < 10 * IN ? 4 : 6);
    const out: Piece[] = [
        shell,
        drumHead(r, 0, true, s),
        ...topHoop(r, lugs, -0.03, PART_CHROME, s),
    ];
    if (s.fine)
        for (const a of lugs)
            out.push(
                radialBox(
                    a,
                    r + 0.011,
                    -0.042,
                    [0.007, 0.0075, 0.016],
                    PART_CHROME,
                ),
            );
    return out;
}

/**
 * A marching bass drum along +Z, after Yamaha's MB-8300: the shell from
 * z = −depth to 0, smooth white heads, wood hoops in the shell's color
 * with claw hooks, and long tension rods from each pair of claws to a
 * center lug. Small drums have 8 lugs, middle sizes 10, the biggest 12.
 * The carrier mount sits at +X, between lugs.
 */
function bassDrum(diameter: number, d: number, s: SegmentCounts): Piece[] {
    const r = diameter / 2;
    const lugs = lugAngles(
        diameter < 21 * IN ? 8 : diameter < 27 * IN ? 10 : 12,
    );
    const out: Piece[] = [
        upZ(
            smoothLathe(
                [
                    [r, 0],
                    [r, (d - 0.06) / 2],
                    [r, d - 0.06],
                ],
                s.round,
                PART_SHELL,
            ),
            [0, 0, -d + 0.03],
        ),
        drumHead(r, 0, true, s),
        drumHead(r, -d, false, s),
    ];
    for (const end of [0, -d]) {
        const sign = end === 0 ? 1 : -1;
        const z = (inward: number) => end - sign * inward;
        out.push(
            ...hoopZ(
                r - 0.004,
                r + 0.02,
                Math.min(z(0.04), z(-0.006)),
                Math.max(z(0.04), z(-0.006)),
                s.round,
                PART_SHELL,
            ),
            // the head's metal collar, just inside the hoop
            ...hoopZ(
                r,
                r + 0.003,
                Math.min(z(0.047), z(0.042)),
                Math.max(z(0.047), z(0.042)),
                s.round,
                PART_ALUMINUM,
                false,
            ),
        );
        for (const a of lugs)
            out.push(
                radialBox(
                    a,
                    r + 0.026,
                    z(0.018),
                    [0.006, 0.011, 0.022],
                    PART_CHROME,
                ),
                cylinder(
                    0.0028,
                    onRing(a, r + 0.029, z(0.035)),
                    onRing(a, r + 0.029, z(d / 2 - 0.07)),
                    s.small,
                    PART_CHROME,
                ),
            );
    }
    for (const a of lugs)
        out.push(
            radialBox(a, r + 0.013, -d / 2, [0.012, 0.012, 0.075], PART_CHROME),
        );
    out.push(
        // thin: the mount sits between the drum and the chest
        radialBox(0, r + 0.008, -d / 2, [0.008, 0.06, 0.09], PART_ALUMINUM),
    );
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
 * A plate carrier, built in the body's rest frame and returned in the
 * hold's instrument frame, after current aluminum vest carriers: flat
 * satin bars from a yoke on the chest up over the shoulders (whose tops
 * sit at 1.46 on every body) and down the back, padded where they sit, a
 * plate down the sternum onto a belly plate, a bar across the upper back,
 * and J-bars from the belly plate to `drumMounts` (instrument frame, the
 * first on the performer's right). Clearances come from the seven body
 * meshes: chests reach z 0.17, upper backs z −0.19.
 */
function vestCarrier(
    family: HoldFamily,
    drumMounts: [Vec3, Vec3],
    s: SegmentCounts,
): Piece[] {
    const body: Piece[] = [];
    // broad faces: out from a line over the shoulders, straight ahead or back below it
    const faceAt = (p: Vec3): Vec3 =>
        p[1] < 1.33 ? [0, 0, Math.sign(p[2])] : [0, p[1] - 1.33, p[2] + 0.01];
    for (const side of [-1, 1]) {
        const pt = (x: number, y: number, z: number): Vec3 => [side * x, y, z];
        const yoke = [
            pt(0.045, 1.2, 0.197),
            pt(0.095, 1.3, 0.19),
            pt(0.11, 1.4, 0.158),
            pt(0.12, 1.465, 0.09),
            pt(0.125, 1.497, 0),
            pt(0.125, 1.472, -0.1),
            pt(0.125, 1.37, -0.205),
            pt(0.125, 1.25, -0.197),
        ];
        body.push(
            ribbon(yoke, 0.055, 0.008, faceAt, PART_ALUMINUM),
            // the pad under the bar where it sits on the shoulder
            ribbon(
                yoke.slice(2, 7).map((p) => {
                    const f = faceAt(p);
                    const l = Math.hypot(...f) || 1;
                    return add(p, scale(f, -0.013 / l));
                }),
                0.07,
                0.016,
                faceAt,
                PART_BLACK,
            ),
        );
    }
    // the front plate down the sternum, the belly plate across it, and a
    // bar across the upper back
    body.push(
        ribbon(
            [
                [0, 1.25, 0.199],
                [0, 1.03, 0.199],
            ],
            0.11,
            0.01,
            () => [0, 0, 1],
            PART_ALUMINUM,
        ),
        ribbon(
            [
                [-0.11, 1.075, 0.201],
                [0.11, 1.075, 0.201],
            ],
            0.1,
            0.012,
            () => [0, 0, 1],
            PART_ALUMINUM,
        ),
        ribbon(
            [
                [-0.13, 1.3, -0.206],
                [0.13, 1.3, -0.206],
            ],
            0.04,
            0.008,
            () => [0, 0, -1],
            PART_ALUMINUM,
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
            0.009,
            s.small,
            PART_ALUMINUM,
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
    // pieces that bring their own colors (the cymbals' lathing) keep them
    pieces: pieces.map((p) =>
        p.colors
            ? p
            : colorPieces(
                  [p],
                  (part) => BATTERY_COLORS[part] ?? BATTERY_COLORS[PART_CHROME],
              )[0],
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
    // the J-bars meet the mount bar at the back (instrument −Y)
    const back = -(SNARE_R + 0.042);
    const pieces: Piece[] = [
        ...snareDrum(s),
        ...vestCarrier(
            "snare",
            [
                [0.08, back, SNARE_MOUNT_Z],
                [-0.08, back, SNARE_MOUNT_Z],
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
    for (const t of TENOR_DRUMS) {
        // the cut faces the player's belly, 0.23 behind the origin
        const to = [-t.x, -0.23 - t.y];
        const l = Math.hypot(to[0], to[1]) || 1;
        pieces.push(
            ...moved(
                tenorDrum(t.inches * IN, t.depth, [to[0] / l, to[1] / l], s),
                [t.x, t.y, 0],
            ),
        );
    }
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

/**
 * No bass drum's top rises above this, over the hold's origin (1.85 m on
 * the body): the big drums reach about the top of the head (photos,
 * 2026-11-10).
 */
const BASS_TOP = 0.85;

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
        ...moved(bassDrum(diameter, d, s), [ax, ay, d / 2]),
        ...vestCarrier(
            "bass",
            [
                [BASS_BACK + 0.016, ay + 0.03, -0.07],
                [BASS_BACK + 0.016, ay + 0.03, 0.07],
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
    // enough rings for the lathing's tone grooves to show
    const bowSteps = detail === "high" ? 16 : 5;
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

/** The pad's crown over the cymbal's rim plane: the bell rises 0.052, the pad 0.0065 more. */
const PAD_TOP = 0.0585;
/**
 * How far each palm's inner face sits inside its hold's grip point, toward
 * the other cymbal, measured on the seven posed bodies (2026-11-15). The
 * hands aren't posed as mirror images (the left is rolled half a turn
 * about its fingers), so the left palm sits 3.4 cm further in.
 * `cymbalGrip.test.ts` checks every hand clears its cymbal and rests on
 * its pad.
 */
const PALM_INSET = { handR: 0.014, handL: 0.048 } as const;
/** The pad presses this far into the palm, so no light shows between them. */
const PAD_PRESS = 0.003;

/** How much darker a cymbal's lathe groove is than the bronze. */
const LATHE_GROOVE = 0.82;

/**
 * Two 18 inch crash cymbals, one in each hand, inside faces toward each
 * other: brilliant bronze with the lathing's tone grooves (alternate rings
 * a little darker) and a leather pad on the outside of each bell, resting
 * on the palm. The strap runs inside the fist, so it isn't drawn.
 */
function cymbals(detail: Detail, options: ModelOptions): InstrumentModel {
    const s = SEGMENTS[detail];
    const round = detail === "high" ? 48 : s.round;
    const h = hands("cymbals");
    const profile = cymbalProfile(detail);
    const disc = colorPieces(
        [smoothLathe(profile, round, PART_BRONZE)],
        () => BATTERY_COLORS[PART_BRONZE],
    )[0];
    // the bell (the rings nearest the axis on either face) stays bright
    const bellRings = detail === "high" ? 6 : 3;
    const rings = profile.length;
    disc.colors = disc.colors!.map((c, i) => {
        const ring = Math.floor(i / 3 / round);
        const fromAxis = Math.min(ring, rings - 1 - ring);
        return fromAxis >= bellRings && ring % 2 === 1 ? c * LATHE_GROOVE : c;
    });
    // the pad sits on the bell's crown (the bell rises 0.052 at the axis)
    const pad = smoothLathe(
        [
            [0.045, 0.04],
            [0.04, 0.046],
            [0.025, 0.054],
            [0, PAD_TOP],
        ],
        Math.max(8, round / 2),
        PART_BLACK,
    );
    const parts = [disc, pad];
    const plate = (grip: Vec3, bell: Vec3, bone: "handR" | "handL"): Piece[] =>
        parts.map((p) => ({
            // the pad rests on the palm: the plate sits that far inside the grip
            ...transformPiece(
                p,
                alongAxis(
                    bell,
                    sub(
                        grip,
                        scale(bell, PALM_INSET[bone] + PAD_TOP - PAD_PRESS),
                    ),
                ),
            ),
            colors: p.colors,
            bone,
        }));
    // the right hand is at −X, the left at +X (the cymbals' frame keeps +X the performer's left)
    return finish(
        "cymbals",
        [
            ...plate(h.right.grip, [-1, 0, 0], "handR"),
            ...plate(h.left.grip, [1, 0, 0], "handL"),
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
