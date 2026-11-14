import { expect } from "vitest";
import { eq, getTableName, sql } from "drizzle-orm";
import {
    createResolver,
    type Resolver,
    type RouteGeometry,
    type XY,
} from "@openmarch/core";
import { refusalText } from "@/test/refusalText";
import { translateTimelineText } from "@/timeline/translateTimelineText";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import { convertPagesToTimeline } from "@/test/convertPages";
import { readTimelineTables } from "@/timeline/timelineRows";
import { performRedo, performUndo, transactionWithHistory } from "../history";
import { TimelineWriteError } from "../timelineErrors";
import { splitTimelineAtBeat } from "../timelineSplitAtBeat";
import { mergeMoves, splitMarchersIntoNewMove } from "../timelineSplitMoves";
import { deleteTimeline, setMovePath } from "../timelineCommands";
import { removeMarchersFromTimeline } from "../timelineMembership";
import { resizeTimeline } from "../timelineResize";
import { drawRoute } from "../timelineRoutes";
import { drawGroupRoute } from "../timelineGroupRoutes";
import { createTimelinesInTransaction } from "../timelines";
import { createTimelineTransitionsInTransaction } from "../timelineTransitionsInTransaction";
import { createTimelineAssignmentsInTransaction } from "../timelineAssignments";
import { findTrailRouteTarget } from "@/pathways/pathTarget";
import {
    editTrailPoints,
    followOrder,
    followTrail,
    followTrailRefusal,
    lineOrder,
    readTrails,
    removeTrail,
    reverseTrail,
} from "../timelineTrails";

keepFixturesInPageMode("its tests convert the show themselves");

/**
 * Follow a drawn trail, pathways step 4 (spec Appendix K, AP-T1 to AP-T6), on the converted
 * `marchersAndPages` show (page 2's box is `[9, 17)`, one shapeless direct transition holding
 * every marcher). QA-AP-T1 to QA-AP-T8 and QA-UNDO-T1: each edit is one undo step, redo restores
 * the same ids, a refused edit writes nothing, nobody's end spot moves, and nobody outside the
 * line moves at all.
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
const walk = (r: Resolver, ids: readonly number[], from = 0, to = 26) =>
    ids.map((id) =>
        Array.from({ length: 4 * (to - from) + 1 }, (_, i) =>
            r.positionAt(id, from + i / 4),
        ),
    );
const page2 = async (db: DbConnection) =>
    (await db
        .select()
        .from(schema.timelines)
        .where(eq(schema.timelines.start_beat, 9))
        .get())!;
const dist = (p: XY, q: XY) => Math.hypot(q[0] - p[0], q[1] - p[1]);

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

const routeOf = async (db: DbConnection, routeId: number) =>
    JSON.parse(
        (await db
            .select()
            .from(schema.timeline_routes)
            .where(eq(schema.timeline_routes.id, routeId))
            .get())!.geometry,
    ) as RouteGeometry;

const violations = (db: DbConnection) =>
    db.all(sql`SELECT * FROM timeline_route_violations`);

const versionOf = async (db: DbConnection) =>
    (
        await db
            .select({ version: sql<number>`user_version` })
            .from(sql`pragma_user_version`)
            .get()
    )?.version;

/** Marcher `marcherId` taken over by a one-marcher move over `[start, end)`, on layer 1. */
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
            allowSharedRanges: true,
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

/** Where `id` is on a straight walk from `from` to `to` at `share` of the way */
const along = (from: XY, to: XY, share: number): XY => [
    from[0] + (to[0] - from[0]) * share,
    from[1] + (to[1] - from[1]) * share,
];

/** The first four marchers follow a trail with a smooth point and a corner over page 2. */
async function follow(db: DbConnection) {
    await convertPagesToTimeline(db);
    const timeline = await page2(db);
    const before = await resolverOf(db);
    const ids = before.marcherIds().slice(0, 4);
    const others = before.marcherIds().slice(4);
    const starts = ids.map((m) => before.positionAt(m, 9) as XY);
    const ends = ids.map((m) => before.positionAt(m, 17) as XY);
    const order = followOrder(starts, ends);
    const leader = starts[order.at(-1)!]!;
    const entrance = ends[order[0]!]!;
    const points = [
        { at: [leader[0] + 40, leader[1] - 60] as XY, tension: 1 },
        { at: [entrance[0] - 30, entrance[1] - 50] as XY },
    ];
    const original = await dataOf(db);
    const othersBefore = walk(before, others);
    const result = await followTrail({
        db,
        timelineId: timeline.id,
        marcherIds: ids,
        points,
    });
    return {
        timeline,
        ids,
        others,
        starts,
        ends,
        order,
        points,
        original,
        othersBefore,
        result,
    };
}

describeDbTests("Follow a drawn trail (AP-T1 to AP-T6)", (it) => {
    it("lineOrder and followOrder: a line end to end, led from the end nearer the entrance", () => {
        const line: XY[] = [
            [8, 0],
            [0, 0],
            [12, 0],
            [4, 0],
        ];
        expect(lineOrder(line)).toEqual([1, 3, 0, 2]);
        // The end spots lie to the right of the line: the right end leads
        const right: XY[] = line.map(([x]) => [x + 40, 10]);
        expect(followOrder(line, right)).toEqual([1, 3, 0, 2]);
        // And to the left: the left end leads
        const left: XY[] = line.map(([x]) => [x - 40, 10]);
        expect(followOrder(line, left)).toEqual([2, 0, 3, 1]);
        expect(lineOrder([[1, 1]])).toEqual([0]);
        expect(lineOrder([])).toEqual([]);
    });

    it("a line follows a drawn trail into its own end spots; nobody else moves; one undo step, same ids on redo (QA-AP-T1, QA-UNDO-T1)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const f = await follow(db);
        const { result, ids, starts, ends, order } = f;
        expect(result.redrawn).toBe(false);
        expect(result.marcherIds).toEqual(order.map((i) => ids[i]));
        expect(result.leaderId).toBe(ids[order.at(-1)!]);

        // One new follow-the-leader transition in the same move, its slots the line in order
        const transition = (await db
            .select()
            .from(schema.timeline_transitions)
            .where(eq(schema.timeline_transitions.id, result.transitionId))
            .get())!;
        expect(transition).toMatchObject({
            timeline_id: f.timeline.id,
            dest_shape_id: null,
            path_style: "follow_the_leader",
            order_mode: "slot",
            route_id: result.routeId,
            slot_count: 4,
            start_beat: 9,
            end_beat: 17,
        });
        expect(JSON.parse(transition.path_params!)).toEqual({ waypoints: [] });
        const rows = await db
            .select()
            .from(schema.timeline_assignments)
            .where(
                eq(
                    schema.timeline_assignments.transition_id,
                    result.transitionId,
                ),
            )
            .orderBy(schema.timeline_assignments.slot_index)
            .all();
        expect(rows.map((r) => r.marcher_id)).toEqual(result.marcherIds);
        expect(rows.every((r) => r.start_beat === 9 && r.end_beat === 17)).toBe(
            true,
        );
        const spots = await db
            .select()
            .from(schema.timeline_slot_destinations)
            .where(
                eq(
                    schema.timeline_slot_destinations.transition_id,
                    result.transitionId,
                ),
            )
            .orderBy(schema.timeline_slot_destinations.slot_index)
            .all();
        expect(spots.map((s) => [s.x, s.y])).toEqual(order.map((i) => ends[i]));
        const geometry = await routeOf(db, result.routeId);
        expect(geometry.from).toEqual(starts[order.at(-1)!]);
        expect(geometry.to).toEqual(ends[order[0]!]);
        expect(geometry.points.map((p) => p.at)).toEqual(
            f.points.map((p) => p.at),
        );
        expect(geometry.points[0]!.tension).toBe(1);
        // The shared transition they left lost their four slots and nothing else
        expect(await versionOf(db)).toBe(13);
        expect(await violations(db)).toEqual([]);

        const after = await resolverOf(db);
        // Nobody outside the line moves, at any count, bit for bit
        expect(walk(after, f.others)).toEqual(f.othersBefore);
        for (const [i, m] of ids.entries()) {
            // Everyone starts where they stood and ends on their own spot, bit for bit
            expect(after.positionAt(m, 9)).toEqual(starts[i]);
            expect(after.positionAt(m, 17)).toEqual(ends[i]);
        }
        // The leader walks the drawn part: off the straight line, by the smooth point
        const leaderIndex = order.at(-1)!;
        const leader = ids[leaderIndex]!;
        const entry = after.ftlEntry(result.transitionId);
        expect(entry.members).toEqual(result.marcherIds);
        expect(entry.orderSource).toEqual({ kind: "slot", fallback: false });
        const closest = Math.min(
            ...Array.from({ length: 321 }, (_, i) =>
                dist(
                    after.positionAt(leader, 9 + i / 40) as XY,
                    f.points[1]!.at,
                ),
            ),
        );
        expect(closest).toBeLessThan(1.5);
        // Nobody overtakes: each next member is further along at every count (P-5)
        for (let b = 9; b <= 17; b += 0.25) {
            const along = entry.members.map((_, q) => {
                const p = (b - 9) / 8;
                return (
                    entry.startDist[q]! +
                    (entry.endDist[q]! - entry.startDist[q]!) * p
                );
            });
            for (let q = 1; q < along.length; q++)
                expect(along[q]!).toBeGreaterThanOrEqual(along[q - 1]!);
        }
        expect(await readTrails(db, f.timeline.id)).toEqual([
            {
                timelineId: f.timeline.id,
                transitionId: result.transitionId,
                routeId: result.routeId,
                start: 9,
                end: 17,
                reverse: false,
                along: false,
                geometry,
                marcherIds: result.marcherIds,
            },
        ]);
        await expectOneUndoStep(db, f.original);
    });

    it("Follow again draws the trail again, keeping its route and its line; a point edit keeps ids (QA-AP-T2)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const f = await follow(db);
        const before = await dataOf(db);
        const again = await followTrail({
            db,
            timelineId: f.timeline.id,
            marcherIds: [...f.ids].reverse(),
            points: [{ at: [300, 300] }],
        });
        expect(again).toMatchObject({
            redrawn: true,
            routeId: f.result.routeId,
            transitionId: f.result.transitionId,
            marcherIds: f.result.marcherIds,
        });
        const drawn = await routeOf(db, f.result.routeId);
        expect(drawn.points.map((p) => p.at)).toEqual([[300, 300]]);
        const after = await dataOf(db);
        expect(after.timeline_transitions).toEqual(before.timeline_transitions);
        expect(after.timeline_assignments).toEqual(before.timeline_assignments);
        await expectOneUndoStep(db, before);

        const id = drawn.points[0]!.id;
        const edited = await dataOf(db);
        await editTrailPoints({
            db,
            routeId: f.result.routeId,
            points: [{ id, at: [310, 290], tension: 0.8 }, { at: [320, 330] }],
        });
        const next = await routeOf(db, f.result.routeId);
        expect(next.points[0]).toEqual({
            id,
            at: [310, 290],
            tension: 0.8,
        });
        expect(next.points).toHaveLength(2);
        const r = await resolverOf(db);
        for (const [i, m] of f.ids.entries())
            expect(r.positionAt(m, 17)).toEqual(f.ends[i]);
        await expectOneUndoStep(db, edited);
    });

    it("Reverse: the other end leads, everyone keeps their end spot; one row and the trail's ends change (QA-AP-T3)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const f = await follow(db);
        const before = await dataOf(db);
        const result = await reverseTrail({ db, routeId: f.result.routeId });
        expect(result).toEqual({
            leaderId: f.result.marcherIds[0],
            reverse: true,
        });
        const after = await dataOf(db);
        expect(after.timeline_assignments).toEqual(before.timeline_assignments);
        expect(after.timeline_slot_destinations).toEqual(
            before.timeline_slot_destinations,
        );
        const transition = (
            after.timeline_transitions as { id: number }[]
        ).find((t) => t.id === f.result.transitionId) as {
            path_params: string;
        };
        expect(JSON.parse(transition.path_params)).toEqual({
            waypoints: [],
            reverse: true,
        });
        const r = await resolverOf(db);
        expect(r.ftlEntry(f.result.transitionId).members).toEqual(
            [...f.result.marcherIds].reverse(),
        );
        for (const [i, m] of f.ids.entries()) {
            expect(r.positionAt(m, 9)).toEqual(f.starts[i]);
            expect(r.positionAt(m, 17)).toEqual(f.ends[i]);
        }
        expect(walk(r, f.others)).toEqual(f.othersBefore);
        // The trail now runs from the new leader's start to the old leader's end spot
        const geometry = await routeOf(db, f.result.routeId);
        expect(geometry.from).toEqual(f.starts[f.order[0]!]);
        expect(geometry.to).toEqual(f.ends[f.order.at(-1)!]);
        expect(geometry.points.map((p) => p.id)).toEqual(
            (await routeOf(db, f.result.routeId)).points.map((p) => p.id),
        );
        expect((await readTrails(db))[0]!.reverse).toBe(true);
        await expectOneUndoStep(db, before);
        // Reverse again is back to the first leader
        expect(
            (await reverseTrail({ db, routeId: f.result.routeId })).leaderId,
        ).toBe(f.result.leaderId);
    });

    it("Remove trail: the line walks straight to the same end spots, and the route goes (QA-AP-T4)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const f = await follow(db);
        const before = await dataOf(db);
        const gone = await removeTrail({ db, routeId: f.result.routeId });
        expect(gone.marcherIds).toEqual([...f.ids].sort((a, b) => a - b));
        const after = await dataOf(db);
        expect(after.timeline_routes).toEqual([]);
        expect(
            (after.timeline_transitions as { id: number }[]).find(
                (t) => t.id === f.result.transitionId,
            ),
        ).toMatchObject({
            path_style: "direct",
            path_params: null,
            route_id: null,
            order_mode: "inherit",
        });
        const r = await resolverOf(db);
        for (const [i, m] of f.ids.entries()) {
            expect(r.positionAt(m, 17)).toEqual(f.ends[i]);
            const mid = r.positionAt(m, 13) as XY;
            expect(mid[0]).toBeCloseTo((f.starts[i]![0] + f.ends[i]![0]) / 2);
        }
        await expectOneUndoStep(db, before);
        await expectRefused(
            db,
            async () => {
                await removeTrail({ db, routeId: f.result.routeId });
                return removeTrail({ db, routeId: f.result.routeId });
            },
            /trail is gone/,
        ).catch(() => undefined);
    });

    it("refusals write nothing: too few, part of a line, a marcher with a path, split at a count, Straight and Arc, a drawn path on a member (QA-AP-T5)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const f = await follow(db);
        const [a, b] = f.ids;
        const outsider = f.others[0]!;
        const tl = f.timeline.id;
        await expectRefused(
            db,
            () =>
                followTrail({
                    db,
                    timelineId: tl,
                    marcherIds: [outsider],
                    points: [],
                }),
            /two or more marchers/,
        );
        await expectRefused(
            db,
            () =>
                followTrail({
                    db,
                    timelineId: tl,
                    marcherIds: [a!, b!],
                    points: [],
                }),
            /already follows a trail in this move/,
        );
        await expectRefused(
            db,
            () =>
                followTrail({
                    db,
                    timelineId: tl,
                    marcherIds: [...f.ids, outsider],
                    points: [],
                }),
            /already follows a trail in this move/,
        );
        await expectRefused(
            db,
            () => splitTimelineAtBeat({ db, timelineId: tl, beat: 13 }),
            /can't be split at a count while a line follows a trail/,
        );
        await expectRefused(
            db,
            () => setMovePath({ db, timelineId: tl, style: "direct" }),
            /follows a drawn trail: remove the trail first/,
        );
        await expectRefused(
            db,
            () => setMovePath({ db, timelineId: tl, style: "arc", bulge: 0.3 }),
            /follows a drawn trail: remove the trail first/,
        );
        await expectRefused(
            db,
            () =>
                drawRoute({
                    db,
                    timelineId: tl,
                    marcherId: a!,
                    points: [{ at: [10, 10] }],
                }),
            /follows the leader/,
        );
        await expectRefused(
            db,
            () =>
                drawGroupRoute({
                    db,
                    timelineId: tl,
                    marcherIds: [a!, b!],
                    points: [{ at: [10, 10] }],
                }),
            /follows the leader/,
        );
        // A marcher with a drawn path is refused, by name, until the path goes
        const [p, q] = f.others;
        await drawRoute({
            db,
            timelineId: tl,
            marcherId: p!,
            points: [{ at: [50, 50] }],
        });
        await expectRefused(
            db,
            () =>
                followTrail({
                    db,
                    timelineId: tl,
                    marcherIds: [p!, q!],
                    points: [],
                }),
            /walks a drawn path in this move/,
        );
        // Nothing above left the file broken
        expect(await violations(db)).toEqual([]);
    });

    it("a marcher who leaves the line leaves a gap: the order and the others' end spots stay; with nobody left the move's trail goes (QA-AP-T6)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const f = await follow(db);
        const middle = f.result.marcherIds[1]!;
        const before = await dataOf(db);
        await removeMarchersFromTimeline({
            db,
            timelineId: f.timeline.id,
            marcherIds: [middle],
        });
        const r = await resolverOf(db);
        const left = f.result.marcherIds.filter((m) => m !== middle);
        expect(r.ftlEntry(f.result.transitionId).members).toEqual(left);
        for (const m of left) {
            const i = f.ids.indexOf(m);
            expect(r.positionAt(m, 17)).toEqual(f.ends[i]);
        }
        expect(walk(r, f.others)).toEqual(f.othersBefore);
        const transition = (await db
            .select()
            .from(schema.timeline_transitions)
            .where(eq(schema.timeline_transitions.id, f.result.transitionId))
            .get())!;
        expect(transition.slot_count).toBe(4);
        await expectOneUndoStep(db, before);

        await removeMarchersFromTimeline({
            db,
            timelineId: f.timeline.id,
            marcherIds: left,
        });
        expect(await readTrails(db)).toEqual([]);
        expect(await db.select().from(schema.timeline_routes).all()).toEqual(
            [],
        );
        expect(await violations(db)).toEqual([]);
    });

    it("resizing the move keeps the trail exact, and deleting the move takes the trail with it (QA-AP-T7)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const f = await follow(db);
        const before = await resolverOf(db);
        const entry = before.ftlEntry(f.result.transitionId);
        const resized = await resizeTimeline({
            db,
            timelineId: f.timeline.id,
            start: 9,
            end: 15,
        }).catch((e: unknown) => e);
        expect(resized instanceof Error ? refusalText(resized) : "ok").toBe(
            "ok",
        );
        if (!(resized instanceof Error)) {
            const r = await resolverOf(db);
            // The same trail in fewer counts: the same place at the same share of the move
            for (const m of f.ids)
                for (const share of [0, 0.25, 0.5, 0.75, 1]) {
                    const was = before.positionAt(m, 9 + 8 * share) as XY;
                    const now = r.positionAt(m, 9 + 6 * share) as XY;
                    expect(dist(was, now)).toBeLessThan(1e-9);
                }
            expect(r.ftlEntry(f.result.transitionId).endDist).toEqual(
                entry.endDist,
            );
            expect((await performUndo(db)).success).toBe(true);
        } else {
            // The page's own move can't be resized here: the refusal wrote nothing
            expect(resized).toBeInstanceOf(TimelineWriteError);
        }
        await deleteTimeline({ db, timelineId: f.timeline.id });
        expect(await db.select().from(schema.timeline_routes).all()).toEqual(
            [],
        );
        expect(await violations(db)).toEqual([]);
        expect((await performUndo(db)).success).toBe(true);
        expect(await readTrails(db)).toHaveLength(1);
    });

    it("split by marchers: those split off leave the trail with a gap and walk straight to their own end spots; the others keep their order and end spots; one undo step (QA-AP-T5, QA-AP-T6)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const f = await follow(db);
        const line = f.result.marcherIds;
        for (const leaving of [[line[1]!], [line[0]!, line.at(-1)!]]) {
            const before = await dataOf(db);
            const split = await splitMarchersIntoNewMove({
                db,
                timelineId: f.timeline.id,
                marcherIds: leaving,
            });
            expect(split.marcherIds).toEqual(
                [...leaving].sort((a, b) => a - b),
            );
            const r = await resolverOf(db);
            const stay = line.filter((m) => !leaving.includes(m));
            // The line keeps its order and its slots: a gap, not compacted
            expect(r.ftlEntry(f.result.transitionId).members).toEqual(stay);
            const transition = (await db
                .select()
                .from(schema.timeline_transitions)
                .where(
                    eq(schema.timeline_transitions.id, f.result.transitionId),
                )
                .get())!;
            expect(transition.slot_count).toBe(4);
            expect(transition.route_id).toBe(f.result.routeId);
            for (const m of stay)
                expect(r.positionAt(m, 17)).toEqual(f.ends[f.ids.indexOf(m)]);
            // Each one split off walks straight from its start to its own end spot
            for (const m of leaving) {
                const i = f.ids.indexOf(m);
                expect(r.positionAt(m, 17)).toEqual(f.ends[i]);
                for (const share of [0.25, 0.5, 0.75]) {
                    const at = r.positionAt(m, 9 + 8 * share) as XY;
                    expect(
                        dist(at, along(f.starts[i]!, f.ends[i]!, share)),
                    ).toBeLessThan(1e-9);
                }
                const row = (await db
                    .select({ t: schema.timeline_transitions })
                    .from(schema.timeline_assignments)
                    .innerJoin(
                        schema.timeline_transitions,
                        eq(
                            schema.timeline_transitions.id,
                            schema.timeline_assignments.transition_id,
                        ),
                    )
                    .where(eq(schema.timeline_assignments.marcher_id, m))
                    .all()
                    .then((rows) =>
                        rows.find((x) => x.t.timeline_id === split.timeline.id),
                    ))!;
                expect(row.t.path_style).toBe("direct");
                expect(row.t.route_id).toBeNull();
            }
            // Nobody outside the line moves at any count
            expect(walk(r, f.others)).toEqual(f.othersBefore);
            expect(await violations(db)).toEqual([]);
            await expectOneUndoStep(db, before);
            expect((await performUndo(db)).success).toBe(true);
            expect(await dataOf(db)).toEqual(before);
        }
    });

    it("split the whole line off: its transition moves whole, trail and all, so nobody moves; merged back into its old move it is unchanged too (QA-AP-T5)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const f = await follow(db);
        const everyone = [...f.ids, ...f.others];
        const followed = walk(await resolverOf(db), everyone);
        const before = await dataOf(db);
        const split = await splitMarchersIntoNewMove({
            db,
            timelineId: f.timeline.id,
            marcherIds: f.ids,
        });
        expect(walk(await resolverOf(db), everyone)).toEqual(followed);
        const trails = await readTrails(db);
        expect(trails).toHaveLength(1);
        expect(trails[0]!.timelineId).toBe(split.timeline.id);
        expect(trails[0]!.transitionId).toBe(f.result.transitionId);
        expect(trails[0]!.routeId).toBe(f.result.routeId);
        await expectOneUndoStep(db, before);

        // Into their old move: the trail comes back whole with its transition
        const splitData = await dataOf(db);
        await mergeMoves({
            db,
            sourceId: split.timeline.id,
            targetId: f.timeline.id,
        });
        expect(walk(await resolverOf(db), everyone)).toEqual(followed);
        expect((await readTrails(db))[0]!.timelineId).toBe(f.timeline.id);
        expect(await violations(db)).toEqual([]);
        await expectOneUndoStep(db, splitData);
    });

    it("Follow says why it would refuse before anything is drawn, and draws the trail again when a member is taken over at the move's start (review)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const f = await follow(db);
        const tl = f.timeline.id;
        const ask = (ids: readonly number[]) =>
            db.transaction((tx) => followTrailRefusal(tx, tl, ids));
        expect(await ask(f.ids)).toBeNull();
        const said = async (ids: readonly number[]) => {
            const why = await ask(ids);
            return why ? translateTimelineText(why) : null;
        };
        expect(await said([f.others[0]!])).toMatch(/two or more marchers/);
        expect(await said([f.result.marcherIds[0]!, f.others[0]!])).toMatch(
            /already follows a trail/,
        );

        // The middle of the line taken over at the start: a joiner, not a founder
        const joiner = f.result.marcherIds[1]!;
        await overlay(db, joiner, 9, 10, [7, 7]);
        const founders = f.result.marcherIds.filter((m) => m !== joiner);
        expect(
            (await resolverOf(db)).ftlEntry(f.result.transitionId).members,
        ).toEqual(founders);
        for (const ids of [founders, f.result.marcherIds]) {
            expect(await ask(ids)).toBeNull();
            const again = await followTrail({
                db,
                timelineId: tl,
                marcherIds: ids,
                points: [{ at: [30, 30] }],
            });
            expect(again.redrawn).toBe(true);
            expect(again.routeId).toBe(f.result.routeId);
            expect(
                (await routeOf(db, f.result.routeId)).points.map((p) => p.at),
            ).toEqual([[30, 30]]);
        }
        expect(await violations(db)).toEqual([]);
    });

    it("QA-TC-14 (step 6): the shown trail carries each member's own end spot by slot, and when a founder taken over partway leaves it (TC-2)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const f = await follow(db);
        // the first founder is taken over over [12, 13), then resumes
        const taken = f.result.marcherIds[0]!;
        await overlay(db, taken, 12, 13, [7, 7]);
        const r = await resolverOf(db);
        const target = await findTrailRouteTarget(
            db,
            r,
            f.result.routeId,
            new Map(),
        );
        const trail = target!.trail!;
        for (const m of trail.members) {
            // its index on the end line is its own end spot
            expect(m.endAt).toBeDefined();
            expect(trail.endLine![m.endAt!]).toEqual(m.to);
            expect(m.until).toBe(m.marcherId === taken ? 12 : undefined);
        }
    });

    it("a trail nobody founds (each taken over at the start) can still be shown, reversed and removed (review)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const f = await follow(db);
        for (const m of f.result.marcherIds)
            await overlay(db, m, 9, 10, [7, 7]);
        const r = await resolverOf(db);
        expect(r.ftlEntry(f.result.transitionId).members).toEqual([]);
        const target = await findTrailRouteTarget(
            db,
            r,
            f.result.routeId,
            new Map(),
        );
        expect(target).not.toBeNull();
        expect(target!.trail!.members.map((m) => m.marcherId)).toEqual(
            f.result.marcherIds,
        );
        const before = await dataOf(db);
        await reverseTrail({ db, routeId: f.result.routeId });
        expect((await readTrails(db))[0]!.reverse).toBe(true);
        await expectOneUndoStep(db, before);
        await removeTrail({ db, routeId: f.result.routeId });
        expect(await readTrails(db)).toEqual([]);
        expect(await violations(db)).toEqual([]);
    });
});
