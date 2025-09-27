import { expect } from "vitest";
import { describeDbTests, schema } from "@/test/base";
import { eq } from "drizzle-orm";

describeDbTests("Database connection", (it) => {
    it("Database should be defined", async ({ db }) => {
        expect(db).toBeDefined();
    });

    it("Database should be able to run a query", async ({ db }) => {
        const result = await db.select().from(schema.marchers);
        expect(result).toBeDefined();
        expect(result.length).toBe(0);
    });

    it("Database should be able to create and delete a marcher", async ({
        db,
    }) => {
        const preResult = await db.select().from(schema.marchers);
        expect(preResult).toBeDefined();
        expect(preResult.length).toBe(0);

        const result = await db
            .insert(schema.marchers)
            .values({
                section: "Test Section",
                drill_prefix: "B",
                drill_order: 1,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .returning();
        expect(result).toBeDefined();
        expect(result.length).toBe(1);

        const postResult = await db.select().from(schema.marchers);
        expect(postResult).toBeDefined();
        expect(postResult.length).toBe(1);
        expect(postResult[0].id).toBe(result[0].id);
        expect(postResult[0].section).toBe("Test Section");
        expect(postResult[0].drill_prefix).toBe("B");
        expect(postResult[0].drill_order).toBe(1);

        const deleteResult = await db
            .delete(schema.marchers)
            .where(eq(schema.marchers.id, result[0].id))
            .returning();
        expect(deleteResult).toBeDefined();
        expect(deleteResult.length).toBe(1);
        expect(deleteResult[0].id).toBe(result[0].id);

        const postDeleteResult = await db.select().from(schema.marchers);
        expect(postDeleteResult).toBeDefined();
        expect(postDeleteResult.length).toBe(0);
    });

    it("Database should be able to update a marcher", async ({ db }) => {
        const result = await db
            .insert(schema.marchers)
            .values({
                section: "Test Section",
                drill_prefix: "B",
                drill_order: 1,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .returning();
        expect(result).toBeDefined();
        expect(result.length).toBe(1);
        expect(result[0].id).toBeDefined();

        const postResult = await db.select().from(schema.marchers);
        expect(postResult).toBeDefined();
        expect(postResult.length).toBe(1);
        expect(postResult[0].id).toBe(result[0].id);
        expect(postResult[0].section).toBe("Test Section");
        expect(postResult[0].drill_prefix).toBe("B");
        expect(postResult[0].drill_order).toBe(1);

        const updateResult = await db
            .update(schema.marchers)
            .set({
                section: "Updated Section",
                drill_prefix: "C",
                drill_order: 2,
            })
            .where(eq(schema.marchers.id, result[0].id))
            .returning();
        expect(updateResult).toBeDefined();
        expect(updateResult.length).toBe(1);
        expect(updateResult[0].id).toBe(result[0].id);
        expect(updateResult[0].section).toBe("Updated Section");

        const postUpdateResult = await db.select().from(schema.marchers);
        expect(postUpdateResult).toBeDefined();
        expect(postUpdateResult.length).toBe(1);
        expect(postUpdateResult[0].id).toBe(result[0].id);
        expect(postUpdateResult[0].section).toBe("Updated Section");
        expect(postUpdateResult[0].drill_prefix).toBe("C");
        expect(postUpdateResult[0].drill_order).toBe(2);
    });
});
