import {
    type IControllableSegment,
    type Point,
    type SegmentJsonData,
    type ControlPointType,
    type ControlPoint,
} from "../interfaces";

/**
 * Represents a polyline: straight line segments through a sequence of control points.
 * Uses the same control-point array pattern as Spline (multiple points, same API).
 */
export class Line implements IControllableSegment {
    readonly type = "line";

    public startPointOverride?: Point;
    public endPointOverride?: Point;

    public readonly _controlPoints: Point[];

    constructor(_controlPoints: Point[]);
    constructor(startPoint: Point, endPoint: Point);
    constructor(pointsOrStart: Point[] | Point, endPoint?: Point) {
        if (Array.isArray(pointsOrStart)) {
            if (pointsOrStart.length < 2) {
                throw new Error("Line must have at least 2 control points");
            }
            this._controlPoints = pointsOrStart.map((p) => ({ ...p }));
        } else {
            if (endPoint === undefined) {
                throw new Error("Line requires two points");
            }
            this._controlPoints = [{ ...pointsOrStart }, { ...endPoint }];
        }
    }

    /** Effective point at index i (overrides for first/last). */
    private getPointAt(i: number): Point {
        const n = this._controlPoints.length;
        if (i <= 0) return this.getStartPoint();
        if (i >= n - 1) return this.getEndPoint();
        return { ...this._controlPoints[i]! };
    }

    /** Length of segment from point i to i+1. */
    private segmentLength(i: number): number {
        const a = this.getPointAt(i);
        const b = this.getPointAt(i + 1);
        return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
    }

    private toPathString(includeMoveTo: boolean): string {
        const n = this._controlPoints.length;
        if (n < 2) return "";
        const parts: string[] = [];
        for (let i = 0; i < n; i++) {
            const p = this.getPointAt(i);
            if (i === 0 && includeMoveTo) {
                parts.push(`M ${p.x} ${p.y}`);
            } else {
                parts.push(`L ${p.x} ${p.y}`);
            }
        }
        return parts.join(" ");
    }

    getLength(): number {
        let total = 0;
        for (let i = 0; i < this._controlPoints.length - 1; i++) {
            total += this.segmentLength(i);
        }
        return total;
    }

    getPointAtLength(dist: number): Point {
        const total = this.getLength();
        if (total <= 0) return { ...this.getStartPoint() };
        if (dist <= 0) return { ...this.getStartPoint() };
        if (dist >= total) return { ...this.getEndPoint() };
        let remaining = dist;
        for (let i = 0; i < this._controlPoints.length - 1; i++) {
            const segLen = this.segmentLength(i);
            if (remaining <= segLen) {
                const t = segLen > 0 ? remaining / segLen : 0;
                const a = this.getPointAt(i);
                const b = this.getPointAt(i + 1);
                return {
                    x: a.x + t * (b.x - a.x),
                    y: a.y + t * (b.y - a.y),
                };
            }
            remaining -= segLen;
        }
        return { ...this.getEndPoint() };
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
        return this.toPathString(includeMoveTo);
    }

    toJson(): SegmentJsonData {
        return {
            type: this.type,
            data: {
                controlPoints: this._controlPoints.map((p) => ({ ...p })),
            },
        };
    }

    fromJson(data: SegmentJsonData): IControllableSegment {
        if (data.type !== "line") {
            throw new Error(
                `Cannot create Line from data of type ${data.type}`,
            );
        }
        const d = data.data;
        // Support legacy format with startPoint/endPoint
        const controlPoints =
            d.controlPoints ?? [d.startPoint, d.endPoint].filter(Boolean);
        if (controlPoints.length < 2) {
            throw new Error(
                "Line JSON must have controlPoints or startPoint and endPoint",
            );
        }
        return new Line(controlPoints.map((p: Point) => ({ ...p })));
    }

    static fromJson(data: SegmentJsonData): Line {
        const instance = new Line([
            { x: 0, y: 0 },
            { x: 1, y: 1 },
        ]);
        return instance.fromJson(data) as Line;
    }

    /**
     * Create a polyline from an array of points (all points, like Spline.fromPoints).
     */
    static fromPoints(points: Point[]): Line {
        if (points.length < 2) {
            throw new Error("Line must have at least 2 points");
        }
        return new Line(points.map((p) => ({ ...p })));
    }

    get controlPoints(): Point[] {
        return this.getControlPoints(0).map((cp) => cp.point);
    }

    getControlPoints(segmentIndex: number): ControlPoint[] {
        const controlPoints = this._controlPoints.map((point, index) => ({
            id: `cp-${segmentIndex}-line-point-${index}`,
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
        const idx =
            controlPointType === "start"
                ? 0
                : controlPointType === "end"
                  ? this._controlPoints.length - 1
                  : undefined;
        const resolvedIndex = idx ?? pointIndex;

        if (
            controlPointType !== "spline-point" &&
            controlPointType !== "start" &&
            controlPointType !== "end"
        ) {
            throw new Error(
                `Line only supports 'spline-point', 'start', or 'end', got ${controlPointType}`,
            );
        }
        if (
            resolvedIndex === undefined ||
            resolvedIndex < 0 ||
            resolvedIndex >= this._controlPoints.length
        ) {
            throw new Error(
                `Invalid pointIndex ${resolvedIndex} for line with ${this._controlPoints.length} control points`,
            );
        }

        const newControlPoints = [...this._controlPoints];
        newControlPoints[resolvedIndex] = { ...newPoint };

        return new Line(newControlPoints);
    }
}
