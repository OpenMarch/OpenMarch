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

    /** Returns the length of this segment. */
    getLength(): number;

    /** Returns a point at a given distance along this segment (0 to getLength()). */
    getPointAtLength(dist: number): Point;

    /** Returns the SVG path string for this segment. */
    toSvgString(): string;

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