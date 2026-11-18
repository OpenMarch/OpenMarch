/**
 * Set order's sweep (pathways step 4g, DL-27), pure: who a drag through the line picks up and
 * in what order, and the order kept when the drag ends. How an order is drawn is `orderLane`.
 */

export type XY = { readonly x: number; readonly y: number };

/** How near the pointer counts as passing a marcher, at least, in screen pixels: zoomed out it still works */
export const SWEEP_MIN_PX = 10;

/**
 * How near the pointer must pass a marcher for it to join, in field units: half a step, or
 * {@link SWEEP_MIN_PX} on screen when that's more (zoomed out)
 *
 * @param pixelsPerStep field units in one step
 * @param zoom screen pixels per field unit
 */
export function sweepTolerance(pixelsPerStep: number, zoom: number): number {
    return Math.max(pixelsPerStep / 2, SWEEP_MIN_PX / Math.max(zoom, 1e-9));
}

/** Where along `from`→`to` the point `p` is nearest (0 to 1), and how far it is from there */
function nearestOnSegment(
    from: XY,
    to: XY,
    p: XY,
): { t: number; distance: number } {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length2 = dx * dx + dy * dy;
    const t =
        length2 === 0
            ? 0
            : Math.min(
                  1,
                  Math.max(
                      0,
                      ((p.x - from.x) * dx + (p.y - from.y) * dy) / length2,
                  ),
              );
    return {
        t,
        distance: Math.hypot(p.x - (from.x + t * dx), p.y - (from.y + t * dy)),
    };
}

/**
 * The marchers picked once the pointer went from `from` to `to` (a press is `from` = `to`): those
 * already `picked`, then each of `candidates` the way passed within `tolerance` of, in the order it
 * passed them. A marcher passed twice stays where it first joined.
 */
export function sweepThrough({
    picked,
    from,
    to,
    candidates,
    tolerance,
}: {
    picked: readonly number[];
    from: XY;
    to: XY;
    candidates: ReadonlyMap<number, XY>;
    tolerance: number;
}): number[] {
    const already = new Set(picked);
    const passed: { id: number; t: number; distance: number }[] = [];
    for (const [id, at] of candidates) {
        if (already.has(id)) continue;
        const near = nearestOnSegment(from, to, at);
        if (near.distance <= tolerance) passed.push({ id, ...near });
    }
    // Along the way; two passed at the same point, the nearer first
    passed.sort((a, b) => a.t - b.t || a.distance - b.distance || a.id - b.id);
    return passed.length === 0
        ? [...picked]
        : [...picked, ...passed.map((p) => p.id)];
}

/**
 * The order kept when Set order ends: the marchers `picked`, then the other `selected` ones (those
 * skipped) in the order they had (`before`, the order shown when the mode opened), then anyone
 * neither names, by id
 */
export function orderAfterSweep({
    picked,
    before,
    selected,
}: {
    picked: readonly number[];
    before: readonly number[] | null;
    selected: readonly number[];
}): number[] {
    const chosen = new Set(selected);
    const out = picked.filter((id) => chosen.has(id));
    const placed = new Set(out);
    for (const id of before ?? [])
        if (chosen.has(id) && !placed.has(id)) {
            out.push(id);
            placed.add(id);
        }
    for (const id of [...chosen].sort((a, b) => a - b))
        if (!placed.has(id)) {
            out.push(id);
            placed.add(id);
        }
    return out;
}
