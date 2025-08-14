/**
 * A continuous path composed of one or more segments.
 */
export interface IPath {
    readonly segments: IPathSegment[];

    /** Returns the total length of the path by summing segment lengths. */
    getTotalLength(): number;

    /** Returns a point at a given distance along the entire path. */
    getPointAtLength(dist: number): Point;

    /** Returns the full SVG path `d` attribute string for all segments. */
    toSvgString(): string;

    /** Returns the JSON representation of the path. */
    toJson(): string;

    /** Returns the path from a JSON representation. */
    fromJson(json: string): IPath;
}

/**
 * Base interface for all path segments.
 */
export interface IPathSegment {
    /** The type of the segment (e.g., 'line', 'arc', 'cubic-curve', 'spline') */
    readonly type: string;

    /** Optional override for the start point of this segment */
    startPointOverride?: Point;

    /** Optional override for the end point of this segment */
    endPointOverride?: Point;

    /** Returns the length of this segment. */
    getLength(): number;

    /** Returns a point at a given distance along this segment (0 to getLength()). */
    getPointAtLength(dist: number): Point;

    /** Returns the end point of this segment. */
    getEndPoint(): Point;

    /** Returns the SVG path string for this segment. */
    toSvgString(includeMoveTo?: boolean): string;

    /** Returns the JSON representation of this segment, preserving original data. */
    toJson(): SegmentJsonData;

    /** Creates a segment from JSON data. */
    fromJson(data: SegmentJsonData): IPathSegment;
}

/**
 * A 2D point with x and y coordinates.
 */
export interface Point {
    x: number;
    y: number;
}

/**
 * JSON representation of a path segment that preserves original data.
 */
export interface SegmentJsonData {
    type: string;
    data: any; // Specific to each segment type
}

/**
 * JSON representation of a complete path.
 */
export interface PathJsonData {
    segments: SegmentJsonData[];
}

/**
 * Represents a control point that can be interactively moved.
 */
export interface ControlPoint {
    /** Unique identifier for this control point */
    id: string;
    /** Current position of the control point */
    point: Point;
    /** Index of the segment this control point belongs to */
    segmentIndex: number;
    /** Type of control point within the segment */
    type: ControlPointType;
    /** Index within the segment's control points (for segments with multiple control points) */
    pointIndex?: number;
}

/**
 * Types of control points that different segments can have.
 */
export type ControlPointType =
    | "start" // Start point of segment
    | "end" // End point of segment
    | "control1" // First control point (for curves)
    | "control2" // Second control point (for curves)
    | "center" // Center point (for arcs)
    | "spline-point"; // Individual point in spline control points array

/**
 * Callback function called when a control point is moved.
 */
export type ControlPointMoveCallback = (
    controlPointId: string,
    newPoint: Point,
) => void;

/**
 * Interface for segments that support control point interaction.
 */
export interface IControllableSegment extends IPathSegment {
    /** Returns all control points for this segment */
    getControlPoints(segmentIndex: number): ControlPoint[];

    /** Updates a control point and returns a new segment instance */
    updateControlPoint(
        controlPointType: ControlPointType,
        pointIndex: number | undefined,
        newPoint: Point,
    ): IControllableSegment;
}

/**
 * Configuration for control point visualization and interaction.
 */
export interface ControlPointConfig {
    /** Whether to show control points */
    visible: boolean;
    /** Radius of control point handles in pixels */
    handleRadius: number;
    /** Color of control point handles */
    handleColor: string;
    /** Color of control point handles when selected */
    selectedColor: string;
    /** Whether to show control lines (for bezier curves) */
    showControlLines: boolean;
    /** Color of control lines */
    controlLineColor: string;
}
