import type { FieldTheme } from "@openmarch/core";
import { rgbaOf, type Rgba, type StrokePlan } from "@/field/timelineOverlays";
import type { Pt } from "@/items/itemOutlines";
import type { DrawnItemOutline } from "./fieldItems";
import { SELECTION_RGBA01 } from "./selectionRing";
import { PIXELS_PER_METER } from "@/items/itemOutlines";
import type { PlacedPitPlan } from "@/view3d/core/pit/pitPlan";

/** An Outline's line, in CSS px: thicker while selected. */
export const ITEM_STROKE_WIDTH = 1.5;
export const SELECTED_ITEM_STROKE_WIDTH = 2.5;
/** An Outline's fill: the theme's line color, faint enough for the field to show through. */
export const ITEM_FILL_ALPHA = 0.25;
/**
 * A prop with its own color: filled with it, strong enough to read as that color on both themes'
 * fields, still letting the grid show through. Its line stays the theme's, so a pale color keeps
 * an edge on a light field.
 */
export const COLORED_ITEM_FILL_ALPHA = 0.6;
/** A dimmed item (outside an isolated move), as dimmed marchers. */
export const DIMMED_ITEM_ALPHA = 0.3;

/** A filled polygon, in field units. */
export type FillPlan = { readonly points: readonly Pt[]; readonly color: Rgba };

/**
 * A locked item's badge: a disc of this radius in CSS px, holding a padlock. On an item small on
 * screen it shrinks to half the item's narrower side, and below `MIN_LOCK_BADGE_RADIUS` it isn't
 * drawn, so a zoomed-out pit doesn't turn into a row of locks.
 */
export const LOCK_BADGE_RADIUS = 9;
export const MIN_LOCK_BADGE_RADIUS = 4;
/**
 * Equipment drawn from its model (`DrawnItemOutline.plan`): the silhouette filled fainter than an
 * Outline, since the edges inside it carry the detail, and outlined as an Outline is.
 */
export const EQUIPMENT_FILL_ALPHA = 0.12;
/**
 * The edges seen from above appear once the field shows at least this many CSS px per meter
 * (about 1.2× the field's own scale), when they have room to read; below it the silhouette alone
 * is drawn, as clean as a drill chart wants.
 */
export const EQUIPMENT_DETAIL_PX_PER_M = 24;
/** The edges' line: thin and fainter than the silhouette's */
export const EQUIPMENT_DETAIL_WIDTH = 1;
export const EQUIPMENT_DETAIL_ALPHA = 0.55;
/**
 * The facing mark: a small triangle past the front edge, pointing the way the equipment faces,
 * this many CSS px wide (never smaller than 14 cm), drawn with the edges.
 */
export const FACING_MARK_PX = 7;
const FACING_MARK_MIN_M = 0.14;
/** Points around a circle drawn as a polygon */
const CIRCLE_POINTS = 24;

/**
 * What the items layer draws: each Outline's fill, then its line; a padlock badge on each locked
 * item (`locks`, the badges' centers). Line widths are CSS px. A pit instrument's playing spot
 * isn't drawn (owner, 2026-11-15: where its player stands is plain from the drawing).
 */
export type ItemsPlan = {
    readonly fills: readonly FillPlan[];
    readonly strokes: readonly StrokePlan[];
    readonly locks: readonly Pt[];
};

const faded = (color: Rgba, alpha: number): Rgba => [
    color[0],
    color[1],
    color[2],
    color[3] * alpha,
];

/**
 * The items layer's plan: every Outline filled in its prop's color (or
 * faintly in the theme's line color) and outlined in the theme's line color,
 * a selected one outlined in the selection color. A locked item gets a
 * padlock badge at its top left corner, the same size on screen at every
 * `zoom` (CSS px per field unit, 1 by default).
 */
export function planItems(
    outlines: readonly DrawnItemOutline[],
    {
        theme,
        selected,
        isDimmed,
        zoom = 1,
    }: {
        theme: FieldTheme;
        selected: ReadonlySet<number>;
        isDimmed: (id: number) => boolean;
        zoom?: number;
    },
): ItemsPlan {
    const line = rgbaOf(theme.primaryStroke);
    const selection = SELECTION_RGBA01 as unknown as Rgba;
    const fills: FillPlan[] = [];
    const strokes: StrokePlan[] = [];
    const locks: Pt[] = [];
    // The badges and marks go over every Outline
    const badgeFills: FillPlan[] = [];
    const markStrokes: StrokePlan[] = [];
    // A model's edges go under its silhouette's line
    const detailStrokes: StrokePlan[] = [];
    for (const outline of outlines) {
        const alpha = isDimmed(outline.id) ? DIMMED_ITEM_ALPHA : 1;
        const isSelected = selected.has(outline.id);
        const fillAlpha = outline.plan ? EQUIPMENT_FILL_ALPHA : ITEM_FILL_ALPHA;
        const look: ItemLook = {
            fill: outline.color
                ? rgbaOf(outline.color, COLORED_ITEM_FILL_ALPHA * alpha)
                : faded(line, fillAlpha * alpha),
            stroke: {
                color: faded(isSelected ? selection : line, alpha),
                width: isSelected
                    ? SELECTED_ITEM_STROKE_WIDTH
                    : ITEM_STROKE_WIDTH,
            },
            line: faded(line, alpha),
            zoom,
        };
        const drawn = outline.plan
            ? planEquipment(outline.plan, look)
            : planOutline(outline, look);
        fills.push(...drawn.fills);
        strokes.push(...drawn.strokes);
        detailStrokes.push(...drawn.details);
        badgeFills.push(...drawn.marks);
        // Equipment drawn from its model is locked as a rule (a pit stays put), so a badge on every
        // piece would only be noise; a drawn prop that's locked still gets one
        if (outline.locked && !outline.plan) {
            const corner = topLeft(outline.points);
            locks.push(corner);
            badgeFills.push(
                ...lockBadgeOf(outline.points, corner, zoom, {
                    disc: faded(rgbaOf(theme.background), 0.9 * alpha),
                    lock: faded(line, alpha),
                }),
            );
        }
    }
    return {
        fills: [...fills, ...badgeFills],
        strokes: [...detailStrokes, ...strokes, ...markStrokes],
        locks,
    };
}

/** How an item is drawn: its fill, its line, the theme's line color, and the zoom */
type ItemLook = {
    fill: Rgba;
    stroke: { color: Rgba; width: number };
    line: Rgba;
    zoom: number;
};

/** One item's part of the plan: what goes under, the lines, and the marks over everything */
type ItemDrawing = {
    fills: FillPlan[];
    strokes: StrokePlan[];
    details: StrokePlan[];
    marks: FillPlan[];
};

/** An item drawn as its Outline: filled and outlined, closed unless it's an open path */
function planOutline(
    { points, closed }: DrawnItemOutline,
    { fill, stroke }: ItemLook,
): ItemDrawing {
    return {
        fills: [{ points, color: fill }],
        strokes: [
            {
                points: closed ? [...points, points[0]] : points,
                ...stroke,
                dash: null,
                round: true,
            },
        ],
        details: [],
        marks: [],
    };
}

/**
 * Equipment drawn as its model from above: its silhouette filled with `fill` and outlined with
 * `stroke`, and when zoomed in enough the edges seen from above and a facing mark in `line`.
 */
function planEquipment(
    plan: PlacedPitPlan,
    { fill, stroke, line, zoom }: ItemLook,
): ItemDrawing {
    const fills: FillPlan[] = [];
    const strokes: StrokePlan[] = [];
    const details: StrokePlan[] = [];
    const marks: FillPlan[] = [];
    for (const ring of plan.outlines) {
        fills.push({ points: ring, color: fill });
        strokes.push({
            points: [...ring, ring[0]],
            ...stroke,
            dash: null,
            round: true,
        });
    }
    if (zoom * PIXELS_PER_METER >= EQUIPMENT_DETAIL_PX_PER_M) {
        const detail = faded(line, EQUIPMENT_DETAIL_ALPHA);
        for (const points of plan.details)
            details.push({
                points,
                color: detail,
                width: EQUIPMENT_DETAIL_WIDTH,
                dash: null,
                round: false,
            });
        marks.push({ points: facingMark(plan, zoom), color: line });
    }
    return { fills, strokes, details, marks };
}

/**
 * The facing mark of equipment drawn from its model: a triangle just past its front edge, pointing
 * away from it (toward the audience before the item turns), `FACING_MARK_PX` wide on screen.
 */
function facingMark(plan: PlacedPitPlan, zoom: number): Pt[] {
    const width = Math.max(
        FACING_MARK_PX / zoom,
        FACING_MARK_MIN_M * PIXELS_PER_METER,
    );
    const gap = width * 0.3;
    const radians = (plan.rotation * Math.PI) / 180;
    // The item's own axes on the field: across, and toward its front
    const across = { x: Math.cos(radians), y: Math.sin(radians) };
    const ahead = { x: -Math.sin(radians), y: Math.cos(radians) };
    const at = (a: number, f: number): Pt => ({
        x: plan.front.x + across.x * a + ahead.x * f,
        y: plan.front.y + across.y * a + ahead.y * f,
    });
    return [at(-width / 2, gap), at(width / 2, gap), at(0, gap + width * 0.7)];
}

/**
 * A locked item's badge at `corner`, the same size on screen at every `zoom` but shrunk on an item
 * small on screen, and none when that's too small to read.
 */
function lockBadgeOf(
    points: readonly Pt[],
    corner: Pt,
    zoom: number,
    colors: { disc: Rgba; lock: Rgba },
): FillPlan[] {
    const radius = Math.min(
        LOCK_BADGE_RADIUS,
        (narrowerSide(points) * zoom) / 2,
    );
    if (radius < MIN_LOCK_BADGE_RADIUS) return [];
    return lockBadge(corner, radius / LOCK_BADGE_RADIUS / zoom, colors);
}

/** The top left corner of the points' box, in field units (y grows down the screen) */
function topLeft(points: readonly Pt[]): Pt {
    let x = Infinity;
    let y = Infinity;
    for (const p of points) {
        x = Math.min(x, p.x);
        y = Math.min(y, p.y);
    }
    return { x, y };
}

/** The narrower side of the points' box, in field units */
function narrowerSide(points: readonly Pt[]): number {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    return Math.min(
        Math.max(...xs) - Math.min(...xs),
        Math.max(...ys) - Math.min(...ys),
    );
}

/** A circle of `radius` about `center` as a polygon; `closed` repeats the first point at the end */
function circle(center: Pt, radius: number, closed = false): Pt[] {
    const points: Pt[] = [];
    const n = closed ? CIRCLE_POINTS + 1 : CIRCLE_POINTS;
    for (let i = 0; i < n; i++) {
        const a = (i / CIRCLE_POINTS) * Math.PI * 2;
        points.push({
            x: center.x + radius * Math.cos(a),
            y: center.y + radius * Math.sin(a),
        });
    }
    return points;
}

/**
 * A padlock on a disc, centered on `at`, drawn as fills laid out in CSS px of a full-size badge
 * (`px` field units each): the disc, the lock's body, and its shackle as a thick arc with two legs.
 */
function lockBadge(
    at: Pt,
    px: number,
    colors: { disc: Rgba; lock: Rgba },
): FillPlan[] {
    const p = (dx: number, dy: number): Pt => ({
        x: at.x + dx * px,
        y: at.y + dy * px,
    });
    const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
        p(x0, y0),
        p(x1, y0),
        p(x1, y1),
        p(x0, y1),
    ];
    // The shackle: a half ring of outer radius 3.5 and inner 2, over the body's top at y = -0.5
    const outer = 3.5;
    const inner = 2;
    const arc: Pt[] = [];
    const steps = 10;
    for (let i = 0; i <= steps; i++) {
        const a = Math.PI + (i / steps) * Math.PI;
        arc.push(p(outer * Math.cos(a), -1.5 + outer * Math.sin(a)));
    }
    for (let i = steps; i >= 0; i--) {
        const a = Math.PI + (i / steps) * Math.PI;
        arc.push(p(inner * Math.cos(a), -1.5 + inner * Math.sin(a)));
    }
    return [
        // A rim in the lock's color, then the disc inside it
        { points: circle(at, LOCK_BADGE_RADIUS * px), color: colors.lock },
        {
            points: circle(at, (LOCK_BADGE_RADIUS - 1) * px),
            color: colors.disc,
        },
        { points: arc, color: colors.lock },
        { points: rect(-outer, -1.5, -inner, 0), color: colors.lock },
        { points: rect(inner, -1.5, outer, 0), color: colors.lock },
        { points: rect(-4.5, -0.5, 4.5, 5), color: colors.lock },
    ];
}
