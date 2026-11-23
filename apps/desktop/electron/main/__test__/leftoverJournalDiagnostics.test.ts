/** What the error report says about a leftover journal (`leftoverJournalDiagnostics.ts`). */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describeLeftoverJournal } from "../leftoverJournalDiagnostics";

/** Permissions don't stop root, so the read-only case can't happen there. */
const isRoot = process.getuid?.() === 0;

describe("describeLeftoverJournal", () => {
    let dir: string;
    let show: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(
            path.join(os.tmpdir(), "openmarch-journal-facts-"),
        );
        show = path.join(dir, "Dropbox", "Halftime.dots");
        fs.mkdirSync(path.dirname(show));
        fs.writeFileSync(show, Buffer.alloc(4096));
        fs.writeFileSync(`${show}-journal`, Buffer.alloc(512));
        const t = new Date("2026-11-01T12:00:00Z");
        fs.utimesSync(show, t, t);
        const later = new Date("2026-11-01T12:00:05Z");
        fs.utimesSync(`${show}-journal`, later, later);
    });

    afterEach(() => {
        if (fs.existsSync(`${show}-journal`))
            fs.chmodSync(`${show}-journal`, 0o644);
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it.skipIf(isRoot)(
        "tells a read-only journal from a locked one, without paths",
        () => {
            fs.chmodSync(`${show}-journal`, 0o444);

            const facts = describeLeftoverJournal(
                show,
                new Date("2026-11-01T12:01:05Z").getTime(),
            );

            expect(facts).toMatchObject({
                syncService: "Dropbox",
                showBytes: 4096,
                journalBytes: 512,
                journalMode: "444",
                journalAfterShowSeconds: 5,
                journalAgeSeconds: 60,
                journalOpenForRead: "ok",
                journalOpenForWrite: "EACCES",
                folderWritable: true,
            });
            expect(JSON.stringify(facts)).not.toContain("Halftime");
            expect(JSON.stringify(facts)).not.toContain(dir);
        },
    );

    it("copes with a journal that's gone", () => {
        fs.rmSync(`${show}-journal`);
        const facts = describeLeftoverJournal(show);
        expect(facts.journalBytes).toBe(null);
        expect(facts.journalOpenForRead).toBe("ENOENT");
    });
});
