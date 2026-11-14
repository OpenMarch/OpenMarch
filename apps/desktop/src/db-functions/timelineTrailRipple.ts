/**
 * Ripple into the next form, pathways step 9 (spec Appendix L.10, RP-1 to RP-6, AP-T12): a line
 * standing in one form follows its leader along a straight connector (or drawn corners) into the
 * form its end spots make, and along it, in one follow move (register E-4, J-7).
 *
 * - `planRipple` (`timelineTrailRipplePlan`, pure): the deal and the trail as the resolver builds
 *   it; the Follow tool's drawing and this write both use it.
 * - `rippleFormAt`: the next form, the members' end spots in their remembered or guessed order.
 * - `rippleTrailInTransaction`: the write (AP-T12): step 4's Follow (AP-T1) onto the dealt spots,
 *   then the move's shape recipes re-dealt so they agree.
 */
import { and, eq, inArray } from "drizzle-orm";
import { createResolver, type XY } from "@openmarch/core";
import { schema } from "@/global/database/db";
import { readTimelineTables } from "@/timeline/timelineRows";
import type { DbConnection, DbTransaction } from "./types";
import { transactionWithHistory } from "./history";
import { refuse } from "./timelineErrors";
import { marcherName, type RoutePointInput } from "./timelineRoutes";
import { shapeRecipesOnly } from "./shapeRecipes";
import { readTimeline } from "./timelineMemberRows";
import {
    endSpotsInMove,
    followTrailInTransaction,
    trailRefusal,
    type FollowTrailResult,
} from "./timelineTrails";
import {
    planRipple,
    rippleFormProblem,
    rippleRefusal,
    type RippleForm,
} from "./timelineTrailRipplePlan";
import {
    followOrderAt,
    trailDragRefusal,
    trailOrderFrom,
    windowMoveOf,
    type TrailWindow,
} from "./timelineTrailDrag";

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * RP-2: the next form, `spots` (each of `ids`'s end spot at `beat`, the move's end) in the order
 * the show remembers for them there, or else the one their spots suggest. Null when neither has
 * one: the spots don't stand in a line, curve or arc.
 */
export async function rippleFormAt(
    db: DbConnection | DbTransaction,
    ids: readonly number[],
    beat: number,
    spots: ReadonlyMap<number, XY>,
): Promise<RippleForm | null> {
    const sorted = [...new Set(ids)].sort((a, b) => a - b);
    const at = sorted.map((m) => spots.get(m)!);
    const found = await followOrderAt(db, sorted, beat, at);
    if (!found) return null;
    return {
        ids: found.order.map((i) => sorted[i]!),
        spots: found.order.map((i) => at[i]!),
    };
}

// ---------------------------------------------------------------------------
// AP-T12
// ---------------------------------------------------------------------------

export interface RippleInput {
    /** The edit window `[start flag, end flag)`: the line's starts are at its start */
    window: TrailWindow;
    /** The selected marchers (two or more) */
    marcherIds: readonly number[];
    /** The end of the line pressed: the leader (DL-1) */
    leaderId: number;
    /** The connector's corners, in walking order from the leader; none for a straight one */
    points: readonly RoutePointInput[];
    /**
     * The move the line ripples in (step 4's target: the one every member is in at the playhead);
     * the one over exactly the window when absent
     */
    keepMove?: number | null;
    /** The marcher whose spot is the entrance, when the finish was on it (RP-4) */
    enter?: number | null;
}

export interface RippleResult extends FollowTrailResult {
    /** Whose spot each member of the line took, tail first */
    takes: number[];
    /** The shape recipe rows re-dealt */
    recipeRows: number;
}

/**
 * RP-3, AP-T12: every shape recipe of move `timelineId` (not order marks) re-deals its rows of
 * the members: the row of a spot names whoever stands on it now (`holder`: who stood there →
 * who stands there), keeping its id, slot and point. Rows are deleted and written again with
 * their ids, since the unique (recipe, marcher) pair forbids swapping two in place.
 */
async function dealRecipesAgainInTransaction(
    tx: DbTransaction,
    timelineId: number,
    holder: ReadonlyMap<number, number>,
): Promise<number> {
    const R = schema.timeline_shape_recipes;
    const M = schema.timeline_shape_recipe_marchers;
    // Shapes only: an ungrouped mark or an order mark holds no spots to deal
    const rows = (
        await tx
            .select({ row: M })
            .from(M)
            .innerJoin(R, eq(R.id, M.recipe_id))
            .where(
                and(
                    eq(R.timeline_id, timelineId),
                    inArray(M.marcher_id, [...holder.keys()]),
                    shapeRecipesOnly(),
                ),
            )
            .all()
    )
        .map((r) => r.row)
        .filter((r) => holder.get(r.marcher_id) !== r.marcher_id);
    if (rows.length === 0) return 0;
    await tx.delete(M).where(
        inArray(
            M.id,
            rows.map((r) => r.id),
        ),
    );
    await tx
        .insert(M)
        .values(
            rows.map((r) => ({ ...r, marcher_id: holder.get(r.marcher_id)! })),
        );
    return rows.length;
}

/**
 * AP-T12 (spec L.10), inside one write-wrapper transaction: the line of `marcherIds` (its order
 * at the start of move `keepMove`, the grabbed end leading, as AP-T8 reads it) ripples into the form its
 * end spots make in move `keepMove`: the form's spots dealt in trail order from the entrance
 * (RP-3, RP-4), then AP-T1 in that move with the dealt spots as the slots' destinations and the
 * connector's corners as the trail, then the move's shape recipes re-dealt to match.
 *
 * Refused (`E-ARGS`, nothing written): AP-T1's and AP-T8's refusals; no move with end spots for
 * every member; end spots that don't stand in an open line, curve or arc, or that lie on the
 * line itself (RP-2, `rippleFormProblem`); the line already a trail's line there.
 */
export async function rippleTrailInTransaction(
    tx: DbTransaction,
    input: RippleInput,
): Promise<RippleResult> {
    const { window, leaderId, points } = input;
    const ids = [...new Set(input.marcherIds)].sort((a, b) => a - b);
    if (ids.length < 2) refuse(trailRefusal.tooFew());
    if (!(window.end > window.start) || window.start < 0)
        refuse(trailDragRefusal.noWindow());
    // The move the line ripples in: it starts where that move starts, not at the start flag
    const move = input.keepMove ?? (await windowMoveOf(tx, window, ids));
    if (move === null) refuse(trailDragRefusal.noSpots());
    const timeline = await readTimeline(tx, move);
    if (!timeline) refuse(trailDragRefusal.noSpots());
    const resolver = createResolver((await readTimelineTables(tx)).snapshot);
    // The line's order where it stands at the move's start, the grabbed end leading (AP-T8)
    const starts = ids.map((m): XY => {
        const [x, y] = resolver.positionAt(m, timeline.start_beat);
        return [x, y];
    });
    const along = await followOrderAt(tx, ids, timeline.start_beat, starts);
    if (!along) refuse(trailDragRefusal.notFitted());
    const order = trailOrderFrom(along.order, ids.indexOf(leaderId));
    if (!order) refuse(trailDragRefusal.notAnEnd());
    const line = order.map((i) => ids[i]!);
    // Each member's end spot there, its slot's stored destination (as AP-T1 reads it)
    const spots = await endSpotsInMove(tx, move, ids);
    if (!spots) refuse(trailDragRefusal.noSpots());
    const form = await rippleFormAt(tx, ids, timeline.end_beat, spots);
    if (!form) refuse(rippleRefusal.notAForm());
    // The line as it stands, in its own order (not by id), as the tool checks it
    const problem = rippleFormProblem(
        form.spots,
        order.map((i) => starts[i]!),
    );
    if (problem) refuse(problem);
    const plan = planRipple(
        order.map((i) => starts[i]!),
        form,
        points,
        input.enter,
    );
    const followed = await followTrailInTransaction({
        tx,
        timelineId: move,
        marcherIds: line,
        points,
        line,
        destinations: new Map(line.map((m, q) => [m, plan.spots[q]!])),
    });
    // A line that already follows a trail there is drawn again by Follow, never re-dealt
    if (followed.redrawn)
        refuse(trailRefusal.alreadyFollows(await marcherName(tx, leaderId)));
    const recipeRows = await dealRecipesAgainInTransaction(
        tx,
        move,
        new Map(plan.takes.map((was, q) => [was, line[q]!])),
    );
    return { ...followed, takes: plan.takes, recipeRows };
}

/** AP-T12 as one undoable edit. */
export async function rippleTrail(
    args: { db: DbConnection } & RippleInput,
): Promise<RippleResult> {
    const { db, ...input } = args;
    return await transactionWithHistory(db, "rippleTrail", (tx) =>
        rippleTrailInTransaction(tx, input),
    );
}
