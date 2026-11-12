/**
 * The brass section's horns (docs/3d/instruments.md §3, §4), each assembled
 * from `hornKit` parts and laid out from views of the real instrument.
 * Instrument frame: origin at the right hand's grip (the valve block, or the
 * trombone's slide brace), +Z toward the bell, +Y up through the valve caps,
 * +X the performer's left. Proportions follow the reference pages; nothing
 * is copied from them. Pure: no three.js.
 *
 * Every horn's tubing is held to its pitch (`BRASS_OPEN_LENGTH`): one air
 * path of about that length from the mouthpiece to the bell, and a loop on
 * each valve that adds a half step, a whole step, or a step and a half.
 */
import { contra } from "./contra";
import type { Horn } from "./hornKit";
import { lowBrassHorn } from "./lowBrass";
import { marchingHorn } from "./marchingBrass";
import {
    colorPieces,
    PART_BLACK,
    PART_CHROME,
    PART_METAL,
    PART_WOOD,
} from "./mesh";
import type { BrassModelId, Detail, InstrumentModel } from "./model";
import { beret } from "./beret";
import { sousaphone } from "./sousaphone";
import { tromboneHorn } from "./trombones";
import { trumpet } from "./trumpet";

export type { BrassModelId, Detail, InstrumentModel };

/**
 * Overall length along +Z (the rearmost point to the bell's rim) and bell
 * diameter, as built: meters. The sousaphone is worn round the body, so its
 * length is front to back.
 */
export const BRASS_DIMENSIONS: Record<
    BrassModelId,
    { length: number; bell: number }
> = {
    trumpet: { length: 0.56, bell: 0.125 },
    mellophone: { length: 0.48, bell: 0.264 },
    baritone: { length: 0.585, bell: 0.254 },
    euphonium: { length: 0.61, bell: 0.28 },
    trombone: { length: 1.18, bell: 0.21 },
    bassTrombone: { length: 1.17, bell: 0.24 },
    contra: { length: 1.07, bell: 0.5 },
    sousaphone: { length: 0.85, bell: 0.66 },
};

/**
 * The open horn's sounding length for its key, meters: B♭ trumpet, F
 * mellophone, B♭ baritone, euphonium and trombones an octave below the
 * trumpet, BB♭ tubas an octave below those. A horn's centerline comes out
 * a little under it (the bell's flare makes up the rest), and its valve
 * loops are fractions of it (`VALVE_SLIDE_RATIO`).
 */
export const BRASS_OPEN_LENGTH: Record<BrassModelId, number> = {
    trumpet: 1.48,
    mellophone: 1.97,
    baritone: 2.9,
    euphonium: 2.9,
    trombone: 2.75,
    bassTrombone: 2.75,
    contra: 5.6,
    sousaphone: 5.6,
};

/**
 * Default colors by part: yellow brass under gold lacquer (a metal's
 * reflectance, paler than the color the eye names), nickel trim, black, and
 * the pearl of the valve buttons. The window recolors silver.
 */
export const BRASS_COLORS: Record<number, number> = {
    [PART_METAL]: 0xe4b654,
    [PART_CHROME]: 0xe2e2dd,
    [PART_BLACK]: 0x141416,
    [PART_WOOD]: 0xf2efe6,
};

const BUILDERS: Record<BrassModelId, (detail: Detail) => Horn> = {
    trumpet,
    mellophone: (detail) => marchingHorn("mellophone", detail),
    baritone: (detail) => lowBrassHorn("baritone", detail),
    euphonium: (detail) => lowBrassHorn("euphonium", detail),
    trombone: (detail) => tromboneHorn("trombone", detail),
    bassTrombone: (detail) => tromboneHorn("bassTrombone", detail),
    contra,
    sousaphone,
};

/** A horn as built, with its tubing lengths: what the tests hold to pitch. */
export function brassHorn(id: BrassModelId, detail: Detail = "high"): Horn {
    return BUILDERS[id](detail);
}

export function brassModel(
    id: BrassModelId,
    detail: Detail = "high",
): InstrumentModel {
    const horn = brassHorn(id, detail);
    return {
        id,
        pieces: colorPieces(
            // sousaphone players wear a beret, not the shako (owner, 2026-11-10)
            id === "sousaphone"
                ? [...horn.pieces, ...beret(detail)]
                : horn.pieces,
            (part) => BRASS_COLORS[part] ?? BRASS_COLORS[PART_METAL],
        ),
        leftGrip: horn.leftGrip,
        mouthpiece: horn.rim,
    };
}
