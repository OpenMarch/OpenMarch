/** The timeline's height against the canvas: the clamp, the minimums and the keyboard step. */

export const MIN_TIMELINE_HEIGHT = 120;
export const MIN_CANVAS_HEIGHT = 200;
export const TIMELINE_SPLIT_KEY_STEP = 16;
/** Room taken by the splitter and the gaps around it */
export const TIMELINE_SPLIT_GUTTER = 16;

/** The tallest the timeline pane gets: the canvas keeps its minimum. */
export function maxTimelineHeight(available: number): number {
    return Math.max(
        MIN_TIMELINE_HEIGHT,
        available - MIN_CANVAS_HEIGHT - TIMELINE_SPLIT_GUTTER,
    );
}

/**
 * Keeps the timeline at least `MIN_TIMELINE_HEIGHT` tall and leaves the canvas at least
 * `MIN_CANVAS_HEIGHT`. `available` is the workspace height the toolbar, canvas and timeline
 * share; in a window too short for both minimums the timeline's minimum wins.
 */
export function clampTimelineHeight(height: number, available: number): number {
    const value = Number.isFinite(height) ? height : MIN_TIMELINE_HEIGHT;
    return Math.round(
        Math.min(
            maxTimelineHeight(available),
            Math.max(MIN_TIMELINE_HEIGHT, value),
        ),
    );
}

/**
 * A saved height from storage. `null` (the default) means no height was chosen: the pane is
 * as small as it can be and still show every track.
 */
export function parseTimelineHeight(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) && value > 0
        ? value
        : null;
}
