/**
 * The brass section's horns, traced from side-view reference photos
 * (docs/3d/instruments.md §3, §4). Instrument frame: origin at the right
 * hand's grip (the valve block, or the slide brace), +Z toward the bell,
 * +Y up through the valve caps, +X the performer's left. Proportions follow
 * the reference pages; nothing is copied from them. Pure: no three.js.
 *
 * The trumpet, mellophone, baritone, euphonium and contra are modeled
 * meshes (`MODELED` below). The trombones are built here: tubing runs (a
 * path and a bore), slides with crooks, braces, a water key, a bell with a
 * rim bead and a mouthpiece. `detail` picks the mesh's detail or sets the
 * segment counts: "high" for the full bodies, "low" for the block tier.
 */
import {
    arc,
    bellProfile,
    uPath,
    colorPieces,
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

import type { BrassModelId, Detail, InstrumentModel } from "./model";
import { bakedPieces, type BakedMesh } from "./meshAsset";
import trumpetMesh from "../../assets/instruments/trumpet.json";
import mellophoneMesh from "../../assets/instruments/mellophone.json";
import baritoneMesh from "../../assets/instruments/baritone.json";
import euphoniumMesh from "../../assets/instruments/euphonium.json";
import contraMesh from "../../assets/instruments/contra.json";

export type { BrassModelId, Detail, InstrumentModel };

/** Overall length (bell rim to mouthpiece), bell diameter, bore: meters. */
export const BRASS_DIMENSIONS: Record<
    BrassModelId,
    { length: number; bell: number; bore: number }
> = {
    trumpet: { length: 0.48, bell: 0.125, bore: 0.0117 },
    mellophone: { length: 0.55, bell: 0.26, bore: 0.0118 },
    baritone: { length: 0.62, bell: 0.25, bore: 0.0142 },
    euphonium: { length: 0.66, bell: 0.28, bore: 0.0145 },
    trombone: { length: 1.18, bell: 0.21, bore: 0.0127 },
    bassTrombone: { length: 1.18, bell: 0.24, bore: 0.0142 },
    contra: { length: 0.95, bell: 0.5, bore: 0.0185 },
};

/**
 * Default colors by part: gold lacquer, chrome, black, and the pearl of the
 * trumpet's valve buttons. The window recolors silver.
 */
export const BRASS_COLORS: Record<number, number> = {
    [PART_METAL]: 0xd9ad4f,
    [PART_CHROME]: 0xd9dde2,
    [PART_BLACK]: 0x141416,
    [PART_WOOD]: 0xf2efe6,
};

interface SegmentCounts {
    tube: number;
    bell: number;
    small: number;
    crook: number;
}
/** Trombones are long, thin tubes seen end-on: they need finer rings. */
const TROMBONE_SEGMENTS: Record<Detail, SegmentCounts> = {
    high: { tube: 48, bell: 96, small: 24, crook: 14 },
    low: { tube: 12, bell: 24, small: 6, crook: 5 },
};

/** A lathe along +Z instead of +Y: rotate the profile's axis. */
const Y_TO_Z: Mat4 = [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1];
const translate = (x: number, y: number, z: number): Mat4 => [
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
    x,
    y,
    z,
    1,
];
const at = (p: Piece, x: number, y: number, z: number) =>
    transformPiece(p, translate(x, y, z));

/** Builders bound to one detail level. */
function tools(s: SegmentCounts) {
    const run = (
        path: Vec3[],
        r: number | number[],
        part = PART_METAL,
        caps = false,
    ) => smoothTube(path, r, s.tube, part, { capStart: caps, capEnd: caps });
    const thin = (a: Vec3, b: Vec3, r: number, part = PART_CHROME) =>
        smoothTube([a, b], r, s.small, part);
    /** A bell along +Z from z0, flaring over `length` to `rim`, axis at (x, y). */
    const bell = (
        throat: number,
        rim: number,
        z0: number,
        length: number,
        x = 0,
        y = 0,
    ) =>
        at(
            transformPiece(
                smoothLathe(
                    bellProfile(throat, rim, length),
                    s.bell,
                    PART_METAL,
                ),
                Y_TO_Z,
            ),
            x,
            y,
            z0,
        );
    /** A U slide out along ±Z from `start`, crook of `width` toward +X, and back. */
    const uSlide = (
        start: Vec3,
        dirZ: 1 | -1,
        length: number,
        width: number,
        r: number,
    ) => run(uPath(start, [0, 0, dirZ], [1, 0, 0], length, width, s.crook), r);
    /** A valve slide out along +X from `start`, crook of `depth` toward −Z, and back. */
    const xSlide = (start: Vec3, length: number, depth: number, r: number) =>
        run(uPath(start, [1, 0, 0], [0, 0, -1], length, depth, s.crook), r);
    /** Three piston valves at z offsets, standing on the block: casing, cap, stem, button, bottom cap. */
    const valves = (
        zs: number[],
        bore: number,
        bottom: number,
        top: number,
    ) => {
        const out: Piece[] = [];
        const cr = bore * 1.55;
        for (const z of zs) {
            out.push(
                smoothTube(
                    [
                        [0, bottom, z],
                        [0, top, z],
                    ],
                    cr,
                    s.tube,
                    PART_METAL,
                ),
                smoothTube(
                    [
                        [0, top, z],
                        [0, top + 0.012, z],
                    ],
                    cr * 1.08,
                    s.small,
                    PART_CHROME,
                    { capStart: false },
                ),
                smoothTube(
                    [
                        [0, bottom - 0.008, z],
                        [0, bottom, z],
                    ],
                    cr * 1.08,
                    s.small,
                    PART_CHROME,
                    { capEnd: false },
                ),
                thin([0, top + 0.012, z], [0, top + 0.03, z], bore * 0.35),
                smoothTube(
                    [
                        [0, top + 0.03, z],
                        [0, top + 0.036, z],
                    ],
                    bore * 0.9,
                    s.small,
                    PART_CHROME,
                ),
                smoothTube(
                    [
                        [0, top + 0.036, z],
                        [0, top + 0.038, z],
                    ],
                    bore * 0.75,
                    s.small,
                    PART_BLACK,
                ),
            );
        }
        return out;
    };
    /** Mouthpiece: cup rim, cup, shank, pointing −Z from `p`. */
    const mouthpiece = (p: Vec3, bore: number) => {
        const r = bore * 1.3;
        const cup = smoothLathe(
            [
                [r * 0.35, 0],
                [r * 1.15, 0],
                [r * 1.2, 0.004],
                [r * 1.1, 0.012],
                [r * 0.7, 0.03],
                [r * 0.55, 0.055],
                [r * 0.6, 0.075],
            ],
            s.tube,
            PART_CHROME,
        );
        // the lathe's +Y becomes −Z (the mouthpiece points back)
        const flip: Mat4 = [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1];
        return at(transformPiece(cup, flip), p[0], p[1], p[2] + 0.075);
    };
    const brace = (a: Vec3, b: Vec3, r = 0.003) => thin(a, b, r, PART_METAL);
    const waterKey = (p: Vec3, dirZ: 1 | -1) => [
        smoothTube(
            [
                [p[0], p[1] - 0.006, p[2]],
                [p[0], p[1] + 0.004, p[2]],
            ],
            0.006,
            s.small,
            PART_CHROME,
        ),
        thin(p, [p[0], p[1] + 0.006, p[2] + dirZ * 0.03], 0.0015),
        smoothTube(
            [
                [p[0], p[1] - 0.009, p[2]],
                [p[0], p[1] - 0.006, p[2]],
            ],
            0.005,
            s.small,
            PART_BLACK,
        ),
    ];
    const hook = (p: Vec3) =>
        run(arc(p, 0.014, 90, 330, s.crook, "x"), 0.002, PART_METAL, true);
    return {
        run,
        thin,
        bell,
        uSlide,
        xSlide,
        valves,
        mouthpiece,
        brace,
        waterKey,
        hook,
    };
}

function trombone(
    id: "trombone" | "bassTrombone",
    detail: Detail,
): InstrumentModel {
    const d = BRASS_DIMENSIONS[id];
    const s = TROMBONE_SEGMENTS[detail];
    const t = tools(s);
    const bore = d.bore;
    const back = -0.3; // mouthpiece behind the grip
    const front = d.length + back;
    const bellLen = 0.34;
    const bellStart = front - bellLen;
    const slideLen = 0.55;
    const y = 0.05; // the bell section sits above the slide
    const mouthpieceAt: Vec3 = [0.03, 0, back + 0.075];
    const pieces: Piece[] = [
        // inner slide tubes and the outer slide (slightly wider), with the bow
        t.run(
            [
                [0.03, 0, -0.02],
                [0.03, 0, slideLen],
            ],
            bore,
        ),
        t.run(
            [
                [-0.03, 0, -0.02],
                [-0.03, 0, slideLen],
            ],
            bore,
        ),
        t.run(
            [
                [0.03, 0, 0.1],
                [0.03, 0, slideLen],
            ],
            bore * 1.12,
        ),
        t.run(
            [
                [-0.03, 0, 0.1],
                [-0.03, 0, slideLen],
            ],
            bore * 1.12,
        ),
        // the outer slide's bow beyond the slide end
        t.run(
            uPath(
                [0.03, 0, slideLen - 0.02],
                [0, 0, 1],
                [-1, 0, 0],
                0.02,
                0.06,
                s.crook,
            ),
            bore * 1.12,
        ),
        // slide braces: the grip and the outer brace
        t.thin([-0.03, 0, 0], [0.03, 0, 0], 0.004),
        t.thin([-0.03, 0, 0.1], [0.03, 0, 0.1], 0.004),
        // bell section: from the inner slide back, around the tuning bow, forward to the bell
        t.run(
            [
                [0.03, 0, -0.02],
                [0.03, 0, back + 0.075],
            ],
            bore,
        ),
        // the tuning bow behind the grip, then the bell pipe forward on the other side
        t.run(
            [
                [0.03, 0, -0.02],
                [0.03, y, -0.2],
            ],
            [bore, bore * 1.1],
        ),
        t.run(
            uPath([0.03, y, -0.2], [0, 0, -1], [-1, 0, 0], 0.06, 0.06, s.crook),
            bore * 1.1,
        ),
        t.run(
            [
                [-0.03, y, -0.2],
                [-0.03, y, bellStart],
            ],
            [bore * 1.15, bore * 1.3],
        ),
        t.bell(bore * 1.4, d.bell / 2, bellStart, bellLen, -0.03, y),
        // bell brace (the left hand) and a cross brace
        t.thin([-0.03, y, -0.08], [0.03, 0, -0.08], 0.004),
        t.thin([-0.03, y, 0.02], [0.03, 0, 0.02], 0.003),
        ...t.waterKey([0, 0, slideLen + 0.01], -1),
        t.mouthpiece(mouthpieceAt, bore),
    ];
    if (id === "bassTrombone")
        pieces.push(
            smoothTube(
                [
                    [-0.07, y, -0.2],
                    [-0.03, y, -0.2],
                ],
                0.024,
                s.tube,
                PART_METAL,
            ),
            t.thin([-0.09, y + 0.01, -0.2], [-0.07, y, -0.2], 0.003),
        );
    return {
        id,
        pieces: colorPieces(
            pieces,
            (part) => BRASS_COLORS[part] ?? BRASS_COLORS[PART_METAL],
        ),
        leftGrip: [0, y / 2, -0.08],
        mouthpiece: mouthpieceAt,
    };
}

/**
 * Horns drawn from modeled meshes (`assets/instruments/CREDITS.md`): the
 * trumpet is "Trumpet" by Kagelok (CC BY 4.0); the mellophone, baritone,
 * euphonium and contra are built by `scripts/view3d-assets/build-horns.py`
 * from its valve block and mouthpiece, with tubing and bells to side-view
 * proportions. Each keeps the mouthpiece and left grip the procedural horn
 * had, so the brass and contra holds bring the rim to the lips unchanged.
 */
const MODELED: Record<
    Exclude<BrassModelId, "trombone" | "bassTrombone">,
    { mesh: unknown; mouthpiece: Vec3; leftGrip: Vec3 }
> = {
    trumpet: {
        mesh: trumpetMesh,
        mouthpiece: [0, 0.018, -0.093],
        leftGrip: [0.03, -0.012, 0.03],
    },
    mellophone: {
        mesh: mellophoneMesh,
        mouthpiece: [0, 0.018, -0.1175],
        leftGrip: [0.05, -0.012, -0.034],
    },
    baritone: {
        mesh: baritoneMesh,
        mouthpiece: [0, 0.018, -0.1482],
        leftGrip: [0.05, -0.012, -0.034],
    },
    euphonium: {
        mesh: euphoniumMesh,
        mouthpiece: [0, 0.018, -0.1626],
        leftGrip: [0.05, -0.012, -0.034],
    },
    contra: {
        mesh: contraMesh,
        mouthpiece: [-0.1, -0.03, 0.1],
        leftGrip: [0, -0.11, -0.3],
    },
};

function modeled(id: keyof typeof MODELED, detail: Detail): InstrumentModel {
    const m = MODELED[id];
    return {
        id,
        pieces: colorPieces(
            bakedPieces(m.mesh as BakedMesh, detail),
            (part) => BRASS_COLORS[part] ?? BRASS_COLORS[PART_METAL],
        ),
        leftGrip: m.leftGrip,
        mouthpiece: m.mouthpiece,
    };
}

export function brassModel(
    id: BrassModelId,
    detail: Detail = "high",
): InstrumentModel {
    switch (id) {
        case "trombone":
        case "bassTrombone":
            return trombone(id, detail);
        default:
            return modeled(id, detail);
    }
}
