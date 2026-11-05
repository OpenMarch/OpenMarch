// @vitest-environment node
/**
 * The web editor's worker converts a v0.1.7 show on open on sqlite-wasm (`../sqlite.ts`), not
 * node:sqlite, as `openShowAt` in `../index.ts` does: `convertFileOnOpen` with no backup, then
 * the remaining migrations. This runs that on `field-image.dots` (made by v0.1.7's Import Image,
 * see `electron/database/__test__/v017-files/README.md`) and checks the field image's bytes and
 * the field's JSON come out exactly as v0.1.7 wrote them.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DatabaseSync as NodeDatabaseSync } from "node:sqlite";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
    DatabaseSync as WebDatabaseSync,
    deleteDatabase,
    exportDatabase,
    loadSqlite,
    writeDatabase,
} from "../sqlite";
import { convertFileOnOpen } from "@om-electron/database/convertOnOpen";
import { getOrm } from "@om-electron/database/db";
import { DrizzleMigrationService } from "@om-electron/database/services/DrizzleMigrationService";
import { migrationsFolder } from "@om-electron/database/__test__/convertOnOpenFixtures";

const FIXTURE = path.resolve(
    __dirname,
    "../../../electron/database/__test__/v017-files/field-image.dots",
);
const WEB_PATH = "/field-image.dots";

type FieldRow = { id: number; json_data: string; image: Uint8Array | null };

const fieldRows = (filePath: string) => {
    const db = new NodeDatabaseSync(filePath, { readOnly: true });
    try {
        return (
            db
                .prepare("SELECT id, json_data, image FROM field_properties")
                .all() as FieldRow[]
        ).map((r) => ({ ...r, image: r.image && Buffer.from(r.image) }));
    } finally {
        db.close();
    }
};

beforeAll(async () => {
    await loadSqlite();
});

describe("a v0.1.7 show with a field image, converted in the web worker", () => {
    let dir: string | undefined;

    afterEach(() => {
        deleteDatabase(WEB_PATH);
        if (dir) fs.rmSync(dir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it("keeps the image's bytes and the field's JSON", async () => {
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "debug").mockImplementation(() => {});
        const before = fieldRows(FIXTURE);
        expect(before).toHaveLength(1);
        expect(before[0]!.image?.subarray(1, 4).toString("latin1")).toBe("PNG");

        writeDatabase(WEB_PATH, new Uint8Array(fs.readFileSync(FIXTURE)));
        const shim = new WebDatabaseSync(WEB_PATH);
        const result = await convertFileOnOpen(
            WEB_PATH,
            shim as never,
            migrationsFolder,
            { backupPath: "" },
            {
                backup: () => ({ ok: true, backupPath: "", userVersion: 7 }),
            },
        );
        expect(result.status).toBe("converted");
        await new DrizzleMigrationService(
            getOrm(shim as never),
            shim as never,
        ).applyPendingMigrations(migrationsFolder);
        shim.close();

        dir = fs.mkdtempSync(path.join(os.tmpdir(), "om-web-v017-"));
        const out = path.join(dir, "converted.dots");
        fs.writeFileSync(out, exportDatabase(WEB_PATH));
        const after = new NodeDatabaseSync(out, { readOnly: true });
        try {
            expect(
                (
                    after.prepare("PRAGMA user_version").get() as {
                        user_version: number;
                    }
                ).user_version,
            ).toBe(8);
        } finally {
            after.close();
        }
        expect(fieldRows(out)).toEqual(before);
    });
});
