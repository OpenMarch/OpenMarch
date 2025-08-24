import {
    IControllableSegment,
    Point,
    SegmentJsonData,
    ControlPointType,
    ControlPoint,
} from "../interfaces";

/**
 * Represents a spline segment that preserves original spline data.
 * This segment type stores the original spline parameters and can convert to SVG
 * while maintaining the spline data in JSON serialization.
 */
export class Spline implements IControllableSegment {
    readonly type = "spline";

    private _svgApproximation: string | null = null;
    private _length: number | null = null;

    // Override properties for start and end points
    public startPointOverride?: Point;
    public endPointOverride?: Point;

    constructor(
        public readonly _controlPoints: Point[],
        public readonly degree: number = 3,
        public readonly knots?: number[],
        public readonly weights?: number[],
        public readonly closed: boolean = false,
        public readonly tension: number = 0.5, // For catmull-rom splines
    ) {
        if (_controlPoints.length < 2) {
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

    getStartPoint(): Point {
        return this.controlPoints[0];
    }

    getEndPoint(): Point {
        return this.controlPoints[this.controlPoints.length - 1];
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

        // For Catmull-Rom with n points, we create n-1 segments
        // Each segment goes from point i to point i+1
        const numSegments = n - 1;
        const scaledT = t * numSegments;
        const segmentIndex = Math.floor(scaledT);
        const localT = scaledT - segmentIndex;

        // Ensure we don't go beyond the valid segments
        if (segmentIndex >= numSegments) {
            return { ...points[n - 1] };
        }

        // For each segment, we need 4 control points: p0, p1, p2, p3
        // where the curve goes from p1 to p2
        let p0, p1, p2, p3;

        if (segmentIndex === 0) {
            // First segment: curve from p1 to p2
            p0 = points[0]; // Use first point twice for smooth start
            p1 = points[0];
            p2 = points[1];
            p3 = points[2];
        } else if (segmentIndex === numSegments - 1) {
            // Last segment: curve from p1 to p2
            p0 = points[segmentIndex - 1];
            p1 = points[segmentIndex];
            p2 = points[segmentIndex + 1];
            p3 = points[segmentIndex + 1]; // Use last point twice for smooth end
        } else {
            // Middle segments: normal case
            p0 = points[segmentIndex - 1];
            p1 = points[segmentIndex];
            p2 = points[segmentIndex + 1];
            p3 = points[segmentIndex + 2];
        }

        // Catmull-Rom interpolation formula
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
        const points = this.controlPoints;
        const n = points.length;
        if (n < 2) return "";

        let pathData = `M ${points[0].x} ${points[0].y}`;

        if (n === 2) {
            pathData += ` L ${points[1].x} ${points[1].y}`;
            if (this.closed) {
                pathData += " Z";
            }
            return pathData;
        }

        if (this.closed) {
            for (let i = 0; i < n; i++) {
                const p0 = points[(i - 1 + n) % n];
                const p1 = points[i];
                const p2 = points[(i + 1) % n];
                const p3 = points[(i + 2) % n];

                const cp1x = p1.x + (p2.x - p0.x) / 6;
                const cp1y = p1.y + (p2.y - p0.y) / 6;
                const cp2x = p2.x - (p3.x - p1.x) / 6;
                const cp2y = p2.y - (p3.y - p1.y) / 6;

                pathData += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
            }
            pathData += " Z";
        } else {
            // Open spline
            for (let i = 0; i < n - 1; i++) {
                const p0 = points[i > 0 ? i - 1 : 0];
                const p1 = points[i];
                const p2 = points[i + 1];
                const p3 = points[i < n - 2 ? i + 2 : n - 1];

                const cp1x = p1.x + (p2.x - p0.x) / 6;
                const cp1y = p1.y + (p2.y - p0.y) / 6;
                const cp2x = p2.x - (p3.x - p1.x) / 6;
                const cp2y = p2.y - (p3.y - p1.y) / 6;

                pathData += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
            }
        }

        return pathData;
    }

    toJson(): SegmentJsonData {
        const startPoint = this.startPointOverride || this.getStartPoint();
        const endPoint = this.endPointOverride || this.getEndPoint();
        const controlPoints = this.controlPoints.map((p) => ({ ...p }));
        if (startPoint !== controlPoints[0]) {
            controlPoints[0] = { ...startPoint };
        }
        if (endPoint !== controlPoints[controlPoints.length - 1]) {
            controlPoints[controlPoints.length - 1] = { ...endPoint };
        }
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

    fromJson(data: SegmentJsonData): IControllableSegment {
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

    get controlPoints(): Point[] {
        return this.getControlPoints(0).map((cp) => cp.point);
    }

    // IControllableSegment implementation
    getControlPoints(segmentIndex: number): ControlPoint[] {
        const controlPoints = this._controlPoints.map((point, index) => ({
            id: `cp-${segmentIndex}-spline-point-${index}`,
            point: { ...point },
            segmentIndex,
            type: "spline-point" as ControlPointType,
            pointIndex: index,
        }));

        // Apply overrides if provided
        if (this.startPointOverride && controlPoints.length > 0) {
            controlPoints[0].point = { ...this.startPointOverride };
        }
        if (this.endPointOverride && controlPoints.length > 0) {
            controlPoints[controlPoints.length - 1].point = {
                ...this.endPointOverride,
            };
        }

        return controlPoints;
    }

    updateControlPoint(
        controlPointType: ControlPointType,
        pointIndex: number | undefined,
        newPoint: Point,
    ): IControllableSegment {
        if (controlPointType !== "spline-point" || pointIndex === undefined) {
            throw new Error(
                `Spline segments only support 'spline-point' control points with a valid pointIndex`,
            );
        }

        if (pointIndex < 0 || pointIndex >= this.controlPoints.length) {
            throw new Error(
                `Invalid pointIndex ${pointIndex} for spline with ${this.controlPoints.length} control points`,
            );
        }

        // Create a new array with the updated control point
        const newControlPoints = [...this.controlPoints];
        newControlPoints[pointIndex] = { ...newPoint };

        return new Spline(
            newControlPoints,
            this.degree,
            this.knots,
            this.weights,
            this.closed,
            this.tension,
        );
    }
}
