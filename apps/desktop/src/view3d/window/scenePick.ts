/**
 * What the cursor points at in the 3D View, for zooming toward it. Parts of
 * the scene that can be picked (the performers) register a picker; the
 * camera rig asks for the nearest hit along a ray. Cheap analytic shapes,
 * not the meshes: picking runs on every wheel event.
 */
import type { Vector3Tuple } from "three";

/** The distance along the ray (unit `dir`) to the nearest hit, or null. */
export type Picker = (origin: Vector3Tuple, dir: Vector3Tuple) => number | null;

const pickers = new Set<Picker>();

/** Registers a picker; returns a function that removes it. */
export function registerPicker(picker: Picker): () => void {
    pickers.add(picker);
    return () => {
        pickers.delete(picker);
    };
}

/** The nearest hit of any registered picker along the ray, or null. */
export function pickAlong(
    origin: Vector3Tuple,
    dir: Vector3Tuple,
): number | null {
    let best: number | null = null;
    for (const pick of pickers) {
        const t = pick(origin, dir);
        if (t !== null && t > 0 && (best === null || t < best)) best = t;
    }
    return best;
}
