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

    getPointAtLength(distance: number): Point {
        const length = this.getLength();
        if (length === 0) {
            return { ...this.startPoint };
        }
        const t = distance / length;
        return pointOnLine(this.startPoint, this.endPoint, t);
    }

    toSvgCommand(): string {
        return `L ${this.endPoint.x} ${this.endPoint.y}`;
    }
}
