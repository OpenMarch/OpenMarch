import { expect } from "vitest";
import { asc, eq, getTableName } from "drizzle-orm";
import {
    createResolver,
    routePath,
    routePoint,
    type Resolver,
    type RouteGeometry,
    type XY,
} from "@openmarch/core";
import { sql } from "drizzle-orm";
import { refusalText } from "@/test/refusalText";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import { convertPagesToTimeline } from "@/test/convertPages";
import { readTimelineTables } from "@/timeline/timelineRows";
import { performRedo, performUndo, transactionWithHistory } from "../history";
import { TimelineWriteError } from "../timelineErrors";
import { createTimelinesInTransaction } from "../timelines";
import { createTimelineShapesInTransaction } from "../timelineShapes";
import {
    createTimelineTransitionsInTransaction,
    setTimelineTransitionDestinationInTransaction,
} from "../timelineTransitionsInTransaction";
import { createTimelineAssignmentsInTransaction } from "../timelineAssignments";
import {
    splitTimelineAtBeat,
    splitTimelineAtBeatInTransaction,
} from "../timelineSplitAtBeat";
import { mergeMoves, splitMarchersIntoNewMove } from "../timelineSplitMoves";
import { deleteTimeline, setMovePath } from "../timelineCommands";
import { splitMovesAtBeatInTransaction } from "../timelinePointMoves";
import { drawRoute, readRoutes, removeRoute } from "../timelineRoutes";

keepFixturesInPageMode("its tests convert the show themselves");

/**
 * Routes, pathways step 1 (spec v0.9 Appendix I.2 and I.3): the app procedures AP-R1 to AP-R7 on
 * the converted `marchersAndPages` show (pages of 8 counts; page 2's box is `[9, 17)`, one
 * shapeless direct transition per page move holding every marcher). QA-AP-R1 to QA-AP-R4,
 * QA-UNDO-R1, and QA-RT-7's procedure side: each edit is one undo step, a refused edit writes
 * nothing, and the app's resolver agrees with the path the route describes.
 */

const TABLES = [
    schema.timelines,
    schema.timeline_shapes,
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

const snapshot = async (db: DbConnection) => ({
    data: await dataOf(db),
    undo: await db.select().from(schema.history_undo).all(),
    redo: await db.select().from(schema.history_redo).all(),
});

const resolverOf = async (db: DbConnection): Promise<Resolver> =>
    createResolver((await readTimelineTables(db)).snapshot);

/** Every marcher's position at each half beat from 0 to `end`. */
const positions = (r: Resolver, end: number) =>
    r
        .marcherIds()
        .map((id) =>
            Array.from({ length: 2 * end + 1 }, (_, i) =>
                r.positionAt(id, i / 2),
            ),
        );

const expectSamePositions = (
    a: XY[][],
    b: XY[][],
    tolerance: number,
    skip: (m: number) => boolean = () => false,
) => {
    expect(b.length).toBe(a.length);
    a.forEach((row, m) => {
        if (skip(m)) return;
        row.forEach((p, i) => {
            expect(Math.abs(p[0] - b[m]![i]![0])).toBeLessThanOrEqual(
                tolerance,
            );
            expect(Math.abs(p[1] - b[m]![i]![1])).toBeLessThanOrEqual(
                tolerance,
            );
        });
    });
};

/** Page 2's timeline, over [9, 17), and its one transition. */
const page2 = async (db: DbConnection) => {
    const timeline = (await db
        .select()
        .from(schema.timelines)
        .where(eq(schema.timelines.start_beat, 9))
        .get())!;
    expect(timeline.end_beat).toBe(17);
    return timeline;
};

const expectRefused = async (
    db: DbConnection,
    write: () => Promise<unknown>,
    message: RegExp,
) => {
    const before = await snapshot(db);
    const error = await write().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TimelineWriteError);
    expect((error as TimelineWriteError).code).toBe("E-ARGS");
    expect(refusalText(error)).toMatch(message);
    expect(await snapshot(db)).toEqual(before);
};

/** A one-marcher move over `[start, end)` on layer 1, heading for `point`. */
const overlay = (
    db: DbConnection,
    marcherId: number,
    start: number,
    end: number,
    point: XY,
) =>
    transactionWithHistory(db, "overlay", async (tx) => {
        const [t] = await createTimelinesInTransaction({
            tx,
            newTimelines: [{ startBeat: start, endBeat: end }],
        });
        const [made] = await createTimelineTransitionsInTransaction({
            tx,
            newTransitions: [
                {
                    timelineId: t!.id,
                    slotCount: 1,
                    destination: { kind: "individual", points: [point] },
                },
            ],
        });
        await createTimelineAssignmentsInTransaction({
            tx,
            newAssignments: [
                {
                    marcherId,
                    transitionId: made!.id,
                    slotIndex: 0,
                    startBeat: start,
                    endBeat: end,
                    layer: 1,
                },
            ],
        });
        return t!;
    });

const userVersion = async (db: DbConnection) =>
    (
        (await db.all(sql`PRAGMA user_version`)) as
            | { user_version: number }[]
            | number[][]
    ).map((r) => (Array.isArray(r) ? r[0] : r.user_version))[0];

/** Two corners off the straight line between where `m` stands at 9 and where it is at 17. */
const cornersFor = async (db: DbConnection, m: number): Promise<XY[]> => {
    const r = await resolverOf(db);
    const a = r.positionAt(m, 9);
    const b = r.positionAt(m, 17);
    return [
        [a[0] + 40, a[1] - 30],
        [b[0] - 25, b[1] + 50],
    ];
};

/** Where the route of `m` in page 2 says it is at `beat`, from its stored corners (R-14). */
const onRoute = async (db: DbConnection, m: number, beat: number) => {
    const r = await resolverOf(db);
    const [route] = (await readRoutes(db)).filter((x) => x.marcherId === m);
    const A = r.explain(m, route!.start).origin;
    const B = r.positionAt(m, route!.end);
    const path = routePath(A, route!.geometry.points, B, route!.geometry);
    return routePoint(
        path,
        (beat - route!.start) / (route!.end - route!.start),
    );
};

describeDbTests("Routes: draw a path (AP-R1, AP-R2, AP-R3)", (it) => {
    it("draws a route for one marcher of a shared move: a lane on its slot, its move untouched, one undo step, others unchanged; redo restores the same ids", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        const timeline = await page2(db);
        const before = await resolverOf(db);
        const m = before.marcherIds()[0]!;
        const positionsBefore = positions(before, 56);
        const original = await snapshot(db);
        const corners = await cornersFor(db, m);

        const result = await drawRoute({
            db,
            timelineId: timeline.id,
            marcherId: m,
            points: corners.map((at) => ({ at })),
        });
        // Step 24: an own lane on its slot of the shared move; no transition or row is written
        const shared = (
            await db
                .select()
                .from(schema.timeline_assignments)
                .where(eq(schema.timeline_assignments.marcher_id, m))
                .all()
        ).find((r) => r.start_beat === 9)!;
        expect(result.transitionId).toBe(shared.transition_id);
        expect(result.slot).toBe(shared.slot_index);
        expect((await snapshot(db)).data["timeline_transitions"]).toEqual(
            original.data["timeline_transitions"],
        );
        expect((await snapshot(db)).data["timeline_assignments"]).toEqual(
            original.data["timeline_assignments"],
        );
        expect(
            await db.select().from(schema.timeline_lanes).all(),
        ).toMatchObject([
            {
                transition_id: shared.transition_id,
                slot_index: shared.slot_index,
                route_id: result.routeId,
                offset_x: null,
                offset_y: null,
            },
        ]);
        const [route] = await readRoutes(db);
        expect(route).toMatchObject({
            routeId: result.routeId,
            transitionId: result.transitionId,
            timelineId: timeline.id,
            marcherId: m,
            start: 9,
            end: 17,
        });
        expect(route!.geometry.points.map((p) => p.at)).toEqual(corners);
        expect(route!.geometry.from).toEqual(before.positionAt(m, 9));
        expect(route!.geometry.to).toEqual(before.positionAt(m, 17));
        expect(await userVersion(db)).toBe(11);

        // The others are where they were at every beat; the marcher walks the route
        const after = await resolverOf(db);
        const index = after.marcherIds().indexOf(m);
        expectSamePositions(
            positionsBefore,
            positions(after, 56),
            0,
            (i) => i === index,
        );
        for (const beat of [9, 10, 11.5, 13, 15, 16.5, 17]) {
            const want = await onRoute(db, m, beat);
            const got = after.positionAt(m, beat);
            expect(Math.abs(got[0] - want[0])).toBeLessThan(1e-9);
            expect(Math.abs(got[1] - want[1])).toBeLessThan(1e-9);
        }
        // The marcher left the straight line between its ends
        const mid = after.positionAt(m, 13);
        const straight = before.positionAt(m, 13);
        expect(
            Math.hypot(mid[0] - straight[0], mid[1] - straight[1]),
        ).toBeGreaterThan(1);

        const drawn = await dataOf(db);
        expect((await performUndo(db)).success).toBe(true);
        expect((await snapshot(db)).data).toEqual(original.data);
        expect(positions(await resolverOf(db), 56)).toEqual(positionsBefore);
        expect((await performRedo(db)).success).toBe(true);
        expect(await dataOf(db)).toEqual(drawn);
    });

    it("draws a route for a marcher of a shape move: own transition, others unchanged, undo exact (QA-AP-R2)", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        const timeline = await page2(db);
        const transition = (await db
            .select()
            .from(schema.timeline_transitions)
            .where(eq(schema.timeline_transitions.timeline_id, timeline.id))
            .get())!;
        await transactionWithHistory(db, "shape", async (tx) => {
            const [shape] = await createTimelineShapesInTransaction({
                tx,
                newShapes: [
                    {
                        kind: "line",
                        geometry: {
                            points: [
                                [0, 0],
                                [100, 40],
                            ],
                        },
                    },
                ],
            });
            await setTimelineTransitionDestinationInTransaction({
                tx,
                transitionId: transition.id,
                destination: { kind: "shape", shapeId: shape!.id },
            });
        });
        const before = await resolverOf(db);
        const m = before.marcherIds()[1]!;
        const positionsBefore = positions(before, 56);
        const original = await snapshot(db);

        await drawRoute({
            db,
            timelineId: timeline.id,
            marcherId: m,
            points: (await cornersFor(db, m)).map((at) => ({ at })),
        });
        const after = await resolverOf(db);
        const index = after.marcherIds().indexOf(m);
        expectSamePositions(
            positionsBefore,
            positions(after, 56),
            0,
            (i) => i === index,
        );
        // It arrives where its shape slot did
        expect(after.positionAt(m, 17)).toEqual(before.positionAt(m, 17));

        expect((await performUndo(db)).success).toBe(true);
        expect((await snapshot(db)).data).toEqual(original.data);
    });

    it("draws it again in place: the route keeps its id, a dragged point keeps its id, a new point gets a fresh one", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        const timeline = await page2(db);
        const m = (await resolverOf(db)).marcherIds()[0]!;
        const corners = await cornersFor(db, m);
        const first = await drawRoute({
            db,
            timelineId: timeline.id,
            marcherId: m,
            points: corners.map((at) => ({ at })),
        });
        const [drawn] = await readRoutes(db);
        const [p1, p2] = drawn!.geometry.points;
        const again = await drawRoute({
            db,
            timelineId: timeline.id,
            marcherId: m,
            points: [
                { id: p1!.id, at: [p1!.at[0] + 1, p1!.at[1]] },
                { at: [5, 5] },
                { id: p2!.id, at: p2!.at },
            ],
        });
        expect(again).toMatchObject({
            routeId: first.routeId,
            transitionId: first.transitionId,
            slot: first.slot,
        });
        const [redrawn] = await readRoutes(db);
        const ids = redrawn!.geometry.points.map((p) => p.id);
        expect(ids[0]).toBe(p1!.id);
        expect(ids[2]).toBe(p2!.id);
        expect([p1!.id, p2!.id]).not.toContain(ids[1]);
        // One undo step: the first drawing is back
        expect((await performUndo(db)).success).toBe(true);
        expect((await readRoutes(db))[0]!.geometry).toEqual(drawn!.geometry);
        // An id from another route is refused (E-ARGS), written nowhere
        await expect(
            drawRoute({
                db,
                timelineId: timeline.id,
                marcherId: m,
                points: [{ id: "nope", at: [0, 0] }],
            }),
        ).rejects.toMatchObject({ code: "E-ARGS" });
    });

    it("Remove path, and deleting the move with a route, are each one undo step that restores the database (QA-UNDO-R1)", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        const timeline = await page2(db);
        const m = (await resolverOf(db)).marcherIds()[0]!;
        const result = await drawRoute({
            db,
            timelineId: timeline.id,
            marcherId: m,
            points: (await cornersFor(db, m)).map((at) => ({ at })),
        });
        const drawn = await snapshot(db);
        const drawnPositions = positions(await resolverOf(db), 56);

        await removeRoute({ db, routeId: result.routeId });
        expect(await readRoutes(db)).toEqual([]);
        const t = (await db
            .select()
            .from(schema.timeline_transitions)
            .where(eq(schema.timeline_transitions.id, result.transitionId))
            .get())!;
        expect(t).toMatchObject({
            path_style: "direct",
            route_id: null,
            path_params: null,
        });
        const removed = await dataOf(db);
        expect((await performUndo(db)).success).toBe(true);
        expect((await snapshot(db)).data).toEqual(drawn.data);
        expect(positions(await resolverOf(db), 56)).toEqual(drawnPositions);
        expect((await performRedo(db)).success).toBe(true);
        expect(await dataOf(db)).toEqual(removed);
        expect((await performUndo(db)).success).toBe(true);

        // AP-R3: the move goes with its route
        await deleteTimeline({ db, timelineId: timeline.id });
        expect(await db.select().from(schema.timeline_routes).all()).toEqual(
            [],
        );
        const deleted = await dataOf(db);
        expect((await performUndo(db)).success).toBe(true);
        expect((await snapshot(db)).data).toEqual(drawn.data);
        expect((await performRedo(db)).success).toBe(true);
        expect(await dataOf(db)).toEqual(deleted);
    });

    it("refuses, writing nothing: a join, Straight and Arc on a move with a path, split by marchers, merge (QA-AP-R1)", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        const timeline = await page2(db);
        const ids = (await resolverOf(db)).marcherIds();
        const [m, other, taken] = [ids[0]!, ids[1]!, ids[2]!];

        // Taken over at the start of the move by a later move on a higher layer
        await overlay(db, taken, 9, 12, [3, 3]);
        await expectRefused(
            db,
            () =>
                drawRoute({
                    db,
                    timelineId: timeline.id,
                    marcherId: taken,
                    points: [],
                }),
            /taken over at the start of this move/,
        );

        await drawRoute({
            db,
            timelineId: timeline.id,
            marcherId: m,
            points: (await cornersFor(db, m)).map((at) => ({ at })),
        });
        await expectRefused(
            db,
            () => setMovePath({ db, timelineId: timeline.id, style: "direct" }),
            /has a drawn path: remove it first/,
        );
        await expectRefused(
            db,
            () =>
                setMovePath({
                    db,
                    timelineId: timeline.id,
                    style: "arc",
                    bulge: 0.3,
                }),
            /has a drawn path: remove it first/,
        );
        await expectRefused(
            db,
            () =>
                splitMarchersIntoNewMove({
                    db,
                    timelineId: timeline.id,
                    marcherIds: [m],
                }),
            /has a drawn path, which this edit can't keep yet/,
        );
        const page3 = (await db
            .select()
            .from(schema.timelines)
            .where(eq(schema.timelines.start_beat, 17))
            .get())!;
        await expectRefused(
            db,
            () => mergeMoves({ db, sourceId: page3.id, targetId: timeline.id }),
            /has a drawn path, which this edit can't keep yet/,
        );
        // Splitting off a marcher without a path still works
        await splitMarchersIntoNewMove({
            db,
            timelineId: timeline.id,
            marcherIds: [other],
        });
    });

    it("Basic's + page flag inside a page leaves a marcher with a route alone (QA-AP-R4)", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        const timeline = await page2(db);
        const m = (await resolverOf(db)).marcherIds()[0]!;
        await drawRoute({
            db,
            timelineId: timeline.id,
            marcherId: m,
            points: (await cornersFor(db, m)).map((at) => ({ at })),
        });
        const routesBefore = await readRoutes(db);
        const result = await transactionWithHistory(db, "split", (tx) =>
            splitMovesAtBeatInTransaction({
                tx,
                beat: 13,
                box: { start: 9, end: 17 },
            }),
        );
        expect(result.leftAlone).toContain(m);
        expect(await readRoutes(db)).toEqual(routesBefore);
    });
});

describeDbTests("Routes: cut at a count (AP-R7, QA-AP-R3)", (it) => {
    /** Draws the route; returns what the cut test compares. */
    const setUp = async (
        db: DbConnection,
        corners?: (m: number) => Promise<XY[]>,
    ) => {
        await convertPagesToTimeline(db);
        const timeline = await page2(db);
        const m = (await resolverOf(db)).marcherIds()[0]!;
        await drawRoute({
            db,
            timelineId: timeline.id,
            marcherId: m,
            points: ((await corners?.(m)) ?? (await cornersFor(db, m))).map(
                (at) => ({ at }),
            ),
        });
        return { timeline, m };
    };

    const tolerance = (L: number) => 1e-9 + 1e-9 * Math.max(1, L);

    it("cuts between corners and on a corner with no change in motion; ids kept; one undo step", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { timeline, m } = await setUp(db);
        const [route] = await readRoutes(db);
        const before = await resolverOf(db);
        const positionsBefore = positions(before, 56);
        const original = await snapshot(db);
        const C = before.positionAt(m, 12);

        const result = await splitTimelineAtBeat({
            db,
            timelineId: timeline.id,
            beat: 12,
        });
        const after = await resolverOf(db);
        expectSamePositions(
            positionsBefore,
            positions(after, 56),
            tolerance(200),
        );
        expect(after.positionAt(m, 12)).toEqual(C);

        const routes = await readRoutes(db);
        expect(routes).toHaveLength(2);
        const later = routes.find((r) => r.timelineId === result.after.id)!;
        const earlier = routes.find((r) => r.timelineId === result.before.id)!;
        // The route from the count keeps its id; corners are split between the halves, ids kept
        expect(later.routeId).toBe(route!.routeId);
        expect(later.geometry.from).toEqual(C);
        expect(earlier.geometry.to).toEqual(C);
        expect(
            [...earlier.geometry.points, ...later.geometry.points].map(
                (p) => p.id,
            ),
        ).toEqual(route!.geometry.points.map((p) => p.id));
        // No corner within EPS_GEOM of C
        for (const p of [...earlier.geometry.points, ...later.geometry.points])
            expect(Math.hypot(p.at[0] - C[0], p.at[1] - C[1])).toBeGreaterThan(
                1e-9,
            );

        expect((await performUndo(db)).success).toBe(true);
        expect((await snapshot(db)).data).toEqual(original.data);
    });

    it("cuts exactly on a corner: the corner goes to neither half", async ({
        db,
        marchersAndPages: _,
    }) => {
        // Corners where the marcher is at counts 11 and 14 of a path walked at constant speed:
        // put the first corner on the straight line at 3/8 so the cut at 12 lands on it
        const { timeline, m } = await setUp(db, async (marcher) => {
            const r = await resolverOf(db);
            const a = r.positionAt(marcher, 9);
            const b = r.positionAt(marcher, 17);
            const at = (f: number): XY => [
                a[0] + (b[0] - a[0]) * f,
                a[1] + (b[1] - a[1]) * f,
            ];
            return [at(3 / 8)];
        });
        const before = await resolverOf(db);
        const positionsBefore = positions(before, 56);
        await splitTimelineAtBeat({ db, timelineId: timeline.id, beat: 12 });
        const routes = await readRoutes(db);
        expect(routes.flatMap((r) => r.geometry.points)).toEqual([]);
        expectSamePositions(
            positionsBefore,
            positions(await resolverOf(db), 56),
            tolerance(200),
        );
        void m;
    });

    it("cuts while a higher layer hides the marcher at the count (it resumes after); and a takeover after the count", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { timeline, m } = await setUp(db);
        await overlay(db, m, 11, 14, [7, 7]);
        const positionsBefore = positions(await resolverOf(db), 56);
        await splitTimelineAtBeat({ db, timelineId: timeline.id, beat: 12 });
        expectSamePositions(
            positionsBefore,
            positions(await resolverOf(db), 56),
            tolerance(200),
        );
    });

    it("refuses a row taken over and resumed before the count, or resumed exactly at it", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { timeline, m } = await setUp(db);
        const steal = await overlay(db, m, 10, 11, [7, 7]);
        await expectRefused(
            db,
            () =>
                splitTimelineAtBeat({ db, timelineId: timeline.id, beat: 12 }),
            /taken over earlier in this move/,
        );
        await deleteTimeline({ db, timelineId: steal.id });
        await overlay(db, m, 10, 12, [7, 7]);
        await expectRefused(
            db,
            () =>
                splitTimelineAtBeat({ db, timelineId: timeline.id, beat: 12 }),
            /taken over earlier in this move/,
        );
        void (asc as unknown);
    });

    /** The route row of `m` (one), for setting up edits AP-R1 never draws. */
    const routeRow = async (db: DbConnection, m: number) => {
        const rows = await db
            .select({ a: schema.timeline_assignments })
            .from(schema.timeline_assignments)
            .innerJoin(
                schema.timeline_transitions,
                eq(
                    schema.timeline_transitions.id,
                    schema.timeline_assignments.transition_id,
                ),
            )
            .where(eq(schema.timeline_assignments.marcher_id, m))
            .all();
        return rows
            .map((r) => r.a)
            .filter((a) => a.start_beat >= 9 && a.end_beat <= 17)[0]!;
    };

    it("refuses a row taken over at the move's start, and a row starting after it", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { timeline, m } = await setUp(db);
        const steal = await overlay(db, m, 9, 10, [7, 7]);
        await expectRefused(
            db,
            () =>
                splitTimelineAtBeat({ db, timelineId: timeline.id, beat: 12 }),
            /taken over at the start of this move/,
        );
        await deleteTimeline({ db, timelineId: steal.id });
        // A row starting at the count, after its transition: a join now, founding after a cut
        const row = await routeRow(db, m);
        await db.run(
            sql`UPDATE timeline_assignments SET start_beat = 12 WHERE id = ${row.id}`,
        );
        await expectRefused(
            db,
            () =>
                splitTimelineAtBeat({ db, timelineId: timeline.id, beat: 12 }),
            /taken over at the start of this move/,
        );
    });

    it("cuts with a takeover starting after the count, and a row ending before it, with no change in motion", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { timeline, m } = await setUp(db);
        await overlay(db, m, 13, 15, [7, 7]);
        let positionsBefore = positions(await resolverOf(db), 56);
        await splitTimelineAtBeat({ db, timelineId: timeline.id, beat: 12 });
        expectSamePositions(
            positionsBefore,
            positions(await resolverOf(db), 56),
            tolerance(200),
        );
        expect(await readRoutes(db)).toHaveLength(2);
        expect((await performUndo(db)).success).toBe(true);

        // The row ends at 11, before the cut: the part from the count has no row and goes, with
        // its route
        const row = await routeRow(db, m);
        await db.run(
            sql`UPDATE timeline_assignments SET end_beat = 11 WHERE id = ${row.id}`,
        );
        positionsBefore = positions(await resolverOf(db), 56);
        await splitTimelineAtBeat({ db, timelineId: timeline.id, beat: 12 });
        expectSamePositions(
            positionsBefore,
            positions(await resolverOf(db), 56),
            tolerance(200),
        );
        const routes = await readRoutes(db);
        expect(routes).toHaveLength(1);
        expect(routes[0]!.end).toBeLessThanOrEqual(12);
    });

    for (const idStaysWith of ["before", "neither"] as const)
        it(`the holds cut with the id kept by ${idStaysWith}: motion unchanged, both routes kept`, async ({
            db,
            marchersAndPages: _,
        }) => {
            const { timeline } = await setUp(db);
            const original = await snapshot(db);
            const positionsBefore = positions(await resolverOf(db), 56);
            await transactionWithHistory(db, "cut", (tx) =>
                splitTimelineAtBeatInTransaction({
                    tx,
                    timelineId: timeline.id,
                    beat: 12,
                    allowSharedRanges: true,
                    idStaysWith,
                }),
            );
            expectSamePositions(
                positionsBefore,
                positions(await resolverOf(db), 56),
                tolerance(200),
            );
            expect(await readRoutes(db)).toHaveLength(2);
            expect((await performUndo(db)).success).toBe(true);
            expect((await snapshot(db)).data).toEqual(original.data);
        });
});

describeDbTests("Routes with curves (step 2: AP-R1, AP-R7, spec I.5)", (it) => {
    /** Page 2's route of the first marcher, drawn through `make(A, B)` */
    const drawn = async (
        db: DbConnection,
        make: (A: XY, B: XY) => { at: XY; tension?: number }[],
    ) => {
        await convertPagesToTimeline(db);
        const timeline = await page2(db);
        const r = await resolverOf(db);
        const m = r.marcherIds()[0]!;
        const A = r.positionAt(m, 9);
        const B = r.positionAt(m, 17);
        await drawRoute({
            db,
            timelineId: timeline.id,
            marcherId: m,
            points: make(A, B),
        });
        return { timeline, m, A, B };
    };
    const along = (A: XY, B: XY, t: number, off: number): XY => {
        const dx = B[0] - A[0];
        const dy = B[1] - A[1];
        const l = Math.hypot(dx, dy) || 1;
        return [A[0] + dx * t - (dy / l) * off, A[1] + dy * t + (dx / l) * off];
    };

    it("stores smooth points with their tension and corners without; the marcher walks the curve; roundness 0 is a corner", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { m } = await drawn(db, (A, B) => [
            { at: along(A, B, 0.25, 30), tension: 1 },
            { at: along(A, B, 0.5, -30), tension: 0 },
            { at: along(A, B, 0.75, 30), tension: 1.7 },
        ]);
        const [route] = await readRoutes(db);
        expect(route!.geometry.points.map((p) => p.tension)).toEqual([
            1,
            undefined,
            1.7,
        ]);
        expect("tension" in route!.geometry.points[1]!).toBe(false);
        const r = await resolverOf(db);
        for (const beat of [9, 10, 11.5, 13, 14.25, 16, 17]) {
            const want = await onRoute(db, m, beat);
            const got = r.positionAt(m, beat);
            expect(Math.abs(got[0] - want[0])).toBeLessThan(1e-9);
            expect(Math.abs(got[1] - want[1])).toBeLessThan(1e-9);
        }
    });

    it("every point edit is one undo step; redo restores the same ids and tensions (QA-UNDO-R2)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { timeline, m } = await drawn(db, (A, B) => [
            { at: along(A, B, 0.3, 25) },
            { at: along(A, B, 0.7, -25) },
        ]);
        const geometryNow = async () => (await readRoutes(db))[0]!.geometry;
        const start = await geometryNow();
        const [a, b] = start.points;
        const edits: { id?: string; at: XY; tension?: number }[][] = [
            // Smooth
            [{ ...a!, tension: 1 }, b!],
            // Roundness
            [{ ...a!, tension: 1.6 }, b!],
            // A point added on a curved leg, smooth
            [
                { ...a!, tension: 1.6 },
                { at: along(start.from, start.to, 0.5, 0), tension: 1.6 },
                b!,
            ],
            // The leg made straight, then the point deleted
            [{ id: a!.id, at: a!.at }, b!],
        ];
        const history: RouteGeometry[] = [start];
        for (const points of edits) {
            const undoBefore = (
                await db.select().from(schema.history_undo).all()
            ).length;
            await drawRoute({
                db,
                timelineId: timeline.id,
                marcherId: m,
                points,
            });
            history.push(await geometryNow());
            const groups = new Set(
                (await db.select().from(schema.history_undo).all()).map(
                    (u) => u.history_group,
                ),
            );
            expect(groups.size).toBeGreaterThan(0);
            expect(
                (await db.select().from(schema.history_undo).all()).length,
            ).toBeGreaterThan(undoBefore);
        }
        expect(history[3]!.points[1]!.tension).toBe(1.6);
        for (let i = history.length - 1; i > 0; i--) {
            expect((await performUndo(db)).success).toBe(true);
            expect(await geometryNow()).toEqual(history[i - 1]);
        }
        for (let i = 1; i < history.length; i++) {
            expect((await performRedo(db)).success).toBe(true);
            expect(await geometryNow()).toEqual(history[i]);
        }
    });

    it("an edit keeps `from` while the first point stays put, and writes the real start when it moves (QA-AP-R6)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { timeline, m, A } = await drawn(db, (A, B) => [
            { at: along(A, B, 0.25, 20), tension: 1 },
            { at: along(A, B, 0.5, -20), tension: 1 },
            { at: along(A, B, 0.75, 20), tension: 1 },
        ]);
        const [route] = await readRoutes(db);
        expect(route!.geometry.from).toEqual(A);
        // An earlier edit moved where the marcher starts, as far as the route knows
        const stale = {
            ...route!.geometry,
            from: [A[0] - 7, A[1] + 3] as XY,
            to: [1, 2] as XY,
        };
        await db
            .update(schema.timeline_routes)
            .set({ geometry: JSON.stringify(stale) })
            .where(eq(schema.timeline_routes.id, route!.routeId));
        const [p1, p2, p3] = stale.points;
        await drawRoute({
            db,
            timelineId: timeline.id,
            marcherId: m,
            points: [p1!, { ...p2!, at: [p2!.at[0] + 4, p2!.at[1]] }, p3!],
        });
        let now = (await readRoutes(db))[0]!.geometry;
        expect(now.from).toEqual(stale.from);
        expect(now.to).toEqual(stale.to);
        await drawRoute({
            db,
            timelineId: timeline.id,
            marcherId: m,
            points: [
                { ...p1!, at: [p1!.at[0] + 2, p1!.at[1]] },
                now.points[1]!,
                p3!,
            ],
        });
        now = (await readRoutes(db))[0]!.geometry;
        expect(now.from).toEqual(A);
        expect(now.to).toEqual(stale.to);
    });

    it("cuts on a curve: the marcher is at C at the count, points split with their ids and tensions, the ends kept (QA-AP-R5)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { timeline, m } = await drawn(db, (A, B) => [
            { at: along(A, B, 0.2, 30), tension: 1 },
            { at: along(A, B, 0.45, -30), tension: 1.4 },
            { at: along(A, B, 0.7, 30), tension: 1 },
            { at: along(A, B, 0.9, -10), tension: 0.6 },
        ]);
        const [route] = await readRoutes(db);
        const before = await resolverOf(db);
        const C = before.positionAt(m, 12);
        const path0L = routePath(
            before.explain(m, 9).origin,
            route!.geometry.points,
            before.positionAt(m, 17),
            route!.geometry,
        ).L;
        const original = await snapshot(db);
        const result = await splitTimelineAtBeat({
            db,
            timelineId: timeline.id,
            beat: 12,
        });
        const after = await resolverOf(db);
        expect(after.positionAt(m, 12)).toEqual(C);
        const routes = await readRoutes(db);
        const later = routes.find((r) => r.timelineId === result.after.id)!;
        const earlier = routes.find((r) => r.timelineId === result.before.id)!;
        expect(later.routeId).toBe(route!.routeId);
        expect(earlier.geometry.from).toEqual(route!.geometry.from);
        expect(earlier.geometry.to).toEqual(C);
        expect(later.geometry.from).toEqual(C);
        expect(later.geometry.to).toEqual(route!.geometry.to);
        expect([...earlier.geometry.points, ...later.geometry.points]).toEqual(
            route!.geometry.points,
        );
        // Both halves start and end where they did; in between the curve is redrawn a little
        for (const beat of [9, 17])
            expect(after.positionAt(m, beat)).toEqual(
                before.positionAt(m, beat),
            );
        let drift = 0;
        for (let b = 9; b <= 17; b += 0.25) {
            const p = before.positionAt(m, b);
            const q = after.positionAt(m, b);
            drift = Math.max(drift, Math.hypot(p[0] - q[0], p[1] - q[1]));
        }
        // Small next to the path: about 1% of its length here (5.4 of 531 field units)
        expect(drift).toBeGreaterThan(0);
        expect(drift).toBeLessThan(0.02 * path0L);
        expect((await performUndo(db)).success).toBe(true);
        expect((await snapshot(db)).data).toEqual(original.data);
    });

    it("cuts exactly on a corner whose neighbors are smooth: the corner goes, C is kept, the pieces beside it are redrawn (QA-AP-R5, corner case)", async ({
        db,
        marchersAndPages: _,
    }) => {
        // Mirror-symmetric about the middle, so the corner sits halfway along: count 13 of 9–17
        const { timeline, m } = await drawn(db, (A, B) => [
            { at: along(A, B, 0.25, 30), tension: 1 },
            { at: along(A, B, 0.5, 0) },
            { at: along(A, B, 0.75, 30), tension: 1 },
        ]);
        const [route] = await readRoutes(db);
        const [first, corner, last] = route!.geometry.points;
        const before = await resolverOf(db);
        const C = before.positionAt(m, 13);
        expect(
            Math.hypot(C[0] - corner!.at[0], C[1] - corner!.at[1]),
        ).toBeLessThan(1e-6);
        const original = await snapshot(db);
        const result = await splitTimelineAtBeat({
            db,
            timelineId: timeline.id,
            beat: 13,
        });
        const after = await resolverOf(db);
        expect(after.positionAt(m, 13)).toEqual(C);
        const routes = await readRoutes(db);
        const earlier = routes.find((r) => r.timelineId === result.before.id)!;
        const later = routes.find((r) => r.timelineId === result.after.id)!;
        // The corner is within ε of C, so neither half keeps it (spec I.5)
        expect(earlier.geometry.points).toEqual([first]);
        expect(later.geometry.points).toEqual([last]);
        for (const beat of [9, 17])
            expect(after.positionAt(m, beat)).toEqual(
                before.positionAt(m, beat),
            );
        // The pieces beside C now follow the chord rule there, so the motion near it changes a
        // little: the case owner question 1 on #680 covers
        let drift = 0;
        for (let b = 9; b <= 17; b += 0.25) {
            const p = before.positionAt(m, b);
            const q = after.positionAt(m, b);
            drift = Math.max(drift, Math.hypot(p[0] - q[0], p[1] - q[1]));
        }
        expect(drift).toBeGreaterThan(0);
        expect((await performUndo(db)).success).toBe(true);
        expect((await snapshot(db)).data).toEqual(original.data);
    });

    it("cuts on a straight piece of a curved path with no change in motion (QA-AP-R5, line case)", async ({
        db,
        marchersAndPages: _,
    }) => {
        // A smooth point and a corner close to A, a long straight leg, a smooth point near B: the
        // count (3/8 of the way) falls on the straight leg between two corners
        const { timeline, m } = await drawn(db, (A, B) => [
            { at: along(A, B, 0.02, 3), tension: 1 },
            { at: along(A, B, 0.05, 6) },
            { at: along(A, B, 0.9, 6) },
            { at: along(A, B, 0.95, 2), tension: 1 },
        ]);
        const before = await resolverOf(db);
        const [route] = await readRoutes(db);
        const r0 = before;
        const path = routePath(
            r0.explain(m, 9).origin,
            route!.geometry.points,
            r0.positionAt(m, 17),
            route!.geometry,
        );
        const d = (3 / 8) * path.L;
        const j = path.D.findIndex((x, k) => k > 0 && d < x) - 1;
        expect(path.pieces[j]!.kind).toBe("line");
        const positionsBefore = positions(before, 56);
        await splitTimelineAtBeat({ db, timelineId: timeline.id, beat: 12 });
        expectSamePositions(
            positionsBefore,
            positions(await resolverOf(db), 56),
            tolerance(path.L),
        );
    });

    const tolerance = (L: number) => 1e-9 + 1e-9 * Math.max(1, L);
});

/** Keeps the type import used in assertions readable. */
export type _RouteGeometry = RouteGeometry;
