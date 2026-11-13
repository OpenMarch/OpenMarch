/**
 * The show copy sent with a bug report (fork #801) must not carry names,
 * notes, history or (by default) music. The strongest check is the raw file:
 * no original name or note may appear anywhere in its bytes.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { writeReportCopy } from "../reportCopy";
import { AUDIO, SECRETS, makeShowWithSecrets } from "./reportCopyFixture";

let dir: string;
let showPath: string;
let copyPath: string;

const makeShow = () => makeShowWithSecrets(showPath);

function read<T>(sql: string): T[] {
    const db = new DatabaseSync(copyPath, { readOnly: true });
    try {
        return db.prepare(sql).all() as T[];
    } finally {
        db.close();
    }
}

beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "report-copy-"));
    showPath = path.join(dir, "show.dots");
    copyPath = path.join(dir, "report.dots");
    await makeShow();
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("writeReportCopy", () => {
    it("replaces names and clears notes, history and the change log", () => {
        writeReportCopy(showPath, copyPath, { includeAudio: false });

        expect(
            read<{ name: string | null; notes: string | null }>(
                "SELECT name, notes FROM marchers ORDER BY id",
            ),
        ).toEqual([
            { name: "Performer 1", notes: null },
            { name: "Performer 2", notes: null },
            { name: null, notes: null },
        ]);
        expect(
            read<{ n: number }>(
                "SELECT count(*) AS n FROM pages WHERE notes IS NOT NULL",
            )[0].n,
        ).toBe(0);
        for (const table of [
            "history_undo",
            "history_redo",
            "timeline_change_log",
        ])
            expect(
                read<{ n: number }>(`SELECT count(*) AS n FROM ${table}`)[0].n,
            ).toBe(0);
    });

    it("clears every notes, description and nickname column, in any table", () => {
        writeReportCopy(showPath, copyPath, { includeAudio: true });
        const tables = read<{ name: string }>(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
        );
        for (const { name: table } of tables)
            for (const { name: column } of read<{ name: string }>(
                `SELECT name FROM pragma_table_info('${table}')`,
            ))
                if (["notes", "description", "nickname"].includes(column))
                    expect(
                        read<{ n: number }>(
                            `SELECT count(*) AS n FROM "${table}" WHERE "${column}" IS NOT NULL`,
                        )[0].n,
                        `${table}.${column}`,
                    ).toBe(0);
        expect(read<{ name: string }>("SELECT name FROM tags")).toEqual([
            { name: "Tag 1" },
        ]);
        expect(read<{ name: string }>("SELECT name FROM cues")).toEqual([
            { name: "cues 1" },
        ]);
    });

    it("leaves no original name, note or path anywhere in the file", () => {
        writeReportCopy(showPath, copyPath, { includeAudio: false });
        const bytes = fs.readFileSync(copyPath).toString("latin1");
        for (const secret of SECRETS) expect(bytes).not.toContain(secret);
    });

    it("drops the music unless asked, and keeps only the audio file's name", () => {
        writeReportCopy(showPath, copyPath, { includeAudio: false });
        expect(
            read<{ path: string; data: Uint8Array | null }>(
                "SELECT path, data FROM audio_files",
            ),
        ).toEqual([{ path: "opener.mp3", data: null }]);

        writeReportCopy(showPath, copyPath, { includeAudio: true });
        const [row] = read<{ path: string; data: Uint8Array }>(
            "SELECT path, data FROM audio_files",
        );
        expect(row.path).toBe("opener.mp3");
        expect(Uint8Array.from(row.data)).toEqual(AUDIO);
    });

    it("puts every trigger back as it was", () => {
        const triggerSql = (file: string) => {
            const db = new DatabaseSync(file, { readOnly: true });
            try {
                return db
                    .prepare(
                        "SELECT name, sql FROM sqlite_master WHERE type = 'trigger' ORDER BY name",
                    )
                    .all();
            } finally {
                db.close();
            }
        };
        writeReportCopy(showPath, copyPath, { includeAudio: false });
        expect(triggerSql(copyPath).length).toBeGreaterThan(0);
        expect(triggerSql(copyPath)).toEqual(triggerSql(showPath));
    });

    it("never changes the open show", () => {
        writeReportCopy(showPath, copyPath, { includeAudio: false });
        const db = new DatabaseSync(showPath, { readOnly: true });
        try {
            const names = db
                .prepare("SELECT name FROM marchers ORDER BY id")
                .all()
                .map((r) => (r as { name: string | null }).name);
            expect(names).toEqual(["Jordan Quill", "Avery Morrison", null]);
        } finally {
            db.close();
        }
    });
});
