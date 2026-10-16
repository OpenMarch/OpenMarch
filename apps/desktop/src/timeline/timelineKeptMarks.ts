/**
 * Kept marks (docs/timeline/ui.md UI-18, kept marchers on the field): a broken chain beside the
 * dot of each marcher kept on the current page. Where a mark goes and what's under the pointer,
 * for both fields; pure.
 */

/** A marcher kept on the current page, and its mark's tooltip. */
export interface TimelineKeptMark {
    readonly marcherId: number;
    readonly text: string;
}

/** A dot's radius in field units, as drawn (`MarchersLayer`). */
const DOT_RADIUS = 5;
/** The mark's side on screen: about a drill number's height, never tiny, never loud. */
const SIZE_PER_ZOOM = 12;
const MIN_SIZE = 10;
const MAX_SIZE = 16;
/** Screen pixels between the dot and the mark */
const GAP = 1.5;
/** The glyph's share of the mark; the rest is the white backing around it */
export const KEPT_MARK_GLYPH_SHARE = 0.86;
/** The light theme's accent, as the timeline's kept chip; the white backing reads on any field */
export const KEPT_MARK_COLOR = "rgb(100, 66, 255)";
export const KEPT_MARK_BACKING = "rgba(255, 255, 255, 0.95)";
export const KEPT_MARK_BACKING_EDGE = "rgba(0, 0, 0, 0.18)";
/** The backing's corner radius, as a share of its side */
export const KEPT_MARK_CORNER = 0.28;

/** Phosphor's LinkBreak, bold (the timeline's kept chip), on its 256 × 256 grid */
export const LINK_BREAK_PATH =
    "M195.8,60.2a28,28,0,0,0-39.51-.09L144.68,72.28a12,12,0,1,1-17.36-16.56L139,43.43l.2-.2a52,52,0,0,1,73.54,73.54l-.2.2-12.29,11.71a12,12,0,0,1-16.56-17.36l12.17-11.61A28,28,0,0,0,195.8,60.2ZM111.32,183.72,99.71,195.89a28,28,0,0,1-39.6-39.6l12.17-11.61a12,12,0,0,0-16.56-17.36L43.43,139l-.2.2a52,52,0,0,0,73.54,73.54l.2-.2,11.71-12.29a12,12,0,1,0-17.36-16.56ZM216,148H192a12,12,0,0,0,0,24h24a12,12,0,0,0,0-24ZM40,108H64a12,12,0,0,0,0-24H40a12,12,0,0,0,0,24Zm120,72a12,12,0,0,0-12,12v24a12,12,0,0,0,24,0V192A12,12,0,0,0,160,180ZM96,76a12,12,0,0,0,12-12V40a12,12,0,0,0-24,0V64A12,12,0,0,0,96,76Z";

/** A mark's square in field coordinates: its top left corner and side. */
export interface KeptMarkBox {
    readonly x: number;
    readonly y: number;
    readonly size: number;
}

/**
 * Where the kept mark goes for a dot centered at `dot` (field coordinates) at `zoom`: just right
 * of the dot and a little below its center, clear of the drill number above it. Its side is
 * `SIZE_PER_ZOOM` field units on screen, held between 10 and 16 screen pixels.
 */
export function keptMarkBox(
    dot: { readonly x: number; readonly y: number },
    zoom: number,
    dotRadius = DOT_RADIUS,
): KeptMarkBox {
    const z = zoom > 0 ? zoom : 1;
    const screen = Math.min(MAX_SIZE, Math.max(MIN_SIZE, SIZE_PER_ZOOM * z));
    const size = screen / z;
    return {
        x: dot.x + dotRadius + GAP / z,
        y: dot.y + dotRadius * 0.4 - size / 2,
        size,
    };
}

/** Whether the field point (`x`, `y`) is on `box`. */
export const inKeptMarkBox = (box: KeptMarkBox, x: number, y: number) =>
    x >= box.x && x <= box.x + box.size && y >= box.y && y <= box.y + box.size;

/**
 * The mark under the field point (`x`, `y`) at `zoom`: on its square, or within one and a half
 * dot radii of its marcher's dot. `placed` lists the drawn marks with their dots, in drawing
 * order; null for none.
 */
export function keptMarkAt<M>(
    placed: readonly {
        readonly mark: M;
        readonly dot: { readonly x: number; readonly y: number };
    }[],
    x: number,
    y: number,
    zoom: number,
): M | null {
    for (const { mark, dot } of placed) {
        if (inKeptMarkBox(keptMarkBox(dot, zoom), x, y)) return mark;
        if (Math.hypot(x - dot.x, y - dot.y) <= DOT_RADIUS * 1.5) return mark;
    }
    return null;
}
