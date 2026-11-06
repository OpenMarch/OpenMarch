/**
 * Rules about Held holds that the writes and the displays both read, kept free of the database so
 * the inspector's drag preview (`holdDragPreview`) and the timeline's bars can't disagree with what
 * an edit does (holds, fork #476).
 */

/** As much of a stored Held mark as these rules read. */
interface Mark {
    readonly marcherId: number;
    readonly start: number;
    readonly end: number;
}

/**
 * **An Expert window over a Held hold** (holds decision 6, review R2, demo M6): whether a window
 * starting at `windowStart`, ending inside `hold`, **wins** over it. It wins when it starts after
 * the hold's start (inside it): the marcher's edit becomes the window's move, and the hold ends at
 * the start flag. A window starting at or before the hold's start loses: the edit sets the move
 * the hold grows out of, so the whole hold moves. Read by the write
 * (`splitHeldEditsInTransaction`) and the drag preview.
 */
export const windowWinsOverHold = (
    windowStart: number,
    hold: { readonly start: number },
): boolean => windowStart > hold.start;

/**
 * **The Held one** of Make all selected Held (review R1): of `marks` over the count `beat`
 * (`start < beat <= end`), the one starting latest, the lowest marcher id's on a tie; undefined
 * when none is over `beat`. Every Held marcher among them already holds from its own start to
 * `beat`, so holds made like the latest-starting one cover only counts where all of them are
 * holding, whatever order the marchers were selected or stored in.
 */
export function heldOneAt<M extends Mark>(
    marks: readonly M[],
    beat: number,
): M | undefined {
    let held: M | undefined;
    for (const mark of marks) {
        if (!(mark.start < beat && beat <= mark.end)) continue;
        if (
            !held ||
            mark.start > held.start ||
            (mark.start === held.start && mark.marcherId < held.marcherId)
        )
            held = mark;
    }
    return held;
}
