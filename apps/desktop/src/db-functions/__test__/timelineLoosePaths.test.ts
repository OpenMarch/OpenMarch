/**
 * Loose group paths (interaction round 7): a group path for a selection that isn't a placed shape
 * is saved as each marcher's own copy, in the edit's own undo step; the copies regroup bit for bit
 * to be edited together again.
 */
import { expect } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { createResolver, type Resolver, type XY } from "@openmarch/core";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import { convertPagesToTimeline } from "@/test/convertPages";
import { readTimelineTables } from "@/timeline/timelineRows";
import { performUndo, transactionWithHistory } from "../history";
import { detachInTransaction } from "../timelineGroupRoutes";
import {
    detachFromGroupPath,
    drawGroupRoute,
    drawGroupRouteInTransaction,
    meanOf,
} from "../timelineGroupRoutes";
import {
    editPathPoints,
    editPathPointsInTransaction,
    redrawPathInTransaction,
} from "../timelinePathEdits";
import { findGroupTarget } from "@/pathways/pathTarget";
import {
    regroupCopiesInTransaction,
    writeGroupPath,
} from "../timelineLoosePaths";
import { TimelineWriteError } from "../timelineErrors";

keepFixturesInPageMode("its tests convert the show themselves");

const STEPS_PER_BEAT = 16;

const resolverOf = async (db: DbConnection): Promise<Resolver> =>
    createResolver((await readTimelineTables(db)).snapshot);

/** Every marcher's position at every sixteenth of a beat, flattened */
async function walkOf(db: DbConnection): Promise<number[]> {
    const r = await resolverOf(db);
    const end = Math.max(
        ...(await db.select().from(schema.timelines).all()).map(
            (t) => t.end_beat,
        ),
    );
    const out: number[] = [];
    for (const id of [...r.marcherIds()].sort((a, b) => a - b))
        for (let i = 0; i <= end * STEPS_PER_BEAT; i++) {
            const p = r.positionAt(id, i / STEPS_PER_BEAT);
            out.push(p[0], p[1]);
        }
    return out;
}

const sameBits = (a: number[], b: number[]) =>
    a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

/** The routes the members' lanes are on, and each route's lane count */
async function routesOf(db: DbConnection, members: readonly number[]) {
    const A = schema.timeline_assignments;
    const L = schema.timeline_lanes;
    const rows = await db
        .select({ marcher: A.marcher_id, route: L.route_id })
        .from(L)
        .innerJoin(
            A,
            and(
                eq(A.transition_id, L.transition_id),
                eq(A.slot_index, L.slot_index),
            ),
        )
        .all();
    const lanes = await db.select().from(L).all();
    const routes = new Set<number>();
    for (const m of members) {
        const row = rows.find((r) => r.marcher === m);
        if (row) routes.add(row.route);
    }
    return {
        routes: [...routes],
        laneCount: (rid: number) =>
            lanes.filter((l) => l.route_id === rid).length,
    };
}

async function setUp(db: DbConnection) {
    await convertPagesToTimeline(db);
    const timeline = (await db
        .select()
        .from(schema.timelines)
        .where(eq(schema.timelines.start_beat, 9))
        .get())!;
    const r0 = await resolverOf(db);
    const members = [...r0.marcherIds()].sort((a, b) => a - b).slice(0, 6);
    const F = meanOf(members.map((m) => r0.positionAt(m, 9) as XY));
    const G = meanOf(members.map((m) => r0.positionAt(m, 17) as XY));
    const points = [
        { at: [F[0] + 24, F[1] - 32] as XY, tension: 1 },
        { at: [G[0] - 30, G[1] + 28] as XY },
    ];
    return { timeline, members, points, F, G };
}

/** A loose draw for `members`: each left on its own copy */
const drawLoose = (
    db: DbConnection,
    timelineId: number,
    members: readonly number[],
    points: readonly { at: XY; tension?: number }[],
    keepLive = false,
) =>
    writeGroupPath({
        db,
        name: "drawGroupRoute",
        timelineId,
        marcherIds: members,
        keepLive,
        draw: true,
        edit: (tx) =>
            drawGroupRouteInTransaction({
                tx,
                timelineId,
                marcherIds: members,
                points,
            }),
        routeOf: (r) => r.routeId,
    });

/** A copy's stored geometry, parsed */
async function geometryOf(db: DbConnection, routeId: number) {
    const row = await db
        .select()
        .from(schema.timeline_routes)
        .where(eq(schema.timeline_routes.id, routeId))
        .get();
    return JSON.parse(row!.geometry) as {
        points: { id: string; at: XY; tension?: number }[];
    };
}

/** A refusal's Tolgee key, or null */
const refusalKey = (e: unknown): string | null =>
    e instanceof TimelineWriteError ? (e.text?.key ?? null) : null;

describeDbTests("Loose group paths (round 7)", (it) => {
    it("Detach all, then regroup: every position bit for bit", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { timeline, members, points } = await setUp(db);
        await drawGroupRoute({
            db,
            timelineId: timeline.id,
            marcherIds: members,
            points,
        });
        const live = await walkOf(db);
        await detachFromGroupPath({
            db,
            timelineId: timeline.id,
            marcherIds: members,
        });
        expect((await routesOf(db, members)).routes).toHaveLength(6);
        expect(sameBits(live, await walkOf(db))).toBe(true);
        const routeId = await transactionWithHistory(db, "regroup", (tx) =>
            regroupCopiesInTransaction({
                tx,
                timelineId: timeline.id,
                marcherIds: members,
            }),
        );
        const after = await routesOf(db, members);
        expect(after.routes).toEqual([routeId]);
        expect(after.laneCount(routeId)).toBe(6);
        expect(sameBits(live, await walkOf(db))).toBe(true);
    });

    it("a loose draw leaves only copies, one undo puts it back", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { timeline, members, points } = await setUp(db);
        const before = await walkOf(db);
        const routesBefore = (
            await db.select().from(schema.timeline_routes).all()
        ).length;
        const drawn = await writeGroupPath({
            db,
            name: "drawGroupRoute",
            timelineId: timeline.id,
            marcherIds: members,
            keepLive: false,
            draw: true,
            edit: (tx) =>
                drawGroupRouteInTransaction({
                    tx,
                    timelineId: timeline.id,
                    marcherIds: members,
                    points,
                }),
            routeOf: (r) => r.routeId,
        });
        expect(drawn.baked).toBe(true);
        expect(drawn.fromCopies).toBe(false);
        const { routes, laneCount } = await routesOf(db, members);
        expect(routes).toHaveLength(6);
        for (const rid of routes) expect(laneCount(rid)).toBe(1);
        const geometries = new Set(
            (await db.select().from(schema.timeline_routes).all())
                .filter((r) => routes.includes(r.id))
                .map((r) => r.geometry),
        );
        expect(geometries.size).toBe(1);
        expect(sameBits(before, await walkOf(db))).toBe(false);

        expect((await performUndo(db)).success).toBe(true);
        expect(sameBits(before, await walkOf(db))).toBe(true);
        expect(
            (await db.select().from(schema.timeline_routes).all()).length,
        ).toBe(routesBefore);
    });

    it("an edit on the copies regroups, edits and splits them again in one undo step", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { timeline, members, points, F } = await setUp(db);
        await drawLoose(db, timeline.id, members, points);
        const baked = await walkOf(db);
        const copy = (await routesOf(db, members)).routes[0]!;
        const geometry = JSON.parse(
            (await db
                .select()
                .from(schema.timeline_routes)
                .where(eq(schema.timeline_routes.id, copy))
                .get())!.geometry,
        ) as { points: { id: string; at: XY }[] };
        const moved = geometry.points.map((p, i) => ({
            id: p.id,
            at: (i === 0 ? [F[0] + 40, F[1] - 50] : p.at) as XY,
        }));
        const edited = await writeGroupPath({
            db,
            name: "edit",
            timelineId: timeline.id,
            marcherIds: members,
            keepLive: false,
            edit: (tx, routeId) =>
                editPathPointsInTransaction({ tx, routeId, points: moved }),
        });
        expect(edited.fromCopies).toBe(true);
        expect(edited.baked).toBe(true);
        const { routes, laneCount } = await routesOf(db, members);
        expect(routes).toHaveLength(6);
        for (const rid of routes) expect(laneCount(rid)).toBe(1);
        expect(sameBits(baked, await walkOf(db))).toBe(false);

        expect((await performUndo(db)).success).toBe(true);
        expect(sameBits(baked, await walkOf(db))).toBe(true);
    });

    it("keepLive (a placed shape's members) leaves one group path", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { timeline, members, points } = await setUp(db);
        const drawn = await writeGroupPath({
            db,
            name: "drawGroupRoute",
            timelineId: timeline.id,
            marcherIds: members,
            keepLive: true,
            draw: true,
            edit: (tx) =>
                drawGroupRouteInTransaction({
                    tx,
                    timelineId: timeline.id,
                    marcherIds: members,
                    points,
                }),
            routeOf: (r) => r.routeId,
        });
        expect(drawn.baked).toBe(false);
        const { routes, laneCount } = await routesOf(db, members);
        expect(routes).toEqual([drawn.result.routeId]);
        expect(laneCount(drawn.result.routeId)).toBe(6);
    });

    it("selected again, identical copies show as one loose path; a copy edited alone leaves it", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { timeline, members, points } = await setUp(db);
        await writeGroupPath({
            db,
            name: "drawGroupRoute",
            timelineId: timeline.id,
            marcherIds: members,
            keepLive: false,
            draw: true,
            edit: (tx) =>
                drawGroupRouteInTransaction({
                    tx,
                    timelineId: timeline.id,
                    marcherIds: members,
                    points,
                }),
            routeOf: (r) => r.routeId,
        });
        const drills = new Map(members.map((m) => [m, `M${m}`]));
        const target = await findGroupTarget(
            db,
            await resolverOf(db),
            members,
            drills,
            12,
        );
        expect(target?.group?.loose).toBe(true);
        expect(target!.lane).toBeUndefined();
        expect(target!.group!.members.map((m) => m.marcherId)).toEqual(members);
        expect(target!.points.map((p) => p.at)).toEqual(
            points.map((p) => p.at),
        );

        // One marcher's copy edited alone: it's not the same path as the others' any more
        const { routes } = await routesOf(db, members.slice(0, 1));
        const own = await db
            .select()
            .from(schema.timeline_routes)
            .where(eq(schema.timeline_routes.id, routes[0]!))
            .get();
        const geometry = JSON.parse(own!.geometry) as {
            points: { id: string; at: XY }[];
        };
        await editPathPoints({
            db,
            routeId: routes[0]!,
            points: geometry.points.map((p) => ({
                id: p.id,
                at: [p.at[0] + 5, p.at[1]] as XY,
            })),
        });
        expect(
            await findGroupTarget(
                db,
                await resolverOf(db),
                members,
                drills,
                12,
            ),
        ).toBeNull();
        const rest = await findGroupTarget(
            db,
            await resolverOf(db),
            members.slice(1),
            drills,
            12,
        );
        expect(rest?.group?.loose).toBe(true);
    });

    it("a loose edit stays copies (keepLive false on copies); drawn again with keepLive it goes live", async ({
        db,
        marchersAndPages: _,
    }) => {
        // keepLive is the store's call (`keepsLiveFor`): false for a loose path's edits even on
        // a shape's members, true for a fresh drawing of exactly a shape's members
        const { timeline, members, points, F } = await setUp(db);
        await drawLoose(db, timeline.id, members, points);
        const copy = (await routesOf(db, members)).routes[0]!;
        const geometry = await geometryOf(db, copy);
        const edited = await writeGroupPath({
            db,
            name: "editPathPoints",
            timelineId: timeline.id,
            marcherIds: members,
            keepLive: false,
            edit: (tx, routeId) =>
                editPathPointsInTransaction({
                    tx,
                    routeId,
                    points: geometry.points.map((p, i) => ({
                        id: p.id,
                        at: (i === 0 ? [F[0] + 30, F[1] - 40] : p.at) as XY,
                    })),
                }),
        });
        expect(edited.fromCopies).toBe(true);
        expect(edited.baked).toBe(true);
        expect((await routesOf(db, members)).routes).toHaveLength(6);

        const before = await walkOf(db);
        const redrawn = await writeGroupPath({
            db,
            name: "redrawPath",
            timelineId: timeline.id,
            marcherIds: members,
            keepLive: true,
            edit: (tx, routeId) =>
                redrawPathInTransaction({
                    tx,
                    routeId,
                    points: points.map((p) => ({ at: p.at })),
                }),
        });
        expect(redrawn.baked).toBe(false);
        const { routes, laneCount } = await routesOf(db, members);
        expect(routes).toHaveLength(1);
        expect(laneCount(routes[0]!)).toBe(6);
        expect(sameBits(before, await walkOf(db))).toBe(false);
    });

    it("an edit whose copies no longer match is refused and writes nothing", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { timeline, members, points } = await setUp(db);
        await drawLoose(db, timeline.id, members, points);
        // One copy edited alone
        const first = (await routesOf(db, members.slice(0, 1))).routes[0]!;
        const geometry = await geometryOf(db, first);
        await editPathPoints({
            db,
            routeId: first,
            points: geometry.points.map((p) => ({
                id: p.id,
                at: [p.at[0] + 5, p.at[1]] as XY,
            })),
        });
        const before = await walkOf(db);
        const routesBefore = await db
            .select()
            .from(schema.timeline_routes)
            .all();
        let edited = false;
        const refused = await writeGroupPath({
            db,
            name: "editPathPoints",
            timelineId: timeline.id,
            marcherIds: members,
            keepLive: false,
            edit: (tx, routeId) => {
                edited = true;
                return editPathPointsInTransaction({
                    tx,
                    routeId,
                    points: geometry.points,
                });
            },
        }).catch((e: unknown) => e);
        expect(refusalKey(refused)).toBe("timeline.refusals.route.copiesApart");
        expect(edited).toBe(false);
        expect(await db.select().from(schema.timeline_routes).all()).toEqual(
            routesBefore,
        );
        expect(sameBits(before, await walkOf(db))).toBe(true);
    });

    it("regroup refuses copies that differ, a route two members share, and a member with no lane", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { timeline, members, points } = await setUp(db);
        const regroup = (ids: readonly number[]) =>
            transactionWithHistory(db, "regroup", (tx) =>
                regroupCopiesInTransaction({
                    tx,
                    timelineId: timeline.id,
                    marcherIds: ids,
                }),
            ).catch((e: unknown) => e);
        // A member with no lane: nothing drawn yet
        expect(await regroup(members)).toBeInstanceOf(TimelineWriteError);
        // A route two members share: a live group path
        await drawLoose(db, timeline.id, members.slice(0, 3), points, true);
        expect(await regroup(members.slice(0, 3))).toBeInstanceOf(
            TimelineWriteError,
        );
        // Copies that differ
        await drawLoose(db, timeline.id, members.slice(3), points);
        const first = (await routesOf(db, members.slice(3, 4))).routes[0]!;
        const geometry = await geometryOf(db, first);
        await editPathPoints({
            db,
            routeId: first,
            points: geometry.points.map((p) => ({
                id: p.id,
                at: [p.at[0], p.at[1] + 4] as XY,
            })),
        });
        expect(await regroup(members.slice(3))).toBeInstanceOf(
            TimelineWriteError,
        );
    });

    it("a member sharing its spot keeps the group path live, naming who shares (D-22)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { timeline, members, points, F } = await setUp(db);
        const live = await drawLoose(db, timeline.id, members, points, true);
        const routeId = live.result.routeId;
        const r0 = await resolverOf(db);
        const outsider = [...r0.marcherIds()].sort((a, b) => a - b)[8]!;
        const A = schema.timeline_assignments;
        const L = schema.timeline_lanes;
        const m1Row = (
            await db.select().from(A).where(eq(A.marcher_id, members[0]!)).all()
        ).find((a) => a.start_beat === 9)!;
        // The outsider takes over m1's spot from count 4 (step 12's occupancy)
        await db.run(
            sql.raw("DROP INDEX timeline_assignments_transition_slot_unique"),
        );
        await db.run(
            sql.raw(
                "DROP INDEX timeline_assignments_transition_marcher_unique",
            ),
        );
        await db.run(sql`UPDATE ${A} SET end_beat = 13 WHERE id = ${m1Row.id}`);
        await db.run(
            sql`UPDATE ${A} SET start_beat = 13, slot_index = ${m1Row.slot_index} WHERE marcher_id = ${outsider} AND start_beat = 9`,
        );
        const geometry = await geometryOf(db, routeId);
        const written = await writeGroupPath({
            db,
            name: "editPathPoints",
            timelineId: timeline.id,
            marcherIds: members,
            keepLive: false,
            edit: (tx, rid) =>
                editPathPointsInTransaction({
                    tx,
                    routeId: rid,
                    points: geometry.points.map((p, i) => ({
                        id: p.id,
                        at: (i === 0 ? [F[0] + 20, F[1] - 30] : p.at) as XY,
                    })),
                }),
        });
        expect(written.baked).toBe(false);
        expect(written.shared).toHaveLength(2);
        const lanes = await db
            .select()
            .from(L)
            .where(eq(L.route_id, routeId))
            .all();
        expect(lanes).toHaveLength(6);
    });

    it("Detach with a route takes the member's laned row on that route, not its earliest", async ({
        db,
        marchersAndPages: _,
    }) => {
        const { timeline, members, points } = await setUp(db);
        const r0 = await resolverOf(db);
        const all = [...r0.marcherIds()].sort((a, b) => a - b);
        const [z, w] = [all[8]!, all[9]!];
        // Group path G1 for the members, G2 for two others
        const g1 = (await drawLoose(db, timeline.id, members, points, true))
            .result.routeId;
        const g2 = (await drawLoose(db, timeline.id, [z, w], points, true))
            .result.routeId;
        const A = schema.timeline_assignments;
        const L = schema.timeline_lanes;
        await db.run(
            sql.raw(
                "DROP INDEX timeline_assignments_transition_marcher_unique",
            ),
        );
        // z leaves its spot at count 4, and m1 walks it from there: a second laned row, on G2
        const m1 = members[0]!;
        const m1Row = (
            await db.select().from(A).where(eq(A.marcher_id, m1)).all()
        ).find((a) => a.start_beat === 9)!;
        const zRow = (
            await db.select().from(A).where(eq(A.marcher_id, z)).all()
        ).find((a) => a.start_beat === 9)!;
        await db.run(sql`UPDATE ${A} SET end_beat = 13 WHERE id = ${m1Row.id}`);
        await db.run(sql`DELETE FROM ${A} WHERE id = ${zRow.id}`);
        await db.run(
            sql`INSERT INTO ${A} (marcher_id, transition_id, slot_index, start_beat, end_beat) VALUES (${m1}, ${zRow.transition_id}, ${zRow.slot_index}, 13, 17)`,
        );
        const laneOn = (slot: number) =>
            db
                .select()
                .from(L)
                .where(
                    and(
                        eq(L.transition_id, zRow.transition_id),
                        eq(L.slot_index, slot),
                    ),
                )
                .get();
        const { routes } = await transactionWithHistory(db, "detach", (tx) =>
            detachInTransaction({
                tx,
                timelineId: timeline.id,
                marcherIds: [m1],
                routeId: g2,
            }),
        );
        // The lane on z's old spot left G2 for the copy; m1's lane on G1 stayed
        expect((await laneOn(zRow.slot_index))!.route_id).toBe(routes[m1]);
        expect((await laneOn(m1Row.slot_index))!.route_id).toBe(g1);
    });
});
