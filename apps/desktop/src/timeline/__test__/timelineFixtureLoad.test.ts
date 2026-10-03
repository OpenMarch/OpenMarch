import { afterEach, expect } from "vitest";
import { count } from "drizzle-orm";
import { createTimelineOracleForTesting } from "@openmarch/core";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { performRedo, performUndo } from "@/db-functions/history";
import type { TimelineFixture } from "../fixtures/fixtureTypes";
import {
    FIXTURE_DRILL_PREFIX,
    loadTimelineFixture,
    type LoadedTimelineFixture,
} from "../fixtures/loadTimelineFixture";
import { sc11, type Sc11Size } from "../fixtures/scenarioFixtures";
import {
    buildTimelineFixture,
    createTimelineDevApi,
    TIMELINE_FIXTURES,
} from "../fixtures/timelineFixtures";
import {
    startTimelineResolver,
    stopTimelineResolver,
    timelineResolverSettled,
    useTimelineResolverStore,
} from "../timelineStore";

/**
 * The fixture loader on a real database (docs/timeline/phases/05-rendering.md P5.7, P5.8): each
 * fixture is written through the db-functions as one undoable edit, and the resolver store built
 * from the tables answers like the oracle over the fixture's own rows.
 */

afterEach(() => stopTimelineResolver());

const tableCount = async (
    db: DbConnection,
    table:
        | typeof schema.marchers
        | typeof schema.timelines
        | typeof schema.timeline_shapes
        | typeof schema.timeline_transitions
        | typeof schema.timeline_assignments
        | typeof schema.timeline_slot_destinations,
) => (await db.select({ n: count() }).from(table).get())!.n;

/**
 * The store's resolver, over the loaded rows, against the oracle over the fixture's rows: at every
 * half beat from before the show to after it, for every marcher.
 */
const expectStoreMatchesFixture = (
    fixture: TimelineFixture,
    loaded: LoadedTimelineFixture,
    beatOffset = 0,
) => {
    const resolver = useTimelineResolverStore.getState().resolver;
    expect(resolver, "the store is ready").not.toBeNull();
    const oracle = createTimelineOracleForTesting(fixture.show);
    const last = Math.max(
        1,
        ...Object.values(fixture.show.transitions).map((t) => t.end),
    );
    for (const m of fixture.show.marchers) {
        const id = loaded.marchers.get(m.id)!;
        for (let b = -1; b <= last + 1; b += 0.5) {
            const [x, y] = resolver!.positionAt(id, b + beatOffset);
            const [ox, oy] = oracle.positionAt(m.id, b);
            const what = `${fixture.name} M${m.id} at beat ${b}`;
            expect(Math.abs(x - ox), what).toBeLessThan(1e-9);
            expect(Math.abs(y - oy), what).toBeLessThan(1e-9);
        }
    }
    const codes = (ds: Array<{ code: string }>) => ds.map((d) => d.code).sort();
    expect(codes(resolver!.diagnostics())).toEqual(codes(oracle.diagnostics()));
};

/** A smaller SC-11, so the regular suite stays quick; the scale test loads the full size. */
const SMALL: Sc11Size = {
    marchers: 40,
    groups: 3,
    groupTransitions: 30,
    stealTransitions: 4,
    timelines: 3,
    shapes: 20,
    chainDepth: 12,
    minRowsPerMarcher: 8,
};

describeDbTests("timeline fixture loader", (it) => {
    for (const { name, build } of TIMELINE_FIXTURES.filter(
        (f) => f.name !== "QA-SC-11",
    ))
        it(`${name}: the store over the loaded rows matches the oracle`, async ({
            db,
        }) => {
            const fixture = build(1);
            const loaded = await loadTimelineFixture(db, fixture);
            await startTimelineResolver(db);
            expectStoreMatchesFixture(fixture, loaded);
        });

    it("a small QA-SC-11 loads, with its timelines, and matches the oracle", async ({
        db,
    }) => {
        const fixture = sc11(3, SMALL);
        const loaded = await loadTimelineFixture(db, fixture);
        expect(await tableCount(db, schema.timelines)).toBe(
            fixture.timelines!.length,
        );
        expect(await tableCount(db, schema.timeline_transitions)).toBe(
            Object.keys(fixture.show.transitions).length,
        );
        expect(await tableCount(db, schema.timeline_assignments)).toBe(
            fixture.show.assignments.length,
        );
        await startTimelineResolver(db);
        expectStoreMatchesFixture(fixture, loaded);
    });

    it("loads as one undoable edit, which the running store follows", async ({
        db,
    }) => {
        await startTimelineResolver(db);
        const fixture = buildTimelineFixture("G13");
        const loaded = await loadTimelineFixture(db, fixture);
        await timelineResolverSettled();
        expectStoreMatchesFixture(fixture, loaded);
        expect(await tableCount(db, schema.timeline_slot_destinations)).toBe(5);

        const undo = await performUndo(db);
        expect(undo.success, undo.error?.message).toBe(true);
        await timelineResolverSettled();
        for (const table of [
            schema.marchers,
            schema.timelines,
            schema.timeline_shapes,
            schema.timeline_transitions,
            schema.timeline_assignments,
            schema.timeline_slot_destinations,
        ])
            expect(await tableCount(db, table)).toBe(0);
        expect(
            useTimelineResolverStore.getState().resolver!.marcherIds(),
        ).toEqual([]);

        const redo = await performRedo(db);
        expect(redo.success, redo.error?.message).toBe(true);
        await timelineResolverSettled();
        expectStoreMatchesFixture(fixture, loaded);
    });

    it("shifts every beat by the offset, and loads beside earlier fixtures", async ({
        db,
    }) => {
        const first = buildTimelineFixture("G6");
        const loadedFirst = await loadTimelineFixture(db, first);
        const second = buildTimelineFixture("G1");
        const loadedSecond = await loadTimelineFixture(db, second, {
            beatOffset: 1,
        });
        const marchers = await db.select().from(schema.marchers);
        expect(marchers.map((m) => m.drill_prefix)).toEqual(
            Array(5).fill(FIXTURE_DRILL_PREFIX),
        );
        expect(marchers.map((m) => m.drill_order)).toEqual([1, 2, 3, 4, 5]);

        await startTimelineResolver(db);
        expectStoreMatchesFixture(first, loadedFirst);
        expectStoreMatchesFixture(second, loadedSecond, 1);
        const timelines = await db.select().from(schema.timelines);
        // A timeline per transition range (C-11)
        expect(timelines.map((t) => [t.start_beat, t.end_beat])).toEqual([
            [0, 4],
            [4, 12],
            [1, 17],
        ]);
    });

    it("an invalid fixture writes nothing", async ({ db }) => {
        const fixture = buildTimelineFixture("G2");
        // Two rows of one marcher overlapping on one layer (E-A3)
        fixture.show.assignments[1]!.layer = 0;
        await expect(loadTimelineFixture(db, fixture)).rejects.toThrow();
        expect(await tableCount(db, schema.marchers)).toBe(0);
        expect(await tableCount(db, schema.timeline_transitions)).toBe(0);
    });

    it("the dev API loads a fixture by name, from beat 1 by default", async ({
        db,
    }) => {
        let reloads = 0;
        const api = createTimelineDevApi(db, () => reloads++);
        expect(api.fixtures()).toContain("QA-SC-05");
        const loaded = await api.loadFixture("qa-sc-05");
        expect(reloads).toBe(1);
        await startTimelineResolver(db);
        expectStoreMatchesFixture(buildTimelineFixture("QA-SC-05"), loaded, 1);
        await expect(api.loadFixture("nope")).rejects.toThrow(/Known/);
    });
});
