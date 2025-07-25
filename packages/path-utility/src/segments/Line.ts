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
        public readonly start: Point,
        public readonly end: Point,
    ) {}

    getLength(): number {
        const dx = this.end.x - this.start.x;
        const dy = this.end.y - this.start.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    getPointAtLength(dist: number): Point {
        const totalLength = this.getLength();
        if (totalLength === 0) return { ...this.start };

        const t = Math.max(0, Math.min(1, dist / totalLength));
        return {
            x: this.start.x + t * (this.end.x - this.start.x),
            y: this.start.y + t * (this.end.y - this.start.y),
        };
    }

    toSvgString(includeMoveTo = false): string {
        const moveTo = includeMoveTo
            ? `M ${this.start.x} ${this.start.y} `
            : "";
        return `${moveTo}L ${this.end.x} ${this.end.y}`;
    }

    toJson(): SegmentJsonData {
        return {
            type: this.type,
            data: {
                start: { ...this.start },
                end: { ...this.end },
            },
        };
    }

    fromJson(data: SegmentJsonData): IPathSegment {
        if (data.type !== "line") {
            throw new Error(
                `Cannot create Line from data of type ${data.type}`,
            );
        }
        return new Line(data.data.start, data.data.end);
    }

    static fromJson(data: SegmentJsonData): Line {
        if (data.type !== "line") {
            throw new Error(
                `Cannot create Line from data of type ${data.type}`,
            );
        }
        return new Line(data.data.start, data.data.end);
    }

    // IControllableSegment implementation
    getControlPoints(segmentIndex: number): ControlPoint[] {
        return [
            {
                id: uuidv4(),
                point: { ...this.start },
                segmentIndex,
                type: "start" as ControlPointType,
            },
            {
                id: uuidv4(),
                point: { ...this.end },
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
                return new Line(newPoint, this.end);
            case "end":
                return new Line(this.start, newPoint);
            default:
                throw new Error(
                    `Line segments do not support control point type: ${controlPointType}`,
                );
        }
    }
}
