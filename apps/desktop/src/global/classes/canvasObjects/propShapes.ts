import { fabric } from "fabric";
import type { ShapeType } from "../Prop";

/** A 2D point in canvas pixels. */
export interface Pt {
    x: number;
    y: number;
}

/** Persisted custom-shape geometry (parsed from prop_page_geometry.custom_geometry). */
export interface CustomGeometryData {
    points?: Pt[];
    originalWidth?: number;
    originalHeight?: number;
    /** Whether a freehand path should be closed. Defaults to true. */
    closed?: boolean;
}

/** A finished prop shape produced by drawing, ready to persist. */
export interface PropGeometry {
    shapeType: ShapeType;
    centerX: number;
    centerY: number;
    widthPixels: number;
    heightPixels: number;
    radiusX?: number;
    radiusY?: number;
    points?: Pt[];
}

export const PREVIEW_FILL = "rgba(64, 64, 64, 0.5)";
export const PREVIEW_STROKE = "rgba(0, 0, 0, 0.8)";

/** How a shape is drawn on the canvas. */
export type ShapeInteraction = "drag" | "click" | "freehand";

/** Context for building an in-progress preview object. */
export interface PreviewContext {
    startPoint: Pt | null;
    points: Pt[];
    currentPoint: Pt;
}

/** Context for turning accumulated drawing input into a finished geometry. */
export interface FinalizeContext {
    startPoint: Pt | null;
    points: Pt[];
    /** The release point, for drag shapes. Unused by click/freehand shapes. */
    endPoint?: Pt;
}

/** Parameters for building the persisted fabric object from saved geometry. */
export interface CreateShapeParams {
    customData: CustomGeometryData | null;
    widthPixels: number;
    heightPixels: number;
    baseProps: fabric.IObjectOptions;
}

/** Everything shape-specific about a prop shape, in one place. */
export interface ShapeHandler {
    interaction: ShapeInteraction;
    /** For click shapes: auto-complete once this many points are placed. */
    maxPoints?: number;
    /** Minimum points required before a click shape can complete. */
    minPoints?: number;
    /** Whether a double-click finishes the shape (click shapes only). */
    completeOnDoubleClick?: boolean;
    /** Build the in-progress preview object, or null if not enough input yet. */
    createPreview(ctx: PreviewContext): fabric.Object | null;
    /** Turn accumulated input into a finished geometry, or null to cancel. */
    finalize(ctx: FinalizeContext): PropGeometry | null;
    /** Build the persisted fabric object from saved geometry, or null to fall
     * back to a rectangle. */
    createFabricShape(params: CreateShapeParams): fabric.Object | null;
}

const MIN_DIMENSION_PIXELS = 10;

/** Bounding box (min/max) of a set of points. */
function bounds(points: Pt[]) {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return { minX, maxX, minY, maxY };
}

/** Scales points from original dimensions to target dimensions, centered at origin. */
function scalePointsToCenter(
    points: Pt[],
    origWidth: number,
    origHeight: number,
    targetWidth: number,
    targetHeight: number,
): Pt[] {
    const { minX, maxX, minY, maxY } = bounds(points);
    const origCenterX = (minX + maxX) / 2;
    const origCenterY = (minY + maxY) / 2;
    const scaleX = targetWidth / (origWidth || 1);
    const scaleY = targetHeight / (origHeight || 1);

    return points.map((p) => ({
        x: (p.x - origCenterX) * scaleX,
        y: (p.y - origCenterY) * scaleY,
    }));
}

/** Quadratic bezier path through p1 → (control p2) → p3. */
function arcPath(p1: Pt, p2: Pt, p3: Pt): string {
    return `M ${p1.x} ${p1.y} Q ${p2.x} ${p2.y} ${p3.x} ${p3.y}`;
}

/** Ramer–Douglas–Peucker perpendicular distance from a point to a line. */
function perpendicularDistance(point: Pt, lineStart: Pt, lineEnd: Pt): number {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;

    if (dx === 0 && dy === 0) {
        return Math.sqrt(
            (point.x - lineStart.x) ** 2 + (point.y - lineStart.y) ** 2,
        );
    }

    const t =
        ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) /
        (dx * dx + dy * dy);
    const nearestX = lineStart.x + t * dx;
    const nearestY = lineStart.y + t * dy;

    return Math.sqrt((point.x - nearestX) ** 2 + (point.y - nearestY) ** 2);
}

/** Ramer–Douglas–Peucker path simplification. */
function simplifyPath(points: Pt[], epsilon: number): Pt[] {
    if (points.length < 3) return points;

    let maxDist = 0;
    let maxIndex = 0;
    const first = points[0];
    const last = points[points.length - 1];

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

/** Bounding-box geometry for a set of already-final points. */
function geometryFromPoints(shapeType: ShapeType, points: Pt[]): PropGeometry {
    const { minX, maxX, minY, maxY } = bounds(points);
    return {
        shapeType,
        centerX: (minX + maxX) / 2,
        centerY: (minY + maxY) / 2,
        widthPixels: maxX - minX,
        heightPixels: maxY - minY,
        points,
    };
}

const rectangle: ShapeHandler = {
    interaction: "drag",
    createPreview({ startPoint, currentPoint }) {
        if (!startPoint) return null;
        return new fabric.Rect({
            left: Math.min(startPoint.x, currentPoint.x),
            top: Math.min(startPoint.y, currentPoint.y),
            width: Math.abs(currentPoint.x - startPoint.x),
            height: Math.abs(currentPoint.y - startPoint.y),
            fill: PREVIEW_FILL,
            stroke: PREVIEW_STROKE,
            strokeWidth: 2,
        });
    },
    finalize({ startPoint, endPoint }) {
        if (!startPoint || !endPoint) return null;
        const left = Math.min(startPoint.x, endPoint.x);
        const top = Math.min(startPoint.y, endPoint.y);
        const width = Math.abs(endPoint.x - startPoint.x);
        const height = Math.abs(endPoint.y - startPoint.y);
        if (width < MIN_DIMENSION_PIXELS || height < MIN_DIMENSION_PIXELS) {
            return null;
        }
        return {
            shapeType: "rectangle",
            centerX: left + width / 2,
            centerY: top + height / 2,
            widthPixels: width,
            heightPixels: height,
        };
    },
    createFabricShape({ widthPixels, heightPixels, baseProps }) {
        return new fabric.Rect({
            width: widthPixels,
            height: heightPixels,
            ...baseProps,
        });
    },
};

const circle: ShapeHandler = {
    interaction: "drag",
    createPreview({ startPoint, currentPoint }) {
        if (!startPoint) return null;
        const dx = currentPoint.x - startPoint.x;
        const dy = currentPoint.y - startPoint.y;
        const radius = Math.sqrt(dx * dx + dy * dy);
        return new fabric.Circle({
            left: startPoint.x,
            top: startPoint.y,
            radius,
            originX: "center",
            originY: "center",
            fill: PREVIEW_FILL,
            stroke: PREVIEW_STROKE,
            strokeWidth: 2,
        });
    },
    finalize({ startPoint, endPoint }) {
        if (!startPoint || !endPoint) return null;
        const dx = endPoint.x - startPoint.x;
        const dy = endPoint.y - startPoint.y;
        const radius = Math.sqrt(dx * dx + dy * dy);
        if (radius < MIN_DIMENSION_PIXELS) return null;
        const diameter = radius * 2;
        return {
            shapeType: "circle",
            centerX: startPoint.x,
            centerY: startPoint.y,
            widthPixels: diameter,
            heightPixels: diameter,
            radiusX: radius,
            radiusY: radius,
        };
    },
    createFabricShape({ widthPixels, heightPixels, baseProps }) {
        return new fabric.Ellipse({
            rx: widthPixels / 2,
            ry: heightPixels / 2,
            ...baseProps,
        });
    },
};

const polygon: ShapeHandler = {
    interaction: "click",
    minPoints: 3,
    completeOnDoubleClick: true,
    createPreview({ points, currentPoint }) {
        if (points.length === 0) return null;
        return new fabric.Polygon([...points, currentPoint], {
            fill: PREVIEW_FILL,
            stroke: PREVIEW_STROKE,
            strokeWidth: 2,
        });
    },
    finalize({ points }) {
        if (points.length < 3) return null;
        return geometryFromPoints(
            "polygon",
            points.map((p) => ({ x: p.x, y: p.y })),
        );
    },
    createFabricShape({ customData, widthPixels, heightPixels, baseProps }) {
        if (customData?.points && customData.points.length >= 3) {
            const scaledPoints = scalePointsToCenter(
                customData.points,
                customData.originalWidth || 1,
                customData.originalHeight || 1,
                widthPixels,
                heightPixels,
            );
            return new fabric.Polygon(scaledPoints, baseProps);
        }
        return null;
    },
};

const arc: ShapeHandler = {
    interaction: "click",
    maxPoints: 3,
    createPreview({ points, currentPoint }) {
        if (points.length === 0) return null;
        if (points.length === 1) {
            // Line from first endpoint to current (second endpoint)
            const pathData = `M ${points[0].x} ${points[0].y} L ${currentPoint.x} ${currentPoint.y}`;
            return new fabric.Path(pathData, {
                fill: "transparent",
                stroke: PREVIEW_STROKE,
                strokeWidth: 2,
            });
        }
        // Both endpoints set; cursor is the control point (arc radius)
        return new fabric.Path(arcPath(points[0], currentPoint, points[1]), {
            fill: PREVIEW_FILL,
            stroke: PREVIEW_STROKE,
            strokeWidth: 2,
        });
    },
    finalize({ points }) {
        if (points.length !== 3) return null;
        // Click order: endpoint1, endpoint2, control point
        const [p1, p3, p2] = points;
        return geometryFromPoints("arc", [p1, p2, p3]);
    },
    createFabricShape({ customData, widthPixels, heightPixels, baseProps }) {
        if (customData?.points && customData.points.length === 3) {
            const [sp1, sp2, sp3] = scalePointsToCenter(
                customData.points,
                customData.originalWidth || 1,
                customData.originalHeight || 1,
                widthPixels,
                heightPixels,
            );
            return new fabric.Path(arcPath(sp1, sp2, sp3), baseProps);
        }
        return null;
    },
};

const freehand: ShapeHandler = {
    interaction: "freehand",
    createPreview({ points }) {
        if (points.length < 2) return null;
        let pathData = `M ${points[0].x} ${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
            pathData += ` L ${points[i].x} ${points[i].y}`;
        }
        return new fabric.Path(pathData, {
            fill: "transparent",
            stroke: PREVIEW_STROKE,
            strokeWidth: 2,
        });
    },
    finalize({ points }) {
        if (points.length < 3) return null;
        // Simplify the path (reduce number of points)
        const simplified = simplifyPath(points, 5);
        return geometryFromPoints("freehand", simplified);
    },
    createFabricShape({ customData, widthPixels, heightPixels, baseProps }) {
        if (customData?.points && customData.points.length >= 2) {
            const scaledPoints = scalePointsToCenter(
                customData.points,
                customData.originalWidth || 1,
                customData.originalHeight || 1,
                widthPixels,
                heightPixels,
            );
            const openPath =
                `M ${scaledPoints[0].x} ${scaledPoints[0].y}` +
                scaledPoints
                    .slice(1)
                    .map((p) => ` L ${p.x} ${p.y}`)
                    .join("");
            const pathData =
                customData.closed !== false ? openPath + " Z" : openPath;
            return new fabric.Path(pathData, baseProps);
        }
        return null;
    },
};

/** Single source of truth for per-shape drawing, preview, and rendering behavior. */
export const PROP_SHAPES: Record<ShapeType, ShapeHandler> = {
    rectangle,
    circle,
    polygon,
    arc,
    freehand,
};

/**
 * Builds the persisted fabric object for a saved shape, falling back to a
 * rectangle when the shape is unknown or its custom geometry is missing/invalid.
 */
export function createPropFabricShape(
    shapeType: string,
    params: CreateShapeParams,
): fabric.Object {
    const handler = PROP_SHAPES[shapeType as ShapeType];
    return (
        handler?.createFabricShape(params) ??
        rectangle.createFabricShape(params)!
    );
}
