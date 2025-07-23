import PathCommander from "svg-path-commander";
import {
    IPathSegment,
    Point,
    SegmentJsonData,
    IControllableSegment,
    ControlPoint,
    ControlPointType,
} from "../interfaces";
import { v4 as uuidv4 } from "uuid";

/**
 * Represents a straight line segment between two points.
 */
export class Line implements IControllableSegment {
    readonly type = "line";

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

    toSvgString(includeMoveTo = false): string {
        const moveTo = includeMoveTo
            ? `M ${this.startPoint.x} ${this.startPoint.y} `
            : "";
        return `${moveTo}L ${this.endPoint.x} ${this.endPoint.y}`;
    }

    toJson(): SegmentJsonData {
        return {
            type: this.type,
            data: {
                startPoint: { ...this.startPoint },
                endPoint: { ...this.endPoint },
            },
        };
    }

    fromJson(data: SegmentJsonData): IPathSegment {
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
        return [
            {
                id: uuidv4(),
                point: { ...this.startPoint },
                segmentIndex,
                type: "start" as ControlPointType,
            },
            {
                id: uuidv4(),
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
