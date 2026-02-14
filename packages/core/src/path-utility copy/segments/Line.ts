import { getMidpoint } from "../geometry-utils";
import {
    type Point,
    type SegmentJsonData,
    type ControlPoint,
    type SegmentType,
} from "../interfaces";

const pointsAreEqual = (point1: Point, point2: Point) => {
    return point1[0] === point2[0] && point1[1] === point2[1];
};

const pointToString = (point: Point) => {
    return `{ x: ${point[0]}, y: ${point[1]}`;
};

/** Threshold for snapping to zero to avoid floating-point artifacts (e.g. ±0, de-normalized floats). */
const ZERO_THRESHOLD = 2e-5;

const snapToZero = (x: number): number =>
    Math.abs(x) < ZERO_THRESHOLD ? 0 : x;

export type NewSegment = {
    /** The points of the new segment */
    points: Point[];
    /** True if this segment should use the old type of the segment */
    useOldType: boolean;
};

/**
 * Represents a polyline: straight line segments through a sequence of control points.
 * Uses the same control-point array pattern as Spline (multiple points, same API).
 */
export class Line {
    readonly type = "linear" as SegmentType;

    /** Subscribers to changes in the position of control points. */
    protected _moveSubscribers: Set<() => void> = new Set();
    /** Subscribers to changes in the number of control points. */
    protected _countSubscribers: Set<() => void> = new Set();

    protected _controlPoints: Point[];
    protected _splitPoints: Point[] = [];

    /**
     *
     * @param controlPoints - The control points of the segment with relative coordinates to the transform point
     * @param transform - The transform point of the segment
     * @throws If the number of control points is less than 2
     */
    constructor(controlPoints: Point[]) {
        if (controlPoints.length < 2) {
            throw new Error("A segment must have at least 2 control points");
        }
        this._controlPoints = [...controlPoints];
        this.calculateSplitPoints();
    }

    assertPointIndexIsValid(pointIndex: number): boolean {
        const isValid =
            pointIndex >= 0 && pointIndex < this._controlPoints.length;
        if (!isValid)
            throw new Error(
                `Invalid point index: ${pointIndex} for segment, segment has ${this._controlPoints.length} control points`,
            );
        return isValid;
    }

    assertSplitPointIndexIsValid(splitPointIndex: number): boolean {
        const isValid =
            splitPointIndex >= 0 && splitPointIndex < this._splitPoints.length;
        if (!isValid)
            throw new Error(
                `Invalid split point index: ${splitPointIndex} for segment, segment has ${this._splitPoints.length} split points`,
            );
        return isValid;
    }

    connectToPreviousSegment(previousSegment: Line): void {
        const currentSegmentStartPoint = this.getStartPoint();
        const previousSegmentEndPoint = previousSegment.getEndPoint();
        if (!pointsAreEqual(currentSegmentStartPoint, previousSegmentEndPoint))
            console.error(
                `Segments are not connected. Previous segment end point: ${pointToString(previousSegmentEndPoint)}. Current segment start point: ${pointToString(currentSegmentStartPoint)}. Automatically connecting them`,
            );

        this._controlPoints = [
            [...currentSegmentStartPoint],
            ...this._controlPoints.slice(1),
        ];
    }

    /** Returns the start point of this segment (snapped to avoid ±0 / de-normal floats). */
    getStartPoint(): Point {
        const p = this._controlPoints[0]!;
        return [snapToZero(p[0]), snapToZero(p[1])];
    }

    zeroStartPoint(): void {
        this._controlPoints[0] = [0, 0];
        this.notifyMoveSubscribers();
        this.calculateSplitPoints();
    }

    /** Returns the end point of this segment. */
    getEndPoint(): Point {
        return this._controlPoints[this._controlPoints.length - 1]!;
    }

    isValidPointIndex(pointIndex: number): boolean {
        return pointIndex >= 0 && pointIndex < this._controlPoints.length;
    }

    isFirstPoint(pointIndex: number): boolean {
        return pointIndex === 0;
    }

    isLastPoint(pointIndex: number): boolean {
        return pointIndex === this._controlPoints.length - 1;
    }

    applyTransformToAllPoints(transform: Point): void {
        const newPoints: Point[] = this._controlPoints.slice(1).map((point) => {
            return [
                snapToZero(point[0] - transform[0]),
                snapToZero(point[1] - transform[1]),
            ];
        });
        this._controlPoints = [[0, 0], ...newPoints];
    }

    /**
     * Points that split the control points of the segment
     */
    get splitPoints(): Point[] {
        return this._splitPoints;
    }

    addControlPointToStart(point: Point): void {
        this._controlPoints.unshift(point);
        this.calculateSplitPoints();
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
        return Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2);
    }

    toSvgString(transform: Point = [0, 0], omitFirst: boolean = false): string {
        const n = this._controlPoints.length;
        if (n < 2) return "";
        const parts: string[] = [];
        for (let i = omitFirst ? 1 : 0; i < n; i++) {
            const p = this._controlPoints[i]!;
            parts.push(`L ${p[0] + transform[0]} ${p[1] + transform[1]}`);
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
                return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
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
        return this._controlPoints.map((p, i) =>
            i === 0 ? ([snapToZero(p[0]), snapToZero(p[1])] as Point) : p,
        );
    }

    getControlPointsWithData({
        previousSegmentType,
        nextSegmentType,
    }: {
        previousSegmentType?: SegmentType;
        nextSegmentType?: SegmentType;
    } = {}): ControlPoint[] {
        const controlPoints = this._controlPoints.map((point, index) => ({
            point:
                index === 0
                    ? ([snapToZero(point[0]), snapToZero(point[1])] as Point)
                    : point,
            pointIndex: index,
            type: this.type,
        }));

        // Default to surrounding segment types to be linear when curved in the middle
        if (this.type === "curved") {
            if (previousSegmentType === "linear")
                controlPoints[0]!.type = "linear";
            if (nextSegmentType === "linear")
                controlPoints[controlPoints.length - 1]!.type = "linear";
        }

        return controlPoints;
    }

    updateControlPoint(pointIndex: number, newPoint: Point): void {
        if (pointIndex < 0 || pointIndex >= this._controlPoints.length) {
            throw new Error(
                `Invalid pointIndex ${pointIndex} for line with ${this._controlPoints.length} control points`,
            );
        }

        this._controlPoints[pointIndex]![0] = newPoint[0];
        this._controlPoints[pointIndex]![1] = newPoint[1];
        this.calculateSplitPoints();
        this.notifyMoveSubscribers();
    }

    addControlPoints(points: Point[]): void {
        this._controlPoints.push(...points);
        this.calculateSplitPoints();
        this.notifyCountSubscribers();
    }
    /**
     * @param splitPointIndex - index of the split point to split the segment on. Also the same as the prior control point index.
     * @returns An array of new segments that will need to be created. Delete this segment from the path before adding.
     */
    getNewSegmentPointsForTypeChange(splitPointIndex: number): NewSegment[] {
        this.assertSplitPointIndexIsValid(splitPointIndex);
        const splitIndex = splitPointIndex + 1;
        let output: NewSegment[];

        if (this.controlPoints.length === 2) {
            output = [{ points: this.controlPoints, useOldType: false }];
        } else if (this.controlPoints.length === 3) {
            const firstPointUsesNew = splitPointIndex === 0;
            output = [
                {
                    points: [this._controlPoints[0]!, this._controlPoints[1]!],
                    useOldType: !firstPointUsesNew,
                },
                {
                    points: [this._controlPoints[1]!, this._controlPoints[2]!],
                    useOldType: firstPointUsesNew,
                },
            ];
        } else {
            const changedEdge = [
                this._controlPoints[splitPointIndex]!,
                this._controlPoints[splitPointIndex + 1]!,
            ];
            const rest = this._controlPoints.slice(
                splitIndex,
                this._controlPoints.length,
            );
            if (splitPointIndex === 0) {
                // No "before" segment; only the changed edge and the rest
                output = [
                    { points: changedEdge, useOldType: false },
                    { points: rest, useOldType: true },
                ];
            } else if (splitPointIndex === this._controlPoints.length - 2) {
                // Last edge: no "after" segment; only the before and the changed edge
                output = [
                    {
                        points: this._controlPoints.slice(0, splitIndex),
                        useOldType: true,
                    },
                    { points: changedEdge, useOldType: false },
                ];
            } else {
                output = [
                    {
                        points: this._controlPoints.slice(0, splitIndex),
                        useOldType: true,
                    },
                    { points: changedEdge, useOldType: false },
                    { points: rest, useOldType: true },
                ];
            }
        }
        return output;
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
        if (this._controlPoints.length <= 2)
            throw new Error(
                "Cannot remove point. A line must have at least 2 control points",
            );

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

    toSimpleObject(): { type: SegmentType; points: Point[] } {
        return { type: this.type, points: this._controlPoints };
    }
}
