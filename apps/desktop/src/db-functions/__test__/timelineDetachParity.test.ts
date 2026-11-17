/**
 * Detach parity, pathways step 3c (spec J.8 AP-R9: "positions are bit-identical"): on the
 * converted `marchersAndPages` show (76 marchers, 6 pages), a 16-member group path with a smooth
 * point, a corner and an arc leg, three spots adjusted, then:
 *
 * - Detach one member, Detach all 16 at once, and Rejoin every unadjusted member after Detach:
 *   every marcher's position at every sixteenth of a beat of the whole show is the same float64
 *   pair (`Object.is` on both coordinates) as before;
 * - Rejoin after the copy was drawn again: bit for bit as before Detach, the offset recorded at
 *   Detach restored while the group path's `from` is unchanged (review of #900);
 * - Rejoin after the group path was re-fitted: in the shared part the marcher keeps its place
 *   against every other member (B1);
 * - every edit is one undo step that puts every position back as before it, and a redo that puts
 *   them back as after it.
 *
 * Rejoin drops an Adjust (owner Q4), so an adjusted member is checked to move and only it.
 */
import { expect } from "vitest";
import { eq } from "drizzle-orm";
import {
    createResolver,
    groupSchedule,
    type Resolver,
    type RouteGeometry,
    type XY,
} from "@openmarch/core";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { keepFixturesInPageMode } from "@/test/timelineMode";
import { convertPagesToTimeline } from "@/test/convertPages";
import { readTimelineTables } from "@/timeline/timelineRows";
import { performRedo, performUndo } from "../history";
import { redrawPath, refitPath } from "../timelinePathEdits";
import {
    detachFromGroupPath,
    drawGroupRoute,
    meanOf,
    rejoinGroupPath,
} from "../timelineGroupRoutes";
import { adjustLane } from "../timelinePathAdjust";

keepFixturesInPageMode("its tests convert the show themselves");

const STEPS_PER_BEAT = 16;

const resolverOf = async (db: DbConnection): Promise<Resolver> =>
    createResolver((await readTimelineTables(db)).snapshot);

/** Every marcher's position at every sixteenth of a beat of the show, by marcher id */
async function walkOf(db: DbConnection) {
    const r = await resolverOf(db);
    const end = Math.max(
        ...(await db.select().from(schema.timelines).all()).map(
            (t) => t.end_beat,
        ),
    );
    const ids = [...r.marcherIds()].sort((a, b) => a - b);
    return {
        ids,
        rows: ids.map((id) =>
            Array.from({ length: end * STEPS_PER_BEAT + 1 }, (_, i) =>
                r.positionAt(id, i / STEPS_PER_BEAT),
            ),
        ),
    };
}

type Walk = Awaited<ReturnType<typeof walkOf>>;

/** The marchers whose walk differs from `base` anywhere, bit for bit; and how many pairs were compared */
function differ(base: Walk, now: Walk) {
    expect(now.ids).toEqual(base.ids);
    const moved: number[] = [];
    let compared = 0;
    base.rows.forEach((row, i) => {
        const other = now.rows[i]!;
        let same = row.length === other.length;
        row.forEach((p, k) => {
            compared++;
            const q = other[k]!;
            if (!Object.is(p[0], q[0]) || !Object.is(p[1], q[1])) same = false;
        });
        if (!same) moved.push(base.ids[i]!);
    });
    return { moved, compared };
}

const report: string[] = [];

describeDbTests("Detach parity (AP-R9)", (it) => {
    it("Detach one, Detach all 16 in one step, Rejoin: every marcher, every 1/16 beat, bit for bit", async ({
        db,
        marchersAndPages: _,
    }) => {
        await convertPagesToTimeline(db);
        const timeline = (await db
            .select()
            .from(schema.timelines)
            .where(eq(schema.timelines.start_beat, 9))
            .get())!;
        const r0 = await resolverOf(db);
        const members = [...r0.marcherIds()].sort((a, b) => a - b).slice(0, 16);
        const F = meanOf(members.map((m) => r0.positionAt(m, 9) as XY));
        const G = meanOf(members.map((m) => r0.positionAt(m, 17) as XY));
        const drawn = await drawGroupRoute({
            db,
            timelineId: timeline.id,
            marcherIds: members,
            points: [
                { at: [F[0] + 24, F[1] - 32], tension: 1 },
                { at: [F[0] + 60, F[1] - 10] },
                { at: [G[0] - 30, G[1] + 28], bulge: 0.25 },
            ],
        });
        // Three spots adjusted, in the middle of the shared part
        const geometry = JSON.parse(
            (await db
                .select()
                .from(schema.timeline_routes)
                .where(eq(schema.timeline_routes.id, drawn.routeId))
                .get())!.geometry,
        ) as RouteGeometry;
        const { W } = groupSchedule(geometry);
        const mid = (W.D[1]! + W.D[W.V.length - 2]!) / 2;
        const lanes = await db
            .select()
            .from(schema.timeline_lanes)
            .where(eq(schema.timeline_lanes.route_id, drawn.routeId))
            .all();
        const rows = await db
            .select()
            .from(schema.timeline_assignments)
            .where(eq(schema.timeline_assignments.start_beat, 9))
            .all();
        const laneOfMarcher = (m: number) => {
            const row = rows.find((a) => a.marcher_id === m)!;
            return lanes.find(
                (l) =>
                    l.transition_id === row.transition_id &&
                    l.slot_index === row.slot_index,
            )!;
        };
        const adjusted = [members[2]!, members[7]!, members[11]!];
        for (const [i, m] of adjusted.entries())
            await adjustLane({
                db,
                laneId: laneOfMarcher(m).id,
                marcherId: m,
                x: mid,
                d: [0, 6 + 3 * i],
            });

        const base = await walkOf(db);
        const pairs = (w: Walk) => w.rows.length * w.rows[0]!.length;
        const undo = async () =>
            expect((await performUndo(db)).success).toBe(true);
        const redo = async () =>
            expect((await performRedo(db)).success).toBe(true);
        /**
         * One edit, checked on positions: who moved against `base`, then an undo that puts every
         * position back as it was before the edit and a redo that puts them back as after it, bit
         * for bit. It ends redone when `keep`, else undone.
         */
        const step = async (
            label: string,
            edit: () => Promise<unknown>,
            expectMoved: number[] | null,
            keep = false,
        ) => {
            const before = await walkOf(db);
            await edit();
            const after = await walkOf(db);
            const d = differ(base, after);
            if (expectMoved !== null)
                expect(d.moved).toEqual([...expectMoved].sort((a, b) => a - b));
            await undo();
            expect(differ(before, await walkOf(db)).moved).toEqual([]);
            await redo();
            expect(differ(after, await walkOf(db)).moved).toEqual([]);
            if (!keep) {
                await undo();
                expect(differ(before, await walkOf(db)).moved).toEqual([]);
            }
            report.push(
                `${label}: ${d.compared} pairs, ${d.moved.length} moved; undo and redo exact`,
            );
            return after;
        };
        const plainMember = members[0]!;

        await step(
            "Detach one adjusted member",
            () =>
                detachFromGroupPath({
                    db,
                    timelineId: timeline.id,
                    marcherIds: [adjusted[0]!],
                }),
            [],
        );
        await step(
            "Detach all 16 in one edit",
            () =>
                detachFromGroupPath({
                    db,
                    timelineId: timeline.id,
                    marcherIds: members,
                }),
            [],
        );

        // Detach 15, Rejoin the unadjusted, then the adjusted (who drop their Adjust, Q4)
        await step(
            "Detach 15",
            () =>
                detachFromGroupPath({
                    db,
                    timelineId: timeline.id,
                    marcherIds: members.slice(0, 15),
                }),
            [],
            true,
        );
        const plain = members.slice(0, 15).filter((m) => !adjusted.includes(m));
        await step(
            `then Rejoin the ${plain.length} unadjusted`,
            () =>
                rejoinGroupPath({
                    db,
                    timelineId: timeline.id,
                    routeId: drawn.routeId,
                    marcherIds: plain,
                }),
            [],
            true,
        );
        await step(
            "then Rejoin the 3 adjusted (only they move: Adjust dropped)",
            () =>
                rejoinGroupPath({
                    db,
                    timelineId: timeline.id,
                    routeId: drawn.routeId,
                    marcherIds: adjusted,
                }),
            adjusted,
        );
        await undo();
        await undo();
        expect(differ(base, await walkOf(db)).moved).toEqual([]);

        // B1 (a): the copy drawn again (its offset becomes 0), then Rejoin: bit for bit as before
        const { routes } = await step(
            "Detach an unadjusted member",
            () =>
                detachFromGroupPath({
                    db,
                    timelineId: timeline.id,
                    marcherIds: [plainMember],
                }),
            [],
            true,
        ).then(async () => ({
            routes: {
                [plainMember]: (await db
                    .select()
                    .from(schema.timeline_lanes)
                    .where(
                        eq(
                            schema.timeline_lanes.id,
                            laneOfMarcher(plainMember).id,
                        ),
                    )
                    .get())!.route_id,
            },
        }));
        const A0 = r0.positionAt(plainMember, 9) as XY;
        await step(
            "then draw its copy again (only it moves)",
            () =>
                redrawPath({
                    db,
                    routeId: routes[plainMember]!,
                    points: [{ at: [A0[0] + 20, A0[1] - 30] }],
                }),
            [plainMember],
            true,
        );
        await step(
            "then Rejoin (R's `from` unchanged: the offset recorded at Detach)",
            () =>
                rejoinGroupPath({
                    db,
                    timelineId: timeline.id,
                    routeId: drawn.routeId,
                    marcherIds: [plainMember],
                }),
            [],
        );
        await undo();
        await undo();
        expect(differ(base, await walkOf(db)).moved).toEqual([]);

        // B1 (b): Detach, Re-fit the group path (the others' middle moved its `from`), Rejoin:
        // in the shared part the rejoined marcher keeps its place against every other member
        await step(
            "Detach an unadjusted member",
            () =>
                detachFromGroupPath({
                    db,
                    timelineId: timeline.id,
                    marcherIds: [plainMember],
                }),
            [],
            true,
        );
        await step(
            "then Re-fit the group path",
            () => refitPath({ db, routeId: drawn.routeId }),
            null,
            true,
        );
        await step(
            "then Rejoin (R's `from` moved: offset from where it starts)",
            () =>
                rejoinGroupPath({
                    db,
                    timelineId: timeline.id,
                    routeId: drawn.routeId,
                    marcherIds: [plainMember],
                }),
            null,
            true,
        );
        const r = await resolverOf(db);
        const refit = JSON.parse(
            (await db
                .select()
                .from(schema.timeline_routes)
                .where(eq(schema.timeline_routes.id, drawn.routeId))
                .get())!.geometry,
        ) as RouteGeometry;
        const { uFirst, uLast } = groupSchedule(refit);
        let placed = 0;
        for (const other of members.filter(
            (m) => m !== plainMember && !adjusted.includes(m),
        ))
            for (let k = 1; k < 16; k++) {
                const b = 9 + 8 * (uFirst + ((uLast - uFirst) * k) / 16);
                const p = r.positionAt(plainMember, b);
                const q = r.positionAt(other, b);
                const Ao = r0.positionAt(other, 9);
                expect(Math.abs(p[0] - q[0] - (A0[0] - Ao[0]))).toBeLessThan(
                    1e-9,
                );
                expect(Math.abs(p[1] - q[1] - (A0[1] - Ao[1]))).toBeLessThan(
                    1e-9,
                );
                placed++;
            }
        report.push(
            `  in its place against the other 12 unadjusted members at ${placed} shared-part samples (within 1e-9)`,
        );
        await undo();
        await undo();
        await undo();
        expect(differ(base, await walkOf(db)).moved).toEqual([]);
        expect(pairs(base)).toBeGreaterThan(70 * 16 * 16);
        // Printed for the PR (vitest run without --silent)
        // eslint-disable-next-line no-console
        console.log(
            `Detach parity (${base.ids.length} marchers x ${base.rows[0]!.length} samples):\n  ${report.join("\n  ")}`,
        );
    });
});
