/**
 * Leftover-journal recovery while a sync app holds files in the show's folder (Windows reports
 * EPERM for a rename or delete then): the error the person sees must be the step that failed,
 * not the clean-up that followed it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import * as os from "os";
import * as path from "path";

const held = vi.hoisted(() => ({ rename: "", rm: "" }));

vi.mock("fs", async (importOriginal) => {
    const real = await importOriginal<typeof import("fs")>();
    const busy = (message: string) =>
        Object.assign(new Error(message), { code: "EPERM" });
    return {
        ...real,
        renameSync: (from: string, to: string) => {
            if (held.rename && to === held.rename) throw busy("rename held");
            real.renameSync(from, to);
        },
        rmSync: (target: string, options?: import("fs").RmOptions) => {
            if (held.rm && String(target).endsWith(held.rm))
                throw busy("delete held");
            real.rmSync(target, options);
        },
    };
});

const fs = await import("fs");
const { journalPathFor } = await import("../../database/leftoverJournal");
const { recoverFromLeftoverJournal, JournalRecoveryError } =
    await import("../leftoverJournalRecovery");

/** A show and a hot journal from a save that stopped halfway. */
function tornShow(filePath: string) {
    const db = new DatabaseSync(filePath);
    db.exec("CREATE TABLE t (x TEXT)");
    const insert = db.prepare("INSERT INTO t VALUES (?)");
    for (let i = 0; i < 500; i++) insert.run("x".repeat(200));
    db.exec("PRAGMA cache_size = 1");
    db.exec("BEGIN");
    db.exec("UPDATE t SET x = x || 'y'");
    const torn = `${filePath}.torn`;
    fs.copyFileSync(filePath, torn);
    fs.copyFileSync(journalPathFor(filePath), journalPathFor(torn));
    db.exec("ROLLBACK");
    db.close();
    fs.renameSync(torn, filePath);
    fs.renameSync(journalPathFor(torn), journalPathFor(filePath));
}

describe("recoverFromLeftoverJournal with files held by another program", () => {
    let tempDir: string;
    let showPath: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "openmarch-busy-"));
        showPath = path.join(tempDir, "show", "Show.dots");
        fs.mkdirSync(path.dirname(showPath));
        tornShow(showPath);
    });

    afterEach(() => {
        held.rename = "";
        held.rm = "";
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("reports the failed replace, not the failed delete of its staged copy", () => {
        held.rename = showPath;
        held.rm = ".recovering";

        let error: unknown;
        try {
            recoverFromLeftoverJournal(showPath, path.join(tempDir, "b"), {
                tempDir,
            });
        } catch (e) {
            error = e;
        }

        expect(error).toBeInstanceOf(JournalRecoveryError);
        expect((error as InstanceType<typeof JournalRecoveryError>).step).toBe(
            "replace",
        );
        expect(String(error)).toContain("rename held");
    });
});
