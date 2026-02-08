import type { Point } from "./interfaces";

/**
 * Returns the midpoint of two points.
 */
export const getMidpoint = (p1: Point, p2: Point): Point => {
    return [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
};

export function distance(p1: Point, p2: Point): number {
    return Math.sqrt((p2[0] - p1[0]) ** 2 + (p2[1] - p1[1]) ** 2);
}

export function pointOnLine(p1: Point, p2: Point, t: number): Point {
    return [p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t];
}

export function pointOnQuadraticBezier(
    p0: Point,
    p1: Point,
    p2: Point,
    t: number,
): Point {
    const oneMinusT = 1 - t;
    return [
        oneMinusT ** 2 * p0[0] + 2 * oneMinusT * t * p1[0] + t ** 2 * p2[0],
        oneMinusT ** 2 * p0[1] + 2 * oneMinusT * t * p1[1] + t ** 2 * p2[1],
    ];
}

export function pointOnCubicBezier(
    p0: Point,
    p1: Point,
    p2: Point,
    p3: Point,
    t: number,
): Point {
    const oneMinusT = 1 - t;
    const oneMinusTSq = oneMinusT * oneMinusT;
    const tSq = t * t;

    return [
        oneMinusTSq * oneMinusT * p0[0] +
            3 * oneMinusTSq * t * p1[0] +
            3 * oneMinusT * tSq * p2[0] +
            tSq * t * p3[0],
        oneMinusTSq * oneMinusT * p0[1] +
            3 * oneMinusTSq * t * p1[1] +
            3 * oneMinusT * tSq * p2[1] +
            tSq * t * p3[1],
    ];
}

// Helper for vector operations
function vecAngle(u: Point, v: Point) {
    const sign = Math.sign(u[0] * v[1] - u[1] * v[0]);
    const dot = u[0] * v[0] + u[1] * v[1];
    const magU = Math.sqrt(u[0] * u[0] + u[1] * u[1]);
    const magV = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
    const cosAngle = dot / (magU * magV);

    return sign * Math.acos(Math.min(1, Math.max(-1, cosAngle)));
}

/**
 * Converts endpoint parameterization of an elliptical arc to center parameterization.
 * Based on the W3C SVG specification.
 * https://www.w3.org/TR/SVG/implnote.html#ArcConversionEndpointToCenter
 */
export function getArcCenter(
    p1: Point,
    p2: Point,
    rx: number,
    ry: number,
    phi: number,
    fA: 0 | 1,
    fS: 0 | 1,
): { center: Point; startAngle: number; sweepAngle: number } {
    const phiRad = (phi * Math.PI) / 180;
    const cosPhi = Math.cos(phiRad);
    const sinPhi = Math.sin(phiRad);

    // Step 1: Compute (x1', y1')
    const x1p = cosPhi * ((p1[0] - p2[0]) / 2) + sinPhi * ((p1[1] - p2[1]) / 2);
    const y1p =
        -sinPhi * ((p1[0] - p2[0]) / 2) + cosPhi * ((p1[1] - p2[1]) / 2);

    // Ensure radii are non-zero
    rx = Math.abs(rx);
    ry = Math.abs(ry);

    // Step 2: Compute (cx', cy')
    let rxSq = rx * rx;
    let rySq = ry * ry;
    const x1pSq = x1p * x1p;
    const y1pSq = y1p * y1p;

    // Check if radii are large enough
    const lambda = x1pSq / rxSq + y1pSq / rySq;
    if (lambda > 1) {
        rx *= Math.sqrt(lambda);
        ry *= Math.sqrt(lambda);
        rxSq = rx * rx;
        rySq = ry * ry;
    }

    const sign = fA === fS ? -1 : 1;
    const num = rxSq * rySq - rxSq * y1pSq - rySq * x1pSq;
    const den = rxSq * y1pSq + rySq * x1pSq;
    const c_ = sign * Math.sqrt(Math.max(0, num / den));

    const cxp = c_ * ((rx * y1p) / ry);
    const cyp = c_ * -((ry * x1p) / rx);

    // Step 3: Compute (cx, cy) from (cx', cy')
    const cx = cosPhi * cxp - sinPhi * cyp + (p1[0] + p2[0]) / 2;
    const cy = sinPhi * cxp + cosPhi * cyp + (p1[1] + p2[1]) / 2;

    // Step 4: Compute startAngle and sweepAngle
    const v1: Point = [(x1p - cxp) / rx, (y1p - cyp) / ry];
    const v2: Point = [(-x1p - cxp) / rx, (-y1p - cyp) / ry];

    const startAngle = vecAngle([1, 0], v1);
    let sweepAngle = vecAngle(v1, v2);

    if (fS === 0 && sweepAngle > 0) {
        sweepAngle -= 2 * Math.PI;
    } else if (fS === 1 && sweepAngle < 0) {
        sweepAngle += 2 * Math.PI;
    }

    return { center: [cx, cy], startAngle, sweepAngle };
}

/**
 * Computes the point on an elliptical arc at a given angle.
 */
export function pointOnArc(
    center: Point,
    rx: number,
    ry: number,
    phi: number,
    angle: number,
): Point {
    const phiRad = (phi * Math.PI) / 180;
    const cosPhi = Math.cos(phiRad);
    const sinPhi = Math.sin(phiRad);
    const cosAngle = Math.cos(angle);
    const sinAngle = Math.sin(angle);

    const x = center[0] + rx * cosAngle * cosPhi - ry * sinAngle * sinPhi;
    const y = center[1] + rx * cosAngle * sinPhi + ry * sinAngle * cosPhi;

    return [x, y];
}
