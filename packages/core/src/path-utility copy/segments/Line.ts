import { getMidpoint } from "../geometry-utils";
import {
    type Point,
    type SegmentJsonData,
    type ControlPoint,
} from "../interfaces";

const pointsAreEqual = (point1: Point, point2: Point) => {
    return point1.x === point2.x && point1.y === point2.y;
};
const pointToString = (point: Point) => {
    return `{ x: ${point.x}, y: ${point.y} }`;
};

/**
 * Represents a polyline: straight line segments through a sequence of control points.
 * Uses the same control-point array pattern as Spline (multiple points, same API).
 */
export class Line {
    readonly type = "line" as "line" | "spline";

    /** Subscribers to changes in the position of control points. */
    protected _moveSubscribers: Set<() => void> = new Set();
    /** Subscribers to changes in the number of control points. */
    protected _countSubscribers: Set<() => void> = new Set();

    protected _controlPoints: Point[];
    protected _splitPoints: Point[] = [];

    constructor(controlPoints: Point[]) {
        if (controlPoints.length < 2) {
            throw new Error("A segment must have at least 2 control points");
        }
        this._controlPoints = controlPoints;
        this.calculateSplitPoints();
    }

    connectToPreviousSegment(previousSegment: Line): void {
        const currentSegmentStartPoint = this.getStartPoint();
        const previousSegmentEndPoint = previousSegment.getEndPoint();
        if (!pointsAreEqual(currentSegmentStartPoint, previousSegmentEndPoint))
            console.error(
                `Segments are not connected. Previous segment end point: ${pointToString(previousSegmentEndPoint)}. Current segment start point: ${pointToString(currentSegmentStartPoint)}. Automatically connecting them`,
            );

        this._controlPoints = [
            { ...currentSegmentStartPoint },
            ...this._controlPoints.slice(1),
        ];
    }

    /** Returns the start point of this segment. */
    getStartPoint(): Point {
        return this._controlPoints[0]!;
    }

    /** Returns the end point of this segment. */
    getEndPoint(): Point {
        return this._controlPoints[this._controlPoints.length - 1]!;
    }

    /**
     * Points that split the control points of the segment
     */
    get splitPoints(): Point[] {
        return this._splitPoints;
    }

    protected calculateSplitPoints(): void {
        const splitPoints: Point[] = [];
        for (let i = 0; i < this._controlPoints.length - 1; i++) {
            splitPoints.push(
                getMidpoint(
                    this._controlPoints[i]!,
                    this._controlPoints[i + 1]!,
                ),
            );
        }
        this._splitPoints = splitPoints;
    }

    /** Length of segment from point i to i+1. */
    protected segmentLength(i: number): number {
        const a = this._controlPoints[i]!;
        const b = this._controlPoints[i + 1]!;
        return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
    }

    toPathString(includeMoveTo: boolean): string {
        const n = this._controlPoints.length;
        if (n < 2) return "";
        const parts: string[] = [];
        for (let i = 0; i < n; i++) {
            const p = this._controlPoints[i]!;
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
                const a = this._controlPoints[i]!;
                const b = this._controlPoints[i + 1]!;
                return {
                    x: a.x + t * (b.x - a.x),
                    y: a.y + t * (b.y - a.y),
                };
            }
            remaining -= segLen;
        }
        return { ...this.getEndPoint() };
    }

    /** Returns an array of equidistant points along the whole path. Start and end points are included. */
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

    toJson(): SegmentJsonData {
        return {
            type: this.type,
            points: this._controlPoints,
        };
    }

    static fromJson(data: SegmentJsonData): Line {
        return new Line(data.points.map((p: Point) => ({ ...p })));
    }

    get controlPoints(): Point[] {
        return this._controlPoints;
    }

    getControlPointsWithData(): ControlPoint[] {
        const controlPoints = this._controlPoints.map((point, index) => ({
            point,
            pointIndex: index,
        }));

        return controlPoints;
    }

    updateControlPoint(pointIndex: number, newPoint: Point): void {
        if (pointIndex < 0 || pointIndex >= this._controlPoints.length) {
            throw new Error(
                `Invalid pointIndex ${pointIndex} for line with ${this._controlPoints.length} control points`,
            );
        }

        this._controlPoints[pointIndex]!.x = newPoint.x;
        this._controlPoints[pointIndex]!.y = newPoint.y;
        this.calculateSplitPoints();
        this.notifyMoveSubscribers();
    }

    /**
     * Creates two new lines by splitting this line in half.
     */
    createControlPointInBetweenPoints(splitPointIndex: number): void {
        if (splitPointIndex < 0)
            throw new Error("Split point index must be >= 0");
        if (splitPointIndex >= this._splitPoints.length)
            throw new Error(
                "Split point index must be < split points length - 1",
            );

        const splitPoint = this._splitPoints[splitPointIndex]!;

        this._controlPoints.splice(splitPointIndex + 1, 0, splitPoint);
        this.calculateSplitPoints();

        this.notifyCountSubscribers();
    }

    removeControlPoint(pointIndex: number): void {
        if (pointIndex < 0 || pointIndex >= this._controlPoints.length) {
            throw new Error(
                `Invalid pointIndex ${pointIndex} for line with ${this._controlPoints.length} control points`,
            );
        }
        this._controlPoints.splice(pointIndex, 1);

        this.calculateSplitPoints();
        this.notifyCountSubscribers();
    }

    /**
     * Subscribes to changes in the line.
     * @param callback - The callback to call when the line changes.
     * @returns A function to unsubscribe from the line.
     */
    subscribeToMove(callback: () => void): () => void {
        this._moveSubscribers.add(callback);
        return () => this._moveSubscribers.delete(callback);
    }

    notifyMoveSubscribers(): void {
        this._moveSubscribers.forEach((callback) => callback());
    }

    subscribeToCount(callback: () => void): () => void {
        this._countSubscribers.add(callback);
        return () => this._countSubscribers.delete(callback);
    }

    notifyCountSubscribers(): void {
        this._countSubscribers.forEach((callback) => callback());
    }
}
