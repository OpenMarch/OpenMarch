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
    type PlanContext,
} from "./plan";

/** Turf colors, from the reference demo's `fieldTexture`. */
export const TURF = {
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
 * arrows, and end-zone paint and text when the field has end zones.
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
    planHashesAndTicks(ctx, xs, play);
    planTurfNumbers(ctx);
    pushBorder(ctx, TURF.paint, BORDER);
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
    const text = ctx.params.endZoneText.trim();
    const depth = f.maxZ - f.minZ;
    for (const ez of play.endZones) {
        pushRect(
            ctx,
            "endZone",
            ctx.params.endZoneColor,
            ez.outer,
            f.minZ,
            ez.goal,
            f.maxZ,
        );
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
        });
    }
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
