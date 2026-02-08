/**
 * A continuous path composed of one or more segments.
 */
export interface IPath {
    readonly id: number;
    readonly segments: ControllableSegment[];

    /** Returns the total length of the path by summing segment lengths. */
    getTotalLength(): number;

    /** Returns a point at a given distance along the entire path. */
    getPointAtLength(dist: number): Point;

    /** Returns an array of equidistant points along the whole path. Start and end points are included. */
    getEquidistantPoints(numberOfPoints: number): Point[];

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
}

export type SegmentType = "line" | "spline";

/**
 * Base class for all path segments.
 */
export abstract class ControllableSegment {
    /** The type of the segment (e.g. 'line', 'spline') */
    abstract readonly type: SegmentType;

    _controlPoints: Point[];

    constructor(controlPoints: Point[]) {
        if (controlPoints.length < 2) {
            throw new Error("A segment must have at least 2 control points");
        }
        this._controlPoints = controlPoints;
    }

    /** Returns the length of this segment. */
    abstract getLength(): number;

    /** Returns a point at a given distance along this segment (0 to getLength()). */
    abstract getPointAtLength(dist: number): Point;

    /** Returns an array of equidistant points along this segment. Start and end points are included. */
    abstract getEquidistantPoints(numberOfPoints: number): Point[];

    /** Returns the start point of this segment. */
    getStartPoint(): Point {
        return this._controlPoints[0]!;
    }

    /** Returns the end point of this segment. */
    getEndPoint(): Point {
        return this._controlPoints[this._controlPoints.length - 1]!;
    }

    /** Returns the SVG path string for this segment. */
    abstract toSvgString(includeMoveTo?: boolean): string;

    /** Returns the JSON representation of this segment, preserving original data. */
    toJson(): SegmentJsonData {
        return {
            type: this.type,
            points: this._controlPoints.map((p) => ({ ...p })),
        };
    }

    /**
     * Returns all control points for this segment
     *
     * @param segmentIndex - The index of the segment this control point belongs to
     * @returns An array of control points for the segment
     */
    abstract getControlPoints(segmentIndex: number): ControlPoint[];

    // /** Updates a control point and returns a new segment instance */
    // abstract updateControlPoint(
    //     controlPointType: ControlPointType,
    //     pointIndex: number | undefined,
    //     newPoint: Point,
    // ): ControllableSegment;

    /**
     * Creates a new control point in between two points of this segment.
     *
     * @param startingControlPointIndex - The index of the starting control point. Must be `> 0` and not the last index.
     * @returns The new control point
     */
    abstract createControlPointInBetweenPoints(
        startingControlPointIndex: number,
    ): Point;
}

/**
 * A 2D point with x and y coordinates.
 */
export type Point = [x: number, y: number];

/**
 * JSON representation of a path segment that preserves original data.
 */
export type SegmentJsonData = {
    type: SegmentType;
    points: Point[];
};

/**
 * A base control point that can be used to find a control point in a segment.
 */
export interface ControlPoint {
    /** Current position of the control point */
    point: Point;
    /** Index of the control point in the segment */
    pointIndex: number;
}

/**
 * Represents a control point that can be interactively moved.
 */
export interface GlobalControlPoint {
    /** Point of the control point */
    point: Point;
    /** Index of the segment this control point belongs to */
    segmentIndex: number;
    /** Index of the control point in its segment */
    pointIndex: number;
}

export interface PointProps {
    size: number;
    fill: string;
    stroke: string;
    strokeWidth: number;
}

/**
 * Configuration for control point visualization and interaction.
 */
export interface ControlPointConfig {
    /** Whether to show control points */
    visible: boolean;
    controlPointProps: PointProps;
    splitPointProps: PointProps;
}
