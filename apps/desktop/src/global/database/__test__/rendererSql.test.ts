import { expect } from "vitest";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { sql } from "drizzle-orm";
import { describeDbTests, schema } from "@/test/base";
import { createRendererSqlCallbacks } from "../rendererSql";

/**
 * The 3D View window's `db`, wired like `db.ts` with the 3D View preload, on the editor's
 * connection: `sqlReadBatch` is main's snapshot batch.
 */
function view3dDb() {
    const { proxy, batch } = createRendererSqlCallbacks(
        () => ({
            kind: "view3d",
            sqlReadBatch: window.electron.sqlReadBatch,
        }),
        { retryMs: 1 },
    );
    return drizzle(proxy, batch, { schema, casing: "snake_case" });
}

describeDbTests("3D View reads (#243)", (it) => {
    it("a single read waits out the editor's open transaction and never sees its rows", async ({
        db,
    }) => {
        const view = view3dDb();
        const countBeats = async () =>
            (await view
                .select({ count: sql<number>`count(*)` })
                .from(schema.beats)
                .get())!.count;
        const before = await countBeats();

        let read: Promise<number> | undefined;
        let settled = false;
        await expect(
            db.transaction(async (tx) => {
                // Uncommitted, and rolled back below
                await tx.insert(schema.beats).values({
                    duration: 0.5,
                    position: 9999,
                });
                read = countBeats();
                void read.finally(() => (settled = true));
                await new Promise((resolve) => setTimeout(resolve, 50));
                expect(settled).toBe(false);
                throw new Error("roll back");
            }),
        ).rejects.toThrow("roll back");

        await expect(read!).resolves.toBe(before);
    });

    it("a single read outside a transaction answers at once", async ({
        db,
    }) => {
        await db.insert(schema.beats).values({ duration: 0.5, position: 9999 });
        const rows = await view3dDb()
            .select({ position: schema.beats.position })
            .from(schema.beats)
            .where(sql`${schema.beats.position} = 9999`)
            .all();
        expect(rows).toEqual([{ position: 9999 }]);
    });
});
