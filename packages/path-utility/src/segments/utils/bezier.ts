import { Point } from "../../interfaces";

/*
Quadratic Bézier curve:
  B(t) = (1 - t)^2 * P0
       + 2(1 - t)t * P1
       + t^2 * P2
*/
function quadBezier([p0, p1, p2]: [Point, Point, Point], t: number): Point {
    const u = 1 - t;
    const uu = u * u;
    const tt = t * t;
    return {
        x: uu * p0.x + 2 * u * t * p1.x + tt * p2.x,
        y: uu * p0.y + 2 * u * t * p1.y + tt * p2.y,
    };
}

/*
Cubic Bézier curve:
  B(t) = (1 - t)^3 * P0
       + 3(1 - t)^2 t * P1
       + 3(1 - t) t^2 * P2
       + t^3 * P3
*/
function cubicBezier(
    [p0, p1, p2, p3]: [Point, Point, Point, Point],
    t: number,
): Point {
    const u = 1 - t;
    const uu = u * u;
    const uuu = uu * u;
    const tt = t * t;
    const ttt = tt * t;
    return {
        x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
        y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
    };
}

function dist2(a: Point, b: Point): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
}

/*
Approximate curve length by sampling.
*/
function approximateLength(
    bezier: (t: number) => Point,
    samples = 200,
): number {
    let total = 0;
    let prev = bezier(0);
    for (let i = 1; i <= samples; i++) {
        const t = i / samples;
        const p = bezier(t);
        const dx = p.x - prev.x;
        const dy = p.y - prev.y;
        total += Math.sqrt(dx * dx + dy * dy);
        prev = p;
    }
    return total;
}

/*
Given:
  - bezier(t)
  - last t (tStart)
  - desired Euclidean spacing D
Find next t such that ||B(t) - B(tStart)|| = D
*/
function findNextT(
    bezier: (t: number) => Point,
    tStart: number,
    D: number,
    maxIter = 40,
    eps = 1e-4,
): number {
    const target = D * D;
    const start = bezier(tStart);
    let low = tStart;
    let high = 1;

    // Ensure high is far enough away
    if (dist2(bezier(high), start) < target) {
        return 1; // can't reach full D before curve ends
    }

    for (let i = 0; i < maxIter; i++) {
        const mid = (low + high) / 2;
        const d2 = dist2(bezier(mid), start);
        if (Math.abs(d2 - target) < eps) return mid;
        if (d2 < target) {
            low = mid;
        } else {
            high = mid;
        }
    }

    // Return whichever bound is closer to target
    const dLow = Math.abs(dist2(bezier(low), start) - target);
    const dHigh = Math.abs(dist2(bezier(high), start) - target);
    return dLow < dHigh ? low : high;
}

/*
 * Main entry point:
 * Place N marchers equally spaced by Euclidean distance.
 */
export function placePointsOnBezier({
    points,
    count,
}: {
    points: [Point, Point, Point] | [Point, Point, Point, Point]; // 3 for quadratic, 4 for cubic
    count: number; // number of marchers
}): Point[] {
    if (count <= 1) return [points[0]];

    const isQuadratic = points.length === 3;
    const isCubic = points.length === 4;

    if (!isQuadratic && !isCubic) {
        throw new Error("Bezier must have 3 (quadratic) or 4 (cubic) points.");
    }

    const bezier = (t: number): Point =>
        isQuadratic
            ? quadBezier(points as [Point, Point, Point], t)
            : cubicBezier(points as [Point, Point, Point, Point], t);

    // Approximate total length
    const L = approximateLength(bezier);

    // Ideal Euclidean distance between each marcher
    const D = L / (count - 1);

    const result: Point[] = [];
    let t = 0;
    result.push(bezier(t));

    for (let i = 1; i < count - 1; i++) {
        t = findNextT(bezier, t, D);
        result.push(bezier(t));
    }

    // Always place last marcher exactly at endpoint
    result.push(bezier(1));

    return result;
}
