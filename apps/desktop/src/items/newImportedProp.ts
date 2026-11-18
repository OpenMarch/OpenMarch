import type { XY } from "@openmarch/core";
import type { NewItemArgs } from "@/db-functions/items";

/** Lower than this, an imported model is walked over: a Floor prop rather than an obstacle */
export const FLOOR_PROP_MAX_HEIGHT_M = 0.05;

/**
 * A new prop from an imported model (fork #999): it names the show asset (`items.model`), and its
 * Outline is the model's footprint, a rectangle centered on `home` and turned `rotation` degrees,
 * on field from `beatId`. Unlocked, so it moves over time like any prop. A model with height is
 * an obstacle (props-spec section 5); a flat one is a Floor prop.
 */
export function newImportedProp({
    modelValue,
    footprint,
    name,
    home,
    beatId,
    rotation,
}: {
    modelValue: string;
    footprint: { width: number; depth: number; height: number };
    name: string;
    home: XY;
    beatId: number;
    rotation?: number;
}): NewItemArgs {
    const { width, depth, height } = footprint;
    return {
        kind: "prop",
        name,
        surfaceType: height < FLOOR_PROP_MAX_HEIGHT_M ? "floor" : "obstacle",
        model: modelValue,
        home,
        beatId,
        geometry: { outlineType: "rectangle", width, depth, height, rotation },
    };
}
