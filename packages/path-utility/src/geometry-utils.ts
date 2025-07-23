import { Point } from "./interfaces";

export function distance(p1: Point, p2: Point): number {
    return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
}

export function pointOnLine(p1: Point, p2: Point, t: number): Point {
    return {
        x: p1.x + (p2.x - p1.x) * t,
        y: p1.y + (p2.y - p1.y) * t,
    };
}

export function pointOnQuadraticBezier(p0: Point, p1: Point, p2: Point, t: number): Point {
    const oneMinusT = 1 - t;
    return {
        x: oneMinusT ** 2 * p0.x + 2 * oneMinusT * t * p1.x + t ** 2 * p2.x,
        y: oneMinusT ** 2 * p0.y + 2 * oneMinusT * t * p1.y + t ** 2 * p2.y,
    };
}

export function pointOnCubicBezier(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
    const oneMinusT = 1 - t;
    const oneMinusTSq = oneMinusT * oneMinusT;
    const tSq = t * t;

    return {
        x: oneMinusTSq * oneMinusT * p0.x + 3 * oneMinusTSq * t * p1.x + 3 * oneMinusT * tSq * p2.x + tSq * t * p3.x,
        y: oneMinusTSq * oneMinusT * p0.y + 3 * oneMinusTSq * t * p1.y + 3 * oneMinusT * tSq * p2.y + tSq * t * p3.y,
    };
}
