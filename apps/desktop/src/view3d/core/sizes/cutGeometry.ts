/**
 * Polygon helpers for silk Cut outlines (`./silkCuts`): whether a point or a
 * box lies inside the cut, for the "content outside cut" flag (props-spec §3),
 * and the cut's outline inset by the safe area, for templates.
 *
 * A polygon is a ring of points in order, not closed (the last point joins
 * the first), in any one unit.
 *
 * Plain TypeScript only: this module lives under `view3d/core/`, so it must
 * not import React, React Three Fiber, drei, Electron or the database.
 */
// cspell:words Liang Barsky
import type { CutPoint } from "./silkCuts";

/** Even-odd test; a point exactly on an edge may land either side. */
export function pointInPolygon(
    polygon: readonly CutPoint[],
    [x, y]: CutPoint,
): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, yi] = polygon[i];
        const [xj, yj] = polygon[j];
        const spans = yi > y;
        const spansJ = yj > y;
        const crosses = spans !== spansJ;
        if (crosses && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
            inside = !inside;
    }
    return inside;
}

function distanceToSegment(
    [px, py]: CutPoint,
    [ax, ay]: CutPoint,
    [bx, by]: CutPoint,
): number {
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t =
        len2 === 0
            ? 0
            : Math.max(
                  0,
                  Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2),
              );
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** The distance from a point to the polygon's boundary. */
export function distanceToPolygonEdge(
    polygon: readonly CutPoint[],
    point: CutPoint,
): number {
    let best = Infinity;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++)
        best = Math.min(best, distanceToSegment(point, polygon[j], polygon[i]));
    return best;
}

/** Twice the signed area: positive when the ring runs clockwise with y down. */
function signedArea2(polygon: readonly CutPoint[]): number {
    let a = 0;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++)
        a += polygon[j][0] * polygon[i][1] - polygon[i][0] * polygon[j][1];
    return a;
}

/**
 * The polygon shrunk by `inset` on every side: each vertex moves inward along
 * its corner's bisector (mitered), and vertices that end up closer than
 * `inset` to the outline, as at a narrow tip, are dropped. Good for the smooth,
 * finely sampled outlines of silk Cuts; returns [] when nothing is left.
 */
export function insetPolygon(
    polygon: readonly CutPoint[],
    inset: number,
): CutPoint[] {
    const n = polygon.length;
    if (n < 3 || !(inset >= 0)) return [];
    if (inset === 0) return [...polygon];
    // Inward normal of edge a→b: y down, so a clockwise ring turns right.
    const sign = signedArea2(polygon) > 0 ? 1 : -1;
    const normal = (a: CutPoint, b: CutPoint): CutPoint => {
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const len = Math.hypot(dx, dy) || 1;
        return [(-dy / len) * sign, (dx / len) * sign];
    };
    const out: CutPoint[] = [];
    for (let i = 0; i < n; i++) {
        const prev = polygon[(i + n - 1) % n];
        const cur = polygon[i];
        const next = polygon[(i + 1) % n];
        const n1 = normal(prev, cur);
        const n2 = normal(cur, next);
        const dot = n1[0] * n2[0] + n1[1] * n2[1];
        // Miter: inset / cos(half angle), capped for very sharp corners.
        const k = inset / Math.max(1 + dot, 0.05);
        const p: CutPoint = [
            cur[0] + (n1[0] + n2[0]) * k,
            cur[1] + (n1[1] + n2[1]) * k,
        ];
        if (
            pointInPolygon(polygon, p) &&
            distanceToPolygonEdge(polygon, p) >= inset * (1 - 1e-6)
        )
            out.push(p);
    }
    return out.length >= 3 ? out : [];
}

export interface CutBox {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

/** Whether segment a→b passes through the open box (Liang-Barsky). */
function segmentCrossesBox(a: CutPoint, b: CutPoint, box: CutBox): boolean {
    let t0 = 0;
    let t1 = 1;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const clips: [number, number][] = [
        [-dx, a[0] - box.x],
        [dx, box.x + box.width - a[0]],
        [-dy, a[1] - box.y],
        [dy, box.y + box.height - a[1]],
    ];
    for (const [p, q] of clips) {
        if (p === 0) {
            if (q <= 0) return false;
        } else {
            const r = q / p;
            if (p < 0) t0 = Math.max(t0, r);
            else t1 = Math.min(t1, r);
            if (t0 >= t1) return false;
        }
    }
    return true;
}

/**
 * Whether any part of a box (such as placed Artwork's opaque bounds) lies
 * outside the cut: the "content outside cut" flag. A box that only touches
 * the outline is inside.
 */
export function boxOutsideCut(
    polygon: readonly CutPoint[],
    box: CutBox,
): boolean {
    const corners: CutPoint[] = [
        [box.x, box.y],
        [box.x + box.width, box.y],
        [box.x + box.width, box.y + box.height],
        [box.x, box.y + box.height],
    ];
    const eps = 1e-9 * Math.max(box.width, box.height, 1);
    for (const c of corners)
        if (
            !pointInPolygon(polygon, c) &&
            distanceToPolygonEdge(polygon, c) > eps
        )
            return true;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++)
        if (segmentCrossesBox(polygon[j], polygon[i], box)) return true;
    return false;
}
