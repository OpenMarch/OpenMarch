import type { Checkpoint } from "@openmarch/core";
import {
    checkpointWorld,
    pushBorder,
    pushLineX,
    pushLineZ,
    pushRect,
    sortedVisibleX,
    visible,
    yardNumberBands,
    type NumberBand,
    type EndZoneStyle,
    type PlanContext,
} from "./plan";
import { OPENMARCH_LOGO } from "./brandMark";

/** Turf colors, from the reference demo's `fieldTexture`. */
export const TURF = {
    /** Darker turf painted under the midfield logo as its shadow. */
    shadow: "rgba(12, 38, 10, 0.35)",
    base: "#3d7a33",
    stripeDark: "#3a7330",
    stripeLight: "#44853a",
    paint: "#f4f6f1",
} as const;

/** Five yards in meters: the mowing-stripe width. */
export const FIVE_YARDS = 4.572;
/** Line widths and mark sizes in meters (from the reference demo). */
const LINE = 0.12;
const BORDER = 0.3;
const MARK = 0.61;
/** End zones are at least this deep; a 5-yard gap never is. */
const MIN_END_ZONE = 8;

/**
 * The `turf` style (stadium kits): green turf with 5-yard mowing stripes,
 * white lines at the real checkpoints, hashes, yard numbers with direction
 * arrows, end-zone paint and text when the field has end zones, and the
 * OpenMarch logo at midfield.
 *
 * Turf is the venue's own look, not the show's 2D field theme: only the
 * `theme` style (blank kit) paints with `FieldTheme` colors.
 */
export function planTurf(ctx: PlanContext): void {
    const f = ctx.footprint;
    const xs = sortedVisibleX(ctx);
    const play = playingRegion(ctx, xs);

    pushRect(ctx, "background", TURF.base, f.minX, f.minZ, f.maxX, f.maxZ);
    planStripes(ctx, play.minX, play.maxX);
    planEndZones(ctx, play);
    for (const xc of xs)
        pushLineZ(ctx, "yardLine", TURF.paint, checkpointWorld(ctx, xc), LINE);
    if (!ctx.fieldProperties.useHashes)
        for (const yc of visible(ctx.fieldProperties.yCheckpoints))
            pushLineX(ctx, "yLine", TURF.paint, checkpointWorld(ctx, yc), LINE);
    planCenterLogo(ctx, play);
    planHashesAndTicks(ctx, xs, play);
    planTurfNumbers(ctx);
    pushBorder(ctx, TURF.paint, BORDER);
    ctx.items.push({ type: "grain", role: "grain", seed: 7, strength: 1 });
}

interface PlayingRegion {
    minX: number;
    maxX: number;
    /** End zones, as [outer edge, goal line] pairs. */
    endZones: { outer: number; goal: number }[];
}

/**
 * The field of play between the goal lines. An end zone is the outermost
 * gap between visible x checkpoints when that gap is at least 8 m deep and
 * its outer line has no field label (a football field's 10 yards).
 */
export function playingRegion(
    ctx: PlanContext,
    xs: Checkpoint[] = sortedVisibleX(ctx),
): PlayingRegion {
    const f = ctx.footprint;
    const region: PlayingRegion = { minX: f.minX, maxX: f.maxX, endZones: [] };
    if (!ctx.fieldProperties.useHashes || xs.length < 3) return region;
    const at = (i: number) => checkpointWorld(ctx, xs[i]);
    const last = xs.length - 1;
    if (at(1) - at(0) >= MIN_END_ZONE && !xs[0].fieldLabel) {
        region.minX = at(1);
        region.endZones.push({ outer: f.minX, goal: at(1) });
    }
    if (at(last) - at(last - 1) >= MIN_END_ZONE && !xs[last].fieldLabel) {
        region.maxX = at(last - 1);
        region.endZones.push({ outer: f.maxX, goal: at(last - 1) });
    }
    return region;
}

/** Alternating 5-yard stripes, aligned so the center line is a boundary. */
function planStripes(ctx: PlanContext, minX: number, maxX: number): void {
    const f = ctx.footprint;
    const first = Math.floor(minX / FIVE_YARDS + 1e-9);
    for (let k = first; k * FIVE_YARDS < maxX - 1e-9; k++) {
        const color = k % 2 === 0 ? TURF.stripeLight : TURF.stripeDark;
        const x0 = Math.max(minX, k * FIVE_YARDS);
        const x1 = Math.min(maxX, (k + 1) * FIVE_YARDS);
        pushRect(ctx, "stripe", color, x0, f.minZ, x1, f.maxZ);
    }
}

function planEndZones(ctx: PlanContext, play: PlayingRegion): void {
    const f = ctx.footprint;
    const style = ctx.endZoneStyle ?? "solid";
    const color = ctx.params.endZoneColor;
    const text = ctx.params.endZoneText.trim();
    const depth = f.maxZ - f.minZ;
    for (const ez of play.endZones) {
        planEndZoneFill(ctx, ez, style);
        if (!text) continue;
        const zoneDepth = Math.abs(ez.goal - ez.outer);
        const side = Math.sign(ez.outer - ez.goal);
        ctx.items.push({
            type: "text",
            role: "endZoneText",
            text,
            x: (ez.outer + ez.goal) / 2,
            z: (f.minZ + f.maxZ) / 2,
            height: zoneDepth * 0.36,
            // Glyph tops face the end line, so the words read from the field.
            rotation: (side * Math.PI) / 2,
            color: TURF.paint,
            weight: 700,
            maxLength: depth * 0.82,
            leadingMark: isOpenMarch(text),
            // On bare turf the lettering is outlined in the end-zone color.
            shadow: style === "outline" ? color : shade(color, 0.45),
        });
    }
}

/** Widest midfield logo: fifteen yards, like a large college logo. */
const LOGO_MAX_WIDTH = 3 * FIVE_YARDS;
/** Narrower than this, the logo is skipped. */
const LOGO_MIN_WIDTH = FIVE_YARDS;

/**
 * The OpenMarch logo, in white paint, at the middle of the center line, reading from the
 * front sideline, as large as fits inside the hash rows nearest the middle
 * (or in the middle third of a field without hashes). Skipped on fields too small to
 * hold it.
 */
function planCenterLogo(ctx: PlanContext, play: PlayingRegion): void {
    const f = ctx.footprint;
    const midZ = (f.minZ + f.maxZ) / 2;
    const hashZs = ctx.fieldProperties.useHashes
        ? realHashes(ctx).map((c) => checkpointWorld(ctx, c))
        : [];
    const back = Math.max(f.minZ, ...hashZs.filter((z) => z < midZ - 1e-6));
    const front = Math.min(f.maxZ, ...hashZs.filter((z) => z > midZ + 1e-6));
    const room = hashZs.length
        ? 2 * Math.min(midZ - back, front - midZ) - 2 * MARK
        : (f.maxZ - f.minZ) / 3;
    const aspect = OPENMARCH_LOGO.width / OPENMARCH_LOGO.height;
    const width = Math.min(LOGO_MAX_WIDTH, room * aspect);
    if (width < LOGO_MIN_WIDTH) return;
    if (play.minX > -width || play.maxX < width) return;
    ctx.items.push({
        type: "logo",
        role: "centerLogo",
        x: 0,
        z: midZ,
        width,
        rotation: 0,
        color: TURF.paint,
        shadow: TURF.shadow,
    });
}

/** The end zone's paint under its lettering, in the given style. */
function planEndZoneFill(
    ctx: PlanContext,
    ez: { outer: number; goal: number },
    style: EndZoneStyle,
): void {
    const f = ctx.footprint;
    const color = ctx.params.endZoneColor;
    const [x0, x1] = [Math.min(ez.outer, ez.goal), Math.max(ez.outer, ez.goal)];
    const zone = { minX: x0, maxX: x1, minZ: f.minZ, maxZ: f.maxZ };
    const hatch = (bandColor: string, direction: 1 | -1) =>
        ctx.items.push({
            type: "hatch",
            role: "endZoneHatch",
            ...zone,
            color: bandColor,
            spacing: 2.4,
            width: 1.2,
            direction,
        });
    if (style === "outline") return;
    if (style === "fade") {
        ctx.items.push({
            type: "fade",
            role: "endZoneFade",
            fromX: ez.outer,
            toX: ez.goal,
            minZ: f.minZ,
            maxZ: f.maxZ,
            color,
        });
        return;
    }
    pushRect(ctx, "endZone", color, x0, f.minZ, x1, f.maxZ);
    if (style === "stripes") hatch(shade(color, 0.82), 1);
    if (style === "argyle") {
        hatch(hexAlpha(shade(color, 0.7), 0.45), 1);
        hatch(hexAlpha(shade(color, 0.7), 0.45), -1);
    }
    planEndZoneBorder(ctx, x0, x1, END_ZONE_INSET);
    if (style === "pinstripe")
        planEndZoneBorder(ctx, x0, x1, END_ZONE_INSET + 3 * LINE);
}

/** A white border line `inset` meters inside the end zone's edges. */
function planEndZoneBorder(
    ctx: PlanContext,
    x0: number,
    x1: number,
    inset: number,
): void {
    const f = ctx.footprint;
    const i = inset;
    const z0 = f.minZ + BORDER + i;
    const z1 = f.maxZ - BORDER - i;
    const w = LINE;
    const line = (a: number, b: number, c: number, d: number) =>
        pushRect(ctx, "endZoneBorder", TURF.paint, a, b, c, d);
    line(x0 + i, z0, x1 - i, z0 + w);
    line(x0 + i, z1 - w, x1 - i, z1);
    line(x0 + i, z0, x0 + i + w, z1);
    line(x1 - i - w, z0, x1 - i, z1);
}

/** `#rrggbb` as `rgba(...)` with the given alpha. */
function hexAlpha(hex: string, alpha: number): string {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** End-zone border line inset from the zone's edges, in meters (one yard). */
const END_ZONE_INSET = 0.9144;

/** `#rrggbb` scaled toward black by `factor` (1 keeps it). */
export function shade(hex: string, factor: number): string {
    const n = parseInt(hex.slice(1), 16);
    const c = (v: number) =>
        Math.round(Math.max(0, Math.min(255, v * factor)))
            .toString(16)
            .padStart(2, "0");
    return `#${c(n >> 16)}${c((n >> 8) & 255)}${c(n & 255)}`;
}

/** OpenMarch end-zone text gets the marcher mark in front of it. */
function isOpenMarch(text: string): boolean {
    return text.replace(/\s+/g, "").toLowerCase() === "openmarch";
}

/**
 * Hashes at every visible y checkpoint: a short cross mark on each line, and
 * 1-yard marks between lines that are 5 yards apart, also along both
 * sidelines. When a grid hash and a "real" hash sit within two steps of each
 * other (NCAA), only the real one is painted.
 */
function planHashesAndTicks(
    ctx: PlanContext,
    xs: Checkpoint[],
    play: PlayingRegion,
): void {
    if (!ctx.fieldProperties.useHashes) return;
    const f = ctx.footprint;
    const hashZs = realHashes(ctx).map((c) => checkpointWorld(ctx, c));
    const lineXs = xs.map((c) => checkpointWorld(ctx, c));
    for (const x of lineXs) {
        if (x < play.minX - 1e-6 || x > play.maxX + 1e-6) continue;
        for (const z of hashZs)
            pushLineX(
                ctx,
                "hash",
                TURF.paint,
                z,
                LINE,
                x - MARK / 2,
                x + MARK / 2,
            );
    }
    const tickZs = [
        ...hashZs.map((z) => [z - MARK / 2, z + MARK / 2]),
        [f.maxZ - BORDER - 0.1 - MARK, f.maxZ - BORDER - 0.1],
        [f.minZ + BORDER + 0.1, f.minZ + BORDER + 0.1 + MARK],
    ];
    for (let i = 0; i + 1 < lineXs.length; i++) {
        const [a, b] = [lineXs[i], lineXs[i + 1]];
        if (a < play.minX - 1e-6 || b > play.maxX + 1e-6) continue;
        if (Math.abs(b - a - FIVE_YARDS) > 0.05) continue;
        for (let k = 1; k < 5; k++)
            for (const [z0, z1] of tickZs)
                pushLineZ(
                    ctx,
                    "tick",
                    TURF.paint,
                    a + (k * (b - a)) / 5,
                    LINE,
                    z0,
                    z1,
                );
    }
}

function realHashes(ctx: PlanContext): Checkpoint[] {
    const ys = visible(ctx.fieldProperties.yCheckpoints);
    return ys.filter(
        (c) =>
            !c.useAsReference ||
            !ys.some(
                (o) =>
                    o !== c &&
                    !o.useAsReference &&
                    Math.abs(o.stepsFromCenterFront - c.stepsFromCenterFront) <=
                        2,
            ),
    );
}

/**
 * Yard numbers like a real field: each digit on its own side of the line,
 * home numbers read from the front sideline and away numbers from the back,
 * with an arrow toward the nearer goal on every line but the center.
 */
function planTurfNumbers(ctx: PlanContext): void {
    const { home, away } = yardNumberBands(ctx);
    if (!home) return;
    for (const xc of ctx.fieldProperties.xCheckpoints) {
        if (!xc.fieldLabel) continue;
        const x = checkpointWorld(ctx, xc);
        planNumber(ctx, xc.fieldLabel, x, home, 0);
        if (away) planNumber(ctx, xc.fieldLabel, x, away, Math.PI);
    }
}

function planNumber(
    ctx: PlanContext,
    label: string,
    x: number,
    band: NumberBand,
    rotation: number,
): void {
    const h = Math.abs(band.outside - band.inside);
    const z = (band.inside + band.outside) / 2;
    // Reading from the back flips left and right.
    const reading = rotation === 0 ? 1 : -1;
    const chars = label.length === 2 ? [...label] : [label];
    const offset = chars.length === 2 ? h / 2 : 0;
    chars.forEach((text, i) =>
        ctx.items.push({
            type: "text",
            role: "yardNumber",
            text,
            x: x + reading * (i === 0 ? -offset : offset),
            z,
            height: h,
            rotation,
            color: TURF.paint,
            weight: 600,
        }),
    );
    if (Math.abs(x) < 1e-6) return;
    const dir = x < 0 ? -1 : 1;
    const towardOutside = Math.sign(band.outside - band.inside);
    ctx.items.push({
        type: "arrow",
        role: "arrow",
        x: x + dir * (offset + h * 0.95),
        z: band.inside + towardOutside * h * 0.25,
        dir,
        length: h * 0.32,
        halfWidth: h * 0.18,
        color: TURF.paint,
    });
}
