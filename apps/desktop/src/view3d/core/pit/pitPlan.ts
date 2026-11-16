/**
 * Front ensemble equipment seen from straight above, for the 2D field (instruments.md section 6,
 * "2D"): each built-in model's silhouette and the edges seen from above (bars, drum heads, steps),
 * generated from its GLB by `scripts/view3d-assets/pit-plan.mjs` into `assets/pit/plan.json`.
 *
 * The data loads on its own (it is about 230 KB), the first time a show has a built-in model; until
 * then, and for a model it doesn't know, the field draws the item's footprint as before.
 *
 * Pure apart from the loader: no React, no three.js.
 */
import { pitModelName } from "./pitModels";

/** A point on the field plan */
type Pt = { readonly x: number; readonly y: number };

/**
 * A model from above, in millimeters in the model's axes (x across, z toward the audience): flat
 * `[x, z, x, z, ...]` lists.
 */
export interface PitPlan {
    /** Closed outlines, no repeated end point */
    readonly outline: readonly (readonly number[])[];
    /** Open polylines */
    readonly details: readonly (readonly number[])[];
}

/** A model's plan placed on the field, in field units */
export interface PlacedPitPlan {
    /** Closed outlines, no repeated end point */
    readonly outlines: readonly (readonly Pt[])[];
    readonly details: readonly (readonly Pt[])[];
    /** The middle of the front edge (toward the audience before turning), where a facing mark goes */
    readonly front: Pt;
    /** Degrees, as the field turns Outlines */
    readonly rotation: number;
}

/**
 * Places `plan` on the field: centered on `center` (the model's origin is the middle of its
 * footprint), turned `rotation` degrees as `placeOutline` turns an Outline, at `unitsPerMeter`.
 */
export function placePitPlan(
    plan: PitPlan,
    center: Pt,
    rotation: number,
    unitsPerMeter: number,
): PlacedPitPlan {
    const radians = (rotation * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const k = unitsPerMeter / 1000;
    const at = (x: number, z: number): Pt => ({
        x: center.x + (x * cos - z * sin) * k,
        y: center.y + (x * sin + z * cos) * k,
    });
    const place = (flat: readonly number[]): Pt[] => {
        const points: Pt[] = [];
        for (let i = 0; i + 1 < flat.length; i += 2)
            points.push(at(flat[i], flat[i + 1]));
        return points;
    };
    let front = -Infinity;
    for (const ring of plan.outline)
        for (let i = 1; i < ring.length; i += 2)
            front = Math.max(front, ring[i]);
    return {
        outlines: plan.outline.map(place),
        details: plan.details.map(place),
        front: at(0, Number.isFinite(front) ? front : 0),
        rotation,
    };
}

let plans: Readonly<Record<string, PitPlan>> | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

/** Loads the plans once; listeners hear when they arrive. */
export function loadPitPlans(): Promise<void> {
    loading ??= import("@/view3d/assets/pit/plan.json").then(
        (module) => {
            plans = module.default as Record<string, PitPlan>;
            listeners.forEach((listener) => listener());
            // They load once: nobody needs to hear again, and holding on would keep each
            // listener's owner (a field's items) alive after it's gone
            listeners.clear();
        },
        (error: unknown) => {
            // eslint-disable-next-line no-console -- a broken built-in asset is worth one line
            console.warn("pit plans failed to load; drawing footprints", error);
        },
    );
    return loading;
}

/** Whether the plans have loaded (`loadPitPlans`). */
export const arePitPlansLoaded = (): boolean => plans !== null;

/** Hears when the plans have loaded (once; nothing once they have). */
export function subscribePitPlans(listener: () => void): () => void {
    if (plans) return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/**
 * The plan of the built-in model `modelId` (`pit/<name>`), or null when it has none or the plans
 * haven't loaded yet (which starts loading them).
 */
export function pitPlanOf(modelId: string | null | undefined): PitPlan | null {
    const name = pitModelName(modelId);
    if (!name) return null;
    if (!plans) {
        void loadPitPlans();
        return null;
    }
    return plans[name] ?? null;
}
