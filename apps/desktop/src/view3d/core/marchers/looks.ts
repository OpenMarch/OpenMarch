/**
 * What each 3D View marcher looks like: its body (type, skin tone, height
 * class) and its section's uniform (ADR 0002 D-7).
 *
 * The show file stores none of this yet, so the defaults are derived:
 *
 * - body type and skin tone from a stable hash of the marcher ID, so a
 *   marcher looks the same every time the show opens;
 * - height class 0.95, 1.00 or 1.05 by the same hash at high quality, and
 *   1.00 for everyone at low quality;
 * - one uniform per section, in the section's 2D fill color, carrying the
 *   section's instrument from `core/instruments` in the hold it plays.
 *
 * Pure: no three.js, React or database.
 */
import type { RgbaColor } from "@openmarch/core";
import { FAMILIES, getSectionObjectByName } from "@/global/classes/Sections";
import {
    carryForSection,
    guardCarry,
    type Carry,
    type Finish,
} from "../instruments/catalog";
import { bassSizesFor } from "../instruments/battery";
import type { GuardModelId, ModelOptions } from "../instruments/model";
import type { HoldState } from "../instruments/holds";

const withOptions = (
    carry: Carry | null,
    options?: ModelOptions,
): Carry | null =>
    carry && options && Object.keys(options).length > 0
        ? { ...carry, options }
        : carry;

/**
 * Per-marcher model options for the bass drum line: the marchers whose
 * section carries the bass drum, taken in id order, spread over the
 * drum sizes (a lone drum gets the middle one). Everyone else is undefined.
 */
export function bassOptions(
    ids: readonly number[],
    sections: readonly string[],
): (ModelOptions | undefined)[] {
    const bass = ids
        .map((id, i) => ({ id, i }))
        .filter(({ i }) => carryForSection(sections[i])?.model === "bass")
        .sort((a, b) => a.id - b.id);
    const sizes = bassSizesFor(bass.length);
    const out: (ModelOptions | undefined)[] = ids.map(() => undefined);
    bass.forEach(({ i }, k) => {
        out[i] = { bassInches: sizes[k] };
    });
    return out;
}

/** om-pose's seven body types (`assets/body-v4u/<type>.glb`). */
export const BODY_TYPES = [
    "neutral-slim",
    "neutral-average",
    "neutral-athletic",
    "neutral-broad",
    "neutral-full",
    "feminine-average",
    "masculine-average",
] as const;
export type BodyType = (typeof BODY_TYPES)[number];

/** The skin tones om-pose's viewers use, light to dark. */
export const SKIN_TONES = [
    0xf1c9a5, 0xe0ac7e, 0xc68863, 0x9c6644, 0x6f4a32, 0x4b3124,
] as const;

/** Height classes: each is a full clip set drawn at that scale. */
export const HEIGHT_CLASSES = [0.9, 0.95, 1, 1.05, 1.1] as const;
export type HeightClass = (typeof HEIGHT_CLASSES)[number];

/** Height of the top of the head at class 1.00, in meters. */
export const CLASS_HEIGHT_M = 1.8;

/** A performer's own body: what belongs to the person, not the uniform. */
export interface PerformerBody {
    bodyType: BodyType;
    /** sRGB as a number, as `writeMarcher` takes it. */
    skinTone: number;
    heightClass: HeightClass;
}

/** The class nearest a performer's height in meters. */
export function heightClassFor(heightM: number): HeightClass {
    const ratio = heightM / CLASS_HEIGHT_M;
    let best: HeightClass = 1;
    for (const h of HEIGHT_CLASSES)
        if (Math.abs(h - ratio) < Math.abs(best - ratio)) best = h;
    return best;
}

/** The clip name suffix for a class: "-h090" ... "-h110", none for 1.00. */
export function classSuffix(h: HeightClass): string {
    return h === 1 ? "" : `-h${String(Math.round(h * 100)).padStart(3, "0")}`;
}

/** The packed clip file's tag for a class: "h090" ... "h110". */
export function classTag(h: HeightClass): string {
    return `h${String(Math.round(h * 100)).padStart(3, "0")}`;
}

// cspell:ignore lowbias
/** A 32-bit integer hash (lowbias32), stable across runs and platforms. */
export function hash32(n: number): number {
    let x = n >>> 0;
    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d);
    x ^= x >>> 15;
    x = Math.imul(x, 0x846ca68b);
    x ^= x >>> 16;
    return x >>> 0;
}

/** Height classes a band gets by default, a quarter short, half middle, a quarter tall. */
export const VARIED_HEIGHTS: readonly HeightClass[] = [0.95, 1, 1, 1.05];

/**
 * The derived body for a marcher with no stored body. With `varyHeight`
 * (the high quality tier) heights spread over 0.95, 1.00 and 1.05 so ranks
 * don't look ruler-straight; without it (the low tier) everyone is 1.00, so
 * only one height class is loaded and baked.
 */
export function defaultPerformerBody(
    marcherId: number,
    { varyHeight = false }: { varyHeight?: boolean } = {},
): PerformerBody {
    const a = hash32(marcherId);
    const b = hash32(a ^ 0x9e3779b9);
    const c = hash32(b ^ 0x85ebca6b);
    return {
        bodyType: BODY_TYPES[a % BODY_TYPES.length],
        skinTone: SKIN_TONES[b % SKIN_TONES.length],
        // high bits: this chained hash's low two bits are uneven
        heightClass: varyHeight
            ? VARIED_HEIGHTS[(c >>> 16) % VARIED_HEIGHTS.length]
            : 1,
    };
}

/**
 * The vendored shader's own instrument option. Always "none": the horns
 * are this app's geometry (`core/instruments`), and the shader's built-in
 * placeholders stay discarded.
 */
export type Instrument = "none";

/** Color guard sections (the "Guard" family: color guard, rifle, flag, dancer, twirler). */
export function isGuard(section: string): boolean {
    return getSectionObjectByName(section.trim()).family === FAMILIES.Guard;
}

/** A uniform: `createUniformMaterial`'s input. Colors are sRGB numbers. */
export interface UniformLook {
    style: "classic" | "sash" | "plastron" | "military" | "split" | "fade";
    colors: {
        primary: number;
        secondary: number;
        accent: number;
        trim: number;
        pants: number;
        shoes: number;
        gloves: number;
        hat: number;
        plume: number;
        visor: number;
    };
    options: {
        hat: boolean;
        hatType: "shako";
        instrument: Instrument;
        /** What the section carries, or null. */
        carry: Carry | null;
        /** Gold lacquer ("brass") or silver lacquer. */
        finish: Finish;
        hold: HoldState;
    };
}

/** Used when a section has no fill color: om-pose's "Royal" blue. */
export const DEFAULT_PRIMARY = 0x2d4f9e;

const WHITE = 0xf2f2ee;
const GOLD = 0xd8b04a;
const BLACK = 0x111114;
/** Darker than the pants, so the feet still separate from the legs. */
const SHOE_BLACK = 0x0b0b0d;
/** Lifted from om-pose's 0x1c1f2b, which renders as black legs. */
const NAVY = 0x2b3150;

const rgbToNumber = (c: RgbaColor) =>
    ((Math.round(c.r) & 255) << 16) |
    ((Math.round(c.g) & 255) << 8) |
    (Math.round(c.b) & 255);

/**
 * A section's uniform: om-pose's classic style with the section's fill as
 * the jacket and hat, white and gold trim, navy pants. Guard sections go
 * without the shako. Brass carry their horn in gold lacquer, held as `hold`
 * says (docs/3d/instruments.md §5). `guard`, when set, is the equipment every
 * guard section carries instead of its own (the settings' guard equipment).
 */
export function sectionUniform(
    section: string,
    fill: RgbaColor | null | undefined,
    hold: HoldState = "up",
    options?: ModelOptions,
    guard?: GuardModelId,
): UniformLook {
    const carry =
        guard && isGuard(section)
            ? guardCarry(guard)
            : withOptions(carryForSection(section), options);
    const primary = fill ? rgbToNumber(fill) : DEFAULT_PRIMARY;
    return {
        style: "classic",
        colors: {
            primary,
            secondary: WHITE,
            accent: WHITE,
            trim: GOLD,
            pants: NAVY,
            shoes: SHOE_BLACK,
            gloves: WHITE,
            hat: primary,
            plume: WHITE,
            visor: BLACK,
        },
        options: {
            // guard doesn't wear a shako
            hat: !isGuard(section),
            hatType: "shako",
            instrument: "none",
            carry,
            finish: "brass",
            hold,
        },
    };
}

/** The uniform shader's part ids (om-pose `uniforms/uniform-shader.js`). */
export const PART = {
    shako: [7, 8, 9],
    aussie: [10, 11],
    cape: 12,
    /** the shader's placeholder trumpet, mellophone, baritone: never drawn */
    instruments: [13, 14, 15],
} as const;

/**
 * Whether a look shows a body part: the same rules the uniform shader uses
 * to discard the parts a look doesn't wear, so their triangles can be left
 * out of the draw instead of skinned and discarded.
 */
export function partVisible(look: UniformLook, part: number): boolean {
    const { hat, hatType } = look.options;
    if ((PART.shako as readonly number[]).includes(part))
        return hat && hatType === "shako";
    if ((PART.aussie as readonly number[]).includes(part)) return false;
    if (part === PART.cape) return false;
    // the shader's placeholder instruments never draw: the horns are our own geometry
    if ((PART.instruments as readonly number[]).includes(part)) return false;
    return true;
}

/** Identifies a uniform, so equal looks share one material. */
export function uniformKey(look: UniformLook): string {
    return JSON.stringify(look);
}
