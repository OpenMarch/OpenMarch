/** A dot's radius in field units, as drawn (`MarchersLayer`). */
export const DOT_RADIUS = 5;
/** A dot's outline width, in field units. */
export const OUTLINE_WIDTH = 1;

/**
 * The smallest a dot's target gets on screen, in CSS pixels, so a zoomed-out
 * show can still be clicked. The dot itself is drawn at least 1.5 px.
 */
export const MIN_HIT_SCREEN_RADIUS = 5;

/** How far from a dot's center, in field units, a press still lands on it at `zoom` (CSS px per field unit). */
export function hitRadius(zoom: number): number {
    // The dot plus its outline when zoomed in
    return Math.max(DOT_RADIUS + OUTLINE_WIDTH, MIN_HIT_SCREEN_RADIUS / zoom);
}

/** The marchers drawn: ids, x, y per id in field units, and 1 per id that's hidden (not drawn). */
export type DrawnMarchers = {
    readonly ids: readonly number[];
    readonly positions: ArrayLike<number>;
    readonly hidden?: ArrayLike<number>;
};

/**
 * The marcher a press at `point` lands on: the nearest one within `radius`
 * (field units) that `canSelect` allows, or null on empty field. Hidden
 * marchers and ones that can't be selected (dimmed ones) are passed over, as
 * if not there.
 */
export function marcherAt(
    marchers: DrawnMarchers,
    point: { x: number; y: number },
    radius: number,
    canSelect: (id: number) => boolean = () => true,
): number | null {
    const { ids, positions, hidden } = marchers;
    let best: number | null = null;
    let bestDistance = radius * radius;
    for (let i = 0; i < ids.length; i++) {
        const dx = positions[i * 2] - point.x;
        const dy = positions[i * 2 + 1] - point.y;
        const distance = dx * dx + dy * dy;
        if (distance > bestDistance) continue;
        if (best !== null && distance === bestDistance) continue;
        if (hidden?.[i]) continue;
        if (!canSelect(ids[i])) continue;
        best = ids[i];
        bestDistance = distance;
    }
    return best;
}
