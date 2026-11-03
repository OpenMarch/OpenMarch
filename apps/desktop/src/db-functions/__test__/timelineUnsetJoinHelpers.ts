import { expect } from "vitest";
import { eq, getTableName } from "drizzle-orm";
import { createResolver, type Resolver } from "@openmarch/core";
import { DbConnection, schema } from "@/test/base";
import { readTimelineTables } from "@/timeline/timelineRows";

/**
 * Shared by the Remove keyframe join tests (`timelineUnsetJoin.test.ts`, #470, and
 * `timelineUnsetJoinPart.test.ts`, #471), on the converted `marchersAndPages` show: pages 1 to 6
 * of 8 counts, so page 2's box is `[9, 17)` and page 3's `[17, 25)`.
 */

/** Page 2's box. */
export const PAGE2 = { start: 9, end: 17 };

const TABLES = [
    schema.timelines,
    schema.timeline_shapes,
    schema.timeline_transitions,
    schema.timeline_assignments,
    schema.timeline_slot_destinations,
    schema.timeline_shape_recipes,
    schema.timeline_shape_recipe_marchers,
];

/** Every timeline table's rows, to compare across undo and redo. */
export const dataOf = async (db: DbConnection) => {
    const out: Record<string, unknown[]> = {};
    for (const table of TABLES)
        out[getTableName(table)] = await db.select().from(table).all();
    return out;
};

export const resolverOf = async (db: DbConnection): Promise<Resolver> =>
    createResolver((await readTimelineTables(db)).snapshot);

/** Each marcher's step length on each count of `[start, end)`, page 2 unless given. */
export const stepsOf = (
    r: Resolver,
    marcherIds: readonly number[],
    { start, end }: { start: number; end: number } = PAGE2,
) =>
    new Map(
        marcherIds.map((id) => [
            id,
            Array.from({ length: end - start }, (_, i) => {
                const [x0, y0] = r.positionAt(id, start + i);
                const [x1, y1] = r.positionAt(id, start + i + 1);
                return Math.hypot(x1 - x0, y1 - y0);
            }),
        ]),
    );

/** The same marchers take the same steps, count by count. */
export const expectSameSteps = (
    a: ReturnType<typeof stepsOf>,
    b: ReturnType<typeof stepsOf>,
) => {
    expect([...b.keys()]).toEqual([...a.keys()]);
    for (const [id, steps] of a)
        steps.forEach((step, i) =>
            expect(b.get(id)![i], `marcher ${id}, step ${i}`).toBeCloseTo(
                step,
                6,
            ),
        );
};

/** Page 2's own timeline, over [9, 17), its one transition and its members, ascending. */
export const page2 = async (db: DbConnection) => {
    const timeline = (await db
        .select()
        .from(schema.timelines)
        .where(eq(schema.timelines.start_beat, PAGE2.start))
        .get())!;
    expect(timeline.end_beat).toBe(PAGE2.end);
    const transition = (await db
        .select()
        .from(schema.timeline_transitions)
        .where(eq(schema.timeline_transitions.timeline_id, timeline.id))
        .get())!;
    const members = (
        await db
            .select({ id: schema.timeline_assignments.marcher_id })
            .from(schema.timeline_assignments)
            .where(eq(schema.timeline_assignments.transition_id, transition.id))
            .all()
    )
        .map((r) => r.id)
        .sort((a, b) => a - b);
    return { timeline, transition, members };
};

/** Timeline `id`'s counts, or undefined once it's gone. */
export const timelineRange = async (db: DbConnection, id: number) =>
    await db
        .select({
            start: schema.timelines.start_beat,
            end: schema.timelines.end_beat,
        })
        .from(schema.timelines)
        .where(eq(schema.timelines.id, id))
        .get();
