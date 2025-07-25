import { IPathSegment, Point, SegmentJsonData, IControllableSegment, ControlPoint, ControlPointType } from "../interfaces";

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
        // Use numerical integration for more accurate length calculation
        return this.integrateLength(0, 1, 1000); // Use 1000 segments for accuracy
    }

    private integrateLength(t1: number, t2: number, segments: number): number {
        let length = 0;
        const dt = (t2 - t1) / segments;

        for (let i = 0; i < segments; i++) {
            const t = t1 + i * dt;
            const nextT = t1 + (i + 1) * dt;

            const p1 = this.getPointAtT(t);
            const p2 = this.getPointAtT(nextT);

            length += this.distance(p1, p2);
        }

        return length;
    }

    private distance(p1: Point, p2: Point): number {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    getPointAtLength(dist: number): Point {
        const totalLength = this.getLength();
        if (totalLength === 0) return { ...this.startPoint };

        // Clamp distance to valid range
        const clampedDist = Math.max(0, Math.min(totalLength, dist));

        // Use binary search to find the t value that corresponds to the target distance
        let t = this.findTForDistance(clampedDist, 0, 1, 0.001);
        return this.getPointAtT(t);
    }

    private findTForDistance(
        targetDist: number,
        tMin: number,
        tMax: number,
        tolerance: number,
    ): number {
        if (tMax - tMin < tolerance) {
            return (tMin + tMax) / 2;
        }

        const tMid = (tMin + tMax) / 2;
        const currentDist = this.getLengthAtT(tMid);

        if (Math.abs(currentDist - targetDist) < tolerance) {
            return tMid;
        }

        if (currentDist < targetDist) {
            return this.findTForDistance(targetDist, tMid, tMax, tolerance);
        } else {
            return this.findTForDistance(targetDist, tMin, tMid, tolerance);
        }
    }

    private getLengthAtT(t: number): number {
        return this.integrateLength(0, t, 1000);
    }

    private getPointAtT(t: number): Point {
        // Cubic Bézier curve formula: B(t) = (1-t)³P₀ + 3(1-t)²tP₁ + 3(1-t)t²P₂ + t³P₃
        const u = 1 - t;
        const tt = t * t;
        const uu = u * u;
        const uuu = uu * u;
        const ttt = tt * t;

        return {
            x:
                uuu * this.startPoint.x +
                3 * uu * t * this.controlPoint1.x +
                3 * u * tt * this.controlPoint2.x +
                ttt * this.endPoint.x,
            y:
                uuu * this.startPoint.y +
                3 * uu * t * this.controlPoint1.y +
                3 * u * tt * this.controlPoint2.y +
                ttt * this.endPoint.y,
        };
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
                type: 'start' as ControlPointType,
            },
            {
                id: `cp-${segmentIndex}-control1`,
                point: { ...this.controlPoint1 },
                segmentIndex,
                type: 'control1' as ControlPointType,
            },
            {
                id: `cp-${segmentIndex}-control2`,
                point: { ...this.controlPoint2 },
                segmentIndex,
                type: 'control2' as ControlPointType,
            },
            {
                id: `cp-${segmentIndex}-end`,
                point: { ...this.endPoint },
                segmentIndex,
                type: 'end' as ControlPointType,
            },
        ];
    }

    updateControlPoint(controlPointType: ControlPointType, pointIndex: number | undefined, newPoint: Point): IControllableSegment {
        switch (controlPointType) {
            case 'start':
                return new CubicCurve(newPoint, this.controlPoint1, this.controlPoint2, this.endPoint);
            case 'control1':
                return new CubicCurve(this.startPoint, newPoint, this.controlPoint2, this.endPoint);
            case 'control2':
                return new CubicCurve(this.startPoint, this.controlPoint1, newPoint, this.endPoint);
            case 'end':
                return new CubicCurve(this.startPoint, this.controlPoint1, this.controlPoint2, newPoint);
            default:
                throw new Error(`CubicCurve segments do not support control point type: ${controlPointType}`);
        }
    }
}
