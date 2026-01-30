import {
    type IControllableSegment,
    type Point,
    type SegmentJsonData,
    type ControlPointType,
    type ControlPoint,
} from "../interfaces";

/**
 * A spline segment using Catmull-Rom interpolation through control points.
 * Converts to cubic Béziers for SVG. Alpha: 0 = uniform, 0.5 = centripetal,
 * 1 = chordal.
 */
export class Spline implements IControllableSegment {
    readonly type = "spline";

    private _svgApproximation: string | null = null;
    private _length: number | null = null;

    public startPointOverride?: Point;
    public endPointOverride?: Point;

    constructor(
        public readonly _controlPoints: Point[],
        public readonly alpha: number = 0.5,
        public readonly closed: boolean = false,
    ) {
        if (_controlPoints.length < 2) {
            throw new Error("Spline must have at least 2 control points");
        }
    }

    private getCurves(): Curve[] {
        return catmullrom(
            this._controlPoints.map((p) => ({ x: p.x, y: p.y })),
            this.alpha,
        );
    }

    private toPathString(includeMoveTo: boolean): string {
        const curves = this.getCurves();
        if (curves.length === 0) return "";

        const parts: string[] = [];
        for (let i = 0; i < curves.length; i++) {
            const [p0, p1, p2, p3] = curves[i]!;
            if (i === 0 && includeMoveTo) {
                parts.push(
                    `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y}`,
                );
            } else {
                parts.push(`C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y}`);
            }
        }
        if (this.closed) {
            parts.push(" Z");
        }
        return parts.join(" ");
    }

    getLength(): number {
        if (this._length === null) {
            const curves = this.getCurves();
            this._length = curves.reduce(
                (acc, curve) => acc + cubicBezierArcLength(curve),
                0,
            );
        }
        return this._length;
    }

    getPointAtLength(dist: number): Point {
        const curves = this.getCurves();
        if (curves.length === 0) return this.getStartPoint();
        const total = this.getLength();
        if (dist <= 0) return { ...curves[0]![0] };
        if (dist >= total) return { ...curves[curves.length - 1]![3] };
        let remaining = dist;
        for (let i = 0; i < curves.length; i++) {
            const curve = curves[i]!;
            const segLen = cubicBezierArcLength(curve);
            if (remaining <= segLen) {
                const t = cubicBezierTAtLength(curve, remaining);
                const p = cubicBezierPointAt(curve, t);
                return { x: p.x, y: p.y };
            }
            remaining -= segLen;
        }
        const last = curves[curves.length - 1]!;
        return { ...last[3] };
    }

    getEquidistantPoints(numberOfPoints: number): Point[] {
        if (numberOfPoints <= 0) return [];
        if (numberOfPoints === 1) return [this.getStartPoint()];

        const totalLength = this.getLength();
        const points: Point[] = [];

        for (let i = 0; i < numberOfPoints; i++) {
            const t = i / (numberOfPoints - 1);
            const dist = t * totalLength;
            points.push(this.getPointAtLength(dist));
        }

        return points;
    }

    getStartPoint(): Point {
        return this.startPointOverride ?? { ...this._controlPoints[0]! };
    }

    getEndPoint(): Point {
        return (
            this.endPointOverride ?? {
                ...this._controlPoints[this._controlPoints.length - 1]!,
            }
        );
    }

    toSvgString(includeMoveTo = false): string {
        if (this._svgApproximation === null) {
            this._svgApproximation = this.toPathString(true);
        }
        if (includeMoveTo) {
            return this._svgApproximation;
        }
        const curves = this.getCurves();
        if (curves.length === 0) return "";
        const parts: string[] = [];
        for (let i = 0; i < curves.length; i++) {
            const [, p1, p2, p3] = curves[i]!;
            parts.push(`C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y}`);
        }
        if (this.closed) {
            parts.push(" Z");
        }
        return parts.join(" ");
    }

    toJson(): SegmentJsonData {
        return {
            type: this.type,
            data: {
                controlPoints: this._controlPoints.map((p) => ({ ...p })),
                alpha: this.alpha,
                closed: this.closed,
            },
        };
    }

    fromJson(data: SegmentJsonData): IControllableSegment {
        if (data.type !== "spline") {
            throw new Error(
                `Cannot create Spline from data of type ${data.type}`,
            );
        }
        const d = data.data;
        const alpha = d.alpha ?? (d.tension !== undefined ? d.tension : 0.5);
        return new Spline(d.controlPoints, alpha, d.closed ?? false);
    }

    static fromJson(data: SegmentJsonData): Spline {
        const instance = new Spline(
            [
                { x: 0, y: 0 },
                { x: 1, y: 1 },
            ],
            0.5,
            false,
        );
        return instance.fromJson(data) as Spline;
    }

    /**
     * Create a spline from an array of points (Catmull-Rom interpolation).
     */
    static fromPoints(
        points: Point[],
        alpha: number = 0.5,
        closed: boolean = false,
    ): Spline {
        return new Spline(
            points.map((p) => ({ ...p })),
            alpha,
            closed,
        );
    }

    get controlPoints(): Point[] {
        return this.getControlPoints(0).map((cp) => cp.point);
    }

    getControlPoints(segmentIndex: number): ControlPoint[] {
        const controlPoints = this._controlPoints.map((point, index) => ({
            id: `cp-${segmentIndex}-spline-point-${index}`,
            point: { ...point },
            segmentIndex,
            type: "spline-point" as ControlPointType,
            pointIndex: index,
        }));

        if (this.startPointOverride && controlPoints.length > 0) {
            controlPoints[0]!.point = { ...this.startPointOverride };
        }
        if (this.endPointOverride && controlPoints.length > 0) {
            controlPoints[controlPoints.length - 1]!.point = {
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
                `Spline only supports 'spline-point' control points with a valid pointIndex`,
            );
        }

        if (pointIndex < 0 || pointIndex >= this._controlPoints.length) {
            throw new Error(
                `Invalid pointIndex ${pointIndex} for spline with ${this._controlPoints.length} control points`,
            );
        }

        const newControlPoints = [...this._controlPoints];
        newControlPoints[pointIndex] = { ...newPoint };

        return new Spline(newControlPoints, this.alpha, this.closed);
    }
}

export type IPoint = {
    x: number;
    y: number;
};

export type Curve = [p0: IPoint, p1: IPoint, p2: IPoint, p3: IPoint];

/** Cubic Bézier derivative at t: B'(t) = 3(1-t)²(P1-P0) + 6(1-t)t(P2-P1) + 3t²(P3-P2) */
function cubicBezierDerivative(
    [p0, p1, p2, p3]: Curve,
    t: number,
): { x: number; y: number } {
    const u = 1 - t;
    const u2 = u * u;
    const u1 = u;
    const t2 = t * t;
    return {
        x:
            3 * u2 * (p1.x - p0.x) +
            6 * u1 * t * (p2.x - p1.x) +
            3 * t2 * (p3.x - p2.x),
        y:
            3 * u2 * (p1.y - p0.y) +
            6 * u1 * t * (p2.y - p1.y) +
            3 * t2 * (p3.y - p2.y),
    };
}

/** Point on cubic Bézier at t: B(t) = (1-t)³P0 + 3(1-t)²t P1 + 3(1-t)t² P2 + t³P3 */
function cubicBezierPointAt([p0, p1, p2, p3]: Curve, t: number): IPoint {
    const u = 1 - t;
    const u3 = u * u * u;
    const u2 = u * u;
    const t2 = t * t;
    const t3 = t * t * t;
    return {
        x: u3 * p0.x + 3 * u2 * t * p1.x + 3 * u * t2 * p2.x + t3 * p3.x,
        y: u3 * p0.y + 3 * u2 * t * p1.y + 3 * u * t2 * p2.y + t3 * p3.y,
    };
}

/** Speed |B'(t)| */
function cubicBezierSpeed(curve: Curve, t: number): number {
    const d = cubicBezierDerivative(curve, t);
    return Math.sqrt(d.x * d.x + d.y * d.y);
}

/** Gauss-Legendre n=5 nodes and weights for [0,1] */
const GL5_NODES = [0.5, 0.23076534, 0.76923466, 0.04691008, 0.95308992];
const GL5_WEIGHTS = [
    0.28444444, 0.23931434, 0.23931434, 0.11846344, 0.11846344,
];

/** Arc length of cubic Bézier segment from t0 to t1 (Gauss-Legendre n=5). */
function cubicBezierArcLengthBetween(
    curve: Curve,
    t0: number,
    t1: number,
): number {
    const scale = (t1 - t0) / 2;
    const mid = (t0 + t1) / 2;
    let sum = 0;
    for (let i = 0; i < GL5_NODES.length; i++) {
        const t = mid + scale * (GL5_NODES[i]! * 2 - 1);
        sum += GL5_WEIGHTS[i]! * cubicBezierSpeed(curve, t);
    }
    return (t1 - t0) * 0.5 * sum;
}

/** Total arc length of cubic Bézier segment. */
function cubicBezierArcLength(curve: Curve): number {
    return cubicBezierArcLengthBetween(curve, 0, 1);
}

/** Find t in [0,1] such that arc length from 0 to t equals targetLength (bisection). */
function cubicBezierTAtLength(curve: Curve, targetLength: number): number {
    const total = cubicBezierArcLength(curve);
    if (targetLength <= 0) return 0;
    if (targetLength >= total) return 1;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        const len = cubicBezierArcLengthBetween(curve, 0, mid);
        if (len < targetLength) lo = mid;
        else hi = mid;
    }
    return (lo + hi) / 2;
}

/**
 * Interpolates a Catmull-Rom Spline through a series of x/y points
 * Converts the CR Spline to Cubic Beziers for use with SVG items
 *
 * If 'alpha' is 0.0 then the 'Uniform' varian is used
 * If 'alpha' is 0.5 then the 'Centripetal' variant is used
 * If 'alpha' is 1 then the 'Chordal' variant is used
 *
 *
 * Based on http://www.cemyuksel.com/research/catmullrom_param/catmullrom.pdf
 *
 */
/**
 * When alpha is 0, use uniform parameterization (d = 1 for all segments).
 */
export const catmullrom = (data: IPoint[], alpha: number): Curve[] => {
    const result: Curve[] = [];
    if (data.length < 2) return result;

    let lastStartPoint: IPoint = { ...data[0]! };

    const length = data.length;
    const alpha2 = alpha * 2;

    for (let i = 0; i < length - 1; i++) {
        const p0: IPoint = i === 0 ? data[0]! : data[i - 1]!;
        const p1: IPoint = data[i]!;
        const p2: IPoint = data[i + 1]!;
        const p3: IPoint = i + 2 < length ? data[i + 2]! : p2;

        // C-R knots are defined as
        // t_{i+1} = | P_{i+1} - P_{i} | ^ alpha + t_{i} where alpha ∈ [0,1], t_{0} = 0
        // alpha -> 𝛂

        // now lest use parameter values as
        // d_{i+1} = | P_{i+1} - P_{i} |  where d_{0} = 0
        // When alpha is 0 (uniform), use d = 1 for all segments.

        const d1 =
            alpha === 0
                ? 1
                : Math.sqrt((p0.x - p1.x) ** 2 + (p0.y - p1.y) ** 2);
        const d2 =
            alpha === 0
                ? 1
                : Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
        const d3 =
            alpha === 0
                ? 1
                : Math.sqrt((p2.x - p3.x) ** 2 + (p2.y - p3.y) ** 2);

        // Bezier control point can be calculated as follows
        // B_0 = P_1
        // B_1 = [ -d_2^2𝛂⋅P_0 + (2⋅d_1^2𝛂 + 3⋅d_1^𝛂⋅d_2^𝛂 + d_2^2^𝛂)⋅P_1  + d_1^2𝛂⋅P_2 ] / [ 3⋅d_1^𝛂⋅(d_1^𝛂 + d_2^𝛂) ]
        // B_2 = [ -d_2^2𝛂⋅P_3 + (2⋅d_3^2𝛂 + 3⋅d_3^𝛂⋅d_2^𝛂 + d_2^2^𝛂)⋅P_1  + d_3^2𝛂⋅P_1 ] / [ 3⋅d_3^𝛂⋅(d_3^𝛂 + d_2^𝛂) ]
        // B_3 = P_2
        //
        //
        // Which can be written as conversion matrix
        // A = 2⋅d1^2𝛂 + 3⋅d1^𝛂⋅d2^𝛂 + d3^2𝛂
        // B = 2⋅d3^2𝛂 + 3⋅d3^𝛂⋅d2^𝛂 + d2^2𝛂

        //                          [   0             1            0          0          ]   [ P_0 ]
        // [ B_0, B_1, B_2, B_3 ] = [   -d2^2𝛂 /N     A/N          d1^2𝛂 /N   0          ] ⋅ [ P_1 ]
        //                          [   0             d3^2𝛂 /M     B/M        -d2^2𝛂 /M  ]   [ P_2 ]
        //                          [   0             0            1          0          ]   [ P_3 ]

        // Apply parametrization
        const d3powA = Math.pow(d3, alpha);
        const d3pow2A = Math.pow(d3, alpha2);
        const d2powA = Math.pow(d2, alpha);
        const d2pow2A = Math.pow(d2, alpha2);
        const d1powA = Math.pow(d1, alpha);
        const d1pow2A = Math.pow(d1, alpha2);

        const A = 2 * d1pow2A + 3 * d1powA * d2powA + d2pow2A;
        const B = 2 * d3pow2A + 3 * d3powA * d2powA + d2pow2A;

        let N = 3 * d1powA * (d1powA + d2powA);
        if (N > 0) {
            N = 1 / N;
        }

        let M = 3 * d3powA * (d3powA + d2powA);
        if (M > 0) {
            M = 1 / M;
        }

        let bp1: IPoint = {
            x: (-d2pow2A * p0.x + A * p1.x + d1pow2A * p2.x) * N,
            y: (-d2pow2A * p0.y + A * p1.y + d1pow2A * p2.y) * N,
        };

        let bp2: IPoint = {
            x: (d3pow2A * p1.x + B * p2.x - d2pow2A * p3.x) * M,
            y: (d3pow2A * p1.y + B * p2.y - d2pow2A * p3.y) * M,
        };

        if (bp1.x === 0 && bp1.y === 0) {
            bp1 = { ...p1 };
        }

        if (bp2.x === 0 && bp2.y === 0) {
            bp2 = { ...p2 };
        }

        result.push([{ ...lastStartPoint }, bp1, bp2, { ...p2 }]);

        lastStartPoint = { ...p2 };
    }

    return result;
};
