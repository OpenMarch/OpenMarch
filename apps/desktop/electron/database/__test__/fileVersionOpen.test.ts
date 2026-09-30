/**
 * Opens real `.dots` files at versions 7, 8 and 9 through the same steps as the
 * main process's `setActiveDb` (setDbPath, version decision, migrations), and
 * checks that 7 and 8 open and keep their version while 9 is refused without a
 * single byte of the file changing (ADR 0001 §6).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
    closePersistentConnection,
    connect,
    setDbPath,
} from "../database.services";
import { getOrm } from "../db";
import { DrizzleMigrationService } from "../services/DrizzleMigrationService";
import {
    applyFileVersionDecision,
    FILE_TOO_NEW_STATUS,
    readUserVersion,
} from "../fileVersion";

const migrationsFolder = path.resolve(__dirname, "../migrations");

const sha256 = (filePath: string) =>
    createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");

/** Every file next to `filePath` (catches stray -wal/-journal files). */
const siblings = (filePath: string) =>
    fs.readdirSync(path.dirname(filePath)).sort();

const userVersionOf = (filePath: string) => {
    const db = new DatabaseSync(filePath, { readOnly: true });
    try {
        return readUserVersion(db);
    } finally {
        db.close();
    }
};

/** A migrated, initialized show file, as the app creates one, then set to `version`. */
async function createShowFile(filePath: string, version: number) {
    const db = new DatabaseSync(filePath);
    try {
        applyFileVersionDecision(db, true);
        const orm = getOrm(db);
        await new DrizzleMigrationService(orm, db).applyPendingMigrations(
            migrationsFolder,
        );
        await DrizzleMigrationService.initializeDatabase(orm, db);
        db.prepare(`PRAGMA user_version = ${version}`).run();
    } finally {
        db.close();
    }
}

/** The database steps of `setActiveDb` in `electron/main/index.ts`. */
async function openLikeSetActiveDb(filePath: string, isNewFile = false) {
    const resCode = setDbPath(filePath, isNewFile);
    if (resCode !== 200) return resCode;
    const db = connect();
    try {
        const orm = getOrm(db);
        const migrator = new DrizzleMigrationService(orm, db);
        applyFileVersionDecision(db, isNewFile);
        await migrator.applyPendingMigrations(migrationsFolder);
        if (isNewFile) {
            await DrizzleMigrationService.initializeDatabase(orm, db);
        }
    } finally {
        db.close();
    }
    return resCode;
}

describe("opening files by format version", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "openmarch-version-"));
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "debug").mockImplementation(() => {});
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        closePersistentConnection();
        setDbPath("", false);
        fs.rmSync(tempDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it.each([7, 8])("opens a file at %i and keeps its version", async (v) => {
        const filePath = path.join(tempDir, `show-${v}.dots`);
        await createShowFile(filePath, v);

        expect(await openLikeSetActiveDb(filePath)).toBe(200);
        expect(userVersionOf(filePath)).toBe(v);

        // Opening twice doesn't drift either.
        expect(await openLikeSetActiveDb(filePath)).toBe(200);
        expect(userVersionOf(filePath)).toBe(v);
    });

    it("refuses a file at 9 and leaves its bytes unchanged", async () => {
        const filePath = path.join(tempDir, "show-9.dots");
        await createShowFile(filePath, 9);
        const hashBefore = sha256(filePath);
        const mtimeBefore = fs.statSync(filePath).mtimeMs;
        const filesBefore = siblings(filePath);

        expect(await openLikeSetActiveDb(filePath)).toBe(FILE_TOO_NEW_STATUS);

        expect(sha256(filePath)).toBe(hashBefore);
        expect(fs.statSync(filePath).mtimeMs).toBe(mtimeBefore);
        expect(siblings(filePath)).toEqual(filesBefore);
        expect(userVersionOf(filePath)).toBe(9);
    });

    it("refuses a much newer file too", async () => {
        const filePath = path.join(tempDir, "show-1000.dots");
        await createShowFile(filePath, 1000);
        const hashBefore = sha256(filePath);

        expect(await openLikeSetActiveDb(filePath)).toBe(FILE_TOO_NEW_STATUS);
        expect(sha256(filePath)).toBe(hashBefore);
    });

    it("creates a new file at 7", async () => {
        const filePath = path.join(tempDir, "new.dots");

        expect(await openLikeSetActiveDb(filePath, true)).toBe(200);
        expect(userVersionOf(filePath)).toBe(7);
    });

    describe("migration service", () => {
        it.each([7, 8])(
            "runs migrations on a file at %i without changing its version",
            async (v) => {
                const db = new DatabaseSync(path.join(tempDir, `m-${v}.dots`));
                try {
                    db.prepare(`PRAGMA user_version = ${v}`).run();
                    const migrator = new DrizzleMigrationService(
                        getOrm(db),
                        db,
                    );
                    await migrator.applyPendingMigrations(migrationsFolder);
                    expect(migrator.getAppliedMigrations().length).toBe(
                        fs
                            .readdirSync(migrationsFolder)
                            .filter((f) => f.endsWith(".sql")).length,
                    );
                    expect(readUserVersion(db)).toBe(v);
                } finally {
                    db.close();
                }
            },
        );

        it("refuses a file at 9 with a message to update, without migrating", async () => {
            const db = new DatabaseSync(path.join(tempDir, "m-9.dots"));
            try {
                db.prepare("PRAGMA user_version = 9").run();
                const migrator = new DrizzleMigrationService(getOrm(db), db);
                await expect(
                    migrator.applyPendingMigrations(migrationsFolder),
                ).rejects.toThrow(/newer version of OpenMarch/);
                const tables = db
                    .prepare(
                        "SELECT name FROM sqlite_master WHERE type = 'table'",
                    )
                    .all();
                expect(tables).toEqual([]);
                expect(readUserVersion(db)).toBe(9);
            } finally {
                db.close();
            }
        });

        it("still refuses a pre-0.0.10 file (version 0) as before", async () => {
            const db = new DatabaseSync(path.join(tempDir, "m-0.dots"));
            try {
                const migrator = new DrizzleMigrationService(getOrm(db), db);
                await expect(
                    migrator.applyPendingMigrations(migrationsFolder),
                ).rejects.toThrow(/0\.0\.10/);
                expect(readUserVersion(db)).toBe(0);
            } finally {
                db.close();
            }
        });
    });
});
