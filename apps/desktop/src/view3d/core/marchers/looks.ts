/**
 * What each 3D View marcher looks like: its body (type, skin tone, height
 * class) and its section's uniform (ADR 0010 D-7).
 *
 * The show file stores only the uniform presets (the venue settings'
 * `uniforms` for the band and `guardUniforms` for the guard), so the rest is
 * derived:
 *
 * - body type and skin tone from a stable hash of the marcher ID, so a
 *   marcher looks the same every time the show opens;
 * - height class 0.95, 1.00 or 1.05 by the same hash at high quality, and
 *   1.00 for everyone at low quality;
 * - the uniform from the show's presets (`uniformPresets.ts`): the band
 *   preset's band look, or the guard preset's guard look for the guard
 *   sections, chosen by `isGuard`
 *   (ADR 0010 D-7 and D-18). The section's 2D fill color never touches the
 *   uniform; it only colors what the section carries (drum shells, flag
 *   silks), which otherwise take the preset's colors and silk pattern. Each
 *   look carries the section's instrument from `core/instruments` in the
 *   hold it plays.
 *
 * Pure: no three.js, React or database.
 */
import type { RgbaColor } from "@openmarch/core";
import { FAMILIES, getSectionObjectByName } from "@/global/classes/Sections";
import {
    carryForSection,
    finishFor,
    guardCarry,
    isTuba,
    tubaCarry,
    type Carry,
    type Finish,
    type TubaModelId,
} from "../instruments/catalog";
import { bassSizesFor } from "../instruments/battery";
import type { GuardModelId, ModelOptions } from "../instruments/model";
import type { HoldState } from "../instruments/holds";
import {
    DEFAULT_GUARD_UNIFORM_PRESET,
    DEFAULT_UNIFORM_PRESET,
    UNIFORM_PRESETS,
    guardLookOf,
    type GuardUniformPresetId,
    type UniformPresetId,
} from "./uniformPresets";

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
    style:
        | "classic"
        | "sash"
        | "plastron"
        | "military"
        | "split"
        | "fade"
        | "cadet";
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
        /** The stripe down the pants' outer seam. */
        stripe: boolean;
        /** The high collar in the trim color. */
        collar: boolean;
        /** The cuffs in the trim color. */
        cuffs: boolean;
        /** Gloves; without them the hands are bare, in the performer's skin tone. */
        gloves: boolean;
        hat: boolean;
        hatType: "shako";
        instrument: Instrument;
        /** What the section carries, or null. */
        carry: Carry | null;
        /**
         * sRGB: the section's 2D fill color, for what it carries (drum
         * shells, flag silks). Not part of the uniform; null when the
         * section carries nothing, so looks without a carry never split
         * by fill.
         */
        carryColor: number | null;
        /**
         * The preset whose pattern paints the flag silks, or null for plain
         * silks in `carryColor`.
         */
        silk: UniformPresetId | null;
        /** Gold lacquer ("brass") or silver lacquer. */
        finish: Finish;
        hold: HoldState;
    };
}

/** A 2D fill color as an sRGB number. */
export function fillToNumber(c: RgbaColor): number {
    return (
        ((Math.round(c.r) & 255) << 16) |
        ((Math.round(c.g) & 255) << 8) |
        (Math.round(c.b) & 255)
    );
}

/**
 * A section's uniform from the show's uniform presets: the band preset's
 * band look, or the guard preset's guard look for the guard sections
 * (`isGuard`). Nothing else about it comes from the show. Brass carry their
 * horn in gold lacquer, held as `hold` says (docs/3d/instruments.md §5).
 * `fill` (sRGB, the section's 2D fill) colors drum shells and plain flag
 * silks; without one they take the color and silk pattern of the preset
 * that dresses the section. `guard`, when set, is the equipment every guard
 * section carries instead of its own (the settings' guard equipment). `winds`
 * is the show's choice for its wind players: the brass line's finish, and
 * whether the tubas carry marching tubas or sousaphones. Woodwinds keep the
 * finish they are made in.
 */
export function sectionUniform(
    section: string,
    hold: HoldState = "up",
    options?: ModelOptions,
    fill?: number,
    guard?: GuardModelId,
    preset: UniformPresetId = DEFAULT_UNIFORM_PRESET,
    guardPreset: GuardUniformPresetId = DEFAULT_GUARD_UNIFORM_PRESET,
    winds: { finish?: Finish; tuba?: TubaModelId } = {},
): UniformLook {
    const inGuard = isGuard(section);
    const dressedBy: UniformPresetId = inGuard ? guardPreset : preset;
    const dress = UNIFORM_PRESETS[dressedBy];
    const base = inGuard ? guardLookOf(guardPreset) : dress.band;
    const carry =
        guard && inGuard
            ? guardCarry(guard)
            : winds.tuba && isTuba(section)
              ? tubaCarry(winds.tuba)
              : withOptions(carryForSection(section), options);
    return {
        style: base.style,
        colors: { ...base.colors },
        options: {
            ...base.options,
            // sousaphone players wear a beret, drawn with the horn, not the shako
            hat: carry?.model === "sousaphone" ? false : base.options.hat,
            hatType: "shako",
            instrument: "none",
            carry,
            carryColor: carry ? (fill ?? dress.carry) : null,
            silk: carry && fill === undefined && dress.silk ? dressedBy : null,
            finish: finishFor(carry, winds.finish ?? "brass"),
            hold,
        },
    };
}

/** The uniform shader's part ids (om-pose `uniforms/uniform-shader.js`). */
export const PART = {
    shako: [7, 8, 9],
    /** the shako's plume: drawn as its own mesh (`plumeSet.ts`), not with the body */
    plume: 8,
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

/**
 * Identifies what a uniform draws on the body: looks that differ only in
 * what they carry, how they hold it, its color or its finish draw alike,
 * so their marchers share one body mesh and material. The options that
 * don't reach the body are left out by name, so a new option splits
 * meshes until it's listed here.
 */
export function bodyKey(look: UniformLook): string {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- left out of the key
    const { carry, carryColor, silk, finish, hold, ...drawn } = look.options;
    return JSON.stringify([look.style, look.colors, drawn]);
}
