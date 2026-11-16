// cspell:words Ramer Peucker
import { FieldProperties } from "@openmarch/core";
import type { OutlineType } from "@/db-functions/items";

/**
 * Everything shape-specific about an item's Outline on the field: how each outline type is drawn
 * with the prop tool, previewed while drawing, and built from stored geometry. Ported from PR
 * 1013's prop outlines; plain geometry, so the field's layers, its overlay and the editor share it.
 *
 * Stored custom outlines (`item_geometry.custom_outline`) are size-free: their points are
 * fractions of the Outline's width and depth around its center, so a resize at a count is only a
 * new width and depth and the outline keeps its shape.
 */

/** Field units per meter: an item's geometry is stored in meters */
export const PIXELS_PER_METER = FieldProperties.PIXELS_PER_INCH / 0.0254;

/** A 2D point in field units. */
export interface Pt {
    x: number;
    y: number;
}

/**
 * A stored custom outline: points as fractions of width (x) and depth (y), centered on 0, so they
 * fall within -0.5 to 0.5.
 */
export interface CustomOutline {
    points: Pt[];
    /** Whether a freehand path is closed. Defaults to true. */
    closed?: boolean;
}

/** A finished Outline produced by drawing, in field units. */
export interface DrawnOutline {
    outlineType: OutlineType;
    centerX: number;
    centerY: number;
    widthPixels: number;
    depthPixels: number;
    /** The drawn points of a polygon, arc or freehand Outline */
    points?: Pt[];
    /** Placed equipment's turn, in degrees clockwise on screen; drawn Outlines have none */
    rotation?: number;
}

/** A polyline in field units; a closed one joins its last point to its first. */
export interface OutlinePath {
    points: Pt[];
    closed: boolean;
}

/** How an outline is drawn on the field. */
export type OutlineInteraction = "drag" | "click" | "freehand";

/** Context for building an in-progress preview. */
export interface PreviewContext {
    startPoint: Pt | null;
    points: Pt[];
    currentPoint: Pt;
}

/** Context for turning accumulated drawing input into a finished Outline. */
export interface FinalizeContext {
    startPoint: Pt | null;
    points: Pt[];
    /** The release point, for drag outlines. Unused by click and freehand outlines. */
    endPoint?: Pt;
}

/** Everything shape-specific about drawing an outline type, in one place. */
export interface OutlineHandler {
    interaction: OutlineInteraction;
    /** For click outlines: complete once this many points are placed. */
    maxPoints?: number;
    /** Minimum points required before a click outline can complete. */
    minPoints?: number;
    /** Whether a double-click finishes the outline (click outlines only). */
    completeOnDoubleClick?: boolean;
    /** The in-progress preview, or null if there isn't enough input yet. */
    preview(ctx: PreviewContext): OutlinePath | null;
    /** Turn accumulated input into a finished Outline, or null to cancel. */
    finalize(ctx: FinalizeContext): DrawnOutline | null;
}

/** Smaller drawings are taken as a stray click and cancelled. */
export const MIN_DIMENSION_PIXELS = 10;

/** Corners of circles and ellipses, and points along an arc's curve */
const ELLIPSE_SEGMENTS = 48;
const ARC_SEGMENTS = 24;

/** Bounding box (min/max) of a set of points. */
function bounds(points: readonly Pt[]) {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    return {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys),
    };
}

/** Size-free points of a drawn Outline, for storing (see `CustomOutline`). */
export function normalizeOutlinePoints(drawn: DrawnOutline): Pt[] {
    return (drawn.points ?? []).map((p) => ({
        x: (p.x - drawn.centerX) / drawn.widthPixels,
        y: (p.y - drawn.centerY) / drawn.depthPixels,
    }));
}

/** Stored points at a size, around the shape's center. */
function pointsAtSize(
    points: readonly Pt[],
    widthPixels: number,
    depthPixels: number,
): Pt[] {
    return points.map((p) => ({ x: p.x * widthPixels, y: p.y * depthPixels }));
}

/** Points along the quadratic bezier from p1, with control point p2, to p3. */
function arcPoints(p1: Pt, p2: Pt, p3: Pt): Pt[] {
    return Array.from({ length: ARC_SEGMENTS + 1 }, (_, i) => {
        const t = i / ARC_SEGMENTS;
        const a = (1 - t) * (1 - t);
        const b = 2 * (1 - t) * t;
        const c = t * t;
        return {
            x: a * p1.x + b * p2.x + c * p3.x,
            y: a * p1.y + b * p2.y + c * p3.y,
        };
    });
}

/** An ellipse's outline around `center`. */
function ellipsePoints(center: Pt, rx: number, ry: number): Pt[] {
    return Array.from({ length: ELLIPSE_SEGMENTS }, (_, i) => {
        const angle = (i / ELLIPSE_SEGMENTS) * Math.PI * 2;
        return {
            x: center.x + rx * Math.cos(angle),
            y: center.y + ry * Math.sin(angle),
        };
    });
}

/** Ramer-Douglas-Peucker perpendicular distance from a point to a line. */
function perpendicularDistance(point: Pt, lineStart: Pt, lineEnd: Pt): number {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    if (dx === 0 && dy === 0)
        return Math.hypot(point.x - lineStart.x, point.y - lineStart.y);
    const t =
        ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) /
        (dx * dx + dy * dy);
    return Math.hypot(
        point.x - (lineStart.x + t * dx),
        point.y - (lineStart.y + t * dy),
    );
}

/** Ramer-Douglas-Peucker path simplification. */
export function simplifyPath(points: Pt[], epsilon: number): Pt[] {
    if (points.length < 3) return points;
    const first = points[0];
    const last = points[points.length - 1];
    let maxDist = 0;
    let maxIndex = 0;
    for (let i = 1; i < points.length - 1; i++) {
        const dist = perpendicularDistance(points[i], first, last);
        if (dist > maxDist) {
            maxDist = dist;
            maxIndex = i;
        }
    }
    if (maxDist > epsilon) {
        const left = simplifyPath(points.slice(0, maxIndex + 1), epsilon);
        const right = simplifyPath(points.slice(maxIndex), epsilon);
        return [...left.slice(0, -1), ...right];
    }
    return [first, last];
}

/** The bounding Outline of a set of drawn points, or null when it is too thin to keep. */
function outlineFromPoints(
    outlineType: OutlineType,
    points: Pt[],
): DrawnOutline | null {
    const { minX, maxX, minY, maxY } = bounds(points);
    const widthPixels = maxX - minX;
    const depthPixels = maxY - minY;
    if (
        widthPixels < MIN_DIMENSION_PIXELS ||
        depthPixels < MIN_DIMENSION_PIXELS
    )
        return null;
    return {
        outlineType,
        centerX: (minX + maxX) / 2,
        centerY: (minY + maxY) / 2,
        widthPixels,
        depthPixels,
        points,
    };
}

const rectanglePoints = (a: Pt, b: Pt): Pt[] => [
    { x: a.x, y: a.y },
    { x: b.x, y: a.y },
    { x: b.x, y: b.y },
    { x: a.x, y: b.y },
];

const rectangle: OutlineHandler = {
    interaction: "drag",
    preview({ startPoint, currentPoint }) {
        if (!startPoint) return null;
        return {
            points: rectanglePoints(startPoint, currentPoint),
            closed: true,
        };
    },
    finalize({ startPoint, endPoint }) {
        if (!startPoint || !endPoint) return null;
        const width = Math.abs(endPoint.x - startPoint.x);
        const depth = Math.abs(endPoint.y - startPoint.y);
        if (width < MIN_DIMENSION_PIXELS || depth < MIN_DIMENSION_PIXELS)
            return null;
        return {
            outlineType: "rectangle",
            centerX: (startPoint.x + endPoint.x) / 2,
            centerY: (startPoint.y + endPoint.y) / 2,
            widthPixels: width,
            depthPixels: depth,
        };
    },
};

const circle: OutlineHandler = {
    interaction: "drag",
    preview({ startPoint, currentPoint }) {
        if (!startPoint) return null;
        const radius = Math.hypot(
            currentPoint.x - startPoint.x,
            currentPoint.y - startPoint.y,
        );
        return {
            points: ellipsePoints(startPoint, radius, radius),
            closed: true,
        };
    },
    finalize({ startPoint, endPoint }) {
        if (!startPoint || !endPoint) return null;
        const radius = Math.hypot(
            endPoint.x - startPoint.x,
            endPoint.y - startPoint.y,
        );
        if (radius < MIN_DIMENSION_PIXELS) return null;
        return {
            outlineType: "circle",
            centerX: startPoint.x,
            centerY: startPoint.y,
            widthPixels: radius * 2,
            depthPixels: radius * 2,
        };
    },
};

const polygon: OutlineHandler = {
    interaction: "click",
    minPoints: 3,
    completeOnDoubleClick: true,
    preview({ points, currentPoint }) {
        if (points.length === 0) return null;
        return { points: [...points, currentPoint], closed: true };
    },
    finalize({ points }) {
        if (points.length < 3) return null;
        return outlineFromPoints(
            "polygon",
            points.map((p) => ({ x: p.x, y: p.y })),
        );
    },
};

const arc: OutlineHandler = {
    interaction: "click",
    maxPoints: 3,
    preview({ points, currentPoint }) {
        const [first, second] = points;
        if (!first) return null;
        // A line from the first end to the pointer (the second end)
        if (!second) return { points: [first, currentPoint], closed: false };
        // Both ends set: the pointer is the control point
        return {
            points: arcPoints(first, currentPoint, second),
            closed: false,
        };
    },
    finalize({ points }) {
        if (points.length !== 3) return null;
        // Clicked as end, end, control point; stored as end, control point, end
        const [p1, p3, p2] = points;
        return outlineFromPoints("arc", [p1, p2, p3]);
    },
};

const freehand: OutlineHandler = {
    interaction: "freehand",
    preview({ points }) {
        if (points.length < 2) return null;
        return { points: [...points], closed: false };
    },
    finalize({ points }) {
        if (points.length < 3) return null;
        return outlineFromPoints("freehand", simplifyPath(points, 5));
    },
};

/** Per-outline drawing and preview behavior. */
export const ITEM_OUTLINES: Record<OutlineType, OutlineHandler> = {
    rectangle,
    circle,
    polygon,
    arc,
    freehand,
};

/** Reads a stored custom outline, or null when it is missing or not one. */
export function parseCustomOutline(value: unknown): CustomOutline | null {
    const parsed = typeof value === "string" ? safeParse(value) : value;
    if (
        !parsed ||
        typeof parsed !== "object" ||
        !Array.isArray((parsed as CustomOutline).points)
    )
        return null;
    const outline = parsed as CustomOutline;
    const valid = outline.points.every(
        (p) =>
            p &&
            typeof p.x === "number" &&
            typeof p.y === "number" &&
            Number.isFinite(p.x) &&
            Number.isFinite(p.y),
    );
    return valid ? outline : null;
}

function safeParse(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

/** The custom outline's shape at a size, or null when it hasn't enough points for its type. */
function customShape(
    outlineType: string,
    custom: CustomOutline | null,
    widthPixels: number,
    depthPixels: number,
): OutlinePath | null {
    if (!custom) return null;
    const points = pointsAtSize(custom.points, widthPixels, depthPixels);
    switch (outlineType) {
        case "polygon":
            return points.length >= 3 ? { points, closed: true } : null;
        case "arc": {
            if (points.length !== 3) return null;
            const [p1, p2, p3] = points;
            // Filled to its chord, as PR 1013 drew it
            return { points: arcPoints(p1, p2, p3), closed: true };
        }
        case "freehand":
            return points.length >= 2
                ? { points, closed: custom.closed !== false }
                : null;
        default:
            return null;
    }
}

/**
 * An Outline's shape from stored geometry, around its center and unturned: a rectangle when the
 * outline type is unknown or its custom outline is missing or unusable.
 */
export function outlineShape(
    outlineType: string,
    customOutline: unknown,
    widthPixels: number,
    depthPixels: number,
): OutlinePath {
    if (outlineType === "circle")
        return {
            points: ellipsePoints(
                { x: 0, y: 0 },
                widthPixels / 2,
                depthPixels / 2,
            ),
            closed: true,
        };
    const custom = customShape(
        outlineType,
        parseCustomOutline(customOutline),
        widthPixels,
        depthPixels,
    );
    if (custom) return custom;
    const half = { x: widthPixels / 2, y: depthPixels / 2 };
    return {
        points: rectanglePoints({ x: -half.x, y: -half.y }, half),
        closed: true,
    };
}

/** A shape's points on the field: turned `degrees` clockwise on screen, then moved to `center`. */
export function placeOutline(
    shape: OutlinePath,
    center: Pt,
    degrees: number,
): Pt[] {
    const radians = (degrees * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return shape.points.map((p) => ({
        x: center.x + p.x * cos - p.y * sin,
        y: center.y + p.x * sin + p.y * cos,
    }));
}

/** Whether `point` is inside the polygon `points` (even-odd rule). */
export function insideOutline(points: readonly Pt[], point: Pt): boolean {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[i];
        const b = points[j];
        const aAbove = a.y > point.y;
        const bAbove = b.y > point.y;
        // The edge from a to b crosses the point's row, to the point's right
        if (
            aAbove !== bAbove &&
            point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
        )
            inside = !inside;
    }
    return inside;
}
