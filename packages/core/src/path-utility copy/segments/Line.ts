import { getMidpoint } from "../geometry-utils";
import {
    type Point,
    type SegmentJsonData,
    type ControlPointType,
    type ControlPoint,
    ControllableSegment,
} from "../interfaces";

/**
 * Represents a polyline: straight line segments through a sequence of control points.
 * Uses the same control-point array pattern as Spline (multiple points, same API).
 */
export class Line extends ControllableSegment {
    readonly type = "line";

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

    toSvgString(includeMoveTo = false): string {
        return this.toPathString(includeMoveTo);
    }
    getMidpoint(): Point {
        const total = this.getLength();
        return this.getPointAtLength(total / 2);
    }

    static fromJson(data: SegmentJsonData): Line {
        return new Line(data.points.map((p: Point) => ({ ...p })));
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

        return controlPoints;
    }

    updateControlPoint(
        controlPointType: ControlPointType,
        pointIndex: number | undefined,
        newPoint: Point,
    ): Line {
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

    /**
     * Creates two new lines by splitting this line in half.
     */
    createControlPointInBetweenPoints(
        startingControlPointIndex: number,
    ): Point {
        if (startingControlPointIndex < 0)
            throw new Error("Starting control point index must be >= 0");
        if (startingControlPointIndex >= this._controlPoints.length - 1)
            throw new Error(
                "Starting control point index must be < control points length - 1",
            );

        const p1 = this._controlPoints[startingControlPointIndex]!;
        const p2 = this._controlPoints[startingControlPointIndex + 1]!;

        const midpoint = getMidpoint(p1, p2);

        this._controlPoints.splice(startingControlPointIndex + 1, 0, midpoint);

        return midpoint;
    }
}
