import PathCommander from "svg-path-commander";
import {
    type IControllableSegment,
    type Point,
    type SegmentJsonData,
    type ControlPointType,
    type ControlPoint,
} from "../interfaces";
import { catmullrom, type Curve } from "./CatmullRom";

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
            const pathString = this.toSvgString(true);
            const path = new PathCommander(pathString);
            this._length = path.getTotalLength();
        }
        return this._length;
    }

    getPointAtLength(dist: number): Point {
        const pathString = this.toSvgString(true);
        const path = new PathCommander(pathString);
        const point = path.getPointAtLength(dist);
        return { x: point.x, y: point.y };
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
