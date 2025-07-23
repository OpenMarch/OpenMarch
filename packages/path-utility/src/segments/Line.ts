import { IPathSegment, Point } from "../interfaces";
import { distance, pointOnLine } from "../geometry-utils";

export class Line implements IPathSegment {
    readonly startPoint: Point;
    readonly endPoint: Point;

    constructor(startPoint: Point, endPoint: Point) {
        this.startPoint = startPoint;
        this.endPoint = endPoint;
    }

    getLength(): number {
        return distance(this.startPoint, this.endPoint);
    }

    getPointAtLength(dist: number): Point {
        const length = this.getLength();
        if (dist <= 0) {
            return { ...this.startPoint };
        }
        if (dist >= length) {
            return { ...this.endPoint };
        }

        const t = dist / length;
        return pointOnLine(this.startPoint, this.endPoint, t);
    }

    toSvgCommand(): string {
        return `L ${this.endPoint.x} ${this.endPoint.y}`;
    }
}
