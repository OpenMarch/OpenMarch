import { expect } from "vitest";
import { eq, getTableName, sql } from "drizzle-orm";
import {
    arcPoint,
    createResolver,
    groupSchedule,
    type Resolver,
    type RouteGeometry,
    type XY,
} from "@openmarch/core";
import { refusalText } from "@/test/refusalText";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import { convertPagesToTimeline } from "@/test/convertPages";
import { readTimelineTables } from "@/timeline/timelineRows";
import { performRedo, performUndo } from "../history";
import { drawRoute, readRoutes } from "../timelineRoutes";
import { drawGroupRoute } from "../timelineGroupRoutes";
import { editPathPoints, refitPath } from "../timelinePathEdits";
import { editTrailPoints, followTrail } from "../timelineTrails";
import { splitTimelineAtBeat } from "../timelineSplitAtBeat";

keepFixturesInPageMode("its tests convert the show themselves");

/**
 * Arc legs, pathways step 10a (spec Appendix L: R-14″, AP-T11, the Storage paragraph): a leg of
 * an own path, a group path or a trail made an arc through the one route writer, one undo step
 * each (QA-UNDO-DL); the refusals (QA-AR-2); file version 14 with the first bulge; Re-fit keeping
 * a bulge (QA-AR-3); and the cut at a count through an arc with no change in motion. On the
 * converted `marchersAndPages` show, page 2's move is `[9, 17)`.
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
const userVersion = async (db: DbConnection) =>
    (
        (await db.all(sql`PRAGMA user_version`)) as
            | { user_version: number }[]
            | number[][]
    ).map((r) => (Array.isArray(r) ? r[0] : r.user_version))[0];
const dist = (p: XY, q: XY) => Math.hypot(q[0] - p[0], q[1] - p[1]);
const along = (a: XY, b: XY, f: number): XY => [
    a[0] + (b[0] - a[0]) * f,
    a[1] + (b[1] - a[1]) * f,
];
/** The nearest the marcher comes to `at` over the move, sampled finely */
const nearest = (r: Resolver, m: number, at: XY) =>
    Math.min(
        ...Array.from({ length: 4097 }, (_, i) =>
            dist(r.positionAt(m, 9 + (8 * i) / 4096) as XY, at),
        ),
    );

/** One undo step restores every row; redo restores the same rows, ids included (QA-UNDO-DL) */
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

/** Marcher m1's own path on page 2 with one corner well off the straight line */
async function ownPath(db: DbConnection) {
    await convertPagesToTimeline(db);
    const timeline = await page2(db);
    const r0 = await resolverOf(db);
    const m = r0.marcherIds()[0]!;
    const A = r0.positionAt(m, 9) as XY;
    const B = r0.positionAt(m, 17) as XY;
    const P: XY = [A[0] + 60, A[1] - 40];
    const { routeId } = await drawRoute({
        db,
        timelineId: timeline.id,
        marcherId: m,
        points: [{ at: P }],
    });
    const drawn = await routeOf(db, routeId);
    return { timeline, m, A, B, P, routeId, id: drawn.points[0]!.id };
}

describeDbTests("Arc legs (AP-T11, R-14″)", (it) => {
    it("Arc on an own path's first leg: the marcher walks R-8's arc; file version 14; one undo step", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { m, A, P, routeId, id } = await ownPath(db);
        const versionBefore = await userVersion(db);
        expect(versionBefore).toBeLessThan(14);
        const before = await dataOf(db);

        await editPathPoints({
            db,
            routeId,
            points: [{ id, at: P, bulge: 0.25 }],
        });

        expect((await routeOf(db, routeId)).points).toEqual([
            { id, at: P, bulge: 0.25 },
        ]);
        expect(await userVersion(db)).toBe(14);
        // The marcher passes the arc's middle, a quarter of the chord off it
        const r = await resolverOf(db);
        expect(nearest(r, m, arcPoint(A, P, 0.25, 0.5))).toBeLessThan(0.05);
        expect(nearest(r, m, along(A, P, 0.5))).toBeGreaterThan(10);
        await expectOneUndoStep(db, before);
        // The version isn't lowered by the undo, as 11 isn't when the last path goes
        expect(await userVersion(db)).toBe(14);
    });

    it("the last leg's bulge (toBulge): set, kept by a plain point drag, cleared by Straight (null)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { m, B, P, routeId, id } = await ownPath(db);
        await editPathPoints({
            db,
            routeId,
            points: [{ id, at: P }],
            toBulge: -0.5,
        });
        expect((await routeOf(db, routeId)).toBulge).toBe(-0.5);
        const r = await resolverOf(db);
        // (the samples are a fifth of a unit apart along this half circle)
        expect(nearest(r, m, arcPoint(P, B, -0.5, 0.5))).toBeLessThan(0.25);

        const moved: XY = [P[0] + 5, P[1]];
        await editPathPoints({ db, routeId, points: [{ id, at: moved }] });
        expect((await routeOf(db, routeId)).toBulge).toBe(-0.5);

        await editPathPoints({
            db,
            routeId,
            points: [{ id, at: moved }],
            toBulge: null,
        });
        expect((await routeOf(db, routeId)).toBulge).toBeUndefined();
    });

    it("QA-AR-2: a bulge of 0.6, and a smooth point beside an arc, are refused with the reason; nothing is written", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { P, routeId, id } = await ownPath(db);
        const before = await dataOf(db);
        const version = await userVersion(db);
        const refused = async (
            run: () => Promise<unknown>,
            message: RegExp,
        ) => {
            const error = await run().then(
                () => null,
                (e: unknown) => e,
            );
            expect(error).toMatchObject({ code: "E-ARGS" });
            expect(refusalText(error)).toMatch(message);
            expect(await dataOf(db)).toEqual(before);
            expect(await userVersion(db)).toBe(version);
        };
        await refused(
            () =>
                editPathPoints({
                    db,
                    routeId,
                    points: [{ id, at: P, bulge: 0.6 }],
                }),
            /half circle/,
        );
        await refused(
            () =>
                editPathPoints({
                    db,
                    routeId,
                    points: [{ id, at: P }],
                    toBulge: -0.6,
                }),
            /half circle/,
        );
        await refused(
            () =>
                editPathPoints({
                    db,
                    routeId,
                    points: [{ id, at: P, tension: 1, bulge: 0.25 }],
                }),
            /must be a corner/,
        );
        await refused(
            () =>
                editPathPoints({
                    db,
                    routeId,
                    points: [{ id, at: P, tension: 1 }],
                    toBulge: 0.25,
                }),
            /must be a corner/,
        );
    });

    it("a group path's arc leg: every lane bends the same, one undo step", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        const timeline = await page2(db);
        const r0 = await resolverOf(db);
        const ids = r0.marcherIds().slice(0, 3);
        const starts = ids.map((mm) => r0.positionAt(mm, 9) as XY);
        const mean = (ps: XY[]): XY => [
            ps.reduce((s, p) => s + p[0], 0) / ps.length,
            ps.reduce((s, p) => s + p[1], 0) / ps.length,
        ];
        const F = mean(starts);
        const P: XY = [F[0] + 50, F[1] + 30];
        const Q: XY = [F[0] + 100, F[1] + 30];
        const { routeId } = await drawGroupRoute({
            db,
            timelineId: timeline.id,
            marcherIds: ids,
            points: [{ at: P }, { at: Q }],
        });
        const drawn = await routeOf(db, routeId);
        const before = await dataOf(db);

        await editPathPoints({
            db,
            routeId,
            points: [
                { id: drawn.points[0]!.id, at: P },
                { id: drawn.points[1]!.id, at: Q, bulge: 0.5 },
            ],
        });

        const g = await routeOf(db, routeId);
        expect(g.points[1]!.bulge).toBe(0.5);
        const W = groupSchedule(g).W;
        // the leg arriving at Q, from P: W's second piece (F, P, Q, G)
        expect(W.pieces.map((p) => p.kind)).toEqual(["line", "arc", "line"]);
        // Each member passes the half circle's top, placed by its own offset
        const r = await resolverOf(db);
        const top = arcPoint(P, Q, 0.5, 0.5);
        ids.forEach((mm, i) => {
            const o: XY = [starts[i]![0] - F[0], starts[i]![1] - F[1]];
            expect(nearest(r, mm, [top[0] + o[0], top[1] + o[1]])).toBeLessThan(
                0.05,
            );
        });
        await expectOneUndoStep(db, before);
    });

    it("a trail's last leg as an arc (AP-T2 through the route writer): the leader walks it; one undo step", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        const timeline = await page2(db);
        const r0 = await resolverOf(db);
        const ids = r0.marcherIds().slice(0, 4);
        const starts = ids.map((mm) => r0.positionAt(mm, 9) as XY);
        const corner: XY = [starts[0]![0] + 40, starts[0]![1] - 60];
        const result = await followTrail({
            db,
            timelineId: timeline.id,
            marcherIds: ids,
            points: [{ at: corner }],
        });
        const drawn = await routeOf(db, result.routeId);
        const before = await dataOf(db);

        await editTrailPoints({
            db,
            routeId: result.routeId,
            points: [{ id: drawn.points[0]!.id, at: drawn.points[0]!.at }],
            toBulge: 0.3,
        });

        const g = await routeOf(db, result.routeId);
        expect(g.toBulge).toBe(0.3);
        const r = await resolverOf(db);
        const leader = r.ftlEntry(result.transitionId).members.at(-1)!;
        // The drawn part runs from the corner to the destination's start (the route's `to`)
        const corner2 = g.points[0]!.at;
        const to = g.to;
        const mid = arcPoint(corner2, to, 0.3, 0.5);
        expect(dist(mid, along(corner2, to, 0.5))).toBeGreaterThan(5);
        expect(nearest(r, leader, mid)).toBeLessThan(0.5);
        await expectOneUndoStep(db, before);
    });

    it("QA-AR-3: Re-fit keeps a leg's bulge", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { P, routeId, id } = await ownPath(db);
        await editPathPoints({
            db,
            routeId,
            points: [{ id, at: P, bulge: 0.25 }],
            toBulge: -0.2,
        });
        // The route's stored ends drift from where the marcher stands (as after an earlier edit)
        const g = await routeOf(db, routeId);
        await db
            .update(schema.timeline_routes)
            .set({
                geometry: JSON.stringify({
                    ...g,
                    from: [g.from[0] + 12, g.from[1] - 6],
                }),
            })
            .where(eq(schema.timeline_routes.id, routeId));
        await refitPath({ db, routeId });
        const fitted = await routeOf(db, routeId);
        expect(fitted.from).toEqual(g.from);
        expect(fitted.points[0]!.bulge).toBe(0.25);
        expect(fitted.toBulge).toBe(-0.2);
    });

    it("a cut at a count inside an arc leg keeps the motion: each half stays on the circle", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        const timeline = await page2(db);
        const r0 = await resolverOf(db);
        const m = r0.marcherIds()[0]!;
        const A = r0.positionAt(m, 9) as XY;
        const B = r0.positionAt(m, 17) as XY;
        // A long first leg (an arc) and a short last one, so count 12 falls inside the arc
        const P: XY = [B[0] + 4, B[1] + 4];
        const { routeId } = await drawRoute({
            db,
            timelineId: timeline.id,
            marcherId: m,
            points: [{ at: P }],
        });
        const id = (await routeOf(db, routeId)).points[0]!.id;
        await editPathPoints({
            db,
            routeId,
            points: [{ id, at: P, bulge: 0.3 }],
        });
        const before = await resolverOf(db);
        const at = Array.from({ length: 33 }, (_, i) =>
            before.positionAt(m, 9 + i / 4),
        );
        expect(nearest(before, m, arcPoint(A, P, 0.3, 0.5))).toBeLessThan(0.05);

        await splitTimelineAtBeat({ db, timelineId: timeline.id, beat: 12 });

        const after = await resolverOf(db);
        at.forEach((p, i) => {
            const q = after.positionAt(m, 9 + i / 4);
            expect(dist(p as XY, q as XY), `count ${9 + i / 4}`).toBeLessThan(
                1e-6,
            );
        });
        const routes = await readRoutes(db);
        expect(routes).toHaveLength(2);
        // the half before ends in the arc's part up to the cut, the half after starts with the rest
        const earlier = routes.find((r) => r.routeId !== routeId)!;
        expect(earlier.geometry.toBulge).toBeDefined();
        const later = routes.find((r) => r.routeId === routeId)!;
        expect(later.geometry.points[0]!.bulge).toBeDefined();
    });
});
