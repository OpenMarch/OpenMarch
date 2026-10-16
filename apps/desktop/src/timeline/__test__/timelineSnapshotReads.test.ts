import { expect } from "vitest";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { sql } from "drizzle-orm";
import { describeDbTests, schema } from "@/test/base";
import type { DbConnection } from "@/db-functions/types";
import { loadTimelineFixture } from "../fixtures/loadTimelineFixture";
import { buildTimelineFixture } from "../fixtures/timelineFixtures";
import type { Resolver } from "@openmarch/core";
import { createSqlReadBatch } from "@/global/database/sqlReadBatch";
import { acquireExportResolver } from "../timelineExport";

type Method = "all" | "run" | "get" | "values";

/**
 * Another window's database (the 3D View's), wired like `db.ts` on the editor's connection.
 * `beforeStatement` runs before each of its statements reaches the connection (each statement of
 * a batch, before the batch), so a test can commit an edit between two of them.
 */
function otherWindowDb(beforeStatement: (sql: string) => Promise<void>) {
    return drizzle(
        async (sql: string, params: any[], method: Method) => {
            await beforeStatement(sql);
            return window.electron.sqlProxy(sql, params, method);
        },
        createSqlReadBatch(async (queries) => {
            for (const query of queries) await beforeStatement(query.sql);
            return window.electron.sqlReadBatch(queries);
        }),
        { schema, casing: "snake_case" },
    ) as unknown as DbConnection;
}

/**
 * An edit like the editor's: in one transaction, the transition is replaced by a copy with a new
 * id, and every assignment moves to the copy.
 */
async function replaceTransition(db: DbConnection, id: number) {
    await db.transaction(async (tx) => {
        const cols =
            "timeline_id, dest_shape_id, path_style, path_params, order_mode, slot_count, start_beat, end_beat";
        await tx.run(
            sql.raw(
                `INSERT INTO timeline_transitions (${cols}) SELECT ${cols} FROM timeline_transitions WHERE id = ${id}`,
            ),
        );
        const copy = (await tx
            .select({ id: sql<number>`max(id)` })
            .from(schema.timeline_transitions)
            .get())!.id;
        await tx.run(
            sql`INSERT INTO timeline_slot_destinations (transition_id, slot_index, x, y) SELECT ${copy}, slot_index, x, y FROM timeline_slot_destinations WHERE transition_id = ${id}`,
        );
        await tx.run(
            sql`UPDATE timeline_assignments SET transition_id = ${copy} WHERE transition_id = ${id}`,
        );
        await tx.run(
            sql`DELETE FROM timeline_slot_destinations WHERE transition_id = ${id}`,
        );
        await tx.run(sql`DELETE FROM timeline_transitions WHERE id = ${id}`);
    });
}

describeDbTests("timeline snapshot reads (#224)", (it) => {
    it("an edit committed between another window's reads doesn't tear its snapshot", async ({
        db,
    }) => {
        const loaded = await loadTimelineFixture(
            db,
            buildTimelineFixture("G8"),
            { beatOffset: 1 },
        );
        const marcher = loaded.marchers.get(1)!;
        const before = await acquireExportResolver(db);
        const expected = [1, 3.5, 6, 9].map((b) =>
            before.positionAt(marcher, b),
        );

        let edited = false;
        const view = otherWindowDb(async (query) => {
            if (edited || !query.includes('"timeline_assignments"')) return;
            edited = true;
            for (const id of loaded.transitions.values())
                await replaceTransition(db, id);
        });

        const resolver = await acquireExportResolver(view);
        expect(edited).toBe(true);
        // One committed state, before or after the edit: the edit moves no one
        expect(
            [1, 3.5, 6, 9].map((b) => resolver.positionAt(marcher, b)),
        ).toEqual(expected);
    });

    it("another window's read waits out the editor's open transaction and never sees it", async ({
        db,
    }) => {
        const loaded = await loadTimelineFixture(
            db,
            buildTimelineFixture("G8"),
            { beatOffset: 1 },
        );
        const marcher = loaded.marchers.get(1)!;
        const before = await acquireExportResolver(db);
        const expected = [1, 3.5, 6, 9].map((b) =>
            before.positionAt(marcher, b),
        );

        const view = otherWindowDb(async () => {});
        let read: Promise<Resolver> | undefined;
        let settled = false;
        await expect(
            db.transaction(async (tx) => {
                // Uncommitted: the marcher loses its move
                await tx.run(sql`DELETE FROM timeline_assignments`);
                read = acquireExportResolver(view);
                void read.finally(() => (settled = true));
                await new Promise((resolve) => setTimeout(resolve, 100));
                expect(settled).toBe(false);
                throw new Error("roll back");
            }),
        ).rejects.toThrow("roll back");

        const resolver = await read!;
        expect(
            [1, 3.5, 6, 9].map((b) => resolver.positionAt(marcher, b)),
        ).toEqual(expected);
    });
});
