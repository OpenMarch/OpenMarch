import { expect } from "vitest";
import { and, eq, getTableName } from "drizzle-orm";
import {
    createResolver,
    type Resolver,
    type RouteGeometry,
    type XY,
} from "@openmarch/core";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import { convertPagesToTimeline } from "@/test/convertPages";
import { readTimelineTables } from "@/timeline/timelineRows";
import { performRedo, performUndo, transactionWithHistory } from "../history";
import { createTimelineAssignmentsInTransaction } from "../timelineAssignments";
import { laneOffset } from "../timelineLanes";
import { drawRoute, removeRoute } from "../timelineRoutes";
import { drawGroupRoute, meanOf } from "../timelineGroupRoutes";
import { editPathPoints, redrawPath } from "../timelinePathEdits";

keepFixturesInPageMode("its tests convert the show themselves");

/**
 * Path edits addressed by the path, pathways step 3a (spec Appendix I.10, AP-O8; model C 07 N3):
 * point edits on an open path and drawing it again name the route. After spots change hands (a
 * swap: the rows on two slots trade marchers, the lanes stay with the slots, D-22) they still edit
 * the same path, which now moves whoever holds its spots, and they are never refused for who that
 * is. On the converted `marchersAndPages` show, page 2's move is `[9, 17)`, one shapeless direct
 * transition holding every marcher (QA-AP-O5, QA-AP-O6).
 */

const TABLES = [
    schema.timeline_transitions,
    schema.timeline_assignments,
    schema.timeline_slot_destinations,
    schema.timeline_routes,
    schema.timeline_lanes,
];
const dataOf = async (db: DbConnection) => {
    const out: Record<string, unknown[]> = {};
    for (const table of TABLES)
        out[getTableName(table)] = await db.select().from(table).all();
    return out;
};
const resolverOf = async (db: DbConnection): Promise<Resolver> =>
    createResolver((await readTimelineTables(db)).snapshot);
const page2 = async (db: DbConnection) =>
    (await db
        .select()
        .from(schema.timelines)
        .where(eq(schema.timelines.start_beat, 9))
        .get())!;
const routeOf = async (db: DbConnection, routeId: number) =>
    JSON.parse(
        (await db
            .select()
            .from(schema.timeline_routes)
            .where(eq(schema.timeline_routes.id, routeId))
            .get())!.geometry,
    ) as RouteGeometry;
const routeCount = async (db: DbConnection) =>
    (await db.select().from(schema.timeline_routes).all()).length;

/** Marcher `m`'s row in move `timelineId` */
const rowOf = async (db: DbConnection, m: number, timelineId: number) => {
    const A = schema.timeline_assignments;
    const T = schema.timeline_transitions;
    return (await db
        .select({ row: A })
        .from(A)
        .innerJoin(T, eq(T.id, A.transition_id))
        .where(and(eq(A.marcher_id, m), eq(T.timeline_id, timelineId)))
        .get())!.row;
};

/**
 * Spots change hands: marchers `a` and `b` trade slots in move `timelineId`, as a recast writes it
 * (both rows deleted, then inserted with each other's slot). The lanes stay with the slots (D-22).
 * One undoable edit.
 */
const swap = async (
    db: DbConnection,
    a: number,
    b: number,
    timelineId: number,
) => {
    const ra = await rowOf(db, a, timelineId);
    const rb = await rowOf(db, b, timelineId);
    await transactionWithHistory(db, "swapForTest", async (tx) => {
        await tx
            .delete(schema.timeline_assignments)
            .where(eq(schema.timeline_assignments.id, ra.id));
        await tx
            .delete(schema.timeline_assignments)
            .where(eq(schema.timeline_assignments.id, rb.id));
        await createTimelineAssignmentsInTransaction({
            tx,
            newAssignments: [
                { ...rowArgs(ra), slotIndex: rb.slot_index },
                { ...rowArgs(rb), slotIndex: ra.slot_index },
            ],
        });
    });
};
const rowArgs = (r: typeof schema.timeline_assignments.$inferSelect) => ({
    marcherId: r.marcher_id,
    transitionId: r.transition_id,
    slotIndex: r.slot_index,
    startBeat: r.start_beat,
    endBeat: r.end_beat,
    layer: r.layer,
});

/** One undo step that restores the data exactly, and a redo that restores the same rows. */
const expectOneUndoStep = async (
    db: DbConnection,
    before: Awaited<ReturnType<typeof dataOf>>,
) => {
    const after = await dataOf(db);
    expect((await performUndo(db)).success).toBe(true);
    expect(await dataOf(db)).toEqual(before);
    expect((await performRedo(db)).success).toBe(true);
    expect(await dataOf(db)).toEqual(after);
};

const dist = (p: XY, q: XY) => Math.hypot(q[0] - p[0], q[1] - p[1]);

describeDbTests("Path edits by the path (AP-O8)", (it) => {
    it("after a swap, a point edit on the open own path edits that path, walked by its spot's new marcher (QA-AP-O5)", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        const timeline = await page2(db);
        const r0 = await resolverOf(db);
        const [m1, m2] = r0.marcherIds();
        const A = r0.positionAt(m1!, 9) as XY;
        const { routeId } = await drawRoute({
            db,
            timelineId: timeline.id,
            marcherId: m1!,
            points: [{ at: [A[0] + 30, A[1] - 40] }],
        });
        const drawn = await routeOf(db, routeId);
        await swap(db, m1!, m2!, timeline.id);
        const routes = await routeCount(db);
        const before = await dataOf(db);

        const moved: XY = [A[0] + 50, A[1] - 60];
        await editPathPoints({
            db,
            routeId,
            points: [{ id: drawn.points[0]!.id, at: moved }],
        });

        // The same route, the same point id, in its new place; no route was added or re-pointed
        const after = await routeOf(db, routeId);
        expect(after.points).toEqual([{ id: drawn.points[0]!.id, at: moved }]);
        expect(await routeCount(db)).toBe(routes);
        expect(await dataOf(db)).toMatchObject({
            timeline_lanes: before.timeline_lanes,
            timeline_assignments: before.timeline_assignments,
            timeline_transitions: before.timeline_transitions,
        });
        // The path is the spot's: m2 now walks it, through the moved point
        const r1 = await resolverOf(db);
        const m2Walk = Array.from({ length: 4097 }, (_, i) =>
            r1.positionAt(m2!, 9 + (8 * i) / 4096),
        ) as XY[];
        expect(Math.min(...m2Walk.map((p) => dist(p, moved)))).toBeLessThan(
            0.5,
        );
        await expectOneUndoStep(db, before);
    });

    it("drawing the open path again keeps its id, takes fresh point ids and the real ends (QA-AP-O5)", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        const timeline = await page2(db);
        const r0 = await resolverOf(db);
        const m1 = r0.marcherIds()[0]!;
        const A = r0.positionAt(m1, 9) as XY;
        const B = r0.positionAt(m1, 17) as XY;
        const { routeId } = await drawRoute({
            db,
            timelineId: timeline.id,
            marcherId: m1,
            points: [{ at: [A[0] + 30, A[1] - 40] }],
        });
        const drawn = await routeOf(db, routeId);
        const before = await dataOf(db);

        await redrawPath({
            db,
            routeId,
            // An id passed in is dropped: drawn again, every point is new
            points: [
                { id: drawn.points[0]!.id, at: [A[0] - 20, A[1] + 10] },
                { at: [B[0] + 5, B[1] + 25], tension: 1 },
            ],
        });
        const again = await routeOf(db, routeId);
        expect(again.from).toEqual(A);
        expect(again.to).toEqual(B);
        expect(again.points.map((p) => p.at)).toEqual([
            [A[0] - 20, A[1] + 10],
            [B[0] + 5, B[1] + 25],
        ]);
        expect(again.points[1]!.tension).toBe(1);
        expect(again.points.map((p) => p.id)).not.toContain(
            drawn.points[0]!.id,
        );
        await expectOneUndoStep(db, before);
    });

    it("after a swap in a group path, drawing it again keeps its id and starts each lane from its spot's marcher now (QA-AP-O6)", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        const timeline = await page2(db);
        const r0 = await resolverOf(db);
        const ids = r0.marcherIds().slice(0, 4);
        const { routeId } = await drawGroupRoute({
            db,
            timelineId: timeline.id,
            marcherIds: ids,
            points: [{ at: [0, 0] }],
        });
        // Two members trade spots: each lane stays with its slot
        await swap(db, ids[0]!, ids[1]!, timeline.id);
        const before = await dataOf(db);
        const r1 = await resolverOf(db);
        const starts = ids.map((m) => r1.explain(m, 9).origin as XY);
        const ends = ids.map((m) => r1.positionAt(m, 17) as XY);

        await redrawPath({ db, routeId, points: [{ at: [10, -10] }] });

        const geometry = await routeOf(db, routeId);
        const sorted = [...ids].sort((a, b) => a - b);
        const F = meanOf(sorted.map((m) => starts[ids.indexOf(m)]!));
        const G = meanOf(sorted.map((m) => ends[ids.indexOf(m)]!));
        expect(geometry.from).toEqual(F);
        expect(geometry.to).toEqual(G);
        expect(geometry.points.map((p) => p.at)).toEqual([[10, -10]]);
        // Every lane starts where its slot's marcher stands now
        for (const [i, m] of ids.entries()) {
            const row = await rowOf(db, m, timeline.id);
            const lane = (await db
                .select()
                .from(schema.timeline_lanes)
                .where(
                    and(
                        eq(
                            schema.timeline_lanes.transition_id,
                            row.transition_id,
                        ),
                        eq(schema.timeline_lanes.slot_index, row.slot_index),
                    ),
                )
                .get())!;
            expect(lane.route_id).toBe(routeId);
            expect(laneOffset(lane)).toEqual([
                starts[i]![0] - F[0],
                starts[i]![1] - F[1],
            ]);
        }
        await expectOneUndoStep(db, before);
    });

    it("a path's point edit works whoever is on it, and Remove path by the route restores every id on undo (QA-UNDO-O1)", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        const timeline = await page2(db);
        const r0 = await resolverOf(db);
        const ids = r0.marcherIds().slice(0, 3);
        const { routeId } = await drawGroupRoute({
            db,
            timelineId: timeline.id,
            marcherIds: ids,
            points: [{ at: [0, 0] }],
        });
        const g = await routeOf(db, routeId);
        await editPathPoints({
            db,
            routeId,
            points: [{ id: g.points[0]!.id, at: [4, 4] }],
        });
        expect((await routeOf(db, routeId)).points[0]!.at).toEqual([4, 4]);
        const before = await dataOf(db);
        const { marcherIds } = await removeRoute({ db, routeId });
        expect(marcherIds).toEqual([...ids].sort((a, b) => a - b));
        expect(await routeCount(db)).toBe(0);
        await expectOneUndoStep(db, before);
    });
});
