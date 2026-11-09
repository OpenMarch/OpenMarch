import type { XY } from "@openmarch/core";
import { schema } from "@/global/database/db";
import { assignmentFromRow } from "@/timeline/timelineRows";
import {
    pageBoxStatesForSelection,
    type PageBoxRange,
    type PageBoxState,
} from "@/timeline/timelinePageBoxState";
import { countsText } from "@/timeline/timelineRangeWords";
import { text } from "@/timeline/timelineText";
import type { DbConnection, DbTransaction } from "./types";
import { transactionWithHistory } from "./history";
import { NothingToDo, refuse } from "./timelineErrors";
import { readPageGrid } from "./timelineRipple";
import { isPageBox } from "./timelineMoves";
import { addMarchersToTimelineInTransaction } from "./timelineMembership";
import { readHeldMarks } from "./timelineHeldMarks";
import { overlapsBox } from "@/timeline/basicSimple";
import { updateTimelineSlotDestinationInTransaction } from "./timelineTransitionsInTransaction";

/**
 * **Set as shown** on a page box, in timeline mode (holds, fork #466; holds README decisions 1
 * and 12, review R6; ADR 0012 amendment 2026-10-29).
 *
 * A marcher with no row over any beat of a page box is **Not set** there: it shows the spot it
 * last moved to, and an edit of that earlier page carries into this one. Set as shown gives each
 * such marcher an ordinary one-slot move over the box (C-11), ending at the spot it shows there,
 * so the page becomes **Set** and later edits of earlier pages stop at it. Nothing marks the move:
 * it is the marcher's own page move like any other, so Clear this page, the page deletes and later
 * edits treat it as one.
 *
 * The same write keeps later pages where they were for **Only Page N** after an edit and for
 * **Remove keyframe**'s next page (`at`: the move ends at the spot the marcher stood at before the
 * edit, so it walks there). Stored kept spots, which these once wrote, are gone (holds decision
 * 1, #467).
 *
 * Marchers already Set on the page (their own move there), marchers **Held** over any of it (a
 * Held hold is a decision already: they stand still there on purpose, #472), and marchers partway
 * through a longer move at one of the box's flags are left untouched and reported. The command is one undo step;
 * one that would write nothing opens no edit.
 */

/** A marcher Set as shown left alone, with its state on the box. */
export interface SetAsShownSkip {
    marcherId: number;
    /** `held`: Held over some of the box (a stored mark, with no row there) */
    state: Exclude<PageBoxState, "follows"> | "held";
}

/** What **Set as shown** did, marcher ids ascending. */
export interface SetAsShownResult {
    /** The marchers that now have their own move over the box */
    changed: number[];
    /** The others, with why */
    skipped: SetAsShownSkip[];
}

const ascending = (ids: Iterable<number>) => [...ids].sort((a, b) => a - b);

/**
 * Each of `marcherIds`' state on each of `pageBoxes` (`pageBoxStatesForSelection`), read from the
 * stored rows.
 */
export async function pageBoxStatesOnPageBoxes({
    db,
    pageBoxes,
    marcherIds,
}: {
    db: DbConnection | DbTransaction;
    pageBoxes: readonly PageBoxRange[];
    marcherIds: readonly number[];
}) {
    const rows = await db.select().from(schema.timeline_assignments).all();
    return pageBoxStatesForSelection({
        assignments: rows.map(assignmentFromRow),
        boxes: pageBoxes,
        marcherIds,
    });
}

/**
 * **Set as shown**: each of `marcherIds` that is Not set on the page box `pageBox` gets its own
 * move over the box, ending where it stands there (or at its spot in `at`). Refused (E-ARGS) when
 * `pageBox` isn't a page's box, or a marcher doesn't exist (or an `at` spot isn't a valid
 * destination). Nobody Not set writes nothing and adds no undo step.
 */
export async function setAsShownOnPage({
    db,
    pageBox,
    marcherIds,
    at,
}: {
    db: DbConnection;
    pageBox: PageBoxRange;
    marcherIds: readonly number[];
    /** Where some marchers end the box, when not where they stand there */
    at?: ReadonlyMap<number, XY>;
}): Promise<SetAsShownResult> {
    if (marcherIds.length === 0) return { changed: [], skipped: [] };
    try {
        return await transactionWithHistory(
            db,
            "setAsShownOnPage",
            async (tx) => {
                const result = await setAsShownOnPageInTransaction({
                    tx,
                    pageBox,
                    marcherIds,
                    at,
                });
                if (result.changed.length === 0) throw new NothingToDo(result);
                return result;
            },
        );
    } catch (e) {
        if (e instanceof NothingToDo) return e.result as SetAsShownResult;
        throw e;
    }
}

/** `setAsShownOnPage` inside a caller's edit; setting nobody writes nothing. */
export async function setAsShownOnPageInTransaction({
    tx,
    pageBox,
    marcherIds,
    at,
}: {
    tx: DbTransaction;
    pageBox: PageBoxRange;
    marcherIds: readonly number[];
    at?: ReadonlyMap<number, XY>;
}): Promise<SetAsShownResult> {
    const grid = await readPageGrid(tx);
    // Worded in pages and counts like the other refusals; home has no box
    if (!isPageBox(grid, pageBox))
        refuse(
            text.t("timeline.refusals.defineAsShown.wholePage", {
                defineAsShown: text.t("timeline.terms.defineAsShown"),
                counts: countsText(pageBox, grid.pages.slice(1)),
            }),
        );
    if (marcherIds.length === 0) return { changed: [], skipped: [] };
    const { states } = (
        await pageBoxStatesOnPageBoxes({
            db: tx,
            pageBoxes: [pageBox],
            marcherIds,
        })
    )[0]!;
    // The resolver's view counts a Held marcher as Not set (it has no row there); its mark says
    // otherwise
    const held = new Set(
        (await readHeldMarks(tx, [...states.keys()]))
            .filter((m) => overlapsBox(m, pageBox))
            .map((m) => m.marcherId),
    );
    const stateOf = (id: number) =>
        held.has(id) ? ("held" as const) : states.get(id)!;
    const toSet = ascending(
        [...states.keys()].filter((id) => stateOf(id) === "follows"),
    );
    const result: SetAsShownResult = {
        changed: toSet,
        skipped: ascending(states.keys()).flatMap((marcherId) => {
            const state = stateOf(marcherId);
            return state === "follows" ? [] : [{ marcherId, state }];
        }),
    };
    if (toSet.length === 0) return result;
    // Each one holds through the box, so the add's destination (where it is at the box's
    // end) is where it stands at the box's start: a move that goes nowhere
    const { added } = await addMarchersToTimelineInTransaction({
        tx,
        range: pageBox,
        marcherIds: toSet,
    });
    for (const own of added) {
        const point = at?.get(own.marcherId);
        if (point)
            await updateTimelineSlotDestinationInTransaction({
                tx,
                transitionId: own.transitionId,
                slotIndex: 0,
                point,
            });
    }
    return result;
}
