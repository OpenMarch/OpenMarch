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

export function pointOnQuadraticBezier(
    p0: Point,
    p1: Point,
    p2: Point,
    t: number,
): Point {
    const oneMinusT = 1 - t;
    return {
        x: oneMinusT ** 2 * p0.x + 2 * oneMinusT * t * p1.x + t ** 2 * p2.x,
        y: oneMinusT ** 2 * p0.y + 2 * oneMinusT * t * p1.y + t ** 2 * p2.y,
    };
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

    return {
        x:
            oneMinusTSq * oneMinusT * p0.x +
            3 * oneMinusTSq * t * p1.x +
            3 * oneMinusT * tSq * p2.x +
            tSq * t * p3.x,
        y:
            oneMinusTSq * oneMinusT * p0.y +
            3 * oneMinusTSq * t * p1.y +
            3 * oneMinusT * tSq * p2.y +
            tSq * t * p3.y,
    };
}

// Helper for vector operations
function vecAngle(u: Point, v: Point) {
    const sign = Math.sign(u.x * v.y - u.y * v.x);
    const dot = u.x * v.x + u.y * v.y;
    const magU = Math.sqrt(u.x * u.x + u.y * u.y);
    const magV = Math.sqrt(v.x * v.x + v.y * v.y);
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
    const x1p = cosPhi * ((p1.x - p2.x) / 2) + sinPhi * ((p1.y - p2.y) / 2);
    const y1p = -sinPhi * ((p1.x - p2.x) / 2) + cosPhi * ((p1.y - p2.y) / 2);

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
    const cx = cosPhi * cxp - sinPhi * cyp + (p1.x + p2.x) / 2;
    const cy = sinPhi * cxp + cosPhi * cyp + (p1.y + p2.y) / 2;

    // Step 4: Compute startAngle and sweepAngle
    const v1 = { x: (x1p - cxp) / rx, y: (y1p - cyp) / ry };
    const v2 = { x: (-x1p - cxp) / rx, y: (-y1p - cyp) / ry };

    const startAngle = vecAngle({ x: 1, y: 0 }, v1);
    let sweepAngle = vecAngle(v1, v2);

    if (fS === 0 && sweepAngle > 0) {
        sweepAngle -= 2 * Math.PI;
    } else if (fS === 1 && sweepAngle < 0) {
        sweepAngle += 2 * Math.PI;
    }

    return { center: { x: cx, y: cy }, startAngle, sweepAngle };
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

    const x = center.x + rx * cosAngle * cosPhi - ry * sinAngle * sinPhi;
    const y = center.y + rx * cosAngle * sinPhi + ry * sinAngle * cosPhi;

    return { x, y };
}
