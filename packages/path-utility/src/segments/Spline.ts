import { IPathSegment, Point, SegmentJsonData } from "../interfaces";

/**
 * Represents a spline segment that preserves original spline data.
 * This segment type stores the original spline parameters and can convert to SVG
 * while maintaining the spline data in JSON serialization.
 */
export class Spline implements IPathSegment {
    readonly type = "spline";

    private _svgApproximation: string | null = null;
    private _length: number | null = null;

    constructor(
        public readonly controlPoints: Point[],
        public readonly degree: number = 3,
        public readonly knots?: number[],
        public readonly weights?: number[],
        public readonly closed: boolean = false,
        public readonly tension: number = 0.5, // For catmull-rom splines
    ) {
        if (controlPoints.length < 2) {
            throw new Error("Spline must have at least 2 control points");
        }
    }

    getLength(): number {
        if (this._length === null) {
            this._length = this.calculateLength();
        }
        return this._length;
    }

    private calculateLength(): number {
        // Approximate length by sampling points along the spline
        const samples = Math.max(50, this.controlPoints.length * 10);
        let length = 0;
        let prevPoint = this.getPointAtT(0);

        for (let i = 1; i <= samples; i++) {
            const t = i / samples;
            const currentPoint = this.getPointAtT(t);
            const dx = currentPoint.x - prevPoint.x;
            const dy = currentPoint.y - prevPoint.y;
            length += Math.sqrt(dx * dx + dy * dy);
            prevPoint = currentPoint;
        }

        return length;
    }

    getPointAtLength(dist: number): Point {
        const totalLength = this.getLength();
        if (totalLength === 0) return { ...this.controlPoints[0] };

        const t = Math.max(0, Math.min(1, dist / totalLength));
        return this.getPointAtT(t);
    }

    private getPointAtT(t: number): Point {
        // Implement B-spline evaluation or fall back to Catmull-Rom for simplicity
        if (this.degree === 3 && !this.knots) {
            return this.catmullRomInterpolation(t);
        } else {
            return this.bSplineEvaluation(t);
        }
    }

    private catmullRomInterpolation(t: number): Point {
        const points = this.controlPoints;
        const n = points.length;

        if (n === 1) return { ...points[0] };
        if (n === 2) {
            return {
                x: points[0].x + t * (points[1].x - points[0].x),
                y: points[0].y + t * (points[1].y - points[0].y),
            };
        }

        // Scale t to the curve parameter
        const scaledT = t * (n - 1);
        const segment = Math.floor(scaledT);
        const localT = scaledT - segment;

        const i = Math.max(0, Math.min(segment, n - 2));

        // Get four control points for Catmull-Rom
        const p0 = points[Math.max(0, i - 1)];
        const p1 = points[i];
        const p2 = points[Math.min(n - 1, i + 1)];
        const p3 = points[Math.min(n - 1, i + 2)];

        const t2 = localT * localT;
        const t3 = t2 * localT;

        return {
            x:
                0.5 *
                (2 * p1.x +
                    (-p0.x + p2.x) * localT +
                    (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
                    (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
            y:
                0.5 *
                (2 * p1.y +
                    (-p0.y + p2.y) * localT +
                    (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
                    (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        };
    }

    private bSplineEvaluation(t: number): Point {
        // Simplified B-spline evaluation
        // For a more complete implementation, you would use de Boor's algorithm
        const n = this.controlPoints.length;
        const knots = this.knots || this.generateUniformKnots();

        // Find the knot span
        const span = this.findKnotSpan(t, knots);

        // Simplified evaluation - for production, implement de Boor's algorithm
        if (span >= n - 1) {
            return { ...this.controlPoints[n - 1] };
        }

        return this.catmullRomInterpolation(t); // Fallback
    }

    private generateUniformKnots(): number[] {
        const n = this.controlPoints.length;
        const m = n + this.degree + 1;
        const knots = new Array(m);

        for (let i = 0; i < m; i++) {
            if (i <= this.degree) {
                knots[i] = 0;
            } else if (i >= n) {
                knots[i] = 1;
            } else {
                knots[i] = (i - this.degree) / (n - this.degree);
            }
        }

        return knots;
    }

    private findKnotSpan(t: number, knots: number[]): number {
        const n = this.controlPoints.length - 1;

        if (t >= knots[n + 1]) return n;
        if (t <= knots[this.degree]) return this.degree;

        let low = this.degree;
        let high = n + 1;
        let mid = Math.floor((low + high) / 2);

        while (t < knots[mid] || t >= knots[mid + 1]) {
            if (t < knots[mid]) {
                high = mid;
            } else {
                low = mid;
            }
            mid = Math.floor((low + high) / 2);
        }

        return mid;
    }

    toSvgString(): string {
        if (this._svgApproximation === null) {
            this._svgApproximation = this.generateSvgApproximation();
        }
        return this._svgApproximation;
    }

    private generateSvgApproximation(): string {
        const samples = Math.max(20, this.controlPoints.length * 5);
        const points: Point[] = [];

        for (let i = 0; i <= samples; i++) {
            const t = i / samples;
            points.push(this.getPointAtT(t));
        }

        if (points.length === 0) return "";

        let pathData = `M ${points[0].x} ${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
            pathData += ` L ${points[i].x} ${points[i].y}`;
        }

        if (this.closed) {
            pathData += " Z";
        }

        return pathData;
    }

    toJson(): SegmentJsonData {
        return {
            type: this.type,
            data: {
                controlPoints: this.controlPoints.map((p) => ({ ...p })),
                degree: this.degree,
                knots: this.knots ? [...this.knots] : null,
                weights: this.weights ? [...this.weights] : null,
                closed: this.closed,
                tension: this.tension,
            },
        };
    }

    fromJson(data: SegmentJsonData): IPathSegment {
        if (data.type !== "spline") {
            throw new Error(
                `Cannot create Spline from data of type ${data.type}`,
            );
        }
        return new Spline(
            data.data.controlPoints,
            data.data.degree,
            data.data.knots,
            data.data.weights,
            data.data.closed,
            data.data.tension,
        );
    }

    static fromJson(data: SegmentJsonData): Spline {
        const instance = new Spline([
            { x: 0, y: 0 },
            { x: 1, y: 1 },
        ]);
        return instance.fromJson(data) as Spline;
    }

    /**
     * Creates a spline from an array of points using Catmull-Rom interpolation.
     */
    static fromPoints(
        points: Point[],
        tension: number = 0.5,
        closed: boolean = false,
    ): Spline {
        return new Spline(points, 3, undefined, undefined, closed, tension);
    }

    /**
     * Creates a B-spline from control points, degree, and knot vector.
     */
    static createBSpline(
        controlPoints: Point[],
        degree: number,
        knots: number[],
        weights?: number[],
    ): Spline {
        return new Spline(controlPoints, degree, knots, weights);
    }
}
