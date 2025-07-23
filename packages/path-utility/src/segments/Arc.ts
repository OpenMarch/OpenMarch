import { IPathSegment, Point } from "../interfaces";
import {
    distance,
    getArcCenter,
    pointOnArc,
    pointOnLine,
} from "../geometry-utils";

export class Arc implements IPathSegment {
    readonly startPoint: Point;
    readonly endPoint: Point;
    readonly rx: number;
    readonly ry: number;
    readonly xAxisRotation: number;
    readonly largeArcFlag: 0 | 1;
    readonly sweepFlag: 0 | 1;

    private _length: number | undefined;
    private _points: Point[] | undefined;
    private static readonly FLATTENING_SEGMENTS = 100;

    constructor(
        startPoint: Point,
        rx: number,
        ry: number,
        xAxisRotation: number,
        largeArcFlag: 0 | 1,
        sweepFlag: 0 | 1,
        endPoint: Point,
    ) {
        this.startPoint = startPoint;
        this.rx = rx;
        this.ry = ry;
        this.xAxisRotation = xAxisRotation;
        this.largeArcFlag = largeArcFlag;
        this.sweepFlag = sweepFlag;
        this.endPoint = endPoint;
    }

    private flatten(): Point[] {
        if (this._points) {
            return this._points;
        }

        const { center, startAngle, sweepAngle } = getArcCenter(
            this.startPoint,
            this.endPoint,
            this.rx,
            this.ry,
            this.xAxisRotation,
            this.largeArcFlag,
            this.sweepFlag,
        );

        const points: Point[] = [];
        const numSegments = Arc.FLATTENING_SEGMENTS;

        for (let i = 0; i <= numSegments; i++) {
            const angle = startAngle + (sweepAngle / numSegments) * i;
            points.push(
                pointOnArc(center, this.rx, this.ry, this.xAxisRotation, angle),
            );
        }

        this._points = points;
        return this._points;
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

    getPointAtLength(dist: number): Point {
        const fullLength = this.getLength();
        if (dist <= 0) return { ...this.startPoint };
        if (dist >= fullLength) return { ...this.endPoint };

        const points = this.flatten();
        let traveled = 0;
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            const segmentLength = distance(p1, p2);
            if (traveled + segmentLength >= dist) {
                const remaining = dist - traveled;
                const t = segmentLength === 0 ? 0 : remaining / segmentLength;
                return pointOnLine(p1, p2, t);
            }
            traveled += segmentLength;
        }

        return { ...this.endPoint };
    }

    toSvgCommand(): string {
        return `A ${this.rx} ${this.ry} ${this.xAxisRotation} ${this.largeArcFlag} ${this.sweepFlag} ${this.endPoint.x} ${this.endPoint.y}`;
    }
}
