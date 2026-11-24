import { blockOverhang } from "./blockDigits";
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
    type TurfMarks,
} from "./plan";
import { fieldFamily } from "../venueSettings";
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
const YARD = FIVE_YARDS / 5;
const FOOT = YARD / 3;
/**
 * Line widths and mark sizes in meters. Lines and hashes are 4 inches wide
 * and hashes 2 feet long (NFL, NCAA and high school rules alike).
 */
const LINE = 0.1016;
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

    const grass = ctx.turf ?? TURF;
    const marks = ctx.turf?.marks ?? {};
    pushRect(ctx, "background", grass.base, f.minX, f.minZ, f.maxX, f.maxZ);
    planStripes(ctx, play.minX, play.maxX);
    planEndZones(ctx, play);
    for (const xc of xs) {
        const x = checkpointWorld(ctx, xc);
        const goal = marks.goalLine
            ? play.endZones.find((ez) => Math.abs(ez.goal - x) < 1e-3)
            : undefined;
        if (goal && marks.goalLine) {
            const side = Math.sign(goal.outer - goal.goal);
            const fieldEdge = x - (side * LINE) / 2;
            pushRect(
                ctx,
                "goalLine",
                TURF.paint,
                fieldEdge,
                f.minZ,
                fieldEdge + side * marks.goalLine,
                f.maxZ,
            );
        } else pushLineZ(ctx, "yardLine", TURF.paint, x, LINE);
    }
    if (!ctx.fieldProperties.useHashes)
        for (const yc of visible(ctx.fieldProperties.yCheckpoints))
            pushLineX(ctx, "yLine", TURF.paint, checkpointWorld(ctx, yc), LINE);
    planCenterLogo(ctx, play);
    planHashesAndTicks(ctx, xs, play);
    planVenueMarks(ctx, xs, play, marks);
    planTurfNumbers(ctx);
    if (marks.insetBorder !== false) pushBorder(ctx, TURF.paint, BORDER);
    ctx.items.push({
        type: "grain",
        role: "grain",
        seed: 7,
        strength: 1,
        surface: ctx.turf?.surface ?? "grass",
    });
}

interface PlayingRegion {
    minX: number;
    maxX: number;
    /** End zones, as [outer edge, goal line] pairs. */
    endZones: { outer: number; goal: number }[];
}

/**
 * The field of play between the goal lines. Only football fields have end
 * zones: on one, an end zone is the outermost gap between visible x
 * checkpoints when that gap is at least 8 m deep and its outer line has no
 * field label (a football field's 10 yards). `withFootballEndZones` adds the
 * lines a grid without end zones is missing.
 */
export function playingRegion(
    ctx: PlanContext,
    xs: Checkpoint[] = sortedVisibleX(ctx),
): PlayingRegion {
    const f = ctx.footprint;
    const region: PlayingRegion = { minX: f.minX, maxX: f.maxX, endZones: [] };
    if (fieldFamily(ctx.fieldProperties) !== "football" || xs.length < 3)
        return region;
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
        const grass = ctx.turf ?? TURF;
        const color = k % 2 === 0 ? grass.stripeLight : grass.stripeDark;
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
        const lettering = ctx.turf?.marks?.endZoneText;
        ctx.items.push({
            type: "text",
            role: "endZoneText",
            text,
            x: (ez.outer + ez.goal) / 2,
            z: (f.minZ + f.maxZ) / 2,
            height: lettering?.height ?? zoneDepth * 0.36,
            // Glyph tops face the end line, so the words read from the field.
            rotation: (side * Math.PI) / 2,
            color: TURF.paint,
            weight: 700,
            maxLength: lettering ? depth - 2 * lettering.margin : depth * 0.82,
            leadingMark: isOpenMarch(text),
            // On bare turf the lettering is outlined in the end-zone color.
            shadow:
                style === "outline"
                    ? color
                    : lettering
                      ? undefined
                      : shade(color, 0.45),
        });
    }
}

/** Widest midfield logo: twenty yards, like a large college logo. */
const LOGO_MAX_WIDTH = 4 * FIVE_YARDS;
/** Narrower than this, the logo is skipped. */
const LOGO_MIN_WIDTH = FIVE_YARDS;

/**
 * The OpenMarch logo, in white paint (or the venue's own `centerArt`), at
 * the middle of the center line, reading from the front sideline. It is the
 * same size on every field: as large as fits in the middle third of the
 * width, which is between the hashes on a high school field. On fields with
 * narrower hashes (college, pro) the hash marks run under it. Skipped on
 * fields too small to hold it.
 */
function planCenterLogo(ctx: PlanContext, play: PlayingRegion): void {
    const f = ctx.footprint;
    const midZ = (f.minZ + f.maxZ) / 2;
    const room = (f.maxZ - f.minZ) / 3 - 2 * MARK;
    const art = ctx.centerArt;
    const aspect = art
        ? art.aspect
        : OPENMARCH_LOGO.width / OPENMARCH_LOGO.height;
    const width = Math.min(art?.maxWidth ?? LOGO_MAX_WIDTH, room * aspect);
    if (width < LOGO_MIN_WIDTH) return;
    if (play.minX > -width || play.maxX < width) return;
    if (art) {
        ctx.items.push({
            type: "art",
            role: "centerLogo",
            x: 0,
            z: midZ,
            width,
            height: width / aspect,
            art,
        });
        return;
    }
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
    if (ctx.turf?.marks?.endZoneBorder === false) return;
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
 * The venue's own marks that hang off yard lines (`TurfMarks`): colored
 * lines either side of the 20s, an X on each 35 and a short line on each
 * 2-yard line. All are placed from the goal lines; a 20 or 35 is only marked
 * where the field has a line there.
 */
function planVenueMarks(
    ctx: PlanContext,
    xs: Checkpoint[],
    play: PlayingRegion,
    marks: TurfMarks,
): void {
    const f = ctx.footprint;
    const midZ = (f.minZ + f.maxZ) / 2;
    const lineXs = xs.map((c) => checkpointWorld(ctx, c));
    const hasLine = (x: number) => lineXs.some((l) => Math.abs(l - x) < 0.05);
    for (const ez of play.endZones) {
        // From the goal line toward midfield.
        const side = Math.sign(ez.outer - ez.goal);
        const yardLine = (yards: number) => ez.goal - side * yards * YARD;
        const twenty = yardLine(20);
        if (marks.twenties && hasLine(twenty)) {
            const { goalSide, fieldSide } = marks.twenties;
            pushLineZ(ctx, "accent", goalSide, twenty + side * LINE, LINE);
            pushLineZ(ctx, "accent", fieldSide, twenty - side * LINE, LINE);
        }
        const kickoff = yardLine(35);
        if (marks.kickoffMarks && hasLine(kickoff)) {
            // Two 4 in bars crossing on the line, 2 ft each way.
            const r = FOOT;
            const n = LINE / 2 / Math.SQRT2;
            for (const d of [1, -1])
                ctx.items.push({
                    type: "poly",
                    role: "kickoff",
                    color: TURF.paint,
                    points: [
                        [kickoff - r - n, midZ - d * r + d * n],
                        [kickoff + r - n, midZ + d * r + d * n],
                        [kickoff + r + n, midZ + d * r - d * n],
                        [kickoff - r + n, midZ - d * r - d * n],
                    ],
                });
        }
        if (marks.patLines)
            pushLineZ(
                ctx,
                "patLine",
                TURF.paint,
                yardLine(2),
                LINE,
                midZ - YARD / 2,
                midZ + YARD / 2,
            );
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
    const tickInset = ctx.turf?.marks?.tickInset ?? BORDER + 0.1;
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
        [f.maxZ - tickInset - MARK, f.maxZ - tickInset],
        [f.minZ + tickInset, f.minZ + tickInset + MARK],
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

/**
 * Yard-number proportions as shares of the number's height (6 ft on every
 * template): each digit is 4 ft wide, its inner edge 6 in from the yard line.
 * The direction arrow is a triangle with an 18 in base and 36 in sides (NCAA
 * Rule 1-2-1-i; NFL fields paint the same), its base 6 in outside the outer
 * digit, its axis a little toward the sideline of the number's middle, as
 * the reference photos show.
 */
const DIGIT_WIDTH = 2 / 3;
const DIGIT_GAP = 1 / 12;
const ARROW_BASE = 0.25;
/** Its 36 in sides are half the number's height. */
const ARROW_SIDE = 1 / 2;
const ARROW_LENGTH = Math.sqrt(ARROW_SIDE ** 2 - (ARROW_BASE / 2) ** 2);
const ARROW_GAP = 1 / 12;
const ARROW_AXIS = 0.6;

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
    const w = h * DIGIT_WIDTH;
    const marks = ctx.turf?.marks;
    const gap = marks?.digitGap ?? h * DIGIT_GAP;
    const offset = chars.length === 2 ? gap + w / 2 : 0;
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
            block: true,
        }),
    );
    if (Math.abs(x) < 1e-6) return;
    const dir = x < 0 ? -1 : 1;
    const towardOutside = Math.sign(band.outside - band.inside);
    // The digits' outer edge: past the one digit, or the outer of two.
    // The drawings measure the arrow's gap from the 4's slanted tip, which
    // juts out on the first digit's leading side: outward only where the
    // number reads toward midfield.
    const edge =
        (chars.length === 2 ? offset + w / 2 : w / 2) +
        (dir === -reading ? h * blockOverhang(chars[0]) : 0);
    const length = h * ARROW_LENGTH;
    ctx.items.push({
        type: "arrow",
        role: "arrow",
        x: x + dir * (edge + h * ARROW_GAP + length / 2),
        z: band.inside + towardOutside * (marks?.arrowAxis ?? h * ARROW_AXIS),
        dir,
        length,
        halfWidth: (h * ARROW_BASE) / 2,
        color: TURF.paint,
    });
}
