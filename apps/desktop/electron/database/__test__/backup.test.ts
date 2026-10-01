import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
} from "vitest";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
    backupBeforeConversion,
    BACKUP_NAME_SUFFIX,
    nextBackupPath,
} from "../backup";
import { getOrm } from "../db";
import { DrizzleMigrationService } from "../services/DrizzleMigrationService";
import { applyFileVersionDecision, readUserVersion } from "../fileVersion";

const migrationsFolder = path.resolve(__dirname, "../migrations");

const sha256 = (p: string) =>
    createHash("sha256").update(fs.readFileSync(p)).digest("hex");

/** A real migrated, initialized show file with a few rows in it. */
async function createShowFile(filePath: string) {
    const db = new DatabaseSync(filePath);
    try {
        applyFileVersionDecision(db, true);
        const orm = getOrm(db);
        await new DrizzleMigrationService(orm, db).applyPendingMigrations(
            migrationsFolder,
        );
        await DrizzleMigrationService.initializeDatabase(orm, db);
        db.prepare(
            "INSERT INTO marchers (name, section, drill_prefix, drill_order) VALUES ('Ada', 'Brass', 'B', 1), ('Bo', 'Brass', 'B', 2)",
        ).run();
    } finally {
        db.close();
    }
}

/**
 * Setup hooks get more than the default 10 s: under a heavily loaded full-suite
 * run, building the template show (all migrations) once took longer.
 */
const HOOK_TIMEOUT_MS = 60_000;

/** Restores write access and removes `dir`; a no-op when setup never created it. */
function cleanUpDir(dir: string | undefined) {
    if (!dir || !fs.existsSync(dir)) return;
    try {
        fs.chmodSync(dir, 0o755);
    } catch {
        // best effort; rmSync below reports anything that matters
    }
    fs.rmSync(dir, { recursive: true, force: true });
}

const tableCounts = (filePath: string) => {
    const db = new DatabaseSync(filePath, { readOnly: true });
    try {
        const names = (
            db
                .prepare(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
                )
                .all() as { name: string }[]
        ).map((r) => r.name);
        return Object.fromEntries(
            names.map((n) => [
                n,
                (
                    db.prepare(`SELECT COUNT(*) AS c FROM "${n}"`).get() as {
                        c: number;
                    }
                ).c,
            ]),
        );
    } finally {
        db.close();
    }
};

describe("backupBeforeConversion", () => {
    let templateDir: string | undefined;
    let templatePath: string;
    // Unset until beforeEach runs; afterEach must cope with a failed setup.
    let dir: string;
    let showPath: string;

    // Migrating a show is the slow part; do it once and copy the file for each test.
    beforeAll(async () => {
        templateDir = fs.mkdtempSync(
            path.join(os.tmpdir(), "openmarch-backup-template-"),
        );
        templatePath = path.join(templateDir, "template.dots");
        await createShowFile(templatePath);
    }, HOOK_TIMEOUT_MS);

    afterAll(() => cleanUpDir(templateDir));

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "openmarch-backup-"));
        showPath = path.join(dir, "My Show.dots");
        fs.copyFileSync(templatePath, showPath);
    }, HOOK_TIMEOUT_MS);

    afterEach(() => {
        cleanUpDir(dir as string | undefined);
    });

    it("writes a copy next to the original that opens and matches its tables", () => {
        const result = backupBeforeConversion(showPath);
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        expect(result.backupPath).toBe(
            path.join(dir, `My Show (${BACKUP_NAME_SUFFIX}).dots`),
        );
        expect(result.userVersion).toBe(7);

        const backup = new DatabaseSync(result.backupPath, { readOnly: true });
        try {
            expect(readUserVersion(backup)).toBe(7);
            expect(
                backup.prepare("SELECT name FROM marchers ORDER BY name").all(),
            ).toEqual([{ name: "Ada" }, { name: "Bo" }]);
        } finally {
            backup.close();
        }
        expect(tableCounts(result.backupPath)).toEqual(tableCounts(showPath));
    });

    it("leaves the original untouched and creates no stray files", () => {
        const hash = sha256(showPath);
        const mtime = fs.statSync(showPath).mtimeMs;

        const result = backupBeforeConversion(showPath);

        expect(result.ok).toBe(true);
        expect(sha256(showPath)).toBe(hash);
        expect(fs.statSync(showPath).mtimeMs).toBe(mtime);
        expect(fs.readdirSync(dir).sort()).toEqual([
            `My Show (${BACKUP_NAME_SUFFIX}).dots`,
            "My Show.dots",
        ]);
    });

    it("numbers the name when a backup already exists and never overwrites", () => {
        const first = backupBeforeConversion(showPath);
        const firstHash = first.ok ? sha256(first.backupPath) : "";
        const second = backupBeforeConversion(showPath);
        const third = backupBeforeConversion(showPath);

        expect(second.ok && path.basename(second.backupPath)).toBe(
            `My Show (${BACKUP_NAME_SUFFIX} 2).dots`,
        );
        expect(third.ok && path.basename(third.backupPath)).toBe(
            `My Show (${BACKUP_NAME_SUFFIX} 3).dots`,
        );
        expect(first.ok && sha256(first.backupPath)).toBe(firstHash);
    });

    it("skips a name taken by an unrelated file without touching it", () => {
        const taken = path.join(dir, `My Show (${BACKUP_NAME_SUFFIX}).dots`);
        fs.writeFileSync(taken, "not a database");

        const result = backupBeforeConversion(showPath);

        expect(result.ok && path.basename(result.backupPath)).toBe(
            `My Show (${BACKUP_NAME_SUFFIX} 2).dots`,
        );
        expect(fs.readFileSync(taken, "utf8")).toBe("not a database");
    });

    it("nextBackupPath keeps the extension and picks the first free name", () => {
        const names = new Set([
            "/x/a (before timeline conversion).dots",
            "/x/a (before timeline conversion 2).dots",
        ]);
        expect(nextBackupPath("/x/a.dots", (p) => names.has(p))).toBe(
            "/x/a (before timeline conversion 3).dots",
        );
    });

    it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
        "fails clearly in a read-only folder and writes nothing",
        () => {
            const hash = sha256(showPath);
            fs.chmodSync(dir, 0o555);

            const result = backupBeforeConversion(showPath);

            expect(result.ok).toBe(false);
            if (result.ok) return;
            expect(result.code).toBe("directory-not-writable");
            expect(result.message).toContain("Your file was not changed");
            expect(fs.readdirSync(dir)).toEqual(["My Show.dots"]);
            expect(sha256(showPath)).toBe(hash);
        },
    );

    it("fails when the file doesn't exist", () => {
        const result = backupBeforeConversion(path.join(dir, "nope.dots"));
        expect(result).toMatchObject({ ok: false, code: "source-missing" });
    });

    it("fails when the file isn't a database, leaving nothing behind", () => {
        const junk = path.join(dir, "junk.dots");
        fs.writeFileSync(junk, "this is not sqlite ".repeat(100));

        const result = backupBeforeConversion(junk);

        expect(result).toMatchObject({ ok: false, code: "source-unreadable" });
        expect(fs.readdirSync(dir).sort()).toEqual([
            "My Show.dots",
            "junk.dots",
        ]);
    });

    it("copies a consistent snapshot while a writer holds the file open (WAL)", () => {
        const writer = new DatabaseSync(showPath);
        try {
            writer.exec("PRAGMA journal_mode = WAL");
            writer.exec("BEGIN");
            writer
                .prepare(
                    "INSERT INTO marchers (name, section, drill_prefix, drill_order) VALUES ('Cy', 'Brass', 'B', 3)",
                )
                .run();
            // Uncommitted: must not appear in the backup.
            const result = backupBeforeConversion(showPath);
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            expect(tableCounts(result.backupPath).marchers).toBe(2);
            writer.exec("COMMIT");
        } finally {
            writer.close();
        }
    });

    it("does not loop forever on a dangling symlink at the backup name", () => {
        const taken = path.join(dir, `My Show (${BACKUP_NAME_SUFFIX}).dots`);
        fs.symlinkSync(path.join(dir, "does-not-exist"), taken);

        const result = backupBeforeConversion(showPath);

        expect(result.ok && path.basename(result.backupPath)).toBe(
            `My Show (${BACKUP_NAME_SUFFIX} 2).dots`,
        );
        expect(fs.lstatSync(taken).isSymbolicLink()).toBe(true);
        expect(fs.existsSync(path.join(dir, "does-not-exist"))).toBe(false);
    });

    it("nextBackupPath treats a dangling symlink as taken and gives up after 100 names", () => {
        const taken = path.join(dir, `My Show (${BACKUP_NAME_SUFFIX}).dots`);
        fs.symlinkSync(path.join(dir, "nowhere"), taken);
        expect(path.basename(nextBackupPath(showPath))).toBe(
            `My Show (${BACKUP_NAME_SUFFIX} 2).dots`,
        );
        expect(() => nextBackupPath(showPath, () => true)).toThrow(RangeError);
    });

    it("retakes the snapshot when another connection commits during it", () => {
        const other = new DatabaseSync(showPath);
        try {
            const attempts: number[] = [];
            const result = backupBeforeConversion(showPath, {
                afterSnapshot: (attempt) => {
                    attempts.push(attempt);
                    if (attempt === 1) {
                        other
                            .prepare(
                                "INSERT INTO marchers (name, section, drill_prefix, drill_order) VALUES ('Cy', 'Brass', 'B', 3)",
                            )
                            .run();
                    }
                },
            });
            expect(result.ok).toBe(true);
            expect(attempts).toEqual([1, 2]);
            if (!result.ok) return;
            expect(tableCounts(result.backupPath).marchers).toBe(3);
        } finally {
            other.close();
        }
    });

    it("doesn't fail a good backup when another connection commits after the snapshot", () => {
        const other = new DatabaseSync(showPath);
        try {
            const result = backupBeforeConversion(showPath, {
                beforeVerify: () => {
                    other
                        .prepare(
                            "INSERT INTO marchers (name, section, drill_prefix, drill_order) VALUES ('Cy', 'Brass', 'B', 3)",
                        )
                        .run();
                    other.exec("PRAGMA user_version = 8");
                },
            });
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            // The backup is the snapshot from before the commit.
            expect(tableCounts(result.backupPath).marchers).toBe(2);
            expect(result.userVersion).toBe(7);
        } finally {
            other.close();
        }
    });

    it(
        "reports a locked file as file-busy and writes nothing",
        { timeout: 20000 },
        () => {
            const locker = new DatabaseSync(showPath);
            try {
                locker.exec("BEGIN EXCLUSIVE");
                const result = backupBeforeConversion(showPath);
                expect(result).toMatchObject({ ok: false, code: "file-busy" });
                expect(fs.readdirSync(dir)).toEqual(["My Show.dots"]);
            } finally {
                locker.exec("ROLLBACK");
                locker.close();
            }
        },
    );

    describe("a folder whose name looks like an error", () => {
        let oddDir: string | undefined;
        let oddShow: string;
        beforeEach(() => {
            oddDir = path.join(dir, "Full Band Permission denied");
            fs.mkdirSync(oddDir);
            oddShow = path.join(oddDir, "show.dots");
            fs.copyFileSync(showPath, oddShow);
        });
        afterEach(() => {
            if (oddDir && fs.existsSync(oddDir)) fs.chmodSync(oddDir, 0o755);
            oddDir = undefined;
        });

        it("still backs up", () => {
            expect(backupBeforeConversion(oddShow).ok).toBe(true);
        });

        it("reports a bad file as source-unreadable, not disk-full", () => {
            const junk = path.join(oddDir, "junk.dots");
            fs.writeFileSync(junk, "this is not sqlite ".repeat(100));
            expect(backupBeforeConversion(junk)).toMatchObject({
                ok: false,
                code: "source-unreadable",
            });
        });

        it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
            "reports a read-only folder as directory-not-writable, not disk-full",
            () => {
                fs.chmodSync(oddDir, 0o555);
                expect(backupBeforeConversion(oddShow)).toMatchObject({
                    ok: false,
                    code: "directory-not-writable",
                });
            },
        );
    });

    it("keeps the backup name within 255 bytes for a 250-character name", () => {
        const longPath = path.join(dir, `${"a".repeat(250)}.dots`);
        fs.copyFileSync(showPath, longPath);

        const result = backupBeforeConversion(longPath);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const name = path.basename(result.backupPath);
        expect(Buffer.byteLength(name)).toBeLessThanOrEqual(255);
        expect(name.endsWith(` (${BACKUP_NAME_SUFFIX}).dots`)).toBe(true);
        expect(tableCounts(result.backupPath)).toEqual(tableCounts(showPath));
    });

    it("cuts a unicode name on a character boundary", () => {
        const base = "日".repeat(80); // 240 bytes
        const uniPath = path.join(dir, `${base}.dots`);
        fs.copyFileSync(showPath, uniPath);

        const first = backupBeforeConversion(uniPath);
        const second = backupBeforeConversion(uniPath);

        for (const r of [first, second]) {
            expect(r.ok).toBe(true);
            if (!r.ok) continue;
            const name = path.basename(r.backupPath);
            expect(Buffer.byteLength(name)).toBeLessThanOrEqual(255);
            expect(name).not.toContain("\uFFFD");
            expect(name.startsWith("日")).toBe(true);
        }
        expect(first.ok && second.ok && first.backupPath).not.toBe(
            second.ok && second.backupPath,
        );
    });

    it("sweeps old orphaned temp files but leaves recent and unrelated ones", () => {
        const old = path.join(dir, ".openmarch-backup-aaaaaaaaaaaa.tmp");
        const recent = path.join(dir, ".openmarch-backup-bbbbbbbbbbbb.tmp");
        const other = path.join(dir, ".something-else.tmp");
        for (const f of [old, recent, other]) fs.writeFileSync(f, "x");
        const longAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
        fs.utimesSync(old, longAgo, longAgo);

        expect(backupBeforeConversion(showPath).ok).toBe(true);

        expect(fs.existsSync(old)).toBe(false);
        expect(fs.existsSync(recent)).toBe(true);
        expect(fs.existsSync(other)).toBe(true);
    });

    it("includes committed rows that exist only in the WAL", () => {
        const writer = new DatabaseSync(showPath);
        try {
            writer.exec("PRAGMA journal_mode = WAL");
            writer
                .prepare(
                    "INSERT INTO marchers (name, section, drill_prefix, drill_order) VALUES ('Cy', 'Brass', 'B', 3)",
                )
                .run();
            // The writer stays open, so the row is still only in the -wal file.
            expect(fs.statSync(`${showPath}-wal`).size).toBeGreaterThan(0);

            const result = backupBeforeConversion(showPath);

            expect(result.ok).toBe(true);
            if (!result.ok) return;
            expect(tableCounts(result.backupPath).marchers).toBe(3);
            // The backup is a standalone file: no side files of its own.
            expect(fs.existsSync(`${result.backupPath}-wal`)).toBe(false);
        } finally {
            writer.close();
        }
    });
});
