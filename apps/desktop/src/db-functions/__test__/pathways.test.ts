import { it } from "@/global/database/__test__/db.fixture";
import { schema } from "@/global/database/db";
import { describe, expect } from "vitest";

describe("pathways", () => {
    it("should be able to get pathways", async ({ db }) => {
        expect(db).toBeDefined();
        const result = await db.select().from(schema.marchers);
        expect(result).toBeDefined();
        expect(result.length).toBe(0);
    });
});
