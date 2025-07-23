/** A point in 2D space. */
export interface Point {
    x: number;
    y: number;
}

/**
 * A segment of a path, corresponding to a single SVG path command
 * like a line, curve, or move command.
 */
export interface IPathSegment {
    readonly startPoint: Point;
    readonly endPoint: Point;

    /** Returns the length of this individual segment. */
    getLength(): number;

    /** Returns a point at a given distance along the segment. */
    getPointAtLength(dist: number): Point;

    /** Returns the SVG command string for this segment (e.g., "L 100 100"). */
    toSvgCommand(): string;
}

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
}
