import { Line } from "./segments/Line";
import type { SegmentJsonData, Point } from "./interfaces";

/**
 * A path implementation that can contain multiple types of segments,
 * including splines and SVG-based segments, with proper JSON serialization
 * that preserves the original segment data.
 */
export class Path {
    private _segments: Line[];
    private _id: number;

    constructor(segments: Line[] = [], id: number = 0) {
        this._segments = [...segments].map((segment, index) => {
            if (index > 0) {
                segment.connectToPreviousSegment(segments[index - 1]!);
            }
            return segment;
        });
        this._id = id;
    }

    get id(): number {
        return this._id;
    }

    get segments(): Line[] {
        return [...this._segments];
    }

    /**
     * Updates a segment's control point and keeps segment junctions in sync.
     * When the updated point is the end of a segment, the next segment's start
     * is set to the same position. When the updated point is the start of a
     * segment (index > 0), the previous segment's end is set to the same position.
     */
    updateSegmentControlPoint(
        segmentIndex: number,
        pointIndex: number,
        newPoint: Point,
    ): void {
        if (segmentIndex < 0 || segmentIndex >= this._segments.length) {
            return;
        }
        const segment = this._segments[segmentIndex]!;
        segment.updateControlPoint(pointIndex, newPoint);

        const numPoints = segment.controlPoints.length;
        if (
            segmentIndex < this._segments.length - 1 &&
            pointIndex === numPoints - 1
        ) {
            this._segments[segmentIndex + 1]!.updateControlPoint(0, newPoint);
        }
        if (segmentIndex > 0 && pointIndex === 0) {
            const prev = this._segments[segmentIndex - 1]!;
            prev.updateControlPoint(prev.controlPoints.length - 1, newPoint);
        }
    }

    /**
     * Adds a segment to the path.
     */
    addSegment(segment: Line): void {
        this._segments.push(segment);
    }

    /**
     * Removes a segment at the specified index.
     */
    removeSegment(index: number): boolean {
        if (index >= 0 && index < this._segments.length) {
            this._segments.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * Clears all segments from the path.
     */
    clear(): void {
        this._segments = [];
    }

    // /**
    //  * Replaces a segment at a specific index.
    //  */
    // replaceSegment(index: number, segment: IControllableSegment): void {
    //     if (index >= 0 && index < this._segments.length) {
    //         this._segments[index] = segment;
    //     }
    // }

    // /**
    //  * Inserts segments at the specified index (before the segment currently at that index).
    //  */
    // insertSegmentsAt(index: number, segments: IControllableSegment[]): void {
    //     if (
    //         index >= 0 &&
    //         index <= this._segments.length &&
    //         segments.length > 0
    //     ) {
    //         this._segments.splice(index, 0, ...segments);
    //     }
    // }

    getTotalLength(): number {
        return this._segments.reduce(
            (total, segment) => total + segment.getLength(),
            0,
        );
    }

    getPointAtLength(dist: number): Point {
        if (this._segments.length === 0) {
            throw new Error("Cannot get point from empty path");
        }

        if (dist <= 0) {
            return this._segments[0]!.getPointAtLength(0);
        }

        let remainingDistance = dist;

        for (const segment of this._segments) {
            const segmentLength = segment.getLength();

            if (remainingDistance <= segmentLength) {
                return segment.getPointAtLength(remainingDistance);
            }

            remainingDistance -= segmentLength;
        }

        // If we've gone past the end, return the last point of the last segment
        const lastSegment = this._segments[this._segments.length - 1]!;
        return lastSegment.getPointAtLength(lastSegment.getLength());
    }

    /**
     * Returns evenly spaced points along the path.
     * This is more performant than calling getPointAtLength() multiple times
     * because it pre-computes segment lengths and walks through segments sequentially.
     *
     * @param numPoints The number of evenly spaced points to return (must be >= 2)
     * @returns An array of points evenly distributed along the path
     */
    getEvenlySpacedPoints(numPoints: number): Point[] {
        if (this._segments.length === 0) {
            throw new Error("Cannot get points from empty path");
        }

        if (numPoints < 2) {
            throw new Error("Number of points must be at least 2");
        }

        // Pre-compute segment lengths to avoid redundant calculations
        const segmentLengths: number[] = new Array(this._segments.length);
        let totalLength = 0;

        for (let i = 0; i < this._segments.length; i++) {
            const len = this._segments[i]!.getLength();
            segmentLengths[i] = len;
            totalLength += len;
        }

        if (totalLength === 0) {
            // All segments have zero length, return the start point repeated
            const startPoint = this._segments[0]!.getPointAtLength(0);
            return Array(numPoints).fill(startPoint);
        }

        const points: Point[] = new Array(numPoints);
        const spacing = totalLength / (numPoints - 1);

        // Track current position in the path
        let currentSegmentIndex = 0;
        let distanceIntoCurrentSegment = 0;
        let accumulatedLengthBeforeCurrentSegment = 0;

        for (let i = 0; i < numPoints; i++) {
            const targetDistance = i * spacing;

            // Move forward through segments until we find the one containing our target
            while (
                currentSegmentIndex < this._segments.length - 1 &&
                targetDistance >=
                    accumulatedLengthBeforeCurrentSegment +
                        segmentLengths[currentSegmentIndex]!
            ) {
                accumulatedLengthBeforeCurrentSegment +=
                    segmentLengths[currentSegmentIndex]!;
                currentSegmentIndex++;
            }

            // Calculate distance into the current segment
            distanceIntoCurrentSegment =
                targetDistance - accumulatedLengthBeforeCurrentSegment;

            // Clamp to segment length to handle floating point errors
            const segmentLength = segmentLengths[currentSegmentIndex]!;
            distanceIntoCurrentSegment = Math.min(
                distanceIntoCurrentSegment,
                segmentLength,
            );
            distanceIntoCurrentSegment = Math.max(
                distanceIntoCurrentSegment,
                0,
            );

            points[i] = this._segments[currentSegmentIndex]!.getPointAtLength(
                distanceIntoCurrentSegment,
            );
        }

        return points;
    }

    /**
     * Returns the split points for each segment.
     *
     * @returns An array of arrays of split points. Each array contains the split points for a segment.
     */
    getSplitPoints(): Point[][] {
        const splitPoints: Point[][] = [];
        for (const segment of this._segments)
            splitPoints.push(segment.splitPoints);

        return splitPoints;
    }

    getStartPoint(): Point {
        if (this._segments.length === 0) {
            throw new Error("Cannot get start point of empty path");
        }
        return this._segments[0]!.getStartPoint();
    }

    getLastPoint(): Point {
        if (this._segments.length === 0) {
            throw new Error("Cannot get last point of empty path");
        }

        const lastSegment = this._segments[this._segments.length - 1]!;
        return lastSegment.getEndPoint();
    }

    toSvgString(): string {
        if (this._segments.length === 0) return "";

        const svgParts = this._segments.map((segment, index) => {
            const includeMoveTo = index === 0;
            return segment.toSvgString(includeMoveTo);
        });

        return svgParts.join(" ");
    }

    // /**
    //  * Converts the path to JSON format, preserving original segment data.
    //  * Spline segments will maintain their spline parameters, while SVG segments
    //  * will maintain their geometric data.
    //  */
    // toJson(): string {
    //     const pathData: PathJsonData = {
    //         segments: this._segments.map((segment) => segment.toJson()),
    //     };

    //     return JSON.stringify(pathData, null);
    // }

    // /**
    //  * Creates a path from JSON data, reconstructing the original segment types
    //  * and their specific data (splines with control points, arcs with radii, etc.).
    //  */
    // fromJson(json: string, id: number = 0): Path {
    //     try {
    //         const pathData: PathJsonData = JSON.parse(json);

    //         if (!pathData.segments || !Array.isArray(pathData.segments)) {
    //             throw new Error(
    //                 "Invalid path JSON: missing or invalid segments array",
    //             );
    //         }

    //         const segments: Line[] = pathData.segments.map(
    //             (segmentData: SegmentJsonData) => {
    //                 return this.createSegmentFromJson(segmentData);
    //             },
    //         );

    //         return new Path(segments, id);
    //     } catch (error) {
    //         throw new Error(
    //             `Failed to parse path JSON: ${error instanceof Error ? error.message : "Unknown error"}`,
    //         );
    //     }
    // }

    /**
     * Factory method to create a segment from JSON data based on its type.
     */
    private createSegmentFromJson(data: SegmentJsonData): Line {
        switch (data.type) {
            case "line":
                return Line.fromJson(data);
            default:
                throw new Error(`Unknown segment type: ${data.type}`);
        }
    }

    // /**
    //  * Creates a new Path instance from JSON string.
    //  */
    // static fromJson(json: string, id: number = 0): Path {
    //     const path = new Path();
    //     return path.fromJson(json, id) as Path;
    // }

    // /**
    //  * Creates a new Path instance from a database path_data string.
    //  */
    // static fromDb({ id, path_data }: { id: number; path_data: string }): Path {
    //     return Path.fromJson(path_data, id);
    // }

    /**
     * Creates a simple path from an array of points connected by lines.
     */
    static fromPoints(points: Point[], id: number = 0): Path {
        if (points.length < 2) {
            return new Path([], id);
        }

        return new Path([new Line(points)], id);
    }

    /**
     * Gets the bounding box based on all control points from all segments.
     * This includes start points, end points, and any intermediate control points
     * like bezier curve control points, arc centers, etc.
     *
     * @returns An object with minX, minY, maxX, maxY, width, and height properties
     */
    getBoundsByControlPoints(): {
        minX: number;
        minY: number;
        maxX: number;
        maxY: number;
        width: number;
        height: number;
    } | null {
        if (this._segments.length === 0) {
            return null;
        }

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        // Collect all control points from all segments
        for (let i = 0; i < this._segments.length; i++) {
            const segment = this._segments[i]!;
            const controlPoints = segment.controlPoints;

            // Process each control point
            for (const controlPoint of controlPoints) {
                const { x, y } = controlPoint;

                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
            }
        }

        // If no valid points were found, return null
        if (
            minX === Infinity ||
            minY === Infinity ||
            maxX === -Infinity ||
            maxY === -Infinity
        ) {
            return null;
        }

        return {
            minX,
            minY,
            maxX,
            maxY,
            width: maxX - minX,
            height: maxY - minY,
        };
    }
}
