import { FieldProperties } from "@openmarch/core";
import type { FieldRect } from "@/field/editor/selectionArea";
import type { FieldSize } from "@/field/editor/view";

/**
 * The pit areas (instruments.md section 6, "2D"): a plain, flat-toned pad against the front
 * sideline under the front ensemble's equipment, and one behind the back sideline under equipment
 * standing there (a back podium). Each is only as wide and deep as the equipment on it, with no
 * lines, so it reads as the pit next to the field rather than more field (owner pick 2026-11-15,
 * "flat tone"). A drawing aid only: the field (`FieldProperties`) doesn't change, and nothing stops
 * a marcher or item from standing past it.
 *
 * Field units throughout: the front sideline is `centerFrontPoint.yPixels` (y = 0 steps), y grows
 * toward the audience, and the back sideline is the field's top edge (y = 0).
 */

const UNITS_PER_FT = 12 * FieldProperties.PIXELS_PER_INCH;

/** How far a pit area reaches past the outermost equipment: room to walk around it */
export const PIT_AREA_MARGIN_FT = 4;
const MARGIN = PIT_AREA_MARGIN_FT * UNITS_PER_FT;

/** A piece of equipment where it stands at the start of the show, in field units */
export interface PitAreaEquipment {
    readonly x: number;
    readonly y: number;
    /** Half its footprint's diagonal: it fits inside this circle however it's turned */
    readonly radius: number;
}

/**
 * The pit areas for `equipment`: one in front of the front sideline around what stands there, and
 * one behind the back sideline around what stands there, each only when something does. Equipment
 * standing on the field gets none.
 */
export function pitAreasOf(
    fieldProperties: Pick<FieldProperties, "centerFrontPoint">,
    equipment: readonly PitAreaEquipment[],
): FieldRect[] {
    const front = fieldProperties.centerFrontPoint.yPixels;
    const areas: FieldRect[] = [];
    const around = (
        pieces: readonly PitAreaEquipment[],
        side: "front" | "back",
    ) => {
        if (pieces.length === 0) return;
        let left = Infinity;
        let right = -Infinity;
        let near = side === "front" ? -Infinity : Infinity;
        for (const { x, y, radius } of pieces) {
            left = Math.min(left, x - radius);
            right = Math.max(right, x + radius);
            near =
                side === "front"
                    ? Math.max(near, y + radius)
                    : Math.min(near, y - radius);
        }
        areas.push({
            left: left - MARGIN,
            right: right + MARGIN,
            top: side === "front" ? front : near - MARGIN,
            bottom: side === "front" ? near + MARGIN : 0,
        });
    };
    around(
        equipment.filter((e) => e.y > front),
        "front",
    );
    around(
        equipment.filter((e) => e.y < 0),
        "back",
    );
    return areas;
}

/** Whether `area` is behind the field (it ends at the back sideline) rather than in front of it */
export const isBehindField = (area: FieldRect): boolean => area.bottom <= 0;

/**
 * The area the view fits, centers and keeps in reach: the field, and the pit areas in front of and
 * behind it when there are any. The field's own origin
 * stays at (0, 0); an area behind makes the view's area start above it (`top`).
 */
export function fieldViewSize(
    fieldProperties: Pick<FieldProperties, "width" | "height">,
    areas: readonly (FieldRect | null)[],
): FieldSize {
    let top = 0;
    let bottom = fieldProperties.height;
    for (const area of areas) {
        if (!area) continue;
        top = Math.min(top, area.top);
        bottom = Math.max(bottom, area.bottom);
    }
    return { width: fieldProperties.width, height: bottom - top, top };
}
