import { afterEach, beforeEach, expect } from "vitest";
import { eq } from "drizzle-orm";
import { createTimelineOracleForTesting } from "@openmarch/core";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import {
    resetTimelineChangeLog,
    transactionWithHistory,
} from "@/db-functions/history";
import { readTimelineTables } from "../timelineRows";
import {
    getTimelineWarming,
    positionsAt,
    setTimelineWarmSchedulerForTesting,
    startTimelineResolver,
    stopTimelineResolver,
    timelineMarcherIds,
    timelineResolverSettled,
    timelineWarmFocus,
    useTimelineResolverStore,
} from "../timelineStore";
import type { WarmScheduler } from "../timelineWarm";

/**
 * Idle warming in the resolver store (docs/timeline/phases/05-rendering.md P5.6) on a real
 * database: a pass starts after each cold build and batch, a batch or reset cancels it, and it
 * starts from the beat last drawn.
 */

/** Three marchers through six chained direct moves of 4 beats each, from beat 1. */
const seedChain = (db: DbConnection) =>
    transactionWithHistory(db, "seedChain", async (tx) => {
        await tx.insert(schema.marchers).values(
            [1, 2, 3].map((id) => ({
                id,
                section: "Brass",
                drill_prefix: "B",
                drill_order: id,
                home_x: 2 * id,
                home_y: 0,
            })),
        );
        const ids = [1, 2, 3, 4, 5, 6];
        // One timeline per move, which spans it (C-11)
        await tx.insert(schema.timelines).values(
            ids.map((id) => ({
                id,
                start_beat: 1 + 4 * (id - 1),
                end_beat: 5 + 4 * (id - 1),
            })),
        );
        await tx.insert(schema.timeline_shapes).values(
            ids.map((id) => ({
                id,
                kind: "line",
                geometry: JSON.stringify({
                    points: [
                        [id, 2 * id],
                        [id + 6, 2 * id],
                    ],
                }),
            })),
        );
        await tx.insert(schema.timeline_transitions).values(
            ids.map((id) => ({
                id,
                timeline_id: id,
                dest_shape_id: id,
                path_style: "direct",
                slot_count: 3,
                start_beat: 1 + 4 * (id - 1),
                end_beat: 5 + 4 * (id - 1),
            })),
        );
        await tx.insert(schema.timeline_assignments).values(
            ids.flatMap((t) =>
                [1, 2, 3].map((marcher_id, slot_index) => ({
                    marcher_id,
                    transition_id: t,
                    slot_index,
                    start_beat: 1 + 4 * (t - 1),
                    end_beat: 5 + 4 * (t - 1),
                })),
            ),
        );
    });

/** Runs slices only when the test says so; each slice runs every remaining query. */
const manualScheduler = () => {
    const queue: Array<(timeRemaining: () => number) => void> = [];
    const scheduler: WarmScheduler = {
        request(slice) {
            queue.push(slice);
            return () => {
                const i = queue.indexOf(slice);
                if (i >= 0) queue.splice(i, 1);
            };
        },
    };
    return {
        scheduler,
        pending: () => queue.length,
        /** Runs one slice with room for `queries` queries */
        runSlice(queries = Infinity) {
            const slice = queue.shift();
            if (!slice) throw new Error("no slice is scheduled");
            let checks = 0;
            slice(() => (++checks < queries ? 2 : 0));
        },
    };
};

let manual: ReturnType<typeof manualScheduler>;

beforeEach(() => {
    manual = manualScheduler();
    setTimelineWarmSchedulerForTesting(manual.scheduler);
});

afterEach(() => {
    stopTimelineResolver();
    setTimelineWarmSchedulerForTesting(null);
});

const resolver = () => useTimelineResolverStore.getState().resolver!;

describeDbTests("timeline resolver store: idle warming", (it) => {
    it("warms after the cold build, so the first frames compile nothing", async ({
        db,
    }) => {
        await seedChain(db);
        await startTimelineResolver(db);
        const warm = getTimelineWarming();
        expect(warm).not.toBeNull();
        expect(warm!.done).toBe(false);
        expect(manual.pending()).toBe(1);

        manual.runSlice(2);
        expect(warm!.warmed).toBe(2);
        while (manual.pending() > 0) manual.runSlice();
        expect(warm!.done).toBe(true);
        // Every transition boundary: 1, 5, ..., 25
        expect(warm!.warmed).toBe(7);

        resolver().resetCounters();
        const out = new Float64Array(2 * timelineMarcherIds().length);
        for (const beat of [1, 2.5, 9, 13.25, 24.9, 30])
            expect(positionsAt(beat, out)).toBe(true);
        expect(resolver().counters().originsComputed).toBe(0);
        expect(resolver().checkCacheClosure()).toBe(true);

        // Warming changes no answer
        const oracle = createTimelineOracleForTesting(
            (await readTimelineTables(db)).snapshot,
        );
        for (const m of [1, 2, 3])
            for (const beat of [0, 3, 11, 17.5, 25, 40])
                expect(resolver().positionAt(m, beat)).toEqual(
                    oracle.positionAt(m, beat),
                );
    });

    it("a batch cancels the running pass and starts a new one from the beat last drawn", async ({
        db,
    }) => {
        await seedChain(db);
        await startTimelineResolver(db);
        expect(timelineWarmFocus()).toBe(1);
        const first = getTimelineWarming()!;
        manual.runSlice(1);

        const out = new Float64Array(2 * timelineMarcherIds().length);
        positionsAt(14, out);
        expect(timelineWarmFocus()).toBe(14);

        await transactionWithHistory(db, "moveShape", async (tx) => {
            await tx
                .update(schema.timeline_shapes)
                .set({ geometry: '{"points":[[0,-4],[6,-4]]}' })
                .where(eq(schema.timeline_shapes.id, 2));
        });
        const second = getTimelineWarming()!;
        expect(second).not.toBe(first);
        expect(first.done).toBe(false);
        expect(first.warmed).toBe(1);
        // The cancelled pass left no slice behind; only the new one is scheduled
        expect(manual.pending()).toBe(1);

        // The new pass starts at the boundary nearest beat 14, then alternates outward
        const queried: number[] = [];
        const r = resolver();
        const original = r.positionsAt.bind(r);
        r.positionsAt = (beat, buffer) => {
            queried.push(beat);
            original(beat, buffer);
        };
        while (manual.pending() > 0) manual.runSlice();
        expect(queried).toEqual([13, 17, 9, 21, 5, 25, 1]);
        expect(second.done).toBe(true);
    });

    it("a reset cancels the pass and warms the rebuilt resolver; stop cancels it", async ({
        db,
    }) => {
        await seedChain(db);
        await startTimelineResolver(db);
        const first = getTimelineWarming()!;

        await resetTimelineChangeLog(db);
        await timelineResolverSettled();
        const second = getTimelineWarming()!;
        expect(second).not.toBe(first);
        expect(first.done).toBe(false);
        expect(manual.pending()).toBe(1);

        stopTimelineResolver();
        expect(getTimelineWarming()).toBeNull();
        expect(manual.pending()).toBe(0);
        expect(second.done).toBe(false);
    });

    it("an empty show finishes warming at once", async ({ db }) => {
        await startTimelineResolver(db);
        expect(getTimelineWarming()!.done).toBe(true);
        expect(manual.pending()).toBe(0);
    });
});
