import PathCommander from "svg-path-commander";
import {
    ControlPoint,
    ControlPointType,
    IControllableSegment,
    Point,
    SegmentJsonData,
} from "../interfaces";

export class QuadraticCurve implements IControllableSegment {
    readonly type = "quadratic-curve";
    readonly startPoint: Point;
    readonly controlPoint: Point;
    readonly endPoint: Point;

    // Override properties for start and end points
    public startPointOverride?: Point;
    public endPointOverride?: Point;

    constructor(startPoint: Point, controlPoint: Point, endPoint: Point) {
        this.startPoint = startPoint;
        this.controlPoint = controlPoint;
        this.endPoint = endPoint;
    }

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

    getEndPoint(): Point {
        return this.endPointOverride || this.endPoint;
    }

    toSvgString(): string {
        const effectiveStartPoint = this.startPointOverride || this.startPoint;
        const effectiveEndPoint = this.endPointOverride || this.endPoint;

        return `M ${effectiveStartPoint.x} ${effectiveStartPoint.y} Q ${this.controlPoint.x} ${this.controlPoint.y} ${effectiveEndPoint.x} ${effectiveEndPoint.y}`;
    }

    toJson(): SegmentJsonData {
        return {
            type: this.type,
            data: {
                startPoint: { ...this.startPoint },
                controlPoint: { ...this.controlPoint },
                endPoint: { ...this.endPoint },
            },
        };
    }

    fromJson(data: SegmentJsonData): IControllableSegment {
        if (data.type !== "quadratic-curve") {
            throw new Error(
                `Cannot create QuadraticCurve from data of type ${data.type}`,
            );
        }
        return new QuadraticCurve(
            data.data.startPoint,
            data.data.controlPoint,
            data.data.endPoint,
        );
    }

    static fromJson(data: SegmentJsonData): QuadraticCurve {
        const instance = new QuadraticCurve(
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 0, y: 0 },
        );
        return instance.fromJson(data) as QuadraticCurve;
    }

    toSvgCommand(): string {
        const effectiveEndPoint = this.endPointOverride || this.endPoint;

        return `Q ${this.controlPoint.x} ${this.controlPoint.y} ${effectiveEndPoint.x} ${effectiveEndPoint.y}`;
    }

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
                point: { ...this.controlPoint },
                segmentIndex,
                pointIndex: 1,
                type: "control1" as ControlPointType,
            },
            {
                point: { ...effectiveEndPoint },
                segmentIndex,
                pointIndex: 2,
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
                return new QuadraticCurve(
                    newPoint,
                    this.controlPoint,
                    this.endPoint,
                );
            case "control1":
                return new QuadraticCurve(
                    this.startPoint,
                    newPoint,
                    this.endPoint,
                );
            case "end":
                return new QuadraticCurve(
                    this.startPoint,
                    this.controlPoint,
                    newPoint,
                );
            default:
                throw new Error(
                    `QuadraticCurve segments do not support control point type: ${controlPointType}`,
                );
        }
    }
}
