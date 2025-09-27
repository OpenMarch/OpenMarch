import PathCommander from "svg-path-commander";
import {
    Point,
    SegmentJsonData,
    IControllableSegment,
    ControlPointType,
    ControlPoint,
} from "../interfaces";

/**
 * Represents a straight line segment between two points.
 */
export class Line implements IControllableSegment {
    readonly type = "line";

    // Override properties for start and end points
    public startPointOverride?: Point;
    public endPointOverride?: Point;

    constructor(
        public readonly startPoint: Point,
        public readonly endPoint: Point,
    ) {}

    getLength(): number {
        const pathString = this.toSvgString(true);
        const path = new PathCommander(pathString);
        return path.getTotalLength();
    }

    getPointAtLength(dist: number): Point {
        const pathString = this.toSvgString(true);
        const path = new PathCommander(pathString);
        const point = path.getPointAtLength(dist);
        return { x: point.x, y: point.y };
    }

    getStartPoint(): Point {
        return this.startPointOverride || this.startPoint;
    }

    getEndPoint(): Point {
        return this.endPointOverride || this.endPoint;
    }

    toSvgString(includeMoveTo = false): string {
        const effectiveStartPoint = this.startPointOverride || this.startPoint;
        const effectiveEndPoint = this.endPointOverride || this.endPoint;

        const moveTo = includeMoveTo
            ? `M ${effectiveStartPoint.x} ${effectiveStartPoint.y} `
            : "";
        return `${moveTo}L ${effectiveEndPoint.x} ${effectiveEndPoint.y}`;
    }

    toJson(): SegmentJsonData {
        return {
            type: this.type,
            data: {
                startPoint: { ...this.getStartPoint() },
                endPoint: { ...this.getEndPoint() },
            },
        };
    }

    fromJson(data: SegmentJsonData): IControllableSegment {
        if (data.type !== "line") {
            throw new Error(
                `Cannot create Line from data of type ${data.type}`,
            );
        }
        return new Line(data.data.startPoint, data.data.endPoint);
    }

    static fromJson(data: SegmentJsonData): Line {
        if (data.type !== "line") {
            throw new Error(
                `Cannot create Line from data of type ${data.type}`,
            );
        }
        return new Line(data.data.startPoint, data.data.endPoint);
    }

    // IControllableSegment implementation
    getControlPoints(segmentIndex: number): ControlPoint[] {
        const effectiveStartPoint = this.startPointOverride || this.startPoint;
        const effectiveEndPoint = this.endPointOverride || this.endPoint;

        return [
            {
                point: { ...effectiveStartPoint },
                segmentIndex,
                pointIndex: 0,
                type: "start" as ControlPointType,
            },
            {
                point: { ...effectiveEndPoint },
                segmentIndex,
                pointIndex: 1,
                type: "end" as ControlPointType,
            },
        ];
    }

    updateControlPoint(
        controlPointType: ControlPointType,
        pointIndex: number | undefined,
        newPoint: Point,
    ): IControllableSegment {
        switch (controlPointType) {
            case "start":
                return new Line(newPoint, this.endPoint);
            case "end":
                return new Line(this.startPoint, newPoint);
            default:
                throw new Error(
                    `Line segments do not support control point type: ${controlPointType}`,
                );
        }
    }
}
