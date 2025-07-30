import {
    IPath,
    IPathSegment,
    Point,
    PathJsonData,
    SegmentJsonData,
    ControlPointConfig,
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
    private _segments: IPathSegment[];

    constructor(segments: IPathSegment[] = []) {
        this._segments = [...segments];
    }

    get segments(): IPathSegment[] {
        return [...this._segments];
    }

    /**
     * Adds a segment to the path.
     */
    addSegment(segment: IPathSegment): void {
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

    toSvgString(): string {
        if (this._segments.length === 0) {
            return "";
        }

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
    fromJson(json: string): IPath {
        try {
            const pathData: PathJsonData = JSON.parse(json);

            if (!pathData.segments || !Array.isArray(pathData.segments)) {
                throw new Error(
                    "Invalid path JSON: missing or invalid segments array",
                );
            }

            const segments: IPathSegment[] = pathData.segments.map(
                (segmentData) => {
                    return this.createSegmentFromJson(segmentData);
                },
            );

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
    private createSegmentFromJson(data: SegmentJsonData): IPathSegment {
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
    static fromJson(json: string): Path {
        const path = new Path();
        return path.fromJson(json) as Path;
    }

    /**
     * Creates a ControlPointManager for this path to enable interactive editing.
     * Note: This method is defined separately to avoid circular dependencies.
     */
    createControlPointManager(config?: Partial<ControlPointConfig>) {
        // This will be imported at runtime when needed
        throw new Error(
            "ControlPointManager not available. Import and use ControlPointManager class directly.",
        );
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

        const segments: IPathSegment[] = [];
        for (let i = 0; i < points.length - 1; i++) {
            segments.push(new Line(points[i], points[i + 1]));
        }

        return new Path(segments);
    }
}
