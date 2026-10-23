/**
 * Finding what a finger meant to press. Marcher dots and handles are a few
 * screen pixels wide, much smaller than a fingertip, so a touch that misses
 * picks the nearest pressable thing within a radius.
 */

/** How far (screen px) a touch may land from a marcher or handle and still press it */
export const TOUCH_HIT_RADIUS_PX = 22;

export interface HitRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

export interface HitCandidate<T> {
    item: T;
    /** Bounds in canvas units */
    rect: HitRect;
}

/** Distance from a point to a rectangle; 0 when inside */
export function distanceToRect(
    point: { x: number; y: number },
    rect: HitRect,
): number {
    const dx = Math.max(
        rect.left - point.x,
        0,
        point.x - (rect.left + rect.width),
    );
    const dy = Math.max(
        rect.top - point.y,
        0,
        point.y - (rect.top + rect.height),
    );
    return Math.hypot(dx, dy);
}

/**
 * The candidate nearest to the point, if any lies within the radius.
 * Ties go to the later candidate (drawn on top).
 *
 * @param point In canvas units
 * @param radiusPx In screen pixels
 * @param zoom Canvas zoom; the radius in canvas units is radiusPx / zoom
 */
export function pickNearestWithinRadius<T>(
    candidates: Iterable<HitCandidate<T>>,
    point: { x: number; y: number },
    radiusPx: number,
    zoom: number,
): T | null {
    if (!(zoom > 0) || !Number.isFinite(point.x) || !Number.isFinite(point.y))
        return null;
    const radius = radiusPx / zoom;
    let best: T | null = null;
    let bestDistance = Infinity;
    for (const candidate of candidates) {
        const d = distanceToRect(point, candidate.rect);
        if (d <= radius && d <= bestDistance) {
            best = candidate.item;
            bestDistance = d;
        }
    }
    return best;
}
