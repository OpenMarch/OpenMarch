import type { KeptPageBox, KeptState } from "@/timeline/timelineKept";
import { countsText } from "@/timeline/timelineRangeWords";
import { text } from "@/timeline/timelineText";
import type { DbConnection } from "./types";
import { transactionWithHistory } from "./history";
import { refuse } from "./timelineErrors";
import { readPageGrid } from "./timelineRipple";
import { isPageBox } from "./timelineMoves";
import { keepMarchersOnPageInTransaction } from "./timelineKeepHere";

/**
 * **Set as shown** on a page box, in timeline mode (holds, fork #466; holds README decisions 1
 * and 12, review R6; ADR 0001 amendment draft part 1).
 *
 * A marcher with no row over any beat of a page box is **Not set** there: it shows the spot it
 * last moved to, and an edit of that earlier page carries into this one. Set as shown gives each
 * such marcher an ordinary one-slot move over the box (C-11), ending at the spot it shows there,
 * so the page becomes **Set** and later edits of earlier pages stop at it. Nothing marks the move
 * as kept: it is the marcher's own page move like any other, so Clear this page, the page deletes
 * and later edits treat it as one.
 *
 * Marchers already Set on the page (their own move there, or a kept spot) and marchers partway
 * through a longer move at one of the box's flags are left untouched and reported. The command is
 * one undo step; one that would write nothing opens no edit.
 */

/** A marcher Set as shown left alone, with its state on the box. */
export interface SetAsShownSkip {
    marcherId: number;
    state: Exclude<KeptState, "follows">;
}

/** What **Set as shown** did, marcher ids ascending. */
export interface SetAsShownResult {
    /** The marchers that now have their own move over the box */
    changed: number[];
    /** The others, with why */
    skipped: SetAsShownSkip[];
}

/** Thrown inside an edit that turned out to write nothing, so it rolls back with no undo step. */
class NothingToDo extends Error {
    constructor(readonly result: SetAsShownResult) {
        super("nothing to set as shown");
    }
}

/**
 * **Set as shown**: each of `marcherIds` that is Not set on the page box `pageBox` gets its own
 * move over the box, ending where it stands there. Refused (E-ARGS) when `pageBox` isn't a page's
 * box or a marcher doesn't exist. Nobody Not set writes nothing and adds no undo step.
 */
export async function setAsShownOnPage({
    db,
    pageBox,
    marcherIds,
}: {
    db: DbConnection;
    pageBox: KeptPageBox;
    marcherIds: readonly number[];
}): Promise<SetAsShownResult> {
    if (marcherIds.length === 0) return { changed: [], skipped: [] };
    try {
        return await transactionWithHistory(
            db,
            "setAsShownOnPage",
            async (tx) => {
                const grid = await readPageGrid(tx);
                // Worded in pages and counts like the other refusals; home has no box
                if (!isPageBox(grid, pageBox))
                    refuse(
                        text.t("timeline.refusals.setAsShown.wholePage", {
                            counts: countsText(pageBox, grid.pages.slice(1)),
                        }),
                    );
                const written = await keepMarchersOnPageInTransaction({
                    tx,
                    pageBox,
                    marcherIds,
                    // An ordinary move: nothing marks the page as kept (holds decision 1)
                    markKept: false,
                });
                const result: SetAsShownResult = {
                    changed: written.changed,
                    skipped: written.skipped.map(({ marcherId, state }) => ({
                        marcherId,
                        state: state as SetAsShownSkip["state"],
                    })),
                };
                if (result.changed.length === 0) throw new NothingToDo(result);
                return result;
            },
        );
    } catch (e) {
        if (e instanceof NothingToDo) return e.result;
        throw e;
    }
}
