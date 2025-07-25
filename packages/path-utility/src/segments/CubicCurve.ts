import { IPathSegment, Point, SegmentJsonData } from '../interfaces';

/**
 * Represents a cubic Bézier curve segment with start point, two control points, and end point.
 */
export class CubicCurve implements IPathSegment {
    readonly type = 'cubic-curve';
    
    constructor(
        public readonly startPoint: Point,
        public readonly controlPoint1: Point,
        public readonly controlPoint2: Point,
        public readonly endPoint: Point
    ) {}

    getLength(): number {
        // Approximate length using adaptive subdivision
        return this.approximateLength(0, 1, this.getPointAtT(0), this.getPointAtT(1), 0.01);
    }

    private approximateLength(t1: number, t2: number, p1: Point, p2: Point, tolerance: number): number {
        const tMid = (t1 + t2) / 2;
        const pMid = this.getPointAtT(tMid);
        
        const directDistance = this.distance(p1, p2);
        const subdivisionDistance = this.distance(p1, pMid) + this.distance(pMid, p2);
        
        if (Math.abs(subdivisionDistance - directDistance) < tolerance) {
            return subdivisionDistance;
        }
        
        return this.approximateLength(t1, tMid, p1, pMid, tolerance) +
               this.approximateLength(tMid, t2, pMid, p2, tolerance);
    }

    private distance(p1: Point, p2: Point): number {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    getPointAtLength(dist: number): Point {
        const totalLength = this.getLength();
        if (totalLength === 0) return { ...this.startPoint };
        
        const targetT = Math.max(0, Math.min(1, dist / totalLength));
        
        // Use binary search to find the t value that corresponds to the target distance
        let t = this.findTForDistance(dist, 0, 1, 0.001);
        return this.getPointAtT(t);
    }

    private findTForDistance(targetDist: number, tMin: number, tMax: number, tolerance: number): number {
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
        return this.approximateLength(0, t, this.getPointAtT(0), this.getPointAtT(t), 0.01);
    }

    private getPointAtT(t: number): Point {
        // Cubic Bézier curve formula: B(t) = (1-t)³P₀ + 3(1-t)²tP₁ + 3(1-t)t²P₂ + t³P₃
        const u = 1 - t;
        const tt = t * t;
        const uu = u * u;
        const uuu = uu * u;
        const ttt = tt * t;
        
        return {
            x: uuu * this.startPoint.x + 
               3 * uu * t * this.controlPoint1.x + 
               3 * u * tt * this.controlPoint2.x + 
               ttt * this.endPoint.x,
            y: uuu * this.startPoint.y + 
               3 * uu * t * this.controlPoint1.y + 
               3 * u * tt * this.controlPoint2.y + 
               ttt * this.endPoint.y
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
                endPoint: { ...this.endPoint }
            }
        };
    }

    fromJson(data: SegmentJsonData): IPathSegment {
        if (data.type !== 'cubic-curve') {
            throw new Error(`Cannot create CubicCurve from data of type ${data.type}`);
        }
        return new CubicCurve(
            data.data.startPoint,
            data.data.controlPoint1,
            data.data.controlPoint2,
            data.data.endPoint
        );
    }

    static fromJson(data: SegmentJsonData): CubicCurve {
        const instance = new CubicCurve(
            { x: 0, y: 0 }, 
            { x: 0, y: 0 }, 
            { x: 0, y: 0 }, 
            { x: 0, y: 0 }
        );
        return instance.fromJson(data) as CubicCurve;
    }
}