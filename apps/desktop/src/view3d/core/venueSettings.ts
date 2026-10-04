/**
 * The show's 3D View venue settings (ADR 0002 D-5, docs/3d/design.md §3).
 *
 * Plain TypeScript and zod only: this module lives under `view3d/core/`, so it
 * must not import React, React Three Fiber, drei, Electron or the database.
 */
import * as z from "zod";
import type { FieldProperties } from "@openmarch/core";
import type { LightingPreset, VenueKitId, VenueParams } from "./types";

export const VENUE_SETTINGS_VERSION = 1;

export const VENUE_KIT_IDS = [
    "hs",
    "bighs",
    "college",
    "pro",
    "gym",
    "blank",
] as const satisfies readonly VenueKitId[];

export const LIGHTING_PRESETS = [
    "day",
    "dusk",
    "night",
    "roofClosed",
    "house",
    "show",
] as const satisfies readonly LightingPreset[];

/** "#rrggbb" */
const hexColorSchema = z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Expected a "#rrggbb" color');

export const venueParamsSchema = z.object({
    homeColor: hexColorSchema,
    awayColor: hexColorSchema,
    endZoneText: z.string(),
    endZoneColor: hexColorSchema,
});

/** Version 1 of the venue JSON stored in `view3d_venue.json_data`. */
export const venueSettingsSchema = z.object({
    version: z.literal(VENUE_SETTINGS_VERSION),
    kit: z.enum(VENUE_KIT_IDS),
    lighting: z.enum(LIGHTING_PRESETS),
    crowd: z.boolean(),
    params: venueParamsSchema,
});

export type VenueSettings = z.infer<typeof venueSettingsSchema>;

// Compile-time checks that the schema matches the shared contracts in types.ts.
type Equals<A, B> =
    (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
        ? true
        : false;
const _kitIdsMatch: Equals<VenueSettings["kit"], VenueKitId> = true;
const _lightingMatches: Equals<VenueSettings["lighting"], LightingPreset> =
    true;
const _paramsMatch: Equals<VenueSettings["params"], VenueParams> = true;
void _kitIdsMatch;
void _lightingMatches;
void _paramsMatch;

export const DEFAULT_VENUE_PARAMS: Readonly<VenueParams> = Object.freeze({
    homeColor: "#6442ff",
    awayColor: "#c23b3b",
    endZoneText: "",
    endZoneColor: "#1f2a5c",
});

/**
 * The lighting presets each kit supports and its default (design.md §6).
 * Kit builders should report the same lists in `KitResult.lightingPresets`.
 */
export const KIT_LIGHTING: Readonly<
    Record<
        VenueKitId,
        {
            readonly presets: readonly LightingPreset[];
            readonly defaultLighting: LightingPreset;
        }
    >
> = {
    hs: { presets: ["day", "dusk", "night"], defaultLighting: "day" },
    bighs: { presets: ["day", "dusk", "night"], defaultLighting: "night" },
    college: { presets: ["day", "dusk", "night"], defaultLighting: "night" },
    pro: {
        presets: ["day", "night", "roofClosed"],
        defaultLighting: "roofClosed",
    },
    gym: { presets: ["house", "show"], defaultLighting: "house" },
    blank: { presets: ["day", "dusk", "night"], defaultLighting: "day" },
};

/**
 * Returns `lighting` if the kit supports it, otherwise the kit's default.
 */
export function lightingForKit(
    kit: VenueKitId,
    lighting: LightingPreset,
): LightingPreset {
    const { presets, defaultLighting } = KIT_LIGHTING[kit];
    return presets.includes(lighting) ? lighting : defaultLighting;
}

/** The settings for a kit with its default lighting and default params. */
export function defaultVenueForKit(kit: VenueKitId): VenueSettings {
    return {
        version: VENUE_SETTINGS_VERSION,
        kit,
        lighting: KIT_LIGHTING[kit].defaultLighting,
        crowd: true,
        params: { ...DEFAULT_VENUE_PARAMS },
    };
}

/** The parts of FieldProperties the default venue depends on. */
export type VenueFieldInfo = Pick<
    FieldProperties,
    "name" | "useHashes" | "yCheckpoints"
>;

export type FieldFamily = "football" | "grid" | "other";

/**
 * Classifies a field as football, a grid (indoor or SoundSport floor) or
 * something else. Works for the built-in templates and for custom fields
 * derived from them.
 */
export function fieldFamily(field: VenueFieldInfo): FieldFamily {
    const name = field.name.toLowerCase();
    if (name.includes("football")) return "football";
    if (/indoor|soundsport|sound sport|grid|gym/.test(name)) return "grid";

    // Grid templates name their front and back checkpoints "Front edge" and
    // "Back edge"; football templates use sidelines and hashes.
    const yNames = new Set(
        field.yCheckpoints.map((checkpoint) => checkpoint.name.toLowerCase()),
    );
    if (yNames.has("front edge") && yNames.has("back edge")) return "grid";
    if (field.useHashes || yNames.has("front sideline")) return "football";
    return "other";
}

const KIT_FOR_FAMILY: Readonly<Record<FieldFamily, VenueKitId>> = {
    football: "hs",
    grid: "gym",
    other: "blank",
};

/**
 * The venue a show uses when it has no `view3d_venue` row: `hs` for football
 * fields, `gym` for grid, indoor and SoundSport floors, `blank` otherwise.
 */
export function defaultVenueForField(field: VenueFieldInfo): VenueSettings {
    return defaultVenueForKit(KIT_FOR_FAMILY[fieldFamily(field)]);
}

/**
 * Validates venue settings and moves lighting the kit doesn't support to the
 * kit's default. Throws a ZodError if the value doesn't match the schema.
 */
export function parseVenueSettings(value: unknown): VenueSettings {
    const settings = venueSettingsSchema.parse(value);
    return {
        ...settings,
        lighting: lightingForKit(settings.kit, settings.lighting),
    };
}

/**
 * Like {@link parseVenueSettings}, but takes the stored JSON text and returns
 * `undefined` instead of throwing when it is malformed or invalid.
 */
export function parseVenueSettingsJson(
    json: string,
): VenueSettings | undefined {
    let raw: unknown;
    try {
        raw = JSON.parse(json);
    } catch {
        return undefined;
    }
    const result = venueSettingsSchema.safeParse(raw);
    if (!result.success) return undefined;
    return {
        ...result.data,
        lighting: lightingForKit(result.data.kit, result.data.lighting),
    };
}
