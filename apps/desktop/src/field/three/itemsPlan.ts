import type { FieldTheme } from "@openmarch/core";
import { rgbaOf, type Rgba, type StrokePlan } from "@/field/timelineOverlays";
import type { Pt } from "@/items/itemOutlines";
import type { DrawnItemOutline } from "./fieldItems";
import { SELECTION_RGBA01 } from "./selectionRing";

/** An Outline's line, in CSS px: thicker while selected. */
export const ITEM_STROKE_WIDTH = 1.5;
export const SELECTED_ITEM_STROKE_WIDTH = 2.5;
/** An Outline's fill: the theme's line color, faint enough for the field to show through. */
export const ITEM_FILL_ALPHA = 0.25;
/**
 * A prop with its own color: filled with it, strong enough to read as that color on both themes'
 * fields, still letting the grid show through. Its line stays the theme's, so a pale color keeps
 * an edge on a light field.
 */
export const COLORED_ITEM_FILL_ALPHA = 0.6;
/** A dimmed item (outside an isolated move), as dimmed marchers. */
export const DIMMED_ITEM_ALPHA = 0.3;

/** A filled polygon, in field units. */
export type FillPlan = { readonly points: readonly Pt[]; readonly color: Rgba };

/** What the items layer draws: each Outline's fill, then its line. Line widths are CSS px. */
export type ItemsPlan = {
    readonly fills: readonly FillPlan[];
    readonly strokes: readonly StrokePlan[];
};

const faded = (color: Rgba, alpha: number): Rgba => [
    color[0],
    color[1],
    color[2],
    color[3] * alpha,
];

/**
 * The items layer's plan: every Outline filled in its prop's color (or
 * faintly in the theme's line color) and outlined in the theme's line color,
 * a selected one outlined in the selection color.
 */
export function planItems(
    outlines: readonly DrawnItemOutline[],
    {
        theme,
        selected,
        isDimmed,
    }: {
        theme: FieldTheme;
        selected: ReadonlySet<number>;
        isDimmed: (id: number) => boolean;
    },
): ItemsPlan {
    const line = rgbaOf(theme.primaryStroke);
    const selection = SELECTION_RGBA01 as unknown as Rgba;
    const fills: FillPlan[] = [];
    const strokes: StrokePlan[] = [];
    for (const outline of outlines) {
        const alpha = isDimmed(outline.id) ? DIMMED_ITEM_ALPHA : 1;
        const isSelected = selected.has(outline.id);
        fills.push({
            points: outline.points,
            color: outline.color
                ? rgbaOf(outline.color, COLORED_ITEM_FILL_ALPHA * alpha)
                : faded(line, ITEM_FILL_ALPHA * alpha),
        });
        strokes.push({
            points: outline.closed
                ? [...outline.points, outline.points[0]]
                : outline.points,
            color: faded(isSelected ? selection : line, alpha),
            width: isSelected ? SELECTED_ITEM_STROKE_WIDTH : ITEM_STROKE_WIDTH,
            dash: null,
            round: true,
        });
    }
    return { fills, strokes };
}
