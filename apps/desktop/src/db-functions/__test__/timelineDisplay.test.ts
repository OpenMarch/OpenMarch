import { afterEach, describe, expect, it as plainIt } from "vitest";
import { eq, sql } from "drizzle-orm";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { convertPagesToTimeline } from "@/timeline/convert/writePageConversion";
import {
    startTimelineResolver,
    stopTimelineResolver,
    timelineResolverSettled,
    useTimelineResolverStore,
} from "@/timeline/timelineStore";
import { performRedo, performUndo, transactionWithHistory } from "../history";
import { createBeats } from "../beat";
import { TimelineCommitViolationError } from "../timelineChanges";
import {
    historyStatementTable,
    touchesTimelineDisplayTables,
    useTimelineDisplayStore,
} from "../timelineDisplay";
import { keepFixturesInPageMode } from "@/test/timelineMode";

// P7.17: these tests set up timeline mode themselves
keepFixturesInPageMode(
    "its tests convert the show or write timeline rows, and set the flag, themselves",
);

/**
 * The display signal (docs/timeline/phases/07-page-parity.md P7.15): edits to `timelines` rows
 * alone and shape renames give an empty change batch, so the resolver version stays put, but the
 * display version moves on the commit, the undo and the redo.
 */

afterEach(() => stopTimelineResolver());

const setUp = async (db: DbConnection) => {
    await db.delete(schema.workspace_settings);
    await db.insert(schema.workspace_settings).values({
        id: 1,
        json_data: JSON.stringify({ timelineMode: true }),
    });
    await convertPagesToTimeline(db);
    await startTimelineResolver(db);
    await timelineResolverSettled();
};

const versions = () => ({
    resolver: useTimelineResolverStore.getState().version,
    display: useTimelineDisplayStore.getState().version,
});

describeDbTests("timeline display version", (it) => {
    it("a timeline rename bumps the display version, not the resolver's, through undo and redo", async ({
        db,
        marchersAndPages: _,
    }) => {
        await setUp(db);
        const [timeline] = await db.select().from(schema.timelines).all();
        const start = versions();

        await transactionWithHistory(db, "renameTimeline", (tx) =>
            tx
                .update(schema.timelines)
                .set({ name: "Renamed" })
                .where(eq(schema.timelines.id, timeline!.id)),
        );
        const edited = versions();
        expect(edited.resolver).toBe(start.resolver);
        expect(edited.display).toBe(start.display + 1);

        await performUndo(db);
        const undone = versions();
        expect(undone.resolver).toBe(start.resolver);
        expect(undone.display).toBe(edited.display + 1);
        expect((await db.select().from(schema.timelines).all())[0]!.name).toBe(
            timeline!.name,
        );

        await performRedo(db);
        const redone = versions();
        expect(redone.resolver).toBe(start.resolver);
        expect(redone.display).toBe(undone.display + 1);
    });

    it("a timeline range edit alone bumps the display version through undo and redo", async ({
        db,
        marchersAndPages: _,
    }) => {
        await setUp(db);
        // An empty timeline: one with transitions moves only with them (C-11)
        await transactionWithHistory(db, "addEmptyTimeline", (tx) =>
            tx
                .insert(schema.timelines)
                .values({ name: "Spare", start_beat: 50, end_beat: 53 }),
        );
        await timelineResolverSettled();
        const timeline = await db
            .select()
            .from(schema.timelines)
            .where(eq(schema.timelines.name, "Spare"))
            .get();
        const start = versions();
        await transactionWithHistory(db, "growTimeline", (tx) =>
            tx
                .update(schema.timelines)
                .set({ end_beat: timeline!.end_beat + 4 })
                .where(eq(schema.timelines.id, timeline!.id)),
        );
        expect(versions().display).toBe(start.display + 1);
        await performUndo(db);
        expect(versions().display).toBe(start.display + 2);
        await performRedo(db);
        expect(versions().display).toBe(start.display + 3);
        expect(versions().resolver).toBe(start.resolver);
    });

    it("a shape rename bumps the display version through undo and redo", async ({
        db,
        marchersAndPages: _,
    }) => {
        await setUp(db);
        await db.insert(schema.timeline_shapes).values({
            kind: "line",
            geometry: '{"points":[[0,0],[10,0]]}',
        });
        await timelineResolverSettled();
        const [shape] = await db.select().from(schema.timeline_shapes).all();
        const start = versions();
        await transactionWithHistory(db, "renameShape", (tx) =>
            tx
                .update(schema.timeline_shapes)
                .set({ name: "Front line" })
                .where(eq(schema.timeline_shapes.id, shape!.id)),
        );
        expect(versions().display).toBe(start.display + 1);
        await performUndo(db);
        expect(versions().display).toBe(start.display + 2);
        await performRedo(db);
        expect(versions().display).toBe(start.display + 3);
    });

    it("a drill number edit bumps the display version", async ({
        db,
        marchersAndPages: _,
    }) => {
        await setUp(db);
        const start = versions();
        await transactionWithHistory(db, "renumber", (tx) =>
            tx
                .update(schema.marchers)
                .set({ drill_order: 99 })
                .where(eq(schema.marchers.id, 1)),
        );
        expect(versions().display).toBe(start.display + 1);
        await performUndo(db);
        expect(versions().display).toBe(start.display + 2);
    });

    it("a ripple that only moves a timeline's range bumps the display version, not the resolver's, through undo and redo", async ({
        db,
        marchersAndPages: _,
    }) => {
        await setUp(db);
        const beat = { duration: 0.5, include_in_measure: true };
        // Beats after the last page: no page move changes
        await createBeats({ db, newBeats: [beat, beat, beat, beat] });
        await transactionWithHistory(db, "addEmptyTimeline", (tx) =>
            tx
                .insert(schema.timelines)
                .values({ name: "Spare", start_beat: 50, end_beat: 53 }),
        );
        await timelineResolverSettled();
        const spare = () =>
            db
                .select()
                .from(schema.timelines)
                .where(eq(schema.timelines.name, "Spare"))
                .get();
        const others = async () =>
            (await db.select().from(schema.timelines).all()).filter(
                (t) => t.name !== "Spare",
            );
        const othersBefore = await others();
        const transitionsBefore = await db
            .select()
            .from(schema.timeline_transitions)
            .all();
        const start = versions();

        // One beat inside the spare timeline's range: the ripple grows it by one
        await createBeats({ db, newBeats: [beat], startingPosition: 51 });
        await timelineResolverSettled();
        expect(await spare()).toMatchObject({ start_beat: 50, end_beat: 54 });
        expect(await others()).toEqual(othersBefore);
        expect(
            await db.select().from(schema.timeline_transitions).all(),
        ).toEqual(transitionsBefore);
        const edited = versions();
        expect(edited.resolver).toBe(start.resolver);
        expect(edited.display).toBeGreaterThan(start.display);

        await performUndo(db);
        expect(await spare()).toMatchObject({ start_beat: 50, end_beat: 53 });
        const undone = versions();
        expect(undone.resolver).toBe(start.resolver);
        expect(undone.display).toBeGreaterThan(edited.display);

        await performRedo(db);
        expect(await spare()).toMatchObject({ start_beat: 50, end_beat: 54 });
        expect(versions().resolver).toBe(start.resolver);
        expect(versions().display).toBeGreaterThan(undone.display);
    });

    it("a commit-time rejection, and a throw after a timelines write, leave the display version alone", async ({
        db,
        marchersAndPages: _,
    }) => {
        await setUp(db);
        const [timeline] = await db.select().from(schema.timelines).all();
        const start = versions();

        const violation = await transactionWithHistory(
            db,
            "incomplete",
            async (tx) => {
                await tx
                    .update(schema.timelines)
                    .set({ name: "Never" })
                    .where(eq(schema.timelines.id, timeline!.id));
                await tx.insert(schema.timeline_transitions).values({
                    timeline_id: timeline!.id,
                    dest_shape_id: null,
                    slot_count: 2,
                    start_beat: timeline!.end_beat + 10,
                    end_beat: timeline!.end_beat + 20,
                });
            },
        ).catch((e: unknown) => e);
        expect(violation).toBeInstanceOf(Error);
        expect(versions()).toEqual(start);

        const thrown = await transactionWithHistory(
            db,
            "throws",
            async (tx) => {
                await tx
                    .update(schema.timelines)
                    .set({ name: "Never" })
                    .where(eq(schema.timelines.id, timeline!.id));
                throw new Error("boom");
            },
        ).catch((e: unknown) => e);
        expect((thrown as Error).message).toBe("boom");
        expect(versions()).toEqual(start);
        expect((await db.select().from(schema.timelines).all())[0]!.name).toBe(
            timeline!.name,
        );
    });

    it("a failed undo or redo leaves the display version alone", async ({
        db,
        marchersAndPages: _,
    }) => {
        await setUp(db);
        const [timeline] = await db.select().from(schema.timelines).all();
        await transactionWithHistory(db, "rename", (tx) =>
            tx
                .update(schema.timelines)
                .set({ name: "Renamed" })
                .where(eq(schema.timelines.id, timeline!.id)),
        );
        // Corrupt the newest undo group so that replaying it fails
        await db.run(
            sql.raw(
                `UPDATE history_undo SET sql = 'UPDATE "timelines" SET nonsense = ' WHERE history_group = (SELECT MAX(history_group) FROM history_undo)`,
            ),
        );
        const start = versions();
        const undo = await performUndo(db);
        expect(undo.success).toBe(false);
        expect(versions()).toEqual(start);

        // Repair it, undo for real, then corrupt the redo group
        await db.run(
            sql.raw(
                `UPDATE history_undo SET sql = 'UPDATE "timelines" SET "name" = ''Renamed'' WHERE id = ${timeline!.id}' WHERE history_group = (SELECT MAX(history_group) FROM history_undo)`,
            ),
        );
        expect((await performUndo(db)).success).toBe(true);
        await db.run(
            sql.raw(
                `UPDATE history_redo SET sql = 'UPDATE "timelines" SET nonsense = '`,
            ),
        );
        const afterUndo = versions();
        const redo = await performRedo(db);
        expect(redo.success).toBe(false);
        expect(versions()).toEqual(afterUndo);
    });

    it("an edit outside the timeline tables leaves the display version alone", async ({
        db,
        marchersAndPages: _,
    }) => {
        await setUp(db);
        await db.insert(schema.utility).values({ id: 0 }).onConflictDoNothing();
        const start = versions();
        await transactionWithHistory(db, "updateUtility", (tx) =>
            tx
                .update(schema.utility)
                .set({ last_page_counts: 7 })
                .where(eq(schema.utility.id, 0)),
        );
        expect(versions().display).toBe(start.display);
    });
});

describe("history statement tables", () => {
    plainIt("names the table a statement writes", () => {
        expect(historyStatementTable('UPDATE "timelines" SET "name"=1')).toBe(
            "timelines",
        );
        expect(
            historyStatementTable('DELETE FROM "timeline_shapes" WHERE'),
        ).toBe("timeline_shapes");
        expect(historyStatementTable("nothing")).toBeUndefined();
    });
    plainIt("follows timelines, timeline_shapes and marchers", () => {
        expect(touchesTimelineDisplayTables(["pages", "timelines"])).toBe(true);
        expect(touchesTimelineDisplayTables(["timeline_shapes"])).toBe(true);
        expect(touchesTimelineDisplayTables(["marchers"])).toBe(true);
        expect(
            touchesTimelineDisplayTables(["pages", "timeline_transitions"]),
        ).toBe(false);
    });
});
