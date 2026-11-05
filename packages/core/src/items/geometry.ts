/**
 * An item's Outline at a moment, from its beat-keyed geometry changes (ADR 0010 D-10,
 * props-spec section 5). Independent of moves: positions come from the timeline resolver.
 *
 * Counting follows ADR 0004's states: a change on beat B with transition length L is fully in
 * place on the click of B and eases in from the click of B - L + 1, so L = 1 snaps on the click.
 * Moments are beat positions, fractional between clicks; the caller maps time to them through
 * the tempo map.
 */

export type OutlineType =
    | "rectangle"
    | "circle"
    | "arc"
    | "polygon"
    | "freehand";
export type LeadingEdge = "front" | "back" | "left" | "right";

/** One row of `item_geometry`, with its beat as a position. Sizes in meters, rotation in degrees. */
export interface GeometryChange {
    /** The position of the beat the change is on */
    beat: number;
    outlineType: OutlineType;
    width: number;
    depth: number;
    height: number;
    rotation: number;
    customOutline: unknown;
    /** In counts, at least 1 */
    transitionLength: number;
    rollsOut: boolean;
    leadingEdge: LeadingEdge | null;
}

export interface ItemGeometry {
    outlineType: OutlineType;
    width: number;
    depth: number;
    height: number;
    rotation: number;
    customOutline: unknown;
    rollsOut: boolean;
    leadingEdge: LeadingEdge | null;
    /** How far through the current change's transition, 0 to 1; 1 once it is in place */
    progress: number;
}

const transitionStart = (c: GeometryChange) => c.beat - c.transitionLength + 1;

/** Symmetric ease in and out: slow at both ends, halfway at half time. */
const ease = (p: number) => p * p * (3 - 2 * p);

const settled = (c: GeometryChange): ItemGeometry => ({
    outlineType: c.outlineType,
    width: c.width,
    depth: c.depth,
    height: c.height,
    rotation: c.rotation,
    customOutline: c.customOutline,
    rollsOut: c.rollsOut,
    leadingEdge: c.leadingEdge,
    progress: 1,
});

/** `sorted` is in beat order; looks only at the first `count` changes. */
function geometryAt(
    sorted: readonly GeometryChange[],
    count: number,
    position: number,
): ItemGeometry | null {
    const first = sorted[0];
    if (count === 0 || !first || position < first.beat) return null;
    // The latest change whose transition has started takes over
    let i = count - 1;
    let current = sorted[i];
    while (i > 0 && current && transitionStart(current) > position) {
        current = sorted[--i];
    }
    if (!current) return null;
    // The first change has nothing to ease from: it is in place on its count
    if (i === 0 || position >= current.beat) return settled(current);

    const start = transitionStart(current);
    const from = geometryAt(sorted, i, start);
    if (!from) return settled(current);
    const progress = (position - start) / (current.beat - start);
    const k = ease(progress);
    const blend = (a: number, b: number) => a + (b - a) * k;
    // Outline type, custom outline and roll-out switch when the transition starts
    return {
        ...settled(current),
        width: blend(from.width, current.width),
        depth: blend(from.depth, current.depth),
        height: blend(from.height, current.height),
        rotation: blend(from.rotation, current.rotation),
        progress,
    };
}

/**
 * The item's Outline at `position`, or null before its first change (Off field: a new item is on
 * field from the count it was created on).
 */
export function itemGeometryAt(
    changes: readonly GeometryChange[],
    position: number,
): ItemGeometry | null {
    const sorted = [...changes].sort((a, b) => a.beat - b.beat);
    return geometryAt(sorted, sorted.length, position);
}
