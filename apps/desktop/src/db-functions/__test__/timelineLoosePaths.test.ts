/**
 * Loose group paths (interaction round 7): a group path for a selection that isn't a placed shape
 * is saved as each marcher's own copy, in the edit's own undo step; the copies regroup bit for bit
 * to be edited together again.
 */
import { expect } from "vitest";
import { and, eq } from "drizzle-orm";
import { createResolver, type Resolver, type XY } from "@openmarch/core";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import { convertPagesToTimeline } from "@/test/convertPages";
import { readTimelineTables } from "@/timeline/timelineRows";
import { performUndo, transactionWithHistory } from "../history";
import {
    detachFromGroupPath,
    drawGroupRoute,
    drawGroupRouteInTransaction,
    meanOf,
} from "../timelineGroupRoutes";
import {
    editPathPoints,
    editPathPointsInTransaction,
} from "../timelinePathEdits";
import { findGroupTarget } from "@/pathways/pathTarget";
import {
    regroupCopiesInTransaction,
    writeGroupPath,
} from "../timelineLoosePaths";

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
            edit: (tx) =>
                drawGroupRouteInTransaction({
                    tx,
                    timelineId: timeline.id,
                    marcherIds: members,
                    points,
                }),
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
        const write = (edit: Parameters<typeof writeGroupPath>[0]["edit"]) =>
            writeGroupPath({
                db,
                name: "edit",
                timelineId: timeline.id,
                marcherIds: members,
                keepLive: false,
                edit,
            });
        await write((tx) =>
            drawGroupRouteInTransaction({
                tx,
                timelineId: timeline.id,
                marcherIds: members,
                points,
            }),
        );
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
        const edited = await write((tx, routeId) =>
            editPathPointsInTransaction({
                tx,
                routeId: routeId!,
                points: moved,
            }),
        );
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
            edit: (tx) =>
                drawGroupRouteInTransaction({
                    tx,
                    timelineId: timeline.id,
                    marcherIds: members,
                    points,
                }),
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
            edit: (tx) =>
                drawGroupRouteInTransaction({
                    tx,
                    timelineId: timeline.id,
                    marcherIds: members,
                    points,
                }),
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
});
