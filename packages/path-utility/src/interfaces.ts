/**
 * A continuous path composed of one or more segments.
 */
export interface IPath {
    readonly id: number;
    readonly segments: IControllableSegment[];

    /** Returns the total length of the path by summing segment lengths. */
    getTotalLength(): number;

    /** Returns a point at a given distance along the entire path. */
    getPointAtLength(dist: number): Point;

    /** Returns the start point of the path. */
    getStartPoint(): Point;

    /** Returns the last point of the path. */
    getLastPoint(): Point;

    /** Returns the full SVG path `d` attribute string for all segments. */
    toSvgString(): string;

    /** Returns the JSON representation of the path. */
    toJson(): string;

    /** Returns the path from a JSON representation. */
    fromJson(json: string): IPath;

    /**
     * Gets the bounding box based on all control points from all segments.
     * This includes start points, end points, and any intermediate control points
     * like bezier curve control points, arc centers, etc.
     *
     * @returns An object with minX, minY, maxX, maxY, width, and height properties, or null if no segments exist
     */
    getBoundsByControlPoints(): {
        minX: number;
        minY: number;
        maxX: number;
        maxY: number;
        width: number;
        height: number;
    } | null;
}

/**
 * Base interface for all path segments.
 */
export interface IControllableSegment {
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

    /** Returns the start point of this segment. */
    getStartPoint(): Point;

    /** Returns the end point of this segment. */
    getEndPoint(): Point;

    /** Returns the SVG path string for this segment. */
    toSvgString(includeMoveTo?: boolean): string;

    /** Returns the JSON representation of this segment, preserving original data. */
    toJson(): SegmentJsonData;

    /** Creates a segment from JSON data. */
    fromJson(data: SegmentJsonData): IControllableSegment;

    /**
     * Returns all control points for this segment
     *
     * @param segmentIndex - The index of the segment this control point belongs to
     * @returns An array of control points for the segment
     */
    getControlPoints(segmentIndex: number): ControlPoint[];

    /** Updates a control point and returns a new segment instance */
    updateControlPoint(
        controlPointType: ControlPointType,
        pointIndex: number | undefined,
        newPoint: Point,
    ): IControllableSegment;
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
 * A hook to identify a point on a segment.
 */
export interface SegmentHook {
    type: ControlPointType;
    pointIndex: number;
    segmentIndex: number;
}

/**
 * A base control point that can be used to find a control point in a segment.
 */
export interface ControlPoint {
    /** Current position of the control point */
    point: Point;
    /** Index of the segment this control point belongs to */
    segmentIndex: number;
    /** An type to find the control point in a segment. Can either be a type or an index. */
    type: ControlPointType;
    /** Index of the control point in the segment */
    pointIndex: number;
}

/**
 * Represents a control point that can be interactively moved.
 */
export interface GlobalControlPoint {
    /** Unique type for this control point */
    id: string;
    /** Point of the control point */
    point: Point;
    /** Segment control points that this control point is connected to */
    segmentHooks: SegmentHook[];
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
