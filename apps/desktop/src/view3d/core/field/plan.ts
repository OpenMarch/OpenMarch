import {
    fieldFootprint,
    stepMeters,
    type Checkpoint,
    type FieldFootprint,
    type FieldProperties,
    type FieldTheme,
} from "@openmarch/core";
import type { VenueParams } from "../types";

/**
 * A field surface is planned first, then painted. The plan lists every
 * element in world meters (design.md section 2), in paint order, so tests can
 * count yard lines and hashes without a 2D canvas, and the painter stays a
 * dumb loop over the items.
 */
export type FieldSurfaceStyle = "turf" | "theme" | "tarp";

/**
 * How turf end zones are painted (mockups; not yet a show setting):
 * - `stripes`: diagonal bands and a white border line;
 * - `solid`: flat color and a white border line;
 * - `argyle`: crossed diagonal bands that read as diamonds;
 * - `fade`: color at the end line fading into the turf toward the goal line;
 * - `outline`: no fill, lettering outlined in the end-zone color;
 * - `pinstripe`: flat color with a double white border line.
 */
export const END_ZONE_STYLES = [
    "stripes",
    "solid",
    "argyle",
    "fade",
    "outline",
    "pinstripe",
] as const;
export type EndZoneStyle = (typeof END_ZONE_STYLES)[number];

/** What a painted element stands for. Tests count items by role. */
export type FieldRole =
    | "background"
    | "stripe"
    | "endZone"
    | "grid"
    | "halfLine"
    | "yardLine"
    | "yLine"
    | "hash"
    | "tick"
    | "dot"
    | "border"
    | "yardNumber"
    | "endZoneText"
    | "arrow"
    | "image"
    | "tarpArt"
    | "centerLogo"
    | "endZoneHatch"
    | "endZoneFade"
    | "endZoneBorder"
    | "goalLine"
    | "accent"
    | "kickoff"
    | "patLine"
    | "grain";

export interface PlanRect {
    type: "rect";
    role: FieldRole;
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    color: string;
}

/** A filled polygon in world meters, for marks that aren't square to the field. */
export interface PlanPoly {
    type: "poly";
    role: FieldRole;
    /** Corners as [x, z] pairs, in order. */
    points: [number, number][];
    color: string;
}

export interface PlanText {
    type: "text";
    role: "yardNumber" | "endZoneText";
    text: string;
    /** Center of the glyph box, in world meters. */
    x: number;
    z: number;
    /** Cap height in meters. */
    height: number;
    /**
     * Canvas rotation in radians. 0 reads from the front sideline (glyph tops
     * toward the back), PI reads from the back sideline.
     */
    rotation: number;
    color: string;
    weight: number;
    /** Shrinks the font so the text is at most this long, in meters. */
    maxLength?: number;
    /**
     * Paints the marcher mark (`brandMark.ts`) before the text, in the text's
     * color; `maxLength` then covers the mark and the text together.
     */
    leadingMark?: boolean;
    /** Painted behind the text (and mark) as a drop shadow and outline. */
    shadow?: string;
    /**
     * Paints digits as a football field's block numerals (`blockDigits.ts`),
     * `height` tall and two thirds as wide, instead of in the font. Text with
     * other characters falls back to the font.
     */
    block?: boolean;
}

export interface PlanArrow {
    type: "arrow";
    role: "arrow";
    /** Center of the arrow. */
    x: number;
    z: number;
    /** -1 points toward side 1 (-X), 1 toward side 2 (+X). */
    dir: -1 | 1;
    length: number;
    halfWidth: number;
    color: string;
}

export interface PlanImage {
    type: "image";
    role: "image";
    /** Where the image's rectangle lands, in world meters. */
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    opacity: number;
}

/**
 * A logo painted flat on the field, centered on (x, z). The art comes from
 * `brandMark.ts`; the plan only says where it goes and how big it is.
 */
export interface PlanLogo {
    type: "logo";
    role: "centerLogo";
    x: number;
    z: number;
    /** Width of the logo in meters; the height follows its aspect. */
    width: number;
    /** Same convention as `PlanText.rotation`. */
    rotation: number;
    color: string;
    /** Painted behind the logo as a drop shadow. */
    shadow?: string;
}

/**
 * Diagonal bands across a rectangle, like the stripes painted in college end
 * zones. Bands are `width` meters wide every `spacing` meters, at 45 degrees.
 */
/**
 * Artwork a venue paints at midfield in place of the OpenMarch logo, such as
 * its own roundel. The venue owns the art; the plan only sizes and places it.
 */
export interface FieldCenterArt {
    /** Width over height of the artwork's box. */
    aspect: number;
    /** Widest it is painted, in meters; it also has to fit between the hashes. */
    maxWidth: number;
    /**
     * Paints the artwork into a `w` x `h` pixel box whose top-left corner is
     * the origin and whose top faces the back sideline.
     */
    paint(g: CanvasRenderingContext2D, w: number, h: number): void;
}

/** A venue's own midfield artwork (`FieldCenterArt`), centered on (x, z). */
export interface PlanArt {
    type: "art";
    role: "centerLogo";
    x: number;
    z: number;
    /** Size of the artwork's box in meters. */
    width: number;
    height: number;
    art: FieldCenterArt;
}

export interface PlanHatch {
    type: "hatch";
    role: "endZoneHatch";
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    color: string;
    spacing: number;
    width: number;
    /** 1 for bands rising to +x, -1 for the mirror image. Defaults to 1. */
    direction?: 1 | -1;
}

/** A color fading from opaque at `fromX` to clear at `toX`. */
export interface PlanFade {
    type: "fade";
    role: "endZoneFade";
    fromX: number;
    toX: number;
    minZ: number;
    maxZ: number;
    color: string;
}

/**
 * Fine and coarse noise laid over the whole surface, so grass and paint have
 * texture instead of flat fills. Deterministic for a given `seed`.
 */
export interface PlanGrain {
    type: "grain";
    role: "grain";
    seed: number;
    /** Overall opacity of the noise, 0 to 1. */
    strength: number;
    /**
     * `grass` (default): blade speckle and soft growth blotches. `synthetic`:
     * fine rubber-crumb speckle and fiber streaks across the field, with
     * only a trace of large-scale wear.
     */
    surface?: TurfSurface;
}

/** The generated tarp's background artwork (gradient, glow and arcs). */
export interface PlanTarpArt {
    type: "tarpArt";
    role: "tarpArt";
}

export type PlanItem =
    | PlanRect
    | PlanPoly
    | PlanText
    | PlanArrow
    | PlanImage
    | PlanTarpArt
    | PlanLogo
    | PlanArt
    | PlanHatch
    | PlanFade
    | PlanGrain;

export interface FieldPlan {
    style: FieldSurfaceStyle;
    footprint: FieldFootprint;
    items: PlanItem[];
}

/** Natural size of the image the caller passes, in pixels. */
export interface ImageSize {
    width: number;
    height: number;
}

/**
 * A venue's grass, for the `turf` style: the base green and the two mowing
 * stripes, sRGB hex strings. Paint (lines, numbers, logos) is not part of
 * it, so whites stay white.
 */
export interface TurfColors {
    base: string;
    stripeDark: string;
    stripeLight: string;
    /**
     * What the grass is. `synthetic` (FieldTurf-style) paints crumb and fiber
     * grain instead of growth blotches, and the surface shades each 5-yard
     * roll by its fibers' lay against the view (`turfSheen.ts`). Defaults to
     * `grass`, the shared turf's look.
     */
    surface?: TurfSurface;
    /** The venue's own field markings, on top of the shared turf's. */
    marks?: TurfMarks;
}

/**
 * Field markings a venue paints differently from the shared turf, such as a
 * pro field's (Mark Diesel). Lengths are in meters. Every mark that depends
 * on a yard line is placed from the goal lines, so it only shows on a
 * football field with end zones.
 */
export interface TurfMarks {
    /**
     * Paint the shared turf's thin frame just inside the field's edges.
     * Defaults to true; false when the venue paints its own border outside
     * the field instead.
     */
    insetBorder?: boolean;
    /** How far in from each sideline the 1-yard marks start. */
    tickInset?: number;
    /**
     * Goal line width. Its field side stays where a 4 in line's would be;
     * the extra width goes into the end zone.
     */
    goalLine?: number;
    /** 4 in colored lines either side of each 20-yard line. */
    twenties?: { goalSide: string; fieldSide: string };
    /** An X on each 35-yard line, at the middle of the field. */
    kickoffMarks?: boolean;
    /** A 1-yard line on each 2-yard line, at the middle of the field. */
    patLines?: boolean;
    /** From a yard line's center to the inner edge of each digit. */
    digitGap?: number;
    /** From a number's inside edge to the axis of its arrow. */
    arrowAxis?: number;
    /**
     * End-zone lettering: cap height, and the clear space between it and
     * each sideline. Painted without a drop shadow.
     */
    endZoneText?: { height: number; margin: number };
    /** Paint the white border line inside each end zone. Defaults to true. */
    endZoneBorder?: boolean;
}

/** Natural grass, or synthetic turf laid in 5-yard rolls. */
export type TurfSurface = "grass" | "synthetic";

export interface PlanInput {
    fieldProperties: FieldProperties;
    theme: FieldTheme;
    style: FieldSurfaceStyle;
    params: VenueParams;
    /** Turf end-zone paint; defaults to `solid`. */
    endZoneStyle?: EndZoneStyle;
    /** The venue's own midfield artwork; turf paints the OpenMarch logo without it. */
    centerArt?: FieldCenterArt;
    /** The venue's own grass colors; turf paints the shared ones without it. */
    turf?: TurfColors;
    /** The field background image's size, or null when there is none. */
    image: ImageSize | null;
}

/** Context shared by the per-style planners. */
export interface PlanContext extends PlanInput {
    footprint: FieldFootprint;
    /** Meters per step. */
    step: number;
    items: PlanItem[];
}

export function createPlanContext(input: PlanInput): PlanContext {
    return {
        ...input,
        footprint: fieldFootprint(input.fieldProperties),
        step: stepMeters(input.fieldProperties),
        items: [],
    };
}

export function pushRect(
    ctx: PlanContext,
    role: FieldRole,
    color: string,
    minX: number,
    minZ: number,
    maxX: number,
    maxZ: number,
): void {
    const fp = ctx.footprint;
    const r: PlanRect = {
        type: "rect",
        role,
        color,
        minX: Math.max(fp.minX, Math.min(minX, maxX)),
        maxX: Math.min(fp.maxX, Math.max(minX, maxX)),
        minZ: Math.max(fp.minZ, Math.min(minZ, maxZ)),
        maxZ: Math.min(fp.maxZ, Math.max(minZ, maxZ)),
    };
    if (r.maxX <= r.minX || r.maxZ <= r.minZ) return;
    ctx.items.push(r);
}

/** A line along Z (constant x) from minZ to maxZ, `width` meters wide. */
export function pushLineZ(
    ctx: PlanContext,
    role: FieldRole,
    color: string,
    x: number,
    width: number,
    minZ = ctx.footprint.minZ,
    maxZ = ctx.footprint.maxZ,
): void {
    pushRect(ctx, role, color, x - width / 2, minZ, x + width / 2, maxZ);
}

/** A line along X (constant z) from minX to maxX, `width` meters wide. */
export function pushLineX(
    ctx: PlanContext,
    role: FieldRole,
    color: string,
    z: number,
    width: number,
    minX = ctx.footprint.minX,
    maxX = ctx.footprint.maxX,
): void {
    pushRect(ctx, role, color, minX, z - width / 2, maxX, z + width / 2);
}

/** A frame of `width` meters just inside the footprint's edges. */
export function pushBorder(
    ctx: PlanContext,
    color: string,
    width: number,
): void {
    const { minX, maxX, minZ, maxZ } = ctx.footprint;
    pushRect(ctx, "border", color, minX, minZ, maxX, minZ + width);
    pushRect(ctx, "border", color, minX, maxZ - width, maxX, maxZ);
    pushRect(ctx, "border", color, minX, minZ, minX + width, maxZ);
    pushRect(ctx, "border", color, maxX - width, minZ, maxX, maxZ);
}

export function visible(checkpoints: Checkpoint[]): Checkpoint[] {
    return checkpoints.filter((c) => c.visible !== false);
}

/** World x of an x checkpoint, or world z of a y checkpoint. */
export function checkpointWorld(ctx: PlanContext, c: Checkpoint): number {
    return c.stepsFromCenterFront * ctx.step;
}

/** Visible x checkpoints sorted from side 1 to side 2. */
export function sortedVisibleX(ctx: PlanContext): Checkpoint[] {
    return visible(ctx.fieldProperties.xCheckpoints).sort(
        (a, b) => a.stepsFromCenterFront - b.stepsFromCenterFront,
    );
}

export interface NumberBand {
    /** World z of the number's edge nearer the field's center. */
    inside: number;
    /** World z of the number's edge nearer its sideline. */
    outside: number;
}

/**
 * The yard-number bands in world z, from `yardNumberCoordinates`, with the
 * 2D canvas's rules: nothing without both home coordinates, and the away
 * number placed from `awayStepsFromFrontToOutside` with the home height.
 */
export function yardNumberBands(ctx: PlanContext): {
    home: NumberBand | null;
    away: NumberBand | null;
} {
    const c = ctx.fieldProperties.yardNumberCoordinates;
    if (
        c.homeStepsFromFrontToInside === undefined ||
        c.homeStepsFromFrontToOutside === undefined
    )
        return { home: null, away: null };
    const z = (steps: number) => -steps * ctx.step;
    const height =
        (c.homeStepsFromFrontToInside - c.homeStepsFromFrontToOutside) *
        ctx.step;
    const home = {
        inside: z(c.homeStepsFromFrontToInside),
        outside: z(c.homeStepsFromFrontToOutside),
    };
    if (c.awayStepsFromFrontToOutside === undefined || height <= 0)
        return { home: height > 0 ? home : null, away: null };
    const outside = z(c.awayStepsFromFrontToOutside);
    return { home, away: { outside, inside: outside + height } };
}
