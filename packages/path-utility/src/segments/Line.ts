import { IPathSegment, Point, SegmentJsonData } from "../interfaces";

/**
 * Represents a straight line segment between two points.
 */
export class Line implements IPathSegment {
    readonly type = "line";

    constructor(
        public readonly startPoint: Point,
        public readonly endPoint: Point,
    ) {}

    getLength(): number {
        const dx = this.endPoint.x - this.startPoint.x;
        const dy = this.endPoint.y - this.startPoint.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    getPointAtLength(dist: number): Point {
        const totalLength = this.getLength();
        if (totalLength === 0) return { ...this.startPoint };

        const t = Math.max(0, Math.min(1, dist / totalLength));
        return {
            x: this.startPoint.x + t * (this.endPoint.x - this.startPoint.x),
            y: this.startPoint.y + t * (this.endPoint.y - this.startPoint.y),
        };
    }

    toSvgString(): string {
        return `M ${this.startPoint.x} ${this.startPoint.y} L ${this.endPoint.x} ${this.endPoint.y}`;
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
        const instance = new Line({ x: 0, y: 0 }, { x: 0, y: 0 });
        return instance.fromJson(data) as Line;
    }
}
