// @vitest-environment node
import { createHash as nodeCreateHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createHash } from "../crypto";

const MIGRATIONS = path.join(
    __dirname,
    "../../../electron/database/migrations",
);

describe("the worker's createHash", () => {
    it("hashes every migration as Node does, so web and desktop migrate alike", () => {
        const files = readdirSync(MIGRATIONS).filter((file) =>
            file.endsWith(".sql"),
        );
        expect(files.length).toBeGreaterThan(0);
        for (const file of files) {
            const sql = readFileSync(path.join(MIGRATIONS, file), "utf8");
            expect(createHash("sha256").update(sql).digest("hex")).toBe(
                nodeCreateHash("sha256").update(sql).digest("hex"),
            );
        }
    });

    it("joins updates as one message", () => {
        expect(
            createHash("sha256").update("ab").update("c").digest("hex"),
        ).toBe(nodeCreateHash("sha256").update("abc").digest("hex"));
    });
});
