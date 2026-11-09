/**
 * Rules about Held holds that the writes and the displays both read, kept free of the database so
 * the timeline's bars can't disagree with what an edit does (holds, fork #476).
 */

/**
 * **An Expert window over a Held hold** (holds decision 6, review R2, demo M6; owner confirmed,
 * 2026-11-09): whether a window starting at `windowStart`, ending inside `hold`, **wins** over it.
 * It wins when it starts after the hold's start (inside it): the marcher's edit becomes the
 * window's move, and the hold ends at the start flag. A window starting at or before the hold's
 * start loses: the edit sets the move the hold grows out of, so the whole hold moves. This goes
 * for every window, a page's ordinary window on a later page of a multi-page hold too. Read by the
 * write (`splitHeldEditsInTransaction`) and the bars' drag lighting (`dragLitRanges`). Basic has
 * no window, so a Basic edit always moves the whole hold.
 */
export const windowWinsOverHold = (
    windowStart: number,
    hold: { readonly start: number },
): boolean => windowStart > hold.start;
