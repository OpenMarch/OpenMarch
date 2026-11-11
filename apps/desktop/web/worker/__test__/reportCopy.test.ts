// @vitest-environment node
/**
 * The web editor scrubs a bug report's show copy in its worker, on
 * sqlite-wasm (`../sqlite.ts`), with the same steps as the desktop app
 * (`scrubAndCompact`). The copy's bytes must hold none of the show's names
 * or notes, and no music unless asked, and the open show must be untouched.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
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
import { scrubAndCompact } from "@om-electron/database/reportCopy";
import {
    SECRETS,
    makeShowWithSecrets,
} from "@om-electron/database/__test__/reportCopyFixture";

let dir: string;

beforeAll(async () => {
    await loadSqlite();
});

afterEach(() => {
    deleteDatabase("/show.dots");
    deleteDatabase("/report.dots");
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

/** The worker's steps: copy the open show's bytes, scrub the copy, export it */
async function scrubbedOnTheWeb(includeAudio: boolean) {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "web-report-copy-"));
    const showFile = path.join(dir, "show.dots");
    await makeShowWithSecrets(showFile);
    writeDatabase("/show.dots", new Uint8Array(fs.readFileSync(showFile)));
    const before = exportDatabase("/show.dots");

    writeDatabase("/report.dots", exportDatabase("/show.dots"));
    scrubAndCompact(new WebDatabaseSync("/report.dots"), { includeAudio });
    const copy = exportDatabase("/report.dots");

    const copyFile = path.join(dir, "report.dots");
    fs.writeFileSync(copyFile, copy);
    return { before, after: exportDatabase("/show.dots"), copy, copyFile };
}

describe("the web editor's report copy", () => {
    it("holds none of the show's names or notes, and leaves the open show alone", async () => {
        const { before, after, copy, copyFile } = await scrubbedOnTheWeb(false);
        const text = Buffer.from(copy).toString("latin1");
        for (const secret of SECRETS) expect(text).not.toContain(secret);
        expect(Buffer.from(after).equals(Buffer.from(before))).toBe(true);

        const db = new NodeDatabaseSync(copyFile, { readOnly: true });
        try {
            expect(
                db.prepare("SELECT name FROM marchers ORDER BY id").all(),
            ).toEqual([
                { name: "Performer 1" },
                { name: "Performer 2" },
                { name: null },
            ]);
            expect(
                db.prepare("SELECT count(*) AS n FROM history_undo").get(),
            ).toEqual({ n: 0 });
            expect(db.prepare("SELECT data FROM audio_files").get()).toEqual({
                data: null,
            });
        } finally {
            db.close();
        }
    });

    it("keeps the music when asked", async () => {
        const { copyFile } = await scrubbedOnTheWeb(true);
        const db = new NodeDatabaseSync(copyFile, { readOnly: true });
        try {
            const row = db.prepare("SELECT data FROM audio_files").get() as {
                data: Uint8Array | null;
            };
            expect(row.data?.length).toBe(4096);
        } finally {
            db.close();
        }
    });
});
