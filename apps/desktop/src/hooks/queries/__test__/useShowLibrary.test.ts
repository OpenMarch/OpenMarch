// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getTableName } from "drizzle-orm";
import { schema } from "@/global/database/db";
import { showLibraryKeys } from "../useShowLibrary";

describe("useShowLibrary", () => {
    it("uses the table name as the key base", () => {
        expect(showLibraryKeys.all()).toEqual([
            getTableName(schema.library_items),
        ]);
        expect(showLibraryKeys.items()[0]).toBe("library_items");
    });
});
