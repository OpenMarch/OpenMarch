import type { FieldTheme } from "@openmarch/core";
import type {
    FieldPlan,
    FieldRole,
    FieldSurfaceStyle,
    PlanItem,
} from "@/view3d/core/field";
import { TURF } from "@/view3d/core/field/turfPlan";
import {
    useUiSettingsStore,
    type FieldVenueAround,
    type FieldVenueLook,
} from "@/stores/UiSettingsStore";

/**
 * The venue on the 2D field (fork #1207): the 3D View's field surface, top
 * down, under the 2D grid, washed toward the field's background so the grid
 * and the marchers stay the main layer.
 */

/** How a look paints the venue, for the layer's shader. */
export interface VenueLook {
    /** Share of venue color mixed into the background (0 = background only). */
    amount: number;
    /** Saturation kept, 0..1. */
    saturation: number;
    /** Extra contrast for detail against the turf base: stripes, logo, end zones. */
    detail: number;
    /** Markings only: the logo and end zones as faint grey ink, no turf. */
    ink: boolean;
    /** Keeps the turf's own yard lines, hashes and numbers (and draws the grid in light ink). */
    keepMarkings: boolean;
    /** Share of color for the stands around the field. */
    aroundAmount: number;
}

export const VENUE_LOOKS: Readonly<
    Record<Exclude<FieldVenueLook, "off">, VenueLook>
> = {
    faint: {
        amount: 0.17,
        saturation: 0.5,
        detail: 0.35,
        ink: false,
        keepMarkings: false,
        aroundAmount: 0.22,
    },
    soft: {
        amount: 0.38,
        saturation: 0.7,
        detail: 0.45,
        ink: false,
        keepMarkings: false,
        aroundAmount: 0.42,
    },
    markings: {
        amount: 0.2,
        saturation: 0,
        detail: 0,
        ink: true,
        keepMarkings: false,
        aroundAmount: 0.18,
    },
    full: {
        amount: 0.88,
        saturation: 0.9,
        detail: 0,
        ink: false,
        keepMarkings: true,
        aroundAmount: 0.8,
    },
};

/**
 * The look's numbers, or null when the venue is off. A Field only venue (the
 * theme's surface) has nothing to show, so the look, kept for every show, is
 * off there.
 */
export function venueLook(
    look: FieldVenueLook | undefined,
    style: FieldSurfaceStyle,
): VenueLook | null {
    return !look || look === "off" || !venueShows(style)
        ? null
        : VENUE_LOOKS[look];
}

/** False for a Field only venue, which has no surface of its own to show. */
export function venueShows(style: FieldSurfaceStyle): boolean {
    return style !== "theme";
}

/** What's drawn around the field: only stadium turf has an edge; elsewhere it's none. */
export function venueAround(
    around: FieldVenueAround | undefined,
    style: FieldSurfaceStyle,
): FieldVenueAround {
    const value = around ?? "edge";
    return value === "edge" && style !== "turf" ? "field" : value;
}

/** Roles the 2D grid draws itself; doubled lines a pixel apart look broken. */
const MARKINGS: ReadonlySet<FieldRole> = new Set<FieldRole>([
    "grid",
    "halfLine",
    "yardLine",
    "yLine",
    "hash",
    "tick",
    "dot",
    "border",
    "yardNumber",
    "arrow",
    "grain",
]);
/** Markings only: end zones as a light tint, the logo and lettering as ink. */
const INK_ZONES: ReadonlySet<FieldRole> = new Set<FieldRole>([
    "endZone",
    "endZoneHatch",
    "endZoneFade",
    "endZoneBorder",
]);
const INK_MARKS: ReadonlySet<FieldRole> = new Set<FieldRole>([
    "centerLogo",
    "endZoneText",
    "tarpArt",
    "image",
]);

/**
 * The plan's items a look paints, in passes: each pass is painted at its
 * alpha, in order. Markings only paints end zones lightly, then the logo and
 * lettering; the other looks paint everything but what the 2D grid draws
 * (Full color keeps it all).
 */
export function venuePasses(
    plan: FieldPlan,
    look: VenueLook,
): { items: PlanItem[]; alpha: number }[] {
    if (look.ink)
        return [
            {
                items: plan.items.filter((i) => INK_ZONES.has(i.role)),
                alpha: 0.35,
            },
            {
                items: plan.items.filter((i) => INK_MARKS.has(i.role)),
                alpha: 1,
            },
        ];
    return [
        {
            items: look.keepMarkings
                ? plan.items
                : plan.items.filter((i) => !MARKINGS.has(i.role)),
            alpha: 1,
        },
    ];
}

/** The color most of the surface is (its background rect), as 0..1 RGB. */
export function planBaseColor(plan: FieldPlan): [number, number, number] {
    const background = plan.items.find(
        (i): i is Extract<PlanItem, { color: string }> =>
            i.role === "background" && "color" in i,
    );
    return hexToRgb(background?.color) ?? [0.24, 0.48, 0.2];
}

export function hexToRgb(
    color: string | undefined,
): [number, number, number] | null {
    const m = /^#?([0-9a-f]{6})$/i.exec(color?.trim() ?? "");
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * Roughly the color the look paints the field's background: what the order
 * lanes measure their contrast against (`makeFloorSampler`), 0..255.
 */
export function washedColor(
    background: { r: number; g: number; b: number },
    base: [number, number, number],
    look: VenueLook,
): { r: number; g: number; b: number } {
    if (look.ink) return background;
    const l = 0.299 * base[0] + 0.587 * base[1] + 0.114 * base[2];
    const mixed = base.map((c) => (l + (c - l) * look.saturation) * 255) as [
        number,
        number,
        number,
    ];
    const bg = [background.r, background.g, background.b];
    const out = bg.map((b, i) => b + (mixed[i] - b) * look.amount);
    return { r: out[0], g: out[1], b: out[2] };
}

const WHITE = (a: number) => ({ r: 255, g: 255, b: 255, a });

/**
 * The field with its lines and labels in light ink, for the Full color look,
 * where the turf is dark. Only the 2D grid's drawing uses it; the show's theme
 * is unchanged.
 */
export function withLightLines<T extends { theme: FieldTheme }>(field: T): T {
    return Object.assign(
        Object.create(Object.getPrototypeOf(field) as object) as T,
        field,
        {
            theme: {
                ...field.theme,
                primaryStroke: WHITE(0.95),
                secondaryStroke: WHITE(0.55),
                tertiaryStroke: WHITE(0.25),
                fieldLabel: WHITE(0.9),
            },
        },
    );
}

/** The color under a venue style before the wash: turf green, a tarp's navy, or the theme's. */
export function styleBaseColor(
    style: FieldSurfaceStyle,
    background: { r: number; g: number; b: number },
): [number, number, number] {
    if (style === "turf") return hexToRgb(TURF.base) ?? [0.24, 0.48, 0.2];
    if (style === "tarp") return [0.07, 0.08, 0.2];
    return [background.r / 255, background.g / 255, background.b / 255];
}

/** Picks a look (or off), remembering a look for Show venue on field. */
export function setFieldVenue(look: FieldVenueLook): void {
    const { uiSettings, setUiSettings } = useUiSettingsStore.getState();
    setUiSettings({
        ...uiSettings,
        fieldVenue: look,
        ...(look === "off" ? {} : { fieldVenueLast: look }),
    });
}
