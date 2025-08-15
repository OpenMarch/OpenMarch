import {
    IPath,
    IControllableSegment,
    Point,
    PathJsonData,
    SegmentJsonData,
} from "./interfaces";
import { parseSvg } from "./SvgParser";
import { Line } from "./segments/Line";
import { Arc } from "./segments/Arc";
import { CubicCurve } from "./segments/CubicCurve";
import { Spline } from "./segments/Spline";
import { QuadraticCurve } from "./segments/QuadraticCurve";

/**
 * A path implementation that can contain multiple types of segments,
 * including splines and SVG-based segments, with proper JSON serialization
 * that preserves the original segment data.
 */
export class Path implements IPath {
    private _segments: IControllableSegment[];

    constructor(segments: IControllableSegment[] = []) {
        this._segments = [...segments];
    }

    get segments(): IControllableSegment[] {
        return [...this._segments];
    }

    /**
     * Adds a segment to the path.
     */
    addSegment(segment: IControllableSegment): void {
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

    /**
     * Replaces a segment at a specific index.
     */
    replaceSegment(index: number, segment: IControllableSegment): void {
        if (index >= 0 && index < this._segments.length) {
            this._segments[index] = segment;
        }
    }

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
            return this._segments[0].getPointAtLength(0);
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
        const lastSegment = this._segments[this._segments.length - 1];
        return lastSegment.getPointAtLength(lastSegment.getLength());
    }

    getLastPoint(): Point | null {
        if (this._segments.length === 0) {
            return null;
        }

        const lastSegment = this._segments[this._segments.length - 1];
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

    /**
     * Converts the path to JSON format, preserving original segment data.
     * Spline segments will maintain their spline parameters, while SVG segments
     * will maintain their geometric data.
     */
    toJson(): string {
        const pathData: PathJsonData = {
            segments: this._segments.map((segment) => segment.toJson()),
        };

        return JSON.stringify(pathData, null);
    }

    /**
     * Creates a path from JSON data, reconstructing the original segment types
     * and their specific data (splines with control points, arcs with radii, etc.).
     */
    fromJson(json: string, startPoint?: Point, endPoint?: Point): IPath {
        try {
            const pathData: PathJsonData = JSON.parse(json);

            if (!pathData.segments || !Array.isArray(pathData.segments)) {
                throw new Error(
                    "Invalid path JSON: missing or invalid segments array",
                );
            }

            const segments: IControllableSegment[] = pathData.segments.map(
                (segmentData) => {
                    return this.createSegmentFromJson(segmentData);
                },
            );

            if (segments.length > 0) {
                segments[0].startPointOverride = startPoint;
                segments[segments.length - 1].endPointOverride = endPoint;
            }

            return new Path(segments);
        } catch (error) {
            throw new Error(
                `Failed to parse path JSON: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
        }
    }

    /**
     * Factory method to create a segment from JSON data based on its type.
     */
    private createSegmentFromJson(data: SegmentJsonData): IControllableSegment {
        switch (data.type) {
            case "line":
                return Line.fromJson(data);
            case "arc":
                return Arc.fromJson(data);
            case "cubic-curve":
                return CubicCurve.fromJson(data);
            case "quadratic-curve":
                return QuadraticCurve.fromJson(data);
            case "spline":
                return Spline.fromJson(data);
            default:
                throw new Error(`Unknown segment type: ${data.type}`);
        }
    }

    /**
     * Creates a new Path instance from JSON string.
     */
    static fromJson(json: string, startPoint?: Point, endPoint?: Point): Path {
        const path = new Path();
        return path.fromJson(json, startPoint, endPoint) as Path;
    }

    /**
     * Creates a path from an SVG path string by parsing it into segments.
     * Note: This will lose spline information if the SVG was originally from splines.
     */
    static fromSvgString(svgPath: string): Path {
        const segments = parseSvg(svgPath);
        return new Path(segments);
    }

    /**
     * Creates a path containing only a spline segment.
     */
    static fromSpline(spline: Spline): Path {
        return new Path([spline]);
    }

    /**
     * Creates a simple path from an array of points connected by lines.
     */
    static fromPoints(points: Point[]): Path {
        if (points.length < 2) {
            return new Path();
        }

        const segments: IControllableSegment[] = [];
        for (let i = 0; i < points.length - 1; i++) {
            segments.push(new Line(points[i], points[i + 1]));
        }

        return new Path(segments);
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
            const segment = this._segments[i];
            const controlPoints = segment.getControlPoints(i);

            // Process each control point
            for (const controlPoint of controlPoints) {
                const { x, y } = controlPoint.point;

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
