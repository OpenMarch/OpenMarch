import { createResolver, type XY } from "@openmarch/core";
import { readTimelineTables } from "@/timeline/timelineRows";
import type { DbTransaction } from "./types";
import { readPageGrid } from "./timelineRipple";
import { FIRST_PAGE_ID } from "./rowMappers";
import { samePosition } from "./timelineMoves";
import { setAsShownOnPageInTransaction } from "./timelineSetAsShown";
import {
    cutMoveAtBeatInTransaction,
    planRemovalFromRange,
    rowsIn,
    takeMarchersIntoOwnMoveInTransaction,
} from "./timelineMoveCuts";
import { splitRefusal } from "./timelineSplitMoves";
import { updateTimelineSlotDestinationInTransaction } from "./timelineTransitionsInTransaction";

/**
 * Keeps the page after an edit where it was, for an edit that takes a spot back: **Remove
 * keyframe** (#304) and **Clear Page N** (#573). Read the spots before the edit
 * (`readNextPageSpots`), then, after it, give each marcher that would otherwise move there a move
 * of its own back to its old spot (`keepNextPageInTransaction`, Set as shown with `at`). That move
 * walks somewhere, so its end is a keyframe like any other (holds decision 15), and the pages
 * after it follow it. Without this step the later pages follow back to the earlier spot (**…,
 * Pages N–M follow back**).
 *
 * Clear Page N also keeps a next page that a move left over from its cut runs through
 * (`cutMovesAcross`): a marcher whose move crosses the next page's flag is partway through it
 * there, so Set as shown leaves it alone. The marcher is taken into a move of its own, which is
 * cut at the flag (`cutMoveAtBeatInTransaction`), and its part before ends at the old spot, so the
 * pages after walk on from there as before (holds decision 16: other pages keep their motion).
 * Others sharing the move keep it as it was.
 */

/** The first page box starting on or after `beat`, or null past the last page. */
export async function nextPageBox(
    tx: DbTransaction,
    beat: number,
): Promise<{ start: number; end: number } | null> {
    const grid = await readPageGrid(tx);
    const next = grid.pages
        .filter((p) => p.id !== FIRST_PAGE_ID && p.start >= beat)
        .sort((x, y) => x.start - y.start)[0];
    return next && next.end > next.start
        ? { start: next.start, end: next.end }
        : null;
}

/** The page box after `beat` and where each marcher stands at its end, before an edit. */
export interface NextPageSpots {
    readonly box: { start: number; end: number };
    readonly before: ReadonlyMap<number, XY>;
}

/** `marcherIds`' spots at the end of the page box starting at or after `beat`; null past the end. */
export async function readNextPageSpots(
    tx: DbTransaction,
    beat: number,
    marcherIds: readonly number[],
): Promise<NextPageSpots | null> {
    if (marcherIds.length === 0) return null;
    const box = await nextPageBox(tx, beat);
    if (!box) return null;
    const resolver = createResolver((await readTimelineTables(tx)).snapshot);
    return {
        box,
        before: new Map(
            marcherIds.map((id) => [id, resolver.positionAt(id, box.end)]),
        ),
    };
}

/**
 * After the edit: the marchers in `spots` that now stand elsewhere at the next page's end get a
 * move of their own over it, back to their old spot, unless in `except`. Marchers Set or Held
 * there are left alone (`setAsShownOnPageInTransaction`), and so are those partway through a move
 * at its flag, unless `cutMovesAcross` (see the module comment).
 *
 * @returns the marchers kept, ascending
 */
export async function keepNextPageInTransaction(
    tx: DbTransaction,
    spots: NextPageSpots | null,
    except: ReadonlySet<number> = new Set(),
    { cutMovesAcross = false }: { cutMovesAcross?: boolean } = {},
): Promise<number[]> {
    if (!spots) return [];
    const at = await nextPageMoved(tx, spots, except);
    if (at.size === 0) return [];
    const { changed } = await setAsShownOnPageInTransaction({
        tx,
        pageBox: spots.box,
        marcherIds: [...at.keys()],
        at,
    });
    if (!cutMovesAcross) return changed;
    const set = new Set(changed);
    const cut = await keepThroughMovesAcrossInTransaction(
        tx,
        spots.box.end,
        new Map([...at].filter(([id]) => !set.has(id))),
    );
    return [...changed, ...cut].sort((a, b) => a - b);
}

/** The marchers in `spots`, not in `except`, standing elsewhere at the box's end now, with their old spot */
async function nextPageMoved(
    tx: DbTransaction,
    spots: NextPageSpots,
    except: ReadonlySet<number>,
): Promise<Map<number, XY>> {
    const resolver = createResolver((await readTimelineTables(tx)).snapshot);
    const at = new Map<number, XY>();
    for (const [id, spot] of spots.before)
        if (
            !except.has(id) &&
            !samePosition(spot, resolver.positionAt(id, spots.box.end))
        )
            at.set(id, spot);
    return at;
}

/**
 * Each of `at`'s marchers with one row crossing `beat` has its move cut there and its part before
 * ending at its spot in `at`. They are taken out of a move they share into one of their own first
 * (`takeMarchersIntoOwnMoveInTransaction`), so only their move is cut: the others in it keep their
 * move, any shape recipe and their motion, which a cut would change for a path that isn't direct
 * (`splitTimelineAtBeatInTransaction` samples it). A shape or follow-the-leader member (who stays
 * in its move, `planRemovalFromRange`), a row into a stored shape, more than one row there, or a
 * move split by marcher refuses to break up (`splitRefusal`), is left as it is.
 *
 * @returns the marchers kept
 */
async function keepThroughMovesAcrossInTransaction(
    tx: DbTransaction,
    beat: number,
    at: ReadonlyMap<number, XY>,
): Promise<number[]> {
    if (at.size === 0) return [];
    const marcherIds = [...at.keys()];
    const range = { start: beat, end: beat + 1 };
    const { skipped } = await planRemovalFromRange({ tx, marcherIds, range });
    const stay = new Set(skipped.map((s) => s.marcherId));
    const crossing = (await rowsIn(tx, null, { marcherIds, range })).filter(
        (r) => r.row.start_beat < beat && !stay.has(r.row.marcher_id),
    );
    const once = crossing.filter(
        (r) =>
            r.shapeId === null &&
            crossing.filter((o) => o.row.marcher_id === r.row.marcher_id)
                .length === 1,
    );
    const kept: number[] = [];
    for (const timelineId of new Set(once.map((r) => r.timelineId))) {
        const ids = once
            .filter((r) => r.timelineId === timelineId)
            .map((r) => r.row.marcher_id);
        if (await splitRefusal(tx, timelineId, ids)) continue;
        const own = await takeMarchersIntoOwnMoveInTransaction({
            tx,
            timelineId,
            marcherIds: ids,
        });
        if (own.timelineId === null) continue;
        await cutMoveAtBeatInTransaction({
            tx,
            timelineId: own.timelineId,
            beat,
        });
        const ending = (
            await rowsIn(tx, null, {
                marcherIds: own.taken,
                range: { start: beat - 1, end: beat },
            })
        ).filter((r) => r.row.end_beat === beat);
        for (const r of ending) {
            const point = at.get(r.row.marcher_id);
            if (!point || r.shapeId !== null) continue;
            await updateTimelineSlotDestinationInTransaction({
                tx,
                transitionId: r.row.transition_id,
                slotIndex: r.row.slot_index,
                point,
            });
            kept.push(r.row.marcher_id);
        }
    }
    return kept;
}
