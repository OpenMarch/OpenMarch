// cspell:ignore rehome rehomed
/**
 * Adjust and Re-fit on the stored show, pathways step 3b (spec v0.10 AP-H1, AP-R11, D-22,
 * I-J3 to I-J5; decisions A to C in J.8). On the converted `marchersAndPages` show page 2's move is
 * `[9, 17)`, one shapeless transition holding every marcher.
 */
import * as fs from "fs";
import * as path from "path";
import { expect } from "vitest";
import { eq, getTableName, sql } from "drizzle-orm";
import {
    createResolver,
    groupSchedule,
    refitGeometry,
    S_MIN,
    type AdjustProfile,
    type Resolver,
    type RouteGeometry,
    type XY,
} from "@openmarch/core";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { refusalText } from "@/test/refusalText";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import { convertPagesToTimeline } from "@/test/convertPages";
import { readTimelineTables } from "@/timeline/timelineRows";
import { performRedo, performUndo, transactionWithHistory } from "../history";
import { drawRoute } from "../timelineRoutes";
import {
    detachFromGroupPath,
    drawGroupRoute,
    rejoinGroupPath,
} from "../timelineGroupRoutes";
import { editPathPoints, redrawPath, refitPath } from "../timelinePathEdits";
import {
    acknowledgeRehomed,
    adjustLane,
    removeAdjustKey,
    resetLaneAdjust,
    setAdjustKey,
} from "../timelinePathAdjust";

keepFixturesInPageMode("its tests convert the show themselves");

const TABLES = [
    schema.timeline_transitions,
    schema.timeline_assignments,
    schema.timeline_slot_destinations,
    schema.timeline_routes,
    schema.timeline_lanes,
    schema.timeline_route_sources,
];
const dataOf = async (db: DbConnection) => {
    const out: Record<string, unknown[]> = {};
    for (const table of TABLES)
        out[getTableName(table)] = await db.select().from(table).all();
    return out;
};
const resolverOf = async (db: DbConnection): Promise<Resolver> =>
    createResolver((await readTimelineTables(db)).snapshot);
const routeOf = async (db: DbConnection, routeId: number) =>
    JSON.parse(
        (await db
            .select()
            .from(schema.timeline_routes)
            .where(eq(schema.timeline_routes.id, routeId))
            .get())!.geometry,
    ) as RouteGeometry;
const lanesOf = async (db: DbConnection, routeId: number) =>
    await db
        .select()
        .from(schema.timeline_lanes)
        .where(eq(schema.timeline_lanes.route_id, routeId))
        .all();
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
const fileVersion = async (db: DbConnection) =>
    (
        await db
            .select({ version: sql<number>`user_version` })
            .from(sql`pragma_user_version`)
            .get()
    )?.version;

/**
 * A group path for the first two marchers on page 2: from F up, across and down, the long leg
 * between p and q 200 long, then a third point s beyond. Returns everything the tests read.
 */
async function groupFixture(db: DbConnection) {
    await convertPagesToTimeline(db);
    const timeline = (await db
        .select()
        .from(schema.timelines)
        .where(eq(schema.timelines.start_beat, 9))
        .get())!;
    const r0 = await resolverOf(db);
    const [m1, m2] = r0.marcherIds() as [number, number];
    const A1 = r0.positionAt(m1, 9) as XY;
    const base: XY = [A1[0] + 100, A1[1] + 100];
    const { routeId } = await drawGroupRoute({
        db,
        timelineId: timeline.id,
        marcherIds: [m1, m2],
        points: [
            { at: [base[0], base[1]] },
            { at: [base[0] + 200, base[1]] },
            { at: [base[0] + 300, base[1]] },
        ],
    });
    const geometry = await routeOf(db, routeId);
    const lanes = await lanesOf(db, routeId);
    const assignments = await db
        .select()
        .from(schema.timeline_assignments)
        .all();
    const slotOf = (m: number) =>
        assignments.find((a) => a.marcher_id === m && a.start_beat === 9)!
            .slot_index;
    const laneOf = (m: number) =>
        lanes.find((l) => l.slot_index === slotOf(m))!;
    const [p, q, s] = geometry.points as [
        RouteGeometry["points"][number],
        RouteGeometry["points"][number],
        RouteGeometry["points"][number],
    ];
    const D = (at: XY) =>
        Math.hypot(at[0] - geometry.from[0], at[1] - geometry.from[1]);
    return {
        timeline,
        routeId,
        geometry,
        m1,
        m2,
        lane1: laneOf(m1),
        lane2: laneOf(m2),
        p,
        q,
        s,
        placeP: D(p.at),
    };
}

const profileOf = async (db: DbConnection, laneId: number) => {
    const row = await db
        .select()
        .from(schema.timeline_lanes)
        .where(eq(schema.timeline_lanes.id, laneId))
        .get();
    return row!.adjust === null
        ? null
        : (JSON.parse(row!.adjust) as AdjustProfile);
};

describeDbTests("Adjust and Re-fit", (it) => {
    it("AP-R11: a lane drag writes the key and its zero keys; only that spot moves; one undo step; file version 12", async ({
        db,
        marchersAndPages: _,
    }) => {
        const f = await groupFixture(db);
        const r0 = await resolverOf(db);
        const before = await dataOf(db);
        expect(await fileVersion(db)).toBe(11);
        await adjustLane({
            db,
            laneId: f.lane2.id,
            marcherId: f.m2,
            x: f.placeP + 100,
            d: [0, 30],
        });
        const profile = await profileOf(db, f.lane2.id);
        expect(profile?.keys.map((k) => [k.a, k.b, k.d])).toEqual([
            [f.p.id, f.q.id, [0, 0]],
            [f.p.id, f.q.id, [0, 30]],
            [f.q.id, f.s.id, [0, 0]],
        ]);
        expect(profile?.keys[1]!.f).toBeCloseTo(0.5, 9);
        expect(await fileVersion(db)).toBe(12);
        const r1 = await resolverOf(db);
        for (let b = 9; b <= 17; b += 0.125)
            expect(r1.positionAt(f.m1, b)).toEqual(r0.positionAt(f.m1, b));
        // Off the bulge, and on the first and last legs, the spot walks where it did
        const L = groupSchedule(f.geometry as never).W.L;
        for (const x of [0, f.placeP / 2, f.placeP, f.placeP + 200, L])
            expect(r1.positionAt(f.m2, 9 + (x / L) * 8)).toEqual(
                r0.positionAt(f.m2, 9 + (x / L) * 8),
            );
        await expectOneUndoStep(db, before);
    });

    it("a key edit, removing a key and reset are one undo step each; reset is NULL", async ({
        db,
        marchersAndPages: _,
    }) => {
        const f = await groupFixture(db);
        const args = { db, laneId: f.lane1.id, marcherId: f.m1 };
        await adjustLane({ ...args, x: f.placeP + 100, d: [0, 30] });
        let before = await dataOf(db);
        await setAdjustKey({ ...args, index: 1, d: [5, 9] });
        expect((await profileOf(db, f.lane1.id))?.keys[1]!.d).toEqual([5, 9]);
        await expectOneUndoStep(db, before);

        before = await dataOf(db);
        await resetLaneAdjust(args);
        expect(await profileOf(db, f.lane1.id)).toBeNull();
        await expectOneUndoStep(db, before);
        await performUndo(db);

        before = await dataOf(db);
        await removeAdjustKey({ ...args, index: 1 });
        // Removing the only key that displaces leaves nothing
        expect(await profileOf(db, f.lane1.id)).toBeNull();
        await expectOneUndoStep(db, before);
    });

    it("refuses outside the shared part and on a shared part under two steps, writing nothing", async ({
        db,
        marchersAndPages: _,
    }) => {
        const f = await groupFixture(db);
        const before = await dataOf(db);
        await expect(
            adjustLane({
                db,
                laneId: f.lane1.id,
                marcherId: f.m1,
                x: f.placeP / 2,
                d: [0, 30],
            }),
        ).rejects.toThrow();
        // Squeeze the shared part to a single short stretch
        await editPathPoints({
            db,
            routeId: f.routeId,
            points: [
                { id: f.p.id, at: f.p.at },
                { id: f.q.id, at: [f.p.at[0] + 10, f.p.at[1]] },
                { id: f.s.id, at: [f.p.at[0] + 15, f.p.at[1]] },
            ],
        });
        await expect(
            adjustLane({
                db,
                laneId: f.lane1.id,
                marcherId: f.m1,
                x: f.placeP + 5,
                d: [0, 30],
            }),
        ).rejects.toThrow();
        expect(await profileOf(db, f.lane1.id)).toBeNull();
        await performUndo(db);
        expect(await dataOf(db)).toEqual(before);
    });

    it("AP-H1 from AP-R1: a deleted anchor re-homes with the badge, and one undo restores ids", async ({
        db,
        marchersAndPages: _,
    }) => {
        const f = await groupFixture(db);
        await adjustLane({
            db,
            laneId: f.lane1.id,
            marcherId: f.m1,
            x: f.placeP + 250,
            d: [0, 30],
        });
        const before = await dataOf(db);
        const report = await editPathPoints({
            db,
            routeId: f.routeId,
            points: [
                { id: f.p.id, at: f.p.at },
                { id: f.s.id, at: f.s.at },
            ],
        });
        expect(report.rehomedSpots).toBe(1);
        const profile = await profileOf(db, f.lane1.id);
        expect(profile?.rehomed).toBe(true);
        expect(profile?.keys.every((k) => k.a !== f.q.id)).toBe(true);
        expect(profile?.keys.every((k) => k.b !== f.q.id)).toBe(true);
        await expectOneUndoStep(db, before);
        await performUndo(db);
    });

    it("AP-H1 from AP-R8 again and from the route's redraw: no id survives, anchors go to from..to", async ({
        db,
        marchersAndPages: _,
    }) => {
        const f = await groupFixture(db);
        const args = { db, laneId: f.lane1.id, marcherId: f.m1 };
        await adjustLane({ ...args, x: f.placeP + 100, d: [0, 30] });
        const report = await redrawPath({
            db,
            routeId: f.routeId,
            points: [{ at: f.p.at }, { at: f.q.at }, { at: f.s.at }],
        });
        expect(report.rehomedSpots).toBe(1);
        let profile = await profileOf(db, f.lane1.id);
        expect(profile?.keys.every((k) => k.a === "from" && k.b === "to")).toBe(
            true,
        );
        await performUndo(db);

        const drawn = await drawGroupRoute({
            db,
            timelineId: f.timeline.id,
            marcherIds: [f.m1, f.m2],
            points: [{ at: f.p.at }, { at: f.q.at }, { at: f.s.at }],
        });
        expect(drawn.routeId).toBe(f.routeId);
        expect(drawn.rehome.rehomedSpots).toBe(1);
        profile = await profileOf(db, f.lane1.id);
        expect(profile?.keys.every((k) => k.a === "from" && k.b === "to")).toBe(
            true,
        );
    });

    it("every route geometry writer goes through the one helper", () => {
        const dir = path.resolve(__dirname, "..");
        const writes = (source: string) => {
            const aliases = [
                ...source.matchAll(
                    /(?:const|let)\s+(\w+)\s*=\s*schema\.timeline_routes\b/g,
                ),
            ].map((m) => m[1]!);
            return (
                /update\(\s*schema\.timeline_routes\s*\)/.test(source) ||
                /UPDATE\s+"?timeline_routes\b/i.test(source) ||
                aliases.some((a) =>
                    new RegExp(`update\\(\\s*${a}\\s*\\)`).test(source),
                )
            );
        };
        expect(writes("const R = schema.timeline_routes; tx.update(R)")).toBe(
            true,
        );
        const writers = fs
            .readdirSync(dir)
            .filter((f) => f.endsWith(".ts"))
            .filter((f) => f !== "timelineRouteGeometry.ts")
            .filter((f) => writes(fs.readFileSync(path.join(dir, f), "utf8")));
        expect(writers).toEqual([]);
        expect(
            fs.readFileSync(path.join(dir, "timelineRouteGeometry.ts"), "utf8"),
        ).toMatch(/rehomeProfile/);
    });

    it("AP-R11: a point drag stops short of crowding keys, with no drop and no badge", async ({
        db,
        marchersAndPages: _,
    }) => {
        const f = await groupFixture(db);
        const args = { db, laneId: f.lane1.id, marcherId: f.m1 };
        await adjustLane({ ...args, x: f.placeP + 100, d: [0, 30] });
        await adjustLane({ ...args, x: f.placeP + 130, d: [0, 10] });
        const keysBefore = (await profileOf(db, f.lane1.id))!.keys;
        const report = await editPathPoints({
            db,
            routeId: f.routeId,
            drag: true,
            points: [
                { id: f.p.id, at: f.p.at },
                { id: f.q.id, at: [f.p.at[0] + 20, f.p.at[1]] },
                { id: f.s.id, at: f.s.at },
            ],
        });
        expect(report.stoppedShort).toBe(true);
        expect(report.droppedKeys).toBe(0);
        const after = await profileOf(db, f.lane1.id);
        expect(after?.keys).toEqual(keysBefore);
        expect(after?.rehomed).toBeUndefined();
        // q stopped where the keys, 0.15 of the leg apart, are still a step apart
        const q = (await routeOf(db, f.routeId)).points[1]!;
        const leg = q.at[0] - f.p.at[0];
        expect(leg * 0.15).toBeGreaterThanOrEqual(S_MIN - 1e-6);
        expect(leg).toBeLessThan(200);
    });

    it("decision B: a non-drag edit that crowds keys drops one and badges", async ({
        db,
        marchersAndPages: _,
    }) => {
        const f = await groupFixture(db);
        const args = { db, laneId: f.lane1.id, marcherId: f.m1 };
        await adjustLane({ ...args, x: f.placeP + 100, d: [0, 30] });
        await adjustLane({ ...args, x: f.placeP + 130, d: [0, 10] });
        const report = await editPathPoints({
            db,
            routeId: f.routeId,
            points: [
                { id: f.p.id, at: f.p.at },
                { id: f.q.id, at: [f.p.at[0] + 60, f.p.at[1]] },
                { id: f.s.id, at: f.s.at },
            ],
        });
        // On a leg of 60 the bulge's two keys are 9 apart: the earlier stored goes
        expect(report.droppedKeys).toBe(1);
        const after = await profileOf(db, f.lane1.id);
        expect(after?.rehomed).toBe(true);
        expect(after?.keys.map((k) => k.d)).toEqual([
            [0, 0],
            [0, 10],
            [0, 0],
        ]);
    });

    const shift = async (db: DbConnection, m: number, beat: number, d: XY) => {
        // Moves where marcher `m` stands at `beat`: the destination its arriving row aims at
        const A = schema.timeline_assignments;
        const T = schema.timeline_transitions;
        const row = await db
            .select({ a: A, t: T })
            .from(A)
            .innerJoin(T, eq(T.id, A.transition_id))
            .where(sql`${A.marcher_id} = ${m} AND ${T.end_beat} = ${beat}`)
            .get();
        await transactionWithHistory(db, "shiftForTest", async (tx) => {
            await tx.run(
                sql`UPDATE timeline_slot_destinations SET x = x + ${d[0]}, y = y + ${d[1]} WHERE transition_id = ${row!.t.id} AND slot_index = ${row!.a.slot_index}`,
            );
        });
    };

    it("Re-fit, translation: both ends moved alike is exactly a translation; ids kept; one undo step", async ({
        db,
        marchersAndPages: _,
    }) => {
        const f = await groupFixture(db);
        const delta: XY = [16, -8];
        for (const m of [f.m1, f.m2]) {
            await shift(db, m, 9, delta);
            await shift(db, m, 17, delta);
        }
        const offsets = await lanesOf(db, f.routeId);
        const before = await dataOf(db);
        await refitPath({ db, routeId: f.routeId });
        const after = await routeOf(db, f.routeId);
        expect(after.from).toEqual([
            f.geometry.from[0] + delta[0],
            f.geometry.from[1] + delta[1],
        ]);
        after.points.forEach((p, i) => {
            expect(p.id).toBe(f.geometry.points[i]!.id);
            expect(p.at[0]).toBeCloseTo(
                f.geometry.points[i]!.at[0] + delta[0],
                9,
            );
            expect(p.at[1]).toBeCloseTo(
                f.geometry.points[i]!.at[1] + delta[1],
                9,
            );
        });
        for (const lane of await lanesOf(db, f.routeId)) {
            const was = offsets.find((l) => l.id === lane.id)!;
            expect(lane.offset_x).toBeCloseTo(was.offset_x!, 9);
            expect(lane.offset_y).toBeCloseTo(was.offset_y!, 9);
        }
        await expectOneUndoStep(db, before);
    });

    it("Re-fit, unequal ends: points stretch by fraction; offsets stay against the new from; every spot starts where it stands", async ({
        db,
        marchersAndPages: _,
    }) => {
        const f = await groupFixture(db);
        await shift(db, f.m1, 9, [40, 0]); // only one member's start moves, so spacing changes
        await shift(db, f.m1, 17, [0, 60]);
        await shift(db, f.m2, 17, [0, 60]);
        await refitPath({ db, routeId: f.routeId });
        const r = await resolverOf(db);
        const after = await routeOf(db, f.routeId);
        const lanes = await lanesOf(db, f.routeId);
        const A1 = r.positionAt(f.m1, 9) as XY;
        const A2 = r.positionAt(f.m2, 9) as XY;
        expect(after.from[0]).toBeCloseTo((A1[0] + A2[0]) / 2, 9);
        const lane1 = lanes.find((l) => l.id === f.lane1.id)!;
        expect(lane1.offset_x).toBeCloseTo(A1[0] - after.from[0], 9);
        expect(lane1.offset_y).toBeCloseTo(A1[1] - after.from[1], 9);
        // Inner points are between; the last one moved nearly as far as the end did in y
        expect(after.points.map((p) => p.id)).toEqual(
            f.geometry.points.map((p) => p.id),
        );
        expect(after).toEqual(refitGeometry(f.geometry, after.from, after.to));
        expect(
            after.points[0]!.at[1] - f.geometry.points[0]!.at[1],
        ).toBeLessThan(after.points[2]!.at[1] - f.geometry.points[2]!.at[1]);
    });

    it("Re-fit with nothing changed is refused; AP-H1 runs when it stretches keys together", async ({
        db,
        marchersAndPages: _,
    }) => {
        const f = await groupFixture(db);
        await expect(refitPath({ db, routeId: f.routeId })).rejects.toThrow();
        const args = { db, laneId: f.lane1.id, marcherId: f.m1 };
        await adjustLane({ ...args, x: f.placeP + 100, d: [0, 30] });
        // Pull the far end back past the whole path: the stretch squeezes the long leg
        for (const m of [f.m1, f.m2])
            await shift(db, m, 17, [
                -(f.geometry.to[0] - f.geometry.from[0]) * 0.9,
                0,
            ]);
        const report = await refitPath({ db, routeId: f.routeId });
        const profile = await profileOf(db, f.lane1.id);
        expect(
            profile === null || report.droppedKeys > 0 || !profile.rehomed,
        ).toBe(true);
        const r = await resolverOf(db);
        expect(
            r.diagnostics().filter((d) => d.code.startsWith("D-ADJUST")),
        ).toEqual([]);
    });

    it("the badge can be accepted; positions don't change", async ({
        db,
        marchersAndPages: _,
    }) => {
        const f = await groupFixture(db);
        await adjustLane({
            db,
            laneId: f.lane1.id,
            marcherId: f.m1,
            x: f.placeP + 250,
            d: [0, 30],
        });
        await editPathPoints({
            db,
            routeId: f.routeId,
            points: [
                { id: f.p.id, at: f.p.at },
                { id: f.s.id, at: f.s.at },
            ],
        });
        const r0 = await resolverOf(db);
        const before = await dataOf(db);
        await acknowledgeRehomed({ db, routeId: f.routeId });
        expect((await profileOf(db, f.lane1.id))?.rehomed).toBeUndefined();
        const r1 = await resolverOf(db);
        expect(r1.positionAt(f.m1, 13)).toEqual(r0.positionAt(f.m1, 13));
        await expectOneUndoStep(db, before);
    });

    it("AP-R8 and AP-R1 clear an Adjust anchored on the route a spot leaves, and say so", async ({
        db,
        marchersAndPages: _,
    }) => {
        const f = await groupFixture(db);
        await adjustLane({
            db,
            laneId: f.lane1.id,
            marcherId: f.m1,
            x: f.placeP + 100,
            d: [0, 30],
        });
        const own = await drawRoute({
            db,
            timelineId: f.timeline.id,
            marcherId: f.m1,
            points: [{ at: f.p.at }],
        });
        expect(own.adjustRemoved).toBe(true);
        expect(await profileOf(db, f.lane1.id)).toBeNull();
        await performUndo(db);
        const third = (await resolverOf(db)).marcherIds()[2]!;
        const drawn = await drawGroupRoute({
            db,
            timelineId: f.timeline.id,
            marcherIds: [f.m1, third],
            points: [{ at: f.p.at }],
        });
        expect(drawn.adjustsRemoved).toBe(1);
        expect(await profileOf(db, f.lane1.id)).toBeNull();
    });

    it("QA-AP-L10: Detach keeps an adjusted spot's Adjust and every position; Rejoin drops it (Q4), undo brings it back", async ({
        db,
        marchersAndPages: _,
    }) => {
        const f = await groupFixture(db);
        await adjustLane({
            db,
            laneId: f.lane1.id,
            marcherId: f.m1,
            x: f.placeP + 100,
            d: [0, 30],
        });
        const adjusted = await profileOf(db, f.lane1.id);
        const walk = async () => {
            const r = await resolverOf(db);
            return [f.m1, f.m2].map((m) =>
                Array.from({ length: 65 }, (_, i) =>
                    r.positionAt(m, 9 + i / 8),
                ),
            );
        };
        const before = await walk();
        const beforeData = await dataOf(db);
        const { routes } = await detachFromGroupPath({
            db,
            timelineId: f.timeline.id,
            marcherIds: [f.m1],
        });
        const copy = routes[f.m1]!;
        // The same lane, on the copy, with its offset and Adjust; nobody moves, bit for bit
        const lane = (await lanesOf(db, copy))[0]!;
        expect(lane.id).toBe(f.lane1.id);
        expect([lane.offset_x, lane.offset_y]).toEqual([
            f.lane1.offset_x,
            f.lane1.offset_y,
        ]);
        expect(await profileOf(db, f.lane1.id)).toEqual(adjusted);
        expect(await walk()).toEqual(before);
        await expectOneUndoStep(db, beforeData);

        // Rejoin: back on the group path with its offset, the Adjust gone (no toast, owner Q4)
        const detached = await dataOf(db);
        await rejoinGroupPath({
            db,
            timelineId: f.timeline.id,
            routeId: f.routeId,
            marcherIds: [f.m1],
        });
        const back = (await lanesOf(db, f.routeId)).find(
            (l) => l.id === f.lane1.id,
        )!;
        expect([back.offset_x, back.offset_y]).toEqual([
            f.lane1.offset_x,
            f.lane1.offset_y,
        ]);
        expect(back.adjust).toBeNull();
        expect(await lanesOf(db, copy)).toEqual([]);
        expect(
            await db.select().from(schema.timeline_route_sources).all(),
        ).toEqual([]);
        // The other spot never moved; this one walks the plain lane
        const after = await walk();
        expect(after[1]).toEqual(before[1]);
        expect(after[0]).not.toEqual(before[0]);
        // Undo brings the copy, its link and the Adjust back
        expect((await performUndo(db)).success).toBe(true);
        expect(await dataOf(db)).toEqual(detached);
        expect(await profileOf(db, f.lane1.id)).toEqual(adjusted);
        expect(await walk()).toEqual(before);
    });

    it("an Adjust on a Detached copy and a point edit of the copy write the copy only", async ({
        db,
        marchersAndPages: _,
    }) => {
        const f = await groupFixture(db);
        const { routes } = await detachFromGroupPath({
            db,
            timelineId: f.timeline.id,
            marcherIds: [f.m1],
        });
        const copy = routes[f.m1]!;
        const group = await routeOf(db, f.routeId);
        const r0 = await resolverOf(db);
        // The copy is still a lane with an offset, so it takes an Adjust (AP-R11)
        await adjustLane({
            db,
            laneId: f.lane1.id,
            marcherId: f.m1,
            x: f.placeP + 100,
            d: [0, 30],
        });
        expect(await profileOf(db, f.lane1.id)).not.toBeNull();
        const r1 = await resolverOf(db);
        for (let b = 9; b <= 17; b += 0.25)
            expect(r1.positionAt(f.m2, b)).toEqual(r0.positionAt(f.m2, b));
        // A point drag on the copy, given where the editor shows it (its points plus the offset)
        const o: XY = [f.lane1.offset_x!, f.lane1.offset_y!];
        const shown = (await routeOf(db, copy)).points.map((p) => ({
            id: p.id,
            at: [p.at[0] + o[0], p.at[1] + o[1]] as XY,
        }));
        await editPathPoints({
            db,
            routeId: copy,
            points: shown.map((p, i) =>
                i === 1 ? { id: p.id, at: [p.at[0], p.at[1] + 10] } : p,
            ),
        });
        const edited = await routeOf(db, copy);
        // Unmoved points and both ends kept exactly (so the group's counts stay), the dragged one
        // moved by 10 on the route
        expect(edited.from).toEqual(group.from);
        expect(edited.to).toEqual(group.to);
        expect(edited.points[0]!.at).toEqual(group.points[0]!.at);
        expect(edited.points[2]!.at).toEqual(group.points[2]!.at);
        expect(edited.points[1]!.at[1]).toBeCloseTo(
            group.points[1]!.at[1] + 10,
            9,
        );
        // The group path is untouched, and so is its walker
        expect(await routeOf(db, f.routeId)).toEqual(group);
        const r2 = await resolverOf(db);
        for (let b = 9; b <= 17; b += 0.25)
            expect(r2.positionAt(f.m2, b)).toEqual(r0.positionAt(f.m2, b));
    });

    it("Re-fit on a Detached copy moves its start side only, to where its marcher starts", async ({
        db,
        marchersAndPages: _,
    }) => {
        const f = await groupFixture(db);
        const { routes } = await detachFromGroupPath({
            db,
            timelineId: f.timeline.id,
            marcherIds: [f.m1],
        });
        const copy = routes[f.m1]!;
        // Nothing moved: refused, as for any path that fits
        await expect(refitPath({ db, routeId: copy })).rejects.toThrow();
        // The marcher's start moves (its previous move's end): the copy fits its new start
        const group = await routeOf(db, copy);
        const T = schema.timeline_transitions;
        const D = schema.timeline_slot_destinations;
        const first = (await db
            .select()
            .from(T)
            .where(eq(T.end_beat, 9))
            .all())!;
        expect(first.length).toBeGreaterThan(0);
        const A = schema.timeline_assignments;
        const row = (
            await db.select().from(A).where(eq(A.marcher_id, f.m1)).all()
        ).find((a) => a.end_beat === 9)!;
        await db.run(
            sql`UPDATE ${D} SET x = x + 8 WHERE transition_id = ${row.transition_id} AND slot_index = ${row.slot_index}`,
        );
        await refitPath({ db, routeId: copy });
        const refit = await routeOf(db, copy);
        expect(refit.to).toEqual(group.to);
        expect(refit.from[0]).toBeCloseTo(group.from[0] + 8, 9);
        const lane = (await lanesOf(db, copy))[0]!;
        expect([lane.offset_x, lane.offset_y]).toEqual([
            f.lane1.offset_x,
            f.lane1.offset_y,
        ]);
    });

    it("QA-AP-L2 (D-22): own path, group path, Detach and Adjust on a spot another marcher holds later are refused, naming them", async ({
        db,
        marchersAndPages: _,
    }) => {
        const f = await groupFixture(db);
        const third = (await resolverOf(db)).marcherIds()[2]!;
        const A = schema.timeline_assignments;
        // Step 12's occupancy: m3 holds m1's spot from count 4, on a fixture with the index gone
        await db.run(
            sql.raw("DROP INDEX timeline_assignments_transition_slot_unique"),
        );
        await db.run(
            sql.raw(
                "DROP INDEX timeline_assignments_transition_marcher_unique",
            ),
        );
        await db.run(
            sql`UPDATE ${A} SET end_beat = 13 WHERE marcher_id = ${f.m1} AND start_beat = 9`,
        );
        const ownRow = (
            await db.select().from(A).where(eq(A.marcher_id, third)).all()
        ).find((a) => a.start_beat === 9)!;
        await db.run(
            sql`UPDATE ${A} SET start_beat = 13, slot_index = ${f.lane1.slot_index} WHERE marcher_id = ${third} AND start_beat = 9`,
        );
        // m3 also keeps its own spot (no lane) until count 4: an earlier row with no lane before
        // its laned one (review of #900, S3)
        await db.run(
            sql`INSERT INTO ${A} (marcher_id, transition_id, slot_index, start_beat, end_beat) VALUES (${third}, ${ownRow.transition_id}, ${ownRow.slot_index}, 9, 13)`,
        );
        const before = await dataOf(db);
        const named = expect.objectContaining({
            message: expect.stringMatching(/4/),
        });
        // Detach finds m3's lane on its later row (it isn't "not on a group path"), and refuses
        // the shared spot, naming m1
        const m3Detach = await detachFromGroupPath({
            db,
            timelineId: f.timeline.id,
            marcherIds: [third],
        }).catch((e: unknown) => e);
        expect(refusalText(m3Detach)).toMatch(/is also walked by/);
        await expect(
            adjustLane({
                db,
                laneId: f.lane1.id,
                marcherId: f.m1,
                x: f.placeP + 100,
                d: [0, 30],
            }),
        ).rejects.toEqual(named);
        await expect(
            drawRoute({
                db,
                timelineId: f.timeline.id,
                marcherId: f.m1,
                points: [{ at: f.p.at }],
            }),
        ).rejects.toEqual(named);
        await expect(
            detachFromGroupPath({
                db,
                timelineId: f.timeline.id,
                marcherIds: [f.m1],
            }),
        ).rejects.toEqual(named);
        await expect(
            drawGroupRoute({
                db,
                timelineId: f.timeline.id,
                marcherIds: [f.m1, f.m2],
                points: [{ at: f.p.at }],
            }),
        ).rejects.toThrow();
        expect(await dataOf(db)).toEqual(before);
        // A path edit is not personal (07 N3): it still works
        await editPathPoints({
            db,
            routeId: f.routeId,
            points: [{ id: f.p.id, at: [f.p.at[0], f.p.at[1] + 8] }],
        });
    });

    it("Rejoin finds a Detached lane on a later row of the marcher, and restores its offset (review of #900, S3)", async ({
        db,
        marchersAndPages: _,
    }) => {
        const f = await groupFixture(db);
        const { routes } = await detachFromGroupPath({
            db,
            timelineId: f.timeline.id,
            marcherIds: [f.m1],
        });
        const third = (await resolverOf(db)).marcherIds()[2]!;
        const A = schema.timeline_assignments;
        await db.run(
            sql.raw("DROP INDEX timeline_assignments_transition_slot_unique"),
        );
        await db.run(
            sql.raw(
                "DROP INDEX timeline_assignments_transition_marcher_unique",
            ),
        );
        const thirdRow = (
            await db.select().from(A).where(eq(A.marcher_id, third)).all()
        ).find((a) => a.start_beat === 9)!;
        // m1 holds m3's spot (no lane) until count 4, then its own detached spot; m3 takes its
        // spot from count 4
        await db.run(
            sql`UPDATE ${A} SET start_beat = 13 WHERE marcher_id = ${third} AND start_beat = 9`,
        );
        await db.run(
            sql`UPDATE ${A} SET start_beat = 13 WHERE marcher_id = ${f.m1} AND start_beat = 9`,
        );
        await db.run(
            sql`INSERT INTO ${A} (marcher_id, transition_id, slot_index, start_beat, end_beat) VALUES (${f.m1}, ${thirdRow.transition_id}, ${thirdRow.slot_index}, 9, 13)`,
        );
        await rejoinGroupPath({
            db,
            timelineId: f.timeline.id,
            routeId: f.routeId,
            marcherIds: [f.m1],
        });
        const lane = (await lanesOf(db, f.routeId)).find(
            (l) => l.id === f.lane1.id,
        )!;
        // Back on the group path, not a second lane on m1's earlier spot; R's `from` is as it
        // was at Detach, so the recorded offset is restored (m1 doesn't start on this spot)
        expect(lane).toMatchObject({
            route_id: f.routeId,
            offset_x: f.lane1.offset_x,
            offset_y: f.lane1.offset_y,
            adjust: null,
        });
        expect(await lanesOf(db, routes[f.m1]!)).toEqual([]);
        expect(
            await db
                .select()
                .from(schema.timeline_lanes)
                .where(
                    eq(schema.timeline_lanes.slot_index, thirdRow.slot_index),
                )
                .all(),
        ).toEqual([]);
    });

    it("E-J3, E-J5 and E-R4 refuse at commit", async ({
        db,
        marchersAndPages: _,
    }) => {
        const f = await groupFixture(db);
        const L = schema.timeline_lanes;
        const write = (id: number, adjust: unknown) =>
            transactionWithHistory(db, "writeForTest", async (tx) => {
                await tx
                    .update(L)
                    .set({ adjust: JSON.stringify(adjust) })
                    .where(eq(L.id, id));
            });
        const k = (a: string, b: string, fr: number) => ({
            a,
            b,
            f: fr,
            d: [0, 5],
        });
        await expect(
            write(f.lane1.id, { v: 1, keys: [k("gone", f.q.id, 0.5)] }),
        ).rejects.toThrow(/E-J3/);
        // p..q is 200 long on this route: 0.05 of it is 10, under a step
        await expect(
            write(f.lane1.id, {
                v: 1,
                keys: [k(f.p.id, f.q.id, 0.4), k(f.p.id, f.q.id, 0.45)],
            }),
        ).rejects.toThrow(/E-J5/);
        await write(f.lane1.id, {
            v: 1,
            keys: [k(f.p.id, f.q.id, 0.4), k(f.p.id, f.q.id, 0.5)],
        });
        const own = await drawRoute({
            db,
            timelineId: f.timeline.id,
            marcherId: (await resolverOf(db)).marcherIds()[3]!,
            points: [{ at: f.p.at }],
        });
        const ownLane = (await lanesOf(db, own.routeId))[0]!;
        await expect(
            write(ownLane.id, { v: 1, keys: [k("from", "to", 0.5)] }),
        ).rejects.toThrow(/E-R4/);
    });

    it("Rejoin leaves an Adjust on the route it stays on", async ({
        db,
        marchersAndPages: _,
    }) => {
        const f = await groupFixture(db);
        await adjustLane({
            db,
            laneId: f.lane1.id,
            marcherId: f.m1,
            x: f.placeP + 100,
            d: [0, 30],
        });
        const third = (await resolverOf(db)).marcherIds()[2]!;
        await rejoinGroupPath({
            db,
            timelineId: f.timeline.id,
            routeId: f.routeId,
            marcherIds: [third],
        });
        expect(await profileOf(db, f.lane1.id)).not.toBeNull();
    });
});
