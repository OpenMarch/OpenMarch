import { rgbaToString, type RgbaColor } from "@openmarch/core";

/**
 * A prop's color (`items.color`): stored as `rgba(r, g, b, a)` text like the appearance colors,
 * or null for none, which draws the prop as before (the field theme's line color in 2D, neutral
 * grey in the 3D View).
 */

/** Reads a stored prop color, or null when there is none or it doesn't parse. */
export function parsePropColor(
    text: string | null | undefined,
): RgbaColor | null {
    if (!text) return null;
    const match = text.match(
        /^\s*rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(\d*\.?\d+)\s*)?\)\s*$/,
    );
    if (!match) return null;
    const [r, g, b] = [match[1], match[2], match[3]].map(Number);
    if (r > 255 || g > 255 || b > 255) return null;
    const a = match[4] === undefined ? 1 : Math.min(1, Number(match[4]));
    return { r, g, b, a };
}

/** The stored text for a prop color, or null to clear it. */
export const propColorToString = (color: RgbaColor | null): string | null =>
    color ? rgbaToString(color) : null;

/** Each prop's color by marcher id, for the items that have one. */
export function propColorsByMarcher(
    items: readonly { marcher_id: number; color: string | null }[],
): ReadonlyMap<number, RgbaColor> {
    const colors = new Map<number, RgbaColor>();
    for (const item of items) {
        const color = parsePropColor(item.color);
        if (color) colors.set(item.marcher_id, color);
    }
    return colors;
}
