// @vitest-environment node
/**
 * The history triggers outside the renderer (P9.8). The convert-on-open
 * conversion drops and recreates them in the main process or its worker,
 * where there is no `window.electron` bridge: they must run on the given
 * connection there, not only under vitest.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { DatabaseSync } from "node:sqlite";
import { getOrm } from "@om-electron/database/db";
import { createBlankShow } from "@om-electron/database/__test__/convertOnOpenFixtures";
import { createAllUndoTriggers, dropAllUndoTriggers } from "../historyTriggers";

const triggerNames = (db: DatabaseSync) =>
    (
        db
            .prepare(
                "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name GLOB '*_[iud]t' ORDER BY name",
            )
            .all() as { name: string }[]
    ).map((t) => t.name);

describe("history triggers without a renderer", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "openmarch-triggers-"));
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "info").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("are created and dropped on the connection when there is no window (outside vitest too)", async () => {
        const filePath = path.join(tempDir, "show.dots");
        await createBlankShow(filePath);
        // As in the app's main process: no VITEST, no window.
        vi.stubEnv("VITEST", "");
        expect(typeof window).toBe("undefined");
        const db = new DatabaseSync(filePath);
        try {
            const orm = getOrm(db) as never;
            await dropAllUndoTriggers(orm);
            expect(triggerNames(db)).toEqual([]);

            await createAllUndoTriggers(orm);
            const names = triggerNames(db);
            expect(names).toContain("marchers_it");
            expect(names).toContain("timeline_assignments_dt");
            expect(names.length % 3).toBe(0);
        } finally {
            db.close();
        }
    });
});
