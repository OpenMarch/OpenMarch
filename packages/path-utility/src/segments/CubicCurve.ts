import PathCommander from "svg-path-commander";
import {
    IPathSegment,
    Point,
    SegmentJsonData,
    IControllableSegment,
    ControlPoint,
    ControlPointType,
} from "../interfaces";

/**
 * Represents a cubic Bézier curve segment with start point, two control points, and end point.
 */
export class CubicCurve implements IControllableSegment {
    readonly type = "cubic-curve";

    constructor(
        public readonly startPoint: Point,
        public readonly controlPoint1: Point,
        public readonly controlPoint2: Point,
        public readonly endPoint: Point,
    ) {}

    getLength(): number {
        const pathString = this.toSvgString();
        const path = new PathCommander(pathString);
        return path.getTotalLength();
    }

    getPointAtLength(dist: number): Point {
        const pathString = this.toSvgString();
        const path = new PathCommander(pathString);
        const point = path.getPointAtLength(dist);
        return { x: point.x, y: point.y };
    }

    toSvgString(): string {
        return `M ${this.startPoint.x} ${this.startPoint.y} C ${this.controlPoint1.x} ${this.controlPoint1.y} ${this.controlPoint2.x} ${this.controlPoint2.y} ${this.endPoint.x} ${this.endPoint.y}`;
    }

    toJson(): SegmentJsonData {
        return {
            type: this.type,
            data: {
                startPoint: { ...this.startPoint },
                controlPoint1: { ...this.controlPoint1 },
                controlPoint2: { ...this.controlPoint2 },
                endPoint: { ...this.endPoint },
            },
        };
    }

    fromJson(data: SegmentJsonData): IPathSegment {
        if (data.type !== "cubic-curve") {
            throw new Error(
                `Cannot create CubicCurve from data of type ${data.type}`,
            );
        }
        return new CubicCurve(
            data.data.startPoint,
            data.data.controlPoint1,
            data.data.controlPoint2,
            data.data.endPoint,
        );
    }

    static fromJson(data: SegmentJsonData): CubicCurve {
        const instance = new CubicCurve(
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 0, y: 0 },
        );
        return instance.fromJson(data) as CubicCurve;
    }

    // IControllableSegment implementation
    getControlPoints(segmentIndex: number): ControlPoint[] {
        return [
            {
                id: `cp-${segmentIndex}-start`,
                point: { ...this.startPoint },
                segmentIndex,
                type: "start" as ControlPointType,
            },
            {
                id: `cp-${segmentIndex}-control1`,
                point: { ...this.controlPoint1 },
                segmentIndex,
                type: "control1" as ControlPointType,
            },
            {
                id: `cp-${segmentIndex}-control2`,
                point: { ...this.controlPoint2 },
                segmentIndex,
                type: "control2" as ControlPointType,
            },
            {
                id: `cp-${segmentIndex}-end`,
                point: { ...this.endPoint },
                segmentIndex,
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
                return new CubicCurve(
                    newPoint,
                    this.controlPoint1,
                    this.controlPoint2,
                    this.endPoint,
                );
            case "control1":
                return new CubicCurve(
                    this.startPoint,
                    newPoint,
                    this.controlPoint2,
                    this.endPoint,
                );
            case "control2":
                return new CubicCurve(
                    this.startPoint,
                    this.controlPoint1,
                    newPoint,
                    this.endPoint,
                );
            case "end":
                return new CubicCurve(
                    this.startPoint,
                    this.controlPoint1,
                    this.controlPoint2,
                    newPoint,
                );
            default:
                throw new Error(
                    `CubicCurve segments do not support control point type: ${controlPointType}`,
                );
        }
    }
}
