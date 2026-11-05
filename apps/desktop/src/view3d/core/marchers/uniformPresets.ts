/**
 * The built-in uniform presets (ADR 0010 D-18, amended 2026-10-16): what the
 * band and the guard wear until the show has uniforms of its own, all in
 * OpenMarch purple (#6442ff). The show picks the band's and the guard's
 * apart in the 3D View's venue settings (`uniforms` and `guardUniforms`):
 * West Point dresses the band by default, Royal Sash the guard.
 *
 * Each preset has a band look; all but West Point have a guard look too.
 * What a section carries takes the color of the preset that dresses it:
 * drum shells the band's, flag silks the guard's, painted with its pattern.
 * A section with its own 2D fill color keeps plain silks and shells in that
 * color.
 *
 * Pure: no three.js, React or database.
 */
import type { UniformLook } from "./looks";

/** Every preset, for the band. */
export const UNIFORM_PRESET_IDS = [
    "westPoint",
    "sash",
    "signature",
    "fade",
    "plastron",
    "military",
    "prism",
] as const;
export type UniformPresetId = (typeof UNIFORM_PRESET_IDS)[number];

/** The presets with a guard look, for the guard. */
export const GUARD_UNIFORM_PRESET_IDS = [
    "sash",
    "signature",
    "fade",
    "plastron",
    "military",
    "prism",
] as const satisfies readonly UniformPresetId[];
export type GuardUniformPresetId = (typeof GUARD_UNIFORM_PRESET_IDS)[number];

export const DEFAULT_UNIFORM_PRESET: UniformPresetId = "westPoint";
export const DEFAULT_GUARD_UNIFORM_PRESET: GuardUniformPresetId = "sash";

/** The part of a look a preset sets. */
export type PresetLook = Pick<UniformLook, "style" | "colors"> & {
    options: Pick<
        UniformLook["options"],
        "stripe" | "collar" | "cuffs" | "gloves" | "hat"
    >;
};

/**
 * A silk's color (sRGB) at (u, v): u runs from the pole (0) to the fly end
 * (1), v from the bottom (0) to the top (1).
 */
export type SilkPattern = (u: number, v: number) => number;

export interface UniformPreset {
    band: PresetLook;
    /** Absent for band-only presets; see `GUARD_UNIFORM_PRESET_IDS`. */
    guard?: PresetLook;
    /** sRGB: what the sections it dresses carry; silks without a pattern. */
    carry: number;
    /** The silks' pattern; plain `carry` when absent. */
    silk?: SilkPattern;
}

// OpenMarch purple and its family
const OM = 0x6442ff;
const OM_DEEP = 0x2e1a99;
const OM_NIGHT = 0x170d4a;
const OM_INK = 0x0d0826;
const LAVENDER = 0xb3a3ff;
const LILAC = 0xe8e3ff;

const WHITE = 0xf2f2ee;
const SILVER = 0xc9cdd8;
const GOLD = 0xd8b04a;
/** West Point's cummerbund and plate: a brighter, yellower gold. */
const WEST_POINT_GOLD = 0xf0c02a;
const BLACK = 0x111114;
/** Darker than the pants, so the feet still separate from the legs. */
const SHOE_BLACK = 0x0b0b0d;

/** Blends two sRGB colors, `t` from 0 (a) to 1 (b). */
function mix(a: number, b: number, t: number): number {
    const k = Math.min(1, Math.max(0, t));
    const channel = (shift: number) =>
        Math.round(((a >> shift) & 255) * (1 - k) + ((b >> shift) & 255) * k) <<
        shift;
    return channel(16) | channel(8) | channel(0);
}

/** A band uniform: trim, seam stripe, gloves and a shako. */
const BAND = {
    stripe: true,
    collar: true,
    cuffs: true,
    gloves: true,
    hat: true,
};

/** A plain guard look: no trim or stripe, bare hands, no hat. */
function guardLook(
    style: UniformLook["style"],
    colors: {
        primary: number;
        secondary: number;
        accent: number;
        trim: number;
    },
    pants: number,
    shoes = SHOE_BLACK,
): PresetLook {
    const { primary } = colors;
    return {
        style,
        // gloves, hat, plume and visor are unused: bare hands, no hat
        colors: {
            ...colors,
            pants,
            shoes,
            gloves: primary,
            hat: primary,
            plume: primary,
            visor: primary,
        },
        options: {
            stripe: false,
            collar: false,
            cuffs: false,
            gloves: false,
            hat: false,
        },
    };
}

export const UNIFORM_PRESETS: Readonly<Record<UniformPresetId, UniformPreset>> =
    {
        // West Point: academy full dress. A purple jacket, up to the neck, with
        // rows of white braid high across the chest, a white cross belt with a gold plate, a
        // pleated gold cummerbund, white trousers and a purple shako with a
        // white plume. Band only.
        westPoint: {
            band: {
                style: "cadet",
                colors: {
                    primary: OM,
                    secondary: WEST_POINT_GOLD,
                    accent: WHITE,
                    trim: WHITE,
                    pants: WHITE,
                    shoes: SHOE_BLACK,
                    gloves: WHITE,
                    hat: OM,
                    plume: WHITE,
                    visor: BLACK,
                },
                // no collar: the purple runs up to the neck
                options: { ...BAND, stripe: false, collar: false },
            },
            // band only: the guard wears its own preset
            carry: OM,
        },
        // Royal Sash: a midnight jacket with a purple sash edged in gold. Silks:
        // split on the diagonal, purple at the pole and midnight at the fly, with
        // a gold seam.
        sash: {
            band: {
                style: "sash",
                colors: {
                    primary: OM_NIGHT,
                    secondary: WHITE,
                    accent: OM,
                    trim: GOLD,
                    pants: OM_NIGHT,
                    shoes: SHOE_BLACK,
                    gloves: WHITE,
                    hat: OM_NIGHT,
                    plume: OM,
                    visor: GOLD,
                },
                options: BAND,
            },
            guard: guardLook(
                "sash",
                {
                    primary: OM_NIGHT,
                    secondary: OM_NIGHT,
                    accent: OM,
                    trim: GOLD,
                },
                OM_NIGHT,
            ),
            carry: OM_NIGHT,
            silk: (u, v) => {
                const d = u - v;
                return Math.abs(d) < 0.035 ? GOLD : d < 0 ? OM : OM_NIGHT;
            },
        },
        // Ultraviolet Fade: the jacket fades from near-black at the waist up to
        // purple at the chest, with lilac trim; the guard fades into lavender.
        // Silks glow from ink at the pole out to lilac at the fly end.
        fade: {
            band: {
                style: "fade",
                colors: {
                    primary: OM,
                    secondary: OM_INK,
                    accent: LAVENDER,
                    trim: LAVENDER,
                    pants: OM_INK,
                    shoes: SHOE_BLACK,
                    gloves: BLACK,
                    hat: OM_INK,
                    plume: LAVENDER,
                    visor: OM,
                },
                options: { ...BAND, stripe: false, collar: false },
            },
            guard: guardLook(
                "fade",
                { primary: LAVENDER, secondary: OM_INK, accent: OM, trim: OM },
                OM_INK,
            ),
            carry: OM_INK,
            silk: (u) =>
                u < 0.6
                    ? mix(OM_INK, OM, u / 0.6)
                    : mix(OM, LILAC, (u - 0.6) / 0.4),
        },
        // Signature: a purple jacket and shako with silver trim and a white
        // plume; the guard in a matching purple top. Silks: purple, a white band
        // corner to corner.
        signature: {
            band: {
                style: "classic",
                colors: {
                    primary: OM,
                    secondary: WHITE,
                    accent: WHITE,
                    trim: SILVER,
                    pants: OM_NIGHT,
                    shoes: SHOE_BLACK,
                    gloves: WHITE,
                    hat: OM,
                    plume: WHITE,
                    visor: BLACK,
                },
                options: BAND,
            },
            guard: guardLook(
                "classic",
                { primary: OM, secondary: OM, accent: OM, trim: OM },
                OM_NIGHT,
            ),
            carry: OM,
            silk: (u, v) => {
                const d = Math.abs(u - v);
                return d < 0.11 ? WHITE : d < 0.14 ? OM_DEEP : OM;
            },
        },
        // Lilac Plastron: a lilac bib on a purple jacket, with white pants, shoes
        // and shako. Silks: white with a purple chevron pointing to the fly end.
        plastron: {
            band: {
                style: "plastron",
                colors: {
                    primary: OM,
                    secondary: LILAC,
                    accent: OM,
                    trim: OM_DEEP,
                    pants: WHITE,
                    shoes: WHITE,
                    gloves: WHITE,
                    hat: WHITE,
                    plume: OM,
                    visor: OM_DEEP,
                },
                options: BAND,
            },
            guard: guardLook(
                "plastron",
                { primary: OM, secondary: LILAC, accent: OM, trim: OM_DEEP },
                WHITE,
                WHITE,
            ),
            carry: WHITE,
            silk: (u, v) => {
                const center = 0.25 + 0.45 * (1 - 2 * Math.abs(v - 0.5));
                return Math.abs(u - center) < 0.1 ? OM : WHITE;
            },
        },
        // Night Watch: corps-style military in midnight, with purple cross
        // belts, silver buttons and visor. Silks: midnight with three purple bars
        // edged in silver.
        military: {
            band: {
                style: "military",
                colors: {
                    primary: OM_NIGHT,
                    secondary: OM_INK,
                    accent: OM,
                    trim: SILVER,
                    pants: OM_INK,
                    shoes: SHOE_BLACK,
                    gloves: WHITE,
                    hat: OM_NIGHT,
                    plume: OM,
                    visor: SILVER,
                },
                options: BAND,
            },
            guard: guardLook(
                "military",
                {
                    primary: OM_NIGHT,
                    secondary: OM_INK,
                    accent: OM,
                    trim: SILVER,
                },
                OM_INK,
            ),
            carry: OM_NIGHT,
            silk: (_u, v) => {
                const d = Math.min(
                    Math.abs(v - 0.25),
                    Math.abs(v - 0.5),
                    Math.abs(v - 0.75),
                );
                return d < 0.055 ? OM : d < 0.07 ? SILVER : OM_NIGHT;
            },
        },
        // Prism Split: the jacket splits on a diagonal into purple and lavender.
        // Silks: four bands of purple, midnight to lavender.
        prism: {
            band: {
                style: "split",
                colors: {
                    primary: OM,
                    secondary: LAVENDER,
                    accent: WHITE,
                    trim: WHITE,
                    pants: OM_DEEP,
                    shoes: SHOE_BLACK,
                    gloves: WHITE,
                    hat: OM_DEEP,
                    plume: LAVENDER,
                    visor: BLACK,
                },
                options: BAND,
            },
            guard: guardLook(
                "split",
                { primary: OM, secondary: LILAC, accent: OM, trim: OM },
                OM_DEEP,
            ),
            carry: OM_DEEP,
            silk: (u, v) => {
                const shades = [OM_NIGHT, OM_DEEP, OM, LAVENDER];
                const i = Math.floor((u * 0.7 + v * 0.3) * shades.length);
                return shades[Math.min(shades.length - 1, Math.max(0, i))];
            },
        },
    };

/** `id` if it names a preset, otherwise the band's default. */
export function uniformPresetOf(id: unknown): UniformPresetId {
    return (UNIFORM_PRESET_IDS as readonly unknown[]).includes(id)
        ? (id as UniformPresetId)
        : DEFAULT_UNIFORM_PRESET;
}

/** `id` if it names a preset with a guard look, otherwise the guard's default. */
export function guardUniformPresetOf(id: unknown): GuardUniformPresetId {
    return (GUARD_UNIFORM_PRESET_IDS as readonly unknown[]).includes(id)
        ? (id as GuardUniformPresetId)
        : DEFAULT_GUARD_UNIFORM_PRESET;
}

/** A guard preset's guard look. */
export function guardLookOf(id: GuardUniformPresetId): PresetLook {
    const look = UNIFORM_PRESETS[id].guard;
    if (!look) throw new Error(`uniform preset ${id} has no guard look`);
    return look;
}
