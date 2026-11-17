import type { FieldProperties, XY } from "@openmarch/core";
import type { NewItemArgs } from "@/db-functions/items";
import { isPodiumFamily, type PitVariant } from "@/view3d/core/pit/catalog";

/**
 * A new equipment item from the front ensemble catalog (instruments.md §6): it names its built-in
 * model, is locked, and its Outline is the model's footprint, a rectangle centered on `home` and
 * turned `rotation` degrees (none by default), on field from `beatId`.
 */
export function newEquipment({
    variant,
    name,
    home,
    beatId,
    rotation,
}: {
    variant: PitVariant;
    name: string;
    home: XY;
    beatId: number;
    rotation?: number;
}): NewItemArgs {
    const { width, depth, height } = variant.footprint;
    return {
        kind: "equipment",
        name,
        model: variant.modelId,
        locked: true,
        home,
        beatId,
        geometry: { outlineType: "rectangle", width, depth, height, rotation },
    };
}

/**
 * The turn, in degrees, equipment placed with its center at `center` gets (instruments.md §6).
 * The models are built for the front of the field, with their audience side toward +Z (down the
 * canvas), so a podium unturned has its performer facing the band across the field. A podium on
 * the back half, behind the field's front-to-back center line (including behind the back
 * sideline), is turned 180° so its performer faces the field from there. Everything else, and a
 * podium on the front half or the line itself, keeps 0.
 */
export function equipmentRotationAt(
    variant: PitVariant,
    center: { x: number; y: number },
    field: Pick<FieldProperties, "centerFrontPoint" | "height">,
): number {
    if (!isPodiumFamily(variant.family)) return 0;
    const centerLine = field.centerFrontPoint.yPixels - field.height / 2;
    return center.y < centerLine ? 180 : 0;
}

const escapeRegExp = (text: string) =>
    text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * `base` and the next number for it among `names`: one past the highest "<base> <n>", so a
 * deleted one's number isn't reused while a higher one is in the show ("Marimba 2").
 */
export function nextEquipmentName(
    base: string,
    names: readonly (string | null)[],
): string {
    const pattern = new RegExp(`^${escapeRegExp(base)} (\\d+)$`);
    const highest = names.reduce((max, name) => {
        const match = name ? pattern.exec(name) : null;
        return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    return `${base} ${highest + 1}`;
}
