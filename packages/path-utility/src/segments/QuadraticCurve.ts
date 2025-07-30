import PathCommander from "svg-path-commander";
import { IPathSegment, Point, SegmentJsonData } from "../interfaces";

export class QuadraticCurve implements IPathSegment {
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

    fromJson(data: SegmentJsonData): IPathSegment {
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
}
