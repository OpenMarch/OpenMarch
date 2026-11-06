import type { DbConnection, DbTransaction } from "./types";
import { transactionWithHistory } from "./history";
import { NothingToDo, refuse } from "./timelineErrors";
import { readBasicRows } from "./basicRows";
import {
    arrivalSkipReason,
    isInsideHeldMark,
    marcherRecipeTimelines,
    readArrival,
    readHeldMarks,
} from "./timelineHeldMarks";
import { heldOneAt } from "@/timeline/heldRules";
import { HOME_ARRIVAL, marchersWithShapeHome } from "./timelineHeldArrival";
import {
    writeJoinedHeldMarkInTransaction,
    type HoldSkip,
} from "./timelineHoldOverWindow";

/**
 * **Make all selected Held** (holds, fork #476; review R1, 01-edit-rules "Make all selected Held"):
 * for a selection that is mixed at the count `beat`, some Held there and some not, each selected
 * marcher that stands still at `beat` without a hold gets one like the Held one's: over the same
 * counts, starting at the later of that hold's start and the marcher's own last arrival, and ending
 * at the earlier of that hold's end and the marcher's next move. Holds are always explicit, so a
 * mixed drag never does this by itself (R1: each marcher by its own kind, no toast).
 *
 * - **The Held one** (`heldOneAt`) is the selected marchers' hold over `beat` that starts latest
 *   (ties: the lowest marcher id), so the others' new holds cover only counts where every Held one
 *   is holding, whatever order the marchers were selected or stored in.
 * - A marcher on its starting spot until `beat` is Held from the Held one's start (#619).
 * - A marcher whose own last arrival is **earlier** than the Held one's start is left alone
 *   (`noArrival`): a hold starting where nothing arrives is a borrowed hold (04-anchors), which
 *   only #474 stores, and starting it at the earlier arrival would make a hold unlike the Held
 *   one's, which a drag of both would then route differently (an Expert window starting at the
 *   Held one's start would move that one's hold and cut this one's).
 * - It joins a mark of its own that it touches (touching holds are one hold).
 *
 * Left alone and reported (`MakeHeldSkipReason`): `moving` (partway through a move at `beat`),
 * `defined` (a move of its own ends at `beat`), and, as Hold from previous page, `arrivalShape`,
 * `arrivalFollowLeader` and `homeShape` (the hold would grow out of a shape's or a
 * follow-the-leader move, or a shape's starting spot), or `noArrival` (above).
 *
 * Refused (E-ARGS) when no selected marcher is Held at `beat`. One undo step; a run that holds
 * nobody opens no edit.
 */

/** Why Make all selected Held left a marcher alone. */
export type MakeHeldSkipReason =
    | "moving"
    | "defined"
    | "arrivalShape"
    | "arrivalFollowLeader"
    | "homeShape"
    | "noArrival";

/** What **Make all selected Held** did, marcher ids ascending. */
export interface MakeHeldResult {
    /** The marchers it made Held */
    held: number[];
    /** The others not Held at the count, with why */
    skipped: HoldSkip<MakeHeldSkipReason>[];
}

/** **Make all selected Held** at `beat` for `marcherIds` (see the module comment). */
export async function makeSelectedHeld({
    db,
    beat,
    marcherIds,
}: {
    db: DbConnection;
    beat: number;
    marcherIds: readonly number[];
}): Promise<MakeHeldResult> {
    if (marcherIds.length === 0) return { held: [], skipped: [] };
    try {
        return await transactionWithHistory(
            db,
            "makeSelectedHeld",
            async (tx) => {
                const result = await makeSelectedHeldInTransaction({
                    tx,
                    beat,
                    marcherIds,
                });
                if (result.held.length === 0) throw new NothingToDo(result);
                return result;
            },
        );
    } catch (e) {
        if (e instanceof NothingToDo) return e.result as MakeHeldResult;
        throw e;
    }
}

/** `makeSelectedHeld` inside the caller's edit. */
export async function makeSelectedHeldInTransaction({
    tx,
    beat,
    marcherIds,
}: {
    tx: DbTransaction;
    beat: number;
    marcherIds: readonly number[];
}): Promise<MakeHeldResult> {
    const ids = [...new Set(marcherIds)].sort((x, y) => x - y);
    const marks = await readHeldMarks(tx, ids);
    const like = heldOneAt(marks, beat);
    if (!like)
        refuse(
            `Make all selected Held needs a selected marcher Held at beat ${beat}`,
        );
    const rows = await readBasicRows(tx, { marcherIds: ids });
    const result: MakeHeldResult = { held: [], skipped: [] };
    const planned: { marcherId: number; start: number; end: number }[] = [];
    for (const marcherId of ids) {
        if (
            marks.some(
                (m) => m.marcherId === marcherId && isInsideHeldMark(m, beat),
            )
        )
            continue;
        const own = rows.filter((r) => r.marcherId === marcherId);
        if (own.some((r) => r.start < beat && beat < r.end)) {
            result.skipped.push({ marcherId, reason: "moving" });
            continue;
        }
        if (own.some((r) => r.end === beat)) {
            result.skipped.push({ marcherId, reason: "defined" });
            continue;
        }
        const before = own.filter((r) => r.end < beat).map((r) => r.end);
        // From its starting spot any start works, so the Held one's; else its own last arrival,
        // unless that is earlier than the Held one's start (a borrowed start, until #474)
        const start = before.length === 0 ? like.start : Math.max(...before);
        if (start < like.start) {
            result.skipped.push({ marcherId, reason: "noArrival" });
            continue;
        }
        const end = Math.min(
            like.end,
            ...own.filter((r) => r.start >= beat).map((r) => r.start),
        );
        planned.push({ marcherId, start, end });
    }
    const fromHome = planned
        .filter(
            (p) =>
                !rows.some(
                    (r) => r.marcherId === p.marcherId && r.start < p.start,
                ),
        )
        .map((p) => p.marcherId);
    const shapeHome = await marchersWithShapeHome(tx, fromHome);
    for (const plan of planned) {
        const reason = await startReason(tx, plan, shapeHome);
        if (reason) {
            result.skipped.push({ marcherId: plan.marcherId, reason });
            continue;
        }
        await writeJoinedHeldMarkInTransaction(
            tx,
            marks.filter((m) => m.marcherId === plan.marcherId),
            plan,
        );
        result.held.push(plan.marcherId);
    }
    result.skipped.sort((x, y) => x.marcherId - y.marcherId);
    return result;
}

/** Why a hold of `plan`'s marcher starting at `plan.start` can't be made, or null when it can. */
async function startReason(
    tx: DbTransaction,
    plan: { marcherId: number; start: number },
    shapeHome: ReadonlySet<number>,
): Promise<MakeHeldSkipReason | null> {
    const arrival = await readArrival(tx, plan.marcherId, plan.start);
    if (arrival === HOME_ARRIVAL)
        return shapeHome.has(plan.marcherId) ? "homeShape" : null;
    if (!arrival) return "noArrival";
    const inRecipe =
        (await marcherRecipeTimelines(tx, [arrival.timelineId]))
            .get(arrival.timelineId)
            ?.has(plan.marcherId) ?? false;
    const reason = arrivalSkipReason(arrival, inRecipe);
    if (reason === "followTheLeader") return "arrivalFollowLeader";
    if (reason === "shape") return "arrivalShape";
    return null;
}
