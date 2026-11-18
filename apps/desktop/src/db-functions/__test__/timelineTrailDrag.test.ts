import { expect } from "vitest";
import { eq, getTableName, sql } from "drizzle-orm";
import { createResolver, type Resolver, type XY } from "@openmarch/core";
import { refusalText } from "@/test/refusalText";
import { translateTimelineText } from "@/timeline/translateTimelineText";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import { convertPagesToTimeline } from "@/test/convertPages";
import { readTimelineTables } from "@/timeline/timelineRows";
import { performRedo, performUndo } from "../history";
import { TimelineWriteError } from "../timelineErrors";
import { moveMarchersInTarget } from "../timelineMoves";
import { drawRoute } from "../timelineRoutes";
import {
    editTrailPoints,
    followTrail,
    removeTrail,
    reverseTrail,
} from "../timelineTrails";
import { readAllShapeRecipes } from "../shapeRecipes";
import { setMarcherOrder } from "../marcherOrder";
import type { LineParams } from "@/shapes/line/lineGeometry";
import { followPlanOf, type FollowDrag } from "@/pathways/followDrag";
import { followKeepAt, isTrailLineAt } from "@/pathways/followTool";
import { storedPoints, type PathSession } from "@/pathways/pathPenStore";
import { rememberedOrderAt } from "../rememberedOrder";
import {
    dragTrail,
    followOrderAt,
    tailFirstOf,
    followSource,
    planTrailDrag,
    trailDragPreview,
    trailDragRefusalFor,
    trailOrderFrom,
    type TrailSpacing,
} from "../timelineTrailDrag";

keepFixturesInPageMode("its tests convert the show themselves");

/**
 * Follow by dragging out a trail, pathways step 4b (spec Appendix L, AP-T8 and AP-T9), on the
 * converted `marchersAndPages` show: page 2's box is `[9, 17)`, and marchers 1 to 8 stand in a
 * level line at its start flag. QA-DL-1 to QA-DL-9 and QA-UNDO-DL: each drag is one undo step,
 * redo restores the same ids, and a refused drag writes nothing.
 */

const TABLES = [
    schema.pages,
    schema.utility,
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
const near = (a: readonly number[], b: readonly number[], eps = 1e-6) =>
    Math.abs(a[0]! - b[0]!) <= eps && Math.abs(a[1]! - b[1]!) <= eps;

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

const WINDOW = { start: 9, end: 17 };

/** The show converted; the line of marchers 1 to 8 at page 2's start flag, two steps apart */
async function line(db: DbConnection) {
    await convertPagesToTimeline(db);
    const r = await resolverOf(db);
    const starts = new Map<number, XY>(
        [1, 2, 3, 4, 5, 6, 7, 8].map((m) => [m, r.positionAt(m, 9) as XY]),
    );
    // The marchers stand two steps apart
    const step = (starts.get(2)![0] - starts.get(1)![0]) / 2;
    return { starts, step, before: r };
}

/** Where `d` is along the polyline `pts`, by a linear scan (the test's own) */
function alongPolyline(pts: readonly XY[], d: number): XY {
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]!;
        const b = pts[i]!;
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (d <= acc + len && len > 0) {
            const f = (d - acc) / len;
            return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
        }
        acc += len;
    }
    return pts[pts.length - 1]!;
}

const spotsOf = async (db: DbConnection, transitionId: number) =>
    (
        await db
            .select()
            .from(schema.timeline_slot_destinations)
            .where(
                eq(
                    schema.timeline_slot_destinations.transition_id,
                    transitionId,
                ),
            )
            .orderBy(schema.timeline_slot_destinations.slot_index)
            .all()
    ).map((s): XY => [s.x, s.y]);

describeDbTests("Follow by dragging out a trail (AP-T8, AP-T9)", (it) => {
    it("followSource: a line, an arc and a cornered curve are fitted and ordered; a scatter isn't", () => {
        expect(
            followSource([
                [8, 0],
                [0, 0],
                [4, 0],
            ]),
        ).toEqual({ kind: "line", order: [1, 2, 0] });
        // Every other marcher of a line is still a line
        expect(followSource([[0, 0], [4, 0], [8, 0], [12, 0]])?.kind).toBe("line"); // prettier-ignore
        const arc = Array.from({ length: 6 }, (_, i): XY => {
            const a = Math.PI * (0.1 + (0.8 * i) / 5);
            return [100 * Math.cos(a), 100 * Math.sin(a)];
        });
        const fitted = followSource([
            arc[3]!,
            arc[0]!,
            arc[5]!,
            arc[1]!,
            arc[4]!,
            arc[2]!,
        ]);
        expect(fitted?.kind).toBe("arc");
        // From its left end round to the right
        expect(fitted?.order).toEqual([2, 4, 0, 5, 3, 1]);
        const corner: XY[] = [[0, 0], [2, 0], [4, 0], [6, 0], [6, 2], [6, 4], [6, 6]]; // prettier-ignore
        const curve = followSource([...corner].reverse());
        expect(curve?.kind).toBe("curve");
        expect(curve?.order).toEqual([6, 5, 4, 3, 2, 1, 0]);
        expect(followSource([[0, 0], [10, 0], [3, 7], [9, 9], [5, 3]])).toBeNull(); // prettier-ignore
        expect(followSource([[0, 0]])).toBeNull();
        expect(trailOrderFrom([0, 1, 2], 2)).toEqual([0, 1, 2]);
        expect(trailOrderFrom([0, 1, 2], 0)).toEqual([2, 1, 0]);
        expect(trailOrderFrom([0, 1, 2], 1)).toBeNull();
    });

    it("QA-DL-1: Keep spacing; the spots are P(e_q); the move is where the drag's preview put it at every quarter beat; one undo step (QA-UNDO-DL)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { starts, step, before } = await line(db);
        const ids = [3, 1, 6, 2, 5, 4];
        const leader = starts.get(6)!;
        const corner: XY = [leader[0] + 10 * step, leader[1]];
        const end: XY = [corner[0], corner[1] - 10 * step];
        const points = [{ at: corner }, { at: end }];
        const others = before.marcherIds().filter((m) => !ids.includes(m));
        const walk = (r: Resolver, m: number) =>
            Array.from({ length: 4 * 8 + 1 }, (_, i) =>
                r.positionAt(m, 9 + i / 4),
            );
        const othersBefore = others.map((m) => walk(before, m));
        // What the drag previews, worked out as the field does
        const lineUp = [1, 2, 3, 4, 5, 6].map((m) => starts.get(m)!);
        const plan = planTrailDrag(lineUp, points, { kind: "keep" }, step);
        const original = await dataOf(db);

        const result = await dragTrail({
            db,
            window: WINDOW,
            marcherIds: ids,
            leaderId: 6,
            points,
            spacing: { kind: "keep" },
            step,
            ends: "trail",
        });
        expect(result.marcherIds).toEqual([1, 2, 3, 4, 5, 6]);
        expect(result.leaderId).toBe(6);
        expect(result.addedPage).toBeNull();
        const transition = (await db
            .select()
            .from(schema.timeline_transitions)
            .where(eq(schema.timeline_transitions.id, result.transitionId))
            .get())!;
        expect(transition).toMatchObject({
            dest_shape_id: null,
            path_style: "follow_the_leader",
            order_mode: "slot",
            slot_count: 6,
            start_beat: 9,
            end_beat: 17,
        });
        expect(JSON.parse(transition.path_params!)).toEqual({
            waypoints: [],
            ends: "along",
        });
        const route = JSON.parse(
            (await db
                .select()
                .from(schema.timeline_routes)
                .where(eq(schema.timeline_routes.id, result.routeId))
                .get())!.geometry,
        );
        expect(route.from).toEqual(leader);
        expect(route.to).toEqual(end);
        // e_q = startDist[q] + 20 steps: the leader at the trail's end, the tail at the corner
        const way = [...lineUp, corner, end];
        const spots = await spotsOf(db, result.transitionId);
        spots.forEach((s, q) =>
            expect(near(s, alongPolyline(way, (2 * q + 20) * step))).toBe(true),
        );
        expect(near(spots[5]!, end)).toBe(true);
        expect(near(spots[0]!, corner)).toBe(true);
        expect(spots).toEqual(plan.spots);

        const after = await resolverOf(db);
        for (let i = 0; i <= 32; i++) {
            const b = 9 + i / 4;
            const preview = trailDragPreview(plan, (b - 9) / 8);
            [1, 2, 3, 4, 5, 6].forEach((m, q) => {
                const x = after.positionAt(m, b);
                expect(near(x, preview[q]!, 1e-9), `M${m}@${b}`).toBe(true);
                // and on the way, at its own steady speed
                const want = alongPolyline(
                    way,
                    2 * q * step + 20 * step * ((b - 9) / 8),
                );
                expect(near(x, want, 1e-6), `M${m}@${b} on the way`).toBe(true);
            });
        }
        // Nobody else moves
        expect(others.map((m) => walk(after, m))).toEqual(othersBefore);
        await expectOneUndoStep(db, original);
    });

    it("QA-DL-2: Even 1 step ends 1 step apart from the leader back; past Even's limit it's refused, naming the limit", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { starts, step } = await line(db);
        const leader = starts.get(6)!;
        const points = [
            { at: [leader[0] + 10 * step, leader[1]] as XY },
            { at: [leader[0] + 10 * step, leader[1] - 10 * step] as XY },
        ];
        const ids = [1, 2, 3, 4, 5, 6];
        const lineUp = ids.map((m) => starts.get(m)!);
        // total 30 steps; Even's limit is the tail's: 30 / 5 = 6 steps
        const plan = planTrailDrag(
            lineUp,
            points,
            { kind: "even", steps: 1 },
            step,
        );
        expect(plan.evenLimit).toBeCloseTo(6, 9);
        const drag = (spacing: TrailSpacing) =>
            dragTrail({ db, window: WINDOW, marcherIds: ids, leaderId: 6, points, spacing, step, ends: "trail" }); // prettier-ignore
        await expectRefused(
            db,
            () => drag({ kind: "even", steps: 7 }),
            /6 steps/,
        );
        const result = await drag({ kind: "even", steps: 1 });
        const spots = await spotsOf(db, result.transitionId);
        for (let q = 1; q < 6; q++)
            expect(
                Math.hypot(
                    spots[q]![0] - spots[q - 1]![0],
                    spots[q]![1] - spots[q - 1]![1],
                ),
            ).toBeCloseTo(step, 6);
        expect(spots).toEqual(plan.spots);
    });

    it("QA-DL-3: every other marcher of an 8-marcher line: four at 4 steps; the other four keep their rows", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { starts, step, before } = await line(db);
        const ids = [1, 3, 5, 7];
        const leader = starts.get(7)!;
        const points = [{ at: [leader[0] + 12 * step, leader[1]] as XY }];
        const stay = [2, 4, 6, 8];
        const stayBefore = stay.map((m) => before.positionAt(m, 17));
        const result = await dragTrail({ db, window: WINDOW, marcherIds: ids, leaderId: 7, points, spacing: { kind: "keep" }, step, ends: "trail" }); // prettier-ignore
        expect(result.marcherIds).toEqual(ids);
        const spots = await spotsOf(db, result.transitionId);
        for (let q = 1; q < 4; q++)
            expect(spots[q]![0] - spots[q - 1]![0]).toBeCloseTo(4 * step, 6);
        const after = await resolverOf(db);
        stay.forEach((m, i) =>
            expect(after.positionAt(m, 17)).toEqual(stayBefore[i]),
        );
    });

    it("QA-DL-4: the right three, grabbed at the inner one: it leads, and the others follow through its start", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { starts, step } = await line(db);
        const inner = starts.get(6)!;
        const points = [{ at: [inner[0], inner[1] + 8 * step] as XY }];
        const result = await dragTrail({ db, window: WINDOW, marcherIds: [6, 7, 8], leaderId: 6, points, spacing: { kind: "keep" }, step, ends: "trail" }); // prettier-ignore
        expect(result.marcherIds).toEqual([8, 7, 6]);
        const after = await resolverOf(db);
        // Halfway, M7 has walked 4 steps: through M6's start and 2 steps down the trail
        expect(
            near(after.positionAt(7, 13), [inner[0], inner[1] + 2 * step]),
        ).toBe(true);
        expect(
            near(after.positionAt(8, 17), [inner[0], inner[1] + 4 * step]),
        ).toBe(true);
    });

    it("QA-DL-5 (DL-10): a short trail leaves the tail on the old line, moved along it", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { starts, step } = await line(db);
        const ids = [1, 2, 3, 4, 5, 6, 7, 8];
        const leader = starts.get(8)!;
        // 6 steps on from the right end: five end on the old line, three on the trail
        const points = [{ at: [leader[0] + 6 * step, leader[1]] as XY }];
        const result = await dragTrail({ db, window: WINDOW, marcherIds: ids, leaderId: 8, points, spacing: { kind: "keep" }, step, ends: "trail" }); // prettier-ignore
        const spots = await spotsOf(db, result.transitionId);
        spots.forEach((s, q) => {
            expect(
                near(s, [starts.get(1)![0] + (2 * q + 6) * step, leader[1]]),
            ).toBe(true);
            expect(s[0] <= leader[0] + 1e-6).toBe(q < 5);
        });
    });

    it("QA-DL-6: after a drag, a trail point moved changes only the walk; a spot moved changes only its member (AP-T10)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { starts, step } = await line(db);
        const ids = [1, 2, 3, 4, 5, 6];
        const leader = starts.get(6)!;
        const corner: XY = [leader[0] + 10 * step, leader[1]];
        const end: XY = [corner[0], corner[1] - 10 * step];
        const result = await dragTrail({ db, window: WINDOW, marcherIds: ids, leaderId: 6, points: [{ at: corner }, { at: end }], spacing: { kind: "keep" }, step, ends: "trail" }); // prettier-ignore
        const spots = await spotsOf(db, result.transitionId);
        // The corner dragged out by 4 steps
        const moved: XY = [corner[0], corner[1] + 4 * step];
        await editTrailPoints({
            db,
            routeId: result.routeId,
            points: [{ at: moved }, { at: end }],
        });
        expect(await spotsOf(db, result.transitionId)).toEqual(spots);
        const t = (await db
            .select()
            .from(schema.timeline_transitions)
            .where(eq(schema.timeline_transitions.id, result.transitionId))
            .get())!;
        expect(JSON.parse(t.path_params!).ends).toBe("along");
        const r = await resolverOf(db);
        ids.forEach((m, q) => expect(r.positionAt(m, 17)).toEqual(spots[q]));
        // The leader's way now runs through the moved corner
        const halfway = r.positionAt(6, 13);
        const corners = [leader, moved, end];
        const leaderHalf = alongPolyline(
            corners,
            (Math.hypot(10, 4) * step + 14 * step) / 2,
        );
        expect(near(halfway, leaderHalf, 1e-6)).toBe(true);
        // Reverse is off for a dragged-out line (owner, 2026-11-10): refused, nothing written
        const before = (await db
            .select()
            .from(schema.timeline_transitions)
            .where(eq(schema.timeline_transitions.id, result.transitionId))
            .get())!;
        await expect(
            reverseTrail({ db, routeId: result.routeId }),
        ).rejects.toThrow(/reverseAlong|other end/);
        const after = (await db
            .select()
            .from(schema.timeline_transitions)
            .where(eq(schema.timeline_transitions.id, result.transitionId))
            .get())!;
        expect(after.path_params).toBe(before.path_params);
        expect(JSON.parse(after.path_params!)).toEqual({
            waypoints: [],
            ends: "along",
        });
        // One spot moved: only its member changes
        const r0 = await resolverOf(db);
        await moveMarchersInTarget({
            db,
            target: { kind: "range", ...WINDOW },
            moves: [
                { marcherId: 3, x: spots[2]![0] + 3 * step, y: spots[2]![1] },
            ],
        });
        const r1 = await resolverOf(db);
        for (const m of [1, 2, 4, 5, 6])
            for (let b = 9; b <= 17; b += 0.25)
                expect(r1.positionAt(m, b)).toEqual(r0.positionAt(m, b));
        expect(r1.positionAt(3, 17)).toEqual([
            spots[2]![0] + 3 * step,
            spots[2]![1],
        ]);
    });

    it("R-14″ on a dragged-out trail: a leg made an arc after (AP-T11) resolves, the spots stay, and the members walk the arc", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { starts, step } = await line(db);
        const ids = [1, 2, 3, 4, 5, 6];
        const leader = starts.get(6)!;
        const corner: XY = [leader[0] + 10 * step, leader[1]];
        const end: XY = [corner[0], corner[1] - 10 * step];
        const result = await dragTrail({ db, window: WINDOW, marcherIds: ids, leaderId: 6, points: [{ at: corner }, { at: end }], spacing: { kind: "keep" }, step, ends: "trail" }); // prettier-ignore
        const spots = await spotsOf(db, result.transitionId);
        // The leg into the end made an arc with the pen's leg menu, as the pen writes it; a last-leg
        // bulge to `to` has no length on a dragged-out line, so it isn't kept
        const points = storedPoints([
            { at: { x: corner[0], y: corner[1] } },
            { at: { x: end[0], y: end[1] }, bulge: 0.25 },
        ] as PathSession["points"]);
        expect(points[1]!.bulge).toBe(0.25);
        await editTrailPoints({
            db,
            routeId: result.routeId,
            points,
            toBulge: 0.3,
        });
        const route = (await db
            .select()
            .from(schema.timeline_routes)
            .where(eq(schema.timeline_routes.id, result.routeId))
            .get())!;
        const geometry = JSON.parse(route.geometry) as {
            points: { bulge?: number }[];
            toBulge?: number;
            to: XY;
        };
        expect(geometry.points.map((p) => p.bulge)).toEqual([undefined, 0.25]);
        expect(geometry.toBulge).toBeUndefined();
        expect(geometry.to).toEqual(end);
        expect(await spotsOf(db, result.transitionId)).toEqual(spots);
        const r = await resolverOf(db);
        for (let b = 9; b <= 17; b += 0.25)
            for (const m of ids) {
                const x = r.positionAt(m, b);
                expect(
                    Number.isFinite(x[0]) && Number.isFinite(x[1]),
                    `M${m}@${b}`,
                ).toBe(true);
            }
        ids.forEach((m, q) => expect(r.positionAt(m, 17)).toEqual(spots[q]));
        // The arc: chord 10 steps down, bulge 1/4, so radius 6.25 steps, its centre 3.75 steps
        // left of the chord's middle. The leader walks 10 steps to the corner, then the whole
        // arc (r·θ) to its spot at the end, at one speed: on the circle once past the corner
        const radius = 6.25 * step;
        const center: XY = [corner[0] - 3.75 * step, corner[1] - 5 * step];
        const arcLen = radius * 4 * Math.atan(0.5);
        const onArcFrom = 9 + (8 * 10 * step) / (10 * step + arcLen);
        let onArc = 0;
        for (let b = 9; b <= 17; b += 0.25) {
            if (b <= onArcFrom + 1e-9) continue;
            const x = r.positionAt(6, b);
            expect(
                Math.hypot(x[0] - center[0], x[1] - center[1]),
                `leader@${b}`,
            ).toBeCloseTo(radius, 6);
            onArc++;
        }
        expect(onArc).toBeGreaterThan(10);
        // halfway along the arc, the leader is at its apex, 2.5 steps right of the chord
        const apexAt =
            9 + (8 * (10 * step + arcLen / 2)) / (10 * step + arcLen);
        expect(
            near(
                r.positionAt(6, apexAt),
                [corner[0] + 2.5 * step, corner[1] - 5 * step],
                1e-6,
            ),
        ).toBe(true);
    });

    it("QA-DL-7 (AP-T9): Keep end spots writes AP-T1's rows from the same drawing, the grabbed end leading", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { starts, step, before } = await line(db);
        const ids = [1, 2, 3, 4];
        const tail = starts.get(1)!;
        const points = [{ at: [tail[0] - 5 * step, tail[1] + 5 * step] as XY }];
        expect(
            await db.transaction((tx) =>
                trailDragRefusalFor(tx, WINDOW, ids, 1, "keep"),
            ),
        ).toBeNull();
        const result = await dragTrail({ db, window: WINDOW, marcherIds: ids, leaderId: 1, points, spacing: { kind: "keep" }, step, ends: "keep" }); // prettier-ignore
        expect(result.marcherIds).toEqual([4, 3, 2, 1]);
        const t = (await db
            .select()
            .from(schema.timeline_transitions)
            .where(eq(schema.timeline_transitions.id, result.transitionId))
            .get())!;
        expect(JSON.parse(t.path_params!)).toEqual({ waypoints: [] });
        // Everyone keeps the end spot they had
        expect(await spotsOf(db, result.transitionId)).toEqual(
            [4, 3, 2, 1].map((m) => before.positionAt(m, 17)),
        );
    });

    it("QA-DL-8: a window past the last page adds a page at the end flag, then the move, in one undo step", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { step } = await line(db);
        // The line again at the last page's flag (49)
        const r0 = await resolverOf(db);
        const at49 = [1, 2, 3, 4].map((m) => r0.positionAt(m, 49) as XY);
        await moveMarchersInTarget({
            db,
            target: { kind: "range", start: 41, end: 49 },
            moves: [1, 2, 3, 4].map((m, i) => ({
                marcherId: m,
                x: at49[0]![0] + 2 * i * step,
                y: at49[0]![1],
            })),
        });
        const original = await dataOf(db);
        const pagesBefore = (await db.select().from(schema.pages).all()).length;
        const leader: XY = [at49[0]![0] + 6 * step, at49[0]![1]];
        const result = await dragTrail({ db, window: { start: 49, end: 57 }, marcherIds: [1, 2, 3, 4], leaderId: 4, points: [{ at: [leader[0], leader[1] + 8 * step] }], spacing: { kind: "keep" }, step, ends: "trail" }); // prettier-ignore
        expect(result.addedPage).toEqual({ startBeat: 49, endBeat: 57 });
        expect((await db.select().from(schema.pages).all()).length).toBe(
            pagesBefore + 1,
        );
        const r = await resolverOf(db);
        expect(
            near(r.positionAt(4, 57), [leader[0], leader[1] + 8 * step]),
        ).toBe(true);
        await expectOneUndoStep(db, original);
    });

    it("QA-DL-9: refusals with their reasons, nothing written", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { starts, step } = await line(db);
        const leader = starts.get(4)!;
        const points = [{ at: [leader[0] + 4 * step, leader[1]] as XY }];
        const drag = (marcherIds: number[], leaderId: number, pts = points) =>
            dragTrail({ db, window: WINDOW, marcherIds, leaderId, points: pts, spacing: { kind: "keep" }, step, ends: "trail" }); // prettier-ignore
        await expectRefused(db, () => drag([4], 4), /two or more/);
        await expectRefused(db, () => drag([1, 2, 3, 4], 2), /end of the line/);
        await expectRefused(
            db,
            () => drag([1, 2, 3, 4], 4, []),
            /longer trail/,
        );
        await expectRefused(
            db,
            () => drag([1, 2, 3, 4], 4, [{ at: leader }]),
            /longer trail/,
        );
        // Marchers not on a line, curve or arc
        await moveMarchersInTarget({
            db,
            target: { kind: "range", start: 1, end: 9 },
            moves: [
                {
                    marcherId: 2,
                    x: starts.get(2)![0] + step,
                    y: starts.get(2)![1] + 7 * step,
                },
            ],
        });
        await expectRefused(
            db,
            () => drag([1, 2, 3, 5], 5),
            /line, curve or arc/,
        );
        expect(
            refusalText(
                new TimelineWriteError(
                    "E-ARGS",
                    (await db.transaction((tx) =>
                        trailDragRefusalFor(
                            tx,
                            WINDOW,
                            [1, 2, 3, 5],
                            5,
                            "trail",
                        ),
                    ))!,
                ),
            ),
        ).toMatch(/line, curve or arc/);
        // A member with a drawn path in the window
        const move = (await db
            .select()
            .from(schema.timelines)
            .where(eq(schema.timelines.start_beat, 9))
            .get())!;
        await drawRoute({ db, timelineId: move.id, marcherId: 6, points: [{ at: [starts.get(6)![0], starts.get(6)![1] + 50] }] }); // prettier-ignore
        await expectRefused(db, () => drag([5, 6, 7, 8], 8, [{ at: [starts.get(8)![0] + 4 * step, starts.get(8)![1]] }]), /drawn path/); // prettier-ignore
        expect(
            await db.all(sql`SELECT * FROM timeline_route_violations`),
        ).toEqual([]);
    });

    it("a smooth point: the Follow tool's preview is what's written and how they walk (QA-DL-1)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { starts, step } = await line(db);
        const ids = [1, 2, 3, 4, 5, 6];
        const leader = starts.get(6)!;
        const xy = (p: XY) => ({ x: p[0], y: p[1] });
        const follow: FollowDrag = {
            window: WINDOW,
            ids,
            order: ids,
            starts: new Map(ids.map((m) => [m, xy(starts.get(m)!)])),
            grabbed: 6,
            spacing: { kind: "keep" },
            ends: "trail",
            keep: null,
            step,
        };
        // A smooth point at the corner, as the pen's press-drag places it
        const session = {
            follow,
            points: [
                { at: xy([leader[0] + 10 * step, leader[1]]), tension: 0.5 },
                { at: xy([leader[0] + 10 * step, leader[1] - 10 * step]) },
            ],
        } as unknown as PathSession;
        const plan = followPlanOf(session)!;
        const points = storedPoints(session.points);
        expect(points[0]!.tension).toBe(0.5);
        const result = await dragTrail({ db, window: WINDOW, marcherIds: ids, leaderId: 6, points, spacing: { kind: "keep" }, step, ends: "trail" }); // prettier-ignore
        // The spots written are the ones the preview showed
        expect(await spotsOf(db, result.transitionId)).toEqual(plan.spots);
        // and the walk is the preview's at every quarter beat
        const after = await resolverOf(db);
        for (let i = 0; i <= 32; i++) {
            const b = 9 + i / 4;
            const preview = trailDragPreview(plan, (b - 9) / 8);
            ids.forEach((m, q) =>
                expect(
                    near(after.positionAt(m, b), preview[q]!, 1e-6),
                    `M${m}@${b}`,
                ).toBe(true),
            );
        }
    });

    it("AP-T9: Keep end spots follows into the move at the playhead (step 4's rule), not only one over exactly the window; Even's limit isn't asked", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { starts, step, before } = await line(db);
        const ids = [1, 2, 3, 4];
        // The playhead at 12: the edit window is [9, 12), inside page 2's move [9, 17)
        const window = { start: 9, end: 12 };
        const keep = (await followKeepAt(db, before, ids, 12))!;
        const page2 = (await db
            .select()
            .from(schema.timelines)
            .where(eq(schema.timelines.start_beat, 9))
            .get())!;
        expect(keep).toMatchObject({ timelineId: page2.id, start: 9, end: 17 });
        expect([...keep.spots.values()]).toEqual(
            ids.map((m) => {
                const [x, y] = before.positionAt(m, 17);
                return { x, y };
            }),
        );
        const tail = starts.get(1)!;
        const points = [{ at: [tail[0] - 5 * step, tail[1] + 5 * step] as XY }];
        const drag = (keepMove?: number) =>
            dragTrail({ db, window, marcherIds: ids, leaderId: 1, points, spacing: { kind: "even", steps: 100 }, step, ends: "keep", keepMove }); // prettier-ignore
        // With no move over exactly the window and none given, refused as before
        await expectRefused(db, () => drag(), /one move with spots/);
        const result = await drag(keep.timelineId);
        expect(result.marcherIds).toEqual([4, 3, 2, 1]);
        expect(await spotsOf(db, result.transitionId)).toEqual(
            [4, 3, 2, 1].map((m) => before.positionAt(m, 17)),
        );
        // No move at the playhead for them all: not offered
        expect(await followKeepAt(db, before, ids, 400)).toBeNull();
    });

    it("isTrailLineAt: exactly a trail's line, every member and nobody else", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { starts } = await line(db);
        const page2 = (await db
            .select()
            .from(schema.timelines)
            .where(eq(schema.timelines.start_beat, 9))
            .get())!;
        const lead = starts.get(3)!;
        await followTrail({ db, timelineId: page2.id, marcherIds: [1, 2, 3], points: [{ at: [lead[0] + 40, lead[1] + 40] }] }); // prettier-ignore
        expect(await isTrailLineAt(db, [3, 1, 2], 12)).toBe(true);
        expect(await isTrailLineAt(db, [1, 2], 12)).toBe(false);
        expect(await isTrailLineAt(db, [1, 2, 3, 4], 12)).toBe(false);
        expect(await isTrailLineAt(db, [1, 2, 3], 30)).toBe(false);
    });

    it("QA-DL-19 (step 4f): staggered rows left by a zigzag trail keep its order: the ends to pull are its first and last", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { starts, step } = await line(db);
        const ids = [1, 2, 3, 4, 5, 6, 7];
        // A zigzag out of M7, two steps a leg: with Keep spacing everyone ends on a corner, the
        // odd ones in a front row of four and the even ones in a back row of three (the owner's
        // report). The rows are deep enough that each marcher's nearest is beside them in their
        // own row, so a guess chains them into a U
        const lead = starts.get(7)!;
        const dx = 0.7 * step;
        const dy = Math.sqrt(4 - 0.7 ** 2) * step;
        const points = Array.from({ length: 6 }, (_, i) => ({
            at: [lead[0] + (i + 1) * dx, lead[1] + ((i + 1) % 2) * dy] as XY,
        }));
        await dragTrail({ db, window: WINDOW, marcherIds: ids, leaderId: 7, points, spacing: { kind: "keep" }, step, ends: "trail" }); // prettier-ignore
        const after = await resolverOf(db);
        const rows = ids.map((m) => after.positionAt(m, 17) as XY);
        expect(near(rows[0]!, lead)).toBe(true);
        expect(near(rows[1]!, [lead[0] + dx, lead[1] + dy])).toBe(true);
        expect(near(rows[6]!, [lead[0] + 6 * dx, lead[1]])).toBe(true);
        // What a guess makes of them: a U, its two ends side by side at one end of the rows
        const guess = followSource(rows)!.order.map((i) => ids[i]!);
        expect(guess).toEqual([1, 3, 5, 7, 6, 4, 2]);

        // On the next page the trail's order is remembered instead
        const shuffled = [5, 2, 7, 1, 4, 3, 6];
        const at = shuffled.map((m) => after.positionAt(m, 17) as XY);
        const order = await followOrderAt(db, shuffled, 17, at);
        // Remembered, leader (M7) first; tail first as the Follow tool offers it, M7 last (finding 7)
        expect(order!.leaderFirst).toBe(true);
        expect(order!.order.map((i) => shuffled[i]!)).toEqual(
            [...ids].reverse(),
        );
        expect(tailFirstOf(order!).map((i) => shuffled[i]!)).toEqual(ids);
        // Every other marcher keeps the line's order, leader (M7, who walked first) first (step 4g)
        expect(await rememberedOrderAt(db, [7, 1, 5, 3], 17)).toEqual([7, 5, 3, 1]); // prettier-ignore

        // The write reads the same order: M7 and M1 are the ends, M2 isn't
        const next = { start: 17, end: 25 };
        const refusal = (leaderId: number) =>
            db.transaction((tx) => trailDragRefusalFor(tx, next, shuffled, leaderId, "trail")); // prettier-ignore
        expect(await refusal(7)).toBeNull();
        expect(await refusal(1)).toBeNull();
        expect(translateTimelineText((await refusal(2))!)).toMatch(/end of the line/); // prettier-ignore
        const last = rows[6]!;
        const result = await dragTrail({ db, window: next, marcherIds: shuffled, leaderId: 7, points: [{ at: [last[0] + 20 * step, last[1]] }], spacing: { kind: "keep" }, step, ends: "trail" }); // prettier-ignore
        expect(result.marcherIds).toEqual(ids);
    });

    it("step 4f: with no form remembered, the order is guessed from where they stand", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { starts } = await line(db);
        const ids = [3, 1, 2, 4];
        const at = ids.map((m) => starts.get(m)!);
        expect(await rememberedOrderAt(db, ids, 9)).toBeNull();
        expect(await followOrderAt(db, ids, 9, at)).toEqual({
            order: followSource(at)!.order,
            leaderFirst: false,
        });
        expect((await followOrderAt(db, ids, 9, at))!.order.map((i) => ids[i])).toEqual([1, 2, 3, 4]); // prettier-ignore
    });

    it("step 4g: a dragged-out Line is saved leader first, so removing the trail keeps its order", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { starts, step } = await line(db);
        const ids = [1, 2, 3, 4];
        const leader = starts.get(4)!;
        const corner: XY = [leader[0], leader[1] - 10 * step];
        const result = await dragTrail({ db, window: WINDOW, marcherIds: ids, leaderId: 4, points: [{ at: corner }], spacing: { kind: "keep" }, step, ends: "trail" }); // prettier-ignore
        expect(await rememberedOrderAt(db, ids, 17)).toEqual([4, 3, 2, 1]);
        // The Line's slots run leader first, from its first point, which is the leader's spot
        const recipe = (await readAllShapeRecipes(db)).find(
            (r) => r.id === result.recipeId,
        )!;
        const bySlot = [...recipe.members].sort((a, b) => a.slot - b.slot);
        expect(bySlot.map((m) => m.marcherId)).toEqual([4, 3, 2, 1]);
        const r = await resolverOf(db);
        bySlot.forEach(
            (m) =>
            expect(near([m.x, m.y], r.positionAt(m.marcherId, 17) as XY)).toBe(true), // prettier-ignore
        );
        const first = (recipe.params as LineParams).points[0]!;
        expect(near([first.x, first.y], [bySlot[0]!.x, bySlot[0]!.y])).toBe(true); // prettier-ignore

        // Without the trail, the Line it left holds the same order
        await removeTrail({ db, routeId: result.routeId });
        expect(await rememberedOrderAt(db, ids, 17)).toEqual([4, 3, 2, 1]);
    });

    it("step 4g: a trail edit after an order set by hand is the latest action, so the trail's order holds; undo and redo bring each back", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { starts, step } = await line(db);
        const ids = [1, 2, 3, 4];
        const tail = starts.get(1)!;
        const points = [{ at: [tail[0] - 5 * step, tail[1] + 5 * step] as XY }];
        // Keep end spots: a trail (not along it) M1 leads
        const result = await dragTrail({ db, window: WINDOW, marcherIds: ids, leaderId: 1, points, spacing: { kind: "keep" }, step, ends: "keep" }); // prettier-ignore
        expect(await rememberedOrderAt(db, ids, 17)).toEqual([1, 2, 3, 4]);
        const byHand = [3, 1, 4, 2];
        const marks = async () =>
            (await readAllShapeRecipes(db)).filter((r) => r.kind === "order");

        // Reverse
        await setMarcherOrder(db, { beat: 17, order: byHand });
        expect(await rememberedOrderAt(db, ids, 17)).toEqual(byHand);
        await reverseTrail({ db, routeId: result.routeId });
        expect(await rememberedOrderAt(db, ids, 17)).toEqual([4, 3, 2, 1]);
        expect(await marks()).toHaveLength(0);
        expect((await performUndo(db)).success).toBe(true);
        expect(await rememberedOrderAt(db, ids, 17)).toEqual(byHand);
        expect((await performRedo(db)).success).toBe(true);
        expect(await rememberedOrderAt(db, ids, 17)).toEqual([4, 3, 2, 1]);

        // A point edit, which saves no Line
        await setMarcherOrder(db, { beat: 17, order: byHand });
        expect(await rememberedOrderAt(db, ids, 17)).toEqual(byHand);
        await editTrailPoints({
            db,
            routeId: result.routeId,
            points: [{ at: [tail[0] - 6 * step, tail[1] + 4 * step] }],
        });
        expect(await rememberedOrderAt(db, ids, 17)).toEqual([4, 3, 2, 1]);
        expect(await marks()).toHaveLength(0);
        expect((await performUndo(db)).success).toBe(true);
        expect(await rememberedOrderAt(db, ids, 17)).toEqual(byHand);
    });
});
