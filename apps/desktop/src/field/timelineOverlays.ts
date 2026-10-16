import type { FieldProperties, RgbaColor } from "@openmarch/core";
import {
    evaluatePathWarning,
    STEP_SIZE_WARNING_COLOR,
    STEP_SIZE_WARNING_STROKE_WIDTH,
    WARNING_PATHWAY_DASH,
} from "@/timeline/stepSizeWarning";
import type { CollisionData } from "@/global/classes/CollisionDetection";
import type { TimelinePath } from "@/timeline/timelinePaths";
import type {
    FocusPoint,
    FocusPolyline,
    FocusScene,
} from "@/timeline/timelineFocusScene";

/**
 * What the field draws for the timeline (fork #201): pathways, midpoints and
 * endpoints with step-size warnings, an isolated move's focus scene and
 * collision markers, as plain strokes and dots. Renderer-independent: the
 * three.js layers draw these plans, and the unit tests read them. Each plan
 * sits on its coordinates, with no half-grid-line offset (the dot position
 * rule in docs/field/implementation-plan.md).
 */

/** `[r, g, b, a]`, 0 to 1. */
export type Rgba = readonly [number, number, number, number];

/**
 * Whether sizes are in field units (they scale with the zoom) or in CSS
 * pixels (the same on screen at any zoom).
 */
export type OverlayUnits = "field" | "screen";

/** A polyline. Widths and dashes are in the plan's units. */
export type StrokePlan = {
    readonly points: readonly FocusPoint[];
    readonly color: Rgba;
    readonly width: number;
    /** Dash and gap lengths, or null for a solid line. */
    readonly dash: readonly [number, number] | null;
    /** Round line ends (and joins), as a canvas `lineCap: "round"`; else butt. */
    readonly round: boolean;
};

/** A circle: a fill with an outline centered on its edge. */
export type DotPlan = {
    readonly x: number;
    readonly y: number;
    readonly radius: number;
    readonly fill: Rgba | null;
    readonly stroke: Rgba | null;
    readonly strokeWidth: number;
};

/** A text label, centered on its point. */
export type OverlayLabel = {
    readonly text: string;
    readonly x: number;
    readonly y: number;
    readonly size: number;
    readonly color: Rgba;
};

/** Strokes drawn first, then dots over them, then labels. */
export type OverlayPlan = {
    readonly units: OverlayUnits;
    readonly strokes: readonly StrokePlan[];
    readonly dots: readonly DotPlan[];
    readonly labels: readonly OverlayLabel[];
};

export const rgbaOf = (color: RgbaColor, alpha = 1): Rgba => [
    color.r / 255,
    color.g / 255,
    color.b / 255,
    color.a * alpha,
];

/** A `#rrggbb` color (the timeline's track colors, the ghost grays); gray if it isn't one. */
export function hexRgba(hex: string, alpha = 1): Rgba {
    const match = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!match) return [0.5, 0.5, 0.5, alpha];
    const n = parseInt(match[1]!, 16);
    return [
        ((n >> 16) & 255) / 255,
        ((n >> 8) & 255) / 255,
        (n & 255) / 255,
        alpha,
    ];
}

// ---------------------------------------------------------------------------
// Pathways (P7.10)
// ---------------------------------------------------------------------------

/** `Pathway`'s `DEFAULT_PATHWAY_STROKE_WIDTH`, in field units. */
export const PATHWAY_WIDTH = 2;
/** `Midpoint`: radius 3, a white fill and a 2-unit outline in the path's color. */
export const MIDPOINT_RADIUS = 3;
export const MIDPOINT_STROKE_WIDTH = 2;
/** `Endpoint`: radius 3, filled in the path's color, no outline. */
export const ENDPOINT_RADIUS = 3;

const WHITE: Rgba = [1, 1, 1, 1];

export type PathOverlayInput = {
    readonly marcherIds: readonly number[];
    /** Each marcher's move into the selected page; its endpoint is where it starts. */
    readonly previousPaths: ReadonlyMap<number, TimelinePath>;
    /** Each marcher's move into the next page; its endpoint is where it ends. */
    readonly nextPaths: ReadonlyMap<number, TimelinePath>;
    readonly previousPathsEnabled: boolean;
    readonly nextPathsEnabled: boolean;
    readonly stepSizeWarningsEnabled: boolean;
    readonly fieldProperties: FieldProperties;
};

/**
 * The selected page's paths, midsets and endpoints: each side in its theme
 * color, or dashed, thicker and red when its fastest stretch is over the
 * step-size threshold. A next path over the threshold shows even with its
 * toggle off; a previous path never does (`evaluatePathWarning`).
 */
export function planPathOverlay(input: PathOverlayInput): OverlayPlan {
    const strokes: StrokePlan[] = [];
    const dots: DotPlan[] = [];
    const { fieldProperties, stepSizeWarningsEnabled } = input;
    const theme = fieldProperties.theme;
    const side = (
        path: TimelinePath | undefined,
        endpointAt: "start" | "end",
        pathEnabled: boolean,
        allowForceShow: boolean,
        color: RgbaColor,
    ) => {
        if (!path) return;
        const { show, isWarning } = evaluatePathWarning({
            start: path.start,
            end: path.end,
            distance: path.stride,
            counts: 1,
            fieldProperties,
            pathEnabled,
            allowForceShow,
            warningsEnabled: stepSizeWarningsEnabled,
        });
        if (!show) return;
        const drawn = rgbaOf(isWarning ? STEP_SIZE_WARNING_COLOR : color);
        strokes.push({
            points: path.points,
            color: drawn,
            width: isWarning ? STEP_SIZE_WARNING_STROKE_WIDTH : PATHWAY_WIDTH,
            dash: isWarning
                ? [WARNING_PATHWAY_DASH[0]!, WARNING_PATHWAY_DASH[1]!]
                : null,
            round: false,
        });
        dots.push({
            ...path.midpoint,
            radius: MIDPOINT_RADIUS,
            fill: WHITE,
            stroke: drawn,
            strokeWidth: MIDPOINT_STROKE_WIDTH,
        });
        // The endpoint keeps the theme color, even on a warning
        dots.push({
            ...path[endpointAt],
            radius: ENDPOINT_RADIUS,
            fill: rgbaOf(color),
            stroke: null,
            strokeWidth: 0,
        });
    };
    for (const marcherId of input.marcherIds) {
        side(
            input.previousPaths.get(marcherId),
            "start",
            input.previousPathsEnabled,
            false,
            theme.previousPath,
        );
        side(
            input.nextPaths.get(marcherId),
            "end",
            input.nextPathsEnabled,
            true,
            theme.nextPath,
        );
    }
    return { units: "field", strokes, dots, labels: [] };
}

// ---------------------------------------------------------------------------
// Isolation focus (09-isolation.md): `TimelineFocusLayer`
// ---------------------------------------------------------------------------

/** Sizes in CSS pixels, as `TimelineFocusLayer` (07-ghost-rendering.md §2). */
export const FOCUS = {
    performedWidth: 2,
    ghostWidth: 1.5,
    contextWidth: 1.5,
    contextAlpha: 0.6,
    ghostDash: [2, 4] as const,
    ringWidth: 1.5,
    dotRadius: 3,
    ghostDotRadius: 4,
    ghostDotFillAlpha: 0.45,
    forkRadius: 3.5,
    /** Members outside the selection, while some are selected */
    backgroundAlpha: 0.25,
    /** Rings of members who hold still */
    holdAlpha: 0.4,
} as const;

/**
 * The isolated timeline's scene (`buildFocusScene`), as `TimelineFocusLayer`
 * draws it: context moves, gray dashed ghosts, performed paths, then the start
 * rings, destinations, ghost ends and forks. With marchers selected
 * (`emphasis`), the others step back.
 */
// eslint-disable-next-line max-lines-per-function
export function planFocusOverlay(
    scene: FocusScene,
    ghostColor: string,
    emphasis: ReadonlySet<number> | null,
): OverlayPlan {
    const alphaOf = (marcherId: number) =>
        emphasis === null || emphasis.has(marcherId)
            ? 1
            : FOCUS.backgroundAlpha;
    const strokes: StrokePlan[] = [];
    const dots: DotPlan[] = [];
    const line = (
        points: FocusPolyline,
        color: Rgba,
        width: number,
        dash: readonly [number, number] | null = null,
    ) => {
        if (points.length >= 2)
            strokes.push({ points, color, width, dash, round: true });
    };
    const sceneColor = (alpha: number) => hexRgba(scene.color, alpha);

    // 1. Context moves, and where each member another move took ends up
    for (const path of scene.context)
        line(
            path.points,
            hexRgba(path.color, FOCUS.contextAlpha * alphaOf(path.marcherId)),
            FOCUS.contextWidth,
        );
    for (const path of scene.context) {
        const end = path.points[path.points.length - 1];
        if (end)
            dots.push(
                filled(
                    end,
                    FOCUS.dotRadius,
                    hexRgba(path.color, alphaOf(path.marcherId)),
                ),
            );
    }
    // 2. Ghosts: the isolated move's plan where it no longer has the member
    for (const slot of scene.slots)
        for (const ghost of slot.ghosts)
            line(
                ghost,
                hexRgba(ghostColor, alphaOf(slot.marcherId)),
                FOCUS.ghostWidth,
                [FOCUS.ghostDash[0], FOCUS.ghostDash[1]],
            );
    // 3. Performed paths
    for (const slot of scene.slots) {
        if (slot.holds) continue;
        for (const performed of slot.performed)
            line(
                performed,
                sceneColor(alphaOf(slot.marcherId)),
                FOCUS.performedWidth,
            );
    }
    // 4. Start rings, destinations, ghost ends and forks; one who holds still gets only a quiet ring
    for (const slot of scene.slots) {
        const alpha = alphaOf(slot.marcherId);
        dots.push({
            ...slot.origin,
            radius: FOCUS.dotRadius,
            fill: null,
            stroke: sceneColor(slot.holds ? FOCUS.holdAlpha * alpha : alpha),
            strokeWidth: FOCUS.ringWidth,
        });
        if (slot.holds) continue;
        if (slot.destination)
            dots.push(
                filled(slot.destination, FOCUS.dotRadius, sceneColor(alpha)),
            );
        if (slot.ghostEnd)
            dots.push({
                ...slot.ghostEnd,
                radius: FOCUS.ghostDotRadius,
                fill: hexRgba(ghostColor, FOCUS.ghostDotFillAlpha * alpha),
                stroke: hexRgba(ghostColor, alpha),
                strokeWidth: FOCUS.ringWidth,
            });
        for (const fork of slot.forks)
            dots.push(
                filled(fork, FOCUS.forkRadius, hexRgba(fork.color, alpha)),
            );
    }
    return { units: "screen", strokes, dots, labels: [] };
}

const filled = (p: FocusPoint, radius: number, color: Rgba): DotPlan => ({
    x: p.x,
    y: p.y,
    radius,
    fill: color,
    stroke: null,
    strokeWidth: 0,
});

// ---------------------------------------------------------------------------
// Collisions: `CollisionMarker`
// ---------------------------------------------------------------------------

/** `CollisionMarker`'s look: a translucent red disc with a red outline, and its label above. */
const COLLISION_FILL: Rgba = [1, 0, 0, 0.5];
const COLLISION_RED: Rgba = [1, 0, 0, 1];
const COLLISION_STROKE_WIDTH = 2;
const COLLISION_FONT_SIZE = 12;

/** Where a collision's label is centered, in field y. */
const collisionLabelY = (c: Pick<CollisionData, "y" | "distance">) =>
    c.y - COLLISION_FONT_SIZE - c.distance / 2;

/**
 * The collisions on the selected page: a disc as wide as the two marchers
 * are apart, centered between them, and the pair's labels centered
 * `12 + r / 2` field units above its center.
 */
export function planCollisionOverlay(
    collisions: readonly CollisionData[],
): OverlayPlan {
    return {
        units: "field",
        strokes: [],
        dots: collisions.map((c) => ({
            x: c.x,
            y: c.y,
            radius: c.distance,
            fill: COLLISION_FILL,
            stroke: COLLISION_RED,
            strokeWidth: COLLISION_STROKE_WIDTH,
        })),
        labels: collisions.map((c) => ({
            text: c.label,
            x: c.x,
            y: collisionLabelY(c),
            size: COLLISION_FONT_SIZE,
            color: COLLISION_RED,
        })),
    };
}

/**
 * The view "Zoom to collisions" sets: the discs' bounds and their labels'
 * centers (which count as points), padded by 100 field units,
 * centered, at 70% of the zoom that fits them (never over 1.5 before that). Null with no
 * collisions. `zoom` is CSS pixels per field unit and `panX`, `panY` where
 * field (0, 0) sits, as the field view store holds them.
 */
export function collisionsView(
    collisions: readonly Pick<CollisionData, "x" | "y" | "distance">[],
    width: number,
    height: number,
): { zoom: number; panX: number; panY: number } | null {
    if (collisions.length === 0 || width <= 0 || height <= 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const c of collisions) {
        minX = Math.min(minX, c.x - c.distance);
        minY = Math.min(minY, c.y - c.distance, collisionLabelY(c));
        maxX = Math.max(maxX, c.x + c.distance);
        maxY = Math.max(maxY, c.y + c.distance);
    }
    const padding = 100;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const w = maxX - minX + padding * 2;
    const h = maxY - minY + padding * 2;
    const zoom = Math.min(width / w, height / h, 1.5) * 0.7;
    return {
        zoom,
        panX: width / 2 - centerX * zoom,
        panY: height / 2 - centerY * zoom,
    };
}
