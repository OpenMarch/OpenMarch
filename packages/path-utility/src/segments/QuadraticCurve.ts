import { IPathSegment, Point } from "../interfaces";
import { distance, pointOnLine, pointOnQuadraticBezier } from "../geometry-utils";

export class QuadraticCurve implements IPathSegment {
    readonly startPoint: Point;
    readonly controlPoint: Point;
    readonly endPoint: Point;

    private _length: number | undefined;
    private _points: Point[] | undefined;

    // The number of line segments to use when flattening the curve
    private static readonly FLATTENING_SEGMENTS = 20;

    constructor(startPoint: Point, controlPoint: Point, endPoint: Point) {
        this.startPoint = startPoint;
        this.controlPoint = controlPoint;
        this.endPoint = endPoint;
    }

    private flatten(): Point[] {
        if (this._points) {
            return this._points;
        }

        const points: Point[] = [this.startPoint];
        for (let i = 1; i <= QuadraticCurve.FLATTENING_SEGMENTS; i++) {
            const t = i / QuadraticCurve.FLATTENING_SEGMENTS;
            points.push(
                pointOnQuadraticBezier(this.startPoint, this.controlPoint, this.endPoint, t),
            );
        }
        this._points = points;
        return points;
    }

    getLength(): number {
        if (this._length !== undefined) {
            return this._length;
        }

        const points = this.flatten();
        let length = 0;
        for (let i = 0; i < points.length - 1; i++) {
            length += distance(points[i], points[i + 1]);
        }
        this._length = length;
        return length;
    }

    getPointAtLength(distance: number): Point {
        const fullLength = this.getLength();
        if (distance <= 0) return { ...this.startPoint };
        if (distance >= fullLength) return { ...this.endPoint };

        const points = this.flatten();
        let traveled = 0;
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            const segmentLength = distance(p1, p2);
            if (traveled + segmentLength >= distance) {
                const remaining = distance - traveled;
                const t = segmentLength === 0 ? 0 : remaining / segmentLength;
                return pointOnLine(p1, p2, t);
            }
            traveled += segmentLength;
        }

        return { ...this.endPoint };
    }

    toSvgCommand(): string {
        return `Q ${this.controlPoint.x} ${this.controlPoint.y} ${this.endPoint.x} ${this.endPoint.y}`;
    }
}
