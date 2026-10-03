import { expect } from "vitest";
import { eq } from "drizzle-orm";
import { describeDbTests, schema } from "@/test/base";
import { transactionWithHistory } from "../history";
import {
    subscribeTimelineChanges,
    TimelineChangeEvent,
} from "../timelineChanges";

/**
 * Spec §10.2: the resolver must see exactly the post-commit state. The change-log triggers render
 * REAL columns at full precision, so the drained images parse back to the stored doubles.
 */

/** Values that need 16 or 17 significant digits to round-trip. */
const awkward = [
    0.1 + 0.2,
    1 / 3,
    123456.78901234567,
    -1e6 + 1e-9,
    Math.PI * 1e3,
    -Math.E,
    5e-324,
    999999.9999999999,
];

const record = async (run: () => Promise<unknown>) => {
    const events: TimelineChangeEvent[] = [];
    const unsubscribe = subscribeTimelineChanges((e) => {
        events.push(e);
    });
    try {
        await run();
    } finally {
        unsubscribe();
    }
    return events.flatMap((e) => (e.kind === "batch" ? e.batch.changes : []));
};

const same = (actual: unknown, expected: number, what: string) =>
    expect(
        Object.is(actual, expected),
        `${what}: ${actual} vs ${expected}`,
    ).toBe(true);

describeDbTests("change-log REAL precision", (it) => {
    it("marcher homes and slot destinations round-trip exactly in every image", async ({
        db,
    }) => {
        // Insert at the first value pair, update through the rest, then delete: covers the
        // insert-after, update before/after and delete-before images.
        const pairs = awkward.map(
            (x, i) => [x, awkward[(i + 3) % awkward.length]] as const,
        );
        await transactionWithHistory(db, "seed", async (tx) => {
            await tx.insert(schema.marchers).values({
                id: 1,
                section: "Brass",
                drill_prefix: "B",
                drill_order: 1,
            });
            await tx.insert(schema.timelines).values({
                id: 1,
                name: "T",
                start_beat: 0,
                end_beat: 16,
            });
        });

        const changes = await record(async () => {
            // A transition needs its destination in the same edit
            await transactionWithHistory(db, "insert", async (tx) => {
                await tx.insert(schema.timeline_transitions).values({
                    id: 1,
                    timeline_id: 1,
                    dest_shape_id: null,
                    slot_count: 1,
                    start_beat: 0,
                    end_beat: 16,
                });
                await tx.insert(schema.timeline_slot_destinations).values({
                    id: 1,
                    transition_id: 1,
                    slot_index: 0,
                    x: pairs[0][0],
                    y: pairs[0][1],
                });
            });
            await transactionWithHistory(db, "update", async (tx) => {
                for (const [x, y] of pairs) {
                    await tx
                        .update(schema.marchers)
                        .set({ home_x: x, home_y: y })
                        .where(eq(schema.marchers.id, 1));
                    await tx
                        .update(schema.timeline_slot_destinations)
                        .set({ x, y })
                        .where(eq(schema.timeline_slot_destinations.id, 1));
                }
            });
            await transactionWithHistory(db, "delete", async (tx) => {
                await tx
                    .delete(schema.timeline_slot_destinations)
                    .where(eq(schema.timeline_slot_destinations.id, 1));
                await tx
                    .delete(schema.timeline_transitions)
                    .where(eq(schema.timeline_transitions.id, 1));
            });
        });

        const homes = changes.filter((c) => c.table === "marchers");
        const destinations = changes.filter(
            (c) => c.table === "slot_destinations",
        );
        expect(homes).toHaveLength(pairs.length);
        expect(destinations).toHaveLength(pairs.length + 2);

        // The stored column is the oracle
        const stored = await db.select().from(schema.marchers).all();
        same(stored[0].home_x, pairs.at(-1)![0], "stored home_x");
        same(stored[0].home_y, pairs.at(-1)![1], "stored home_y");

        const imageHome = (image: unknown) =>
            (image as { home: [number, number] }).home;
        homes.forEach((c, i) => {
            const [x, y] = pairs[i];
            same(imageHome(c.after)[0], x, `home after ${i} x`);
            same(imageHome(c.after)[1], y, `home after ${i} y`);
            const [px, py] = i === 0 ? [0, 0] : pairs[i - 1];
            same(imageHome(c.before)[0], px, `home before ${i} x`);
            same(imageHome(c.before)[1], py, `home before ${i} y`);
        });

        const imageXY = (image: unknown) => image as { x: number; y: number };
        // insert (after), then one update per pair (before and after), then delete (before)
        expect(destinations[0].before).toBeNull();
        same(imageXY(destinations[0].after).x, pairs[0][0], "dest insert x");
        same(imageXY(destinations[0].after).y, pairs[0][1], "dest insert y");
        pairs.forEach(([x, y], i) => {
            const c = destinations[i + 1];
            const [px, py] = pairs[i - 1] ?? pairs[0];
            same(imageXY(c.before).x, px, `dest update ${i} before x`);
            same(imageXY(c.before).y, py, `dest update ${i} before y`);
            same(imageXY(c.after).x, x, `dest update ${i} after x`);
            same(imageXY(c.after).y, y, `dest update ${i} after y`);
        });
        const del = destinations.at(-1)!;
        expect(del.after).toBeNull();
        same(imageXY(del.before).x, pairs.at(-1)![0], "dest delete x");
        same(imageXY(del.before).y, pairs.at(-1)![1], "dest delete y");
    });

    it("integer-valued REALs stay plain numbers", async ({ db }) => {
        const changes = await record(() =>
            transactionWithHistory(db, "ints", async (tx) => {
                await tx.insert(schema.marchers).values({
                    id: 1,
                    section: "Brass",
                    drill_prefix: "B",
                    drill_order: 1,
                    home_x: 0,
                    home_y: 100,
                });
            }),
        );
        expect((changes[0].after as { home: number[] }).home).toEqual([0, 100]);
    });
});
