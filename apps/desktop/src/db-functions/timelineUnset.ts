import { and, eq, inArray } from "drizzle-orm";
import { schema } from "@/global/database/db";
import type { DbConnection, DbTransaction } from "./types";
import { transactionWithHistory } from "./history";
import { clearOwnPageMoves } from "./timelineMoveHelpers";
import {
    keepNextPageInTransaction,
    readNextPageSpots,
} from "./timelineNextPageStays";
import type { TimelineEditRefusedError } from "@/timeline/timelineEditRefusals";
import {
    joinMovesAtInTransaction,
    deleteEmptiedOwnMoves,
    readMoveEnds,
    takePartOfGroupsApartInTransaction,
    type NotJoined,
} from "./timelineJoinAtBeat";
import { skippedRefusal } from "./timelineMoveCuts";

/**
 * **Unset** (Set vs Following, #300): takes back the coordinate marchers have on one count, so
 * they follow from earlier there. Each marcher's moves ending on the count are deleted, with their
 * transitions and any timeline that leaves empty (`clearOwnPageMoves`).
 *
 * **Unset here** (#304) keeps the later pages that followed the deleted spot where they were: the
 * first page box starting on or after the count gets a move of the marcher's own, ending where it
 * stood there before the edit, for each marcher that follows there and would otherwise move
 * (Set as shown with `at`, as Only Page N writes it). That move walks somewhere, so its end is a
 * keyframe the designer can see and remove in turn (owner, 2026-10-20): an ordinary move (holds
 * decision 15). Pages after it follow it. **Unset here
 * and on Pages N–M** (#305) is the same delete without the stay (`keepLaterPages` false), so the
 * followers carry back to the earlier spot.
 *
 * Where the marchers' next move starts on the count, the count isn't a page flag and the whole
 * membership of the removed move was selected, the two moves join back into one
 * (`timelineJoinAtBeat.ts`, holds decision 14, #470): the marcher walks the move as it was before
 * Split at playhead, at even speed. The join comes before the stays, so a joined marcher, which
 * still gets where it did, needs none. Where the join is refused, those marchers keep the plain
 * Remove and come back in `notJoined` with the reason, for the UI's toast.
 *
 * Where only part of the move's membership was selected (R4, #471), those marchers are first taken
 * out of both halves into moves of their own (`takePartOfGroupsApartInTransaction`), which then
 * join; the others keep both halves. Shape and follow-the-leader members can't be taken out: they
 * keep the plain Remove, and `notTakenApart` names them. Where their join is refused, the
 * emptied move of their own before the count is deleted (`deleteEmptiedOwnMoves`).
 *
 * Callers pass the marchers that are Set on the count (`timelineSetFollowing`); a marcher with no
 * move ending there is skipped. Nobody to unset writes nothing and adds no undo step.
 */

/** What an Unset did. */
export interface UnsetResult {
    /** The marchers whose coordinate on the count was deleted, ascending */
    unset: number[];
    /** Of those, the ones whose two moves around the count were joined into one, ascending */
    joined: number[];
    /** Of those, the ones whose moves weren't joined because the fit was refused, with why */
    notJoined: NotJoined[];
    /**
     * Shape and follow-the-leader members that couldn't be taken out of part of a group to join
     * (#471) and kept the plain Remove, with the refusal's message (`skippedRefusal`), for the
     * toast after the rest was written
     */
    notTakenApart?: TimelineEditRefusedError;
}

const ascending = (ids: Iterable<number>) =>
    [...new Set(ids)].sort((a, b) => a - b);

/** Thrown inside an edit that turned out to write nothing, so it rolls back with no undo step. */
class NothingToUnset extends Error {
    constructor(readonly result: UnsetResult) {
        super("nothing to unset");
    }
}

/**
 * Unset inside a caller's edit (see the module comment). With `tidyShared` (Basic), a shared
 * transition the delete leaves is compacted and one it empties is deleted, so Basic makes no
 * vacant slot; otherwise a slot in a shared move is left vacant (D-13).
 */
export async function unsetMarchersAtInTransaction({
    tx,
    beat,
    marcherIds,
    keepLaterPages,
    tidyShared = false,
}: {
    tx: DbTransaction;
    beat: number;
    marcherIds: readonly number[];
    keepLaterPages: boolean;
    tidyShared?: boolean;
}): Promise<UnsetResult> {
    const result: UnsetResult = { unset: [], joined: [], notJoined: [] };
    if (marcherIds.length === 0) return result;
    // Part of a group: take them out of both halves first, so their own moves join below
    const apart = await takePartOfGroupsApartInTransaction({
        tx,
        beat,
        marcherIds,
    });
    const a = schema.timeline_assignments;
    const rows = await tx
        .select()
        .from(a)
        .where(
            and(inArray(a.marcher_id, [...marcherIds]), eq(a.end_beat, beat)),
        )
        .all();
    if (rows.length === 0) return result;
    result.unset = ascending(rows.map((r) => r.marcher_id));

    // Where the later pages begin, and where each marcher stands there before the delete
    const later = keepLaterPages
        ? await readNextPageSpots(tx, beat, result.unset)
        : null;

    const ends = await readMoveEnds(
        tx,
        rows.map((r) => r.id),
    );
    await clearOwnPageMoves(tx, rows, { tidyShared });
    const join = await joinMovesAtInTransaction({ tx, beat, ends });
    result.joined = join.joined;
    result.notJoined = join.notJoined;
    await deleteEmptiedOwnMoves(tx, apart.ownMovesBefore);
    const notTaken = await skippedRefusal(tx, apart.leftInGroup);
    if (notTaken) result.notTakenApart = notTaken;

    await keepNextPageInTransaction(tx, later);
    return result;
}

/**
 * **Unset here** as one undoable edit (`unsetMarchersAtInTransaction` with the stays), or with
 * `keepLaterPages` false **Unset here and on Pages N–M** (no stays: the followers carry back).
 */
export async function unsetMarchersAt({
    db,
    beat,
    marcherIds,
    keepLaterPages = true,
    tidyShared = false,
}: {
    db: DbConnection;
    beat: number;
    marcherIds: readonly number[];
    keepLaterPages?: boolean;
    tidyShared?: boolean;
}): Promise<UnsetResult> {
    try {
        return await transactionWithHistory(
            db,
            keepLaterPages ? "unsetMarchersAt" : "unsetMarchersAndFollowersAt",
            async (tx) => {
                const result = await unsetMarchersAtInTransaction({
                    tx,
                    beat,
                    marcherIds,
                    keepLaterPages,
                    tidyShared,
                });
                if (result.unset.length === 0) throw new NothingToUnset(result);
                return result;
            },
        );
    } catch (e) {
        if (e instanceof NothingToUnset) return e.result;
        throw e;
    }
}
