import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";
import { getOrm } from "../../db";
import { DrizzleMigrationService } from "../../services/DrizzleMigrationService";
import {
    PAGE_MODEL_USER_VERSION,
    TIMELINE_MODEL_USER_VERSION,
} from "../../fileVersion";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, "..");

type Journal = { entries: { idx: number; tag: string; when: number }[] };
const journal: Journal = JSON.parse(
    fs.readFileSync(path.join(migrationsDir, "meta/_journal.json"), "utf-8"),
);
const entries = [...journal.entries].sort((a, b) => a.idx - b.idx);

const LIBRARY_MIGRATION = entries[21]!;

const HASH = "a".repeat(64);
const ITEM = "11111111-1111-4111-8111-111111111111";

/**
 * Migration 0021 adds the show's Library (ADR 0002 D-12, package C1.11): `library_blobs` and
 * `library_items`. It only adds tables, so a file's version is unchanged. It comes after
 * `0020_drop_page_era`, so a timeline file takes it on open and a page-model file takes it in its
 * conversion.
 */
describe(`Migration ${LIBRARY_MIGRATION.tag}`, () => {
    let db: DatabaseSync;
    let tempDir: string;
    const tableNames = () =>
        (
            db
                .prepare(
                    "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name",
                )
                .all() as { name: string }[]
        ).map((r) => r.name);
    const userVersion = () =>
        (db.prepare("PRAGMA user_version").get() as { user_version: number })
            .user_version;
    const migrator = () => new DrizzleMigrationService(getOrm(db), db);

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "om-0021-"));
        db = new DatabaseSync(path.join(tempDir, "file.dots"));
    });

    afterEach(() => {
        db?.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    /** Migrates a file through 0020, the last migration before the Library. */
    const migrateToBefore = async () => {
        const before = fs.mkdtempSync(path.join(os.tmpdir(), "om-0021-pre-"));
        try {
            for (const file of fs.readdirSync(migrationsDir)) {
                if (file.endsWith(".sql") && !file.startsWith("0021_"))
                    fs.copyFileSync(
                        path.join(migrationsDir, file),
                        path.join(before, file),
                    );
            }
            fs.mkdirSync(path.join(before, "meta"));
            fs.writeFileSync(
                path.join(before, "meta/_journal.json"),
                JSON.stringify({
                    ...journal,
                    entries: entries.slice(0, 21),
                }),
            );
            await migrator().applyPendingMigrations(before);
        } finally {
            fs.rmSync(before, { recursive: true, force: true });
        }
    };

    it("leaves the Library out of a page-model file until it converts", async () => {
        db.prepare(`PRAGMA user_version = ${PAGE_MODEL_USER_VERSION}`).run();

        await migrator().applyPendingMigrations(migrationsDir);

        expect(tableNames()).not.toContain("library_blobs");
        expect(tableNames()).not.toContain("library_items");
        expect(userVersion()).toBe(PAGE_MODEL_USER_VERSION);
    });

    it("adds the Library tables to a converted file and keeps its timelines", async () => {
        db.prepare(
            `PRAGMA user_version = ${TIMELINE_MODEL_USER_VERSION}`,
        ).run();
        await migrateToBefore();
        db.prepare(
            "INSERT INTO timelines (id, name, start_beat, end_beat) VALUES (1, 'Opener', 0, 32)",
        ).run();

        await migrator().applyPendingMigrations(migrationsDir);

        expect(tableNames()).toEqual(
            expect.arrayContaining(["library_blobs", "library_items"]),
        );
        expect(db.prepare("SELECT name FROM timelines").all()).toEqual([
            { name: "Opener" },
        ]);
        expect(userVersion()).toBe(TIMELINE_MODEL_USER_VERSION);
    });

    describe("constraints", () => {
        beforeEach(async () => {
            db.prepare(
                `PRAGMA user_version = ${TIMELINE_MODEL_USER_VERSION}`,
            ).run();
            await migrator().applyPendingMigrations(migrationsDir);
        });

        const insertItem = (values: Record<string, unknown>) =>
            db
                .prepare(
                    "INSERT INTO library_items (item_id, version_hash, kind, name, built_in, parts, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)",
                )
                .run(
                    ...([
                        values.item_id ?? ITEM,
                        values.version_hash ?? HASH,
                        values.kind ?? "model",
                        "Rifle",
                        values.built_in ?? 0,
                        "{}",
                        "{}",
                    ] as (string | number)[]),
                );

        it("keys an item by item id and Version", () => {
            insertItem({});
            insertItem({ version_hash: "b".repeat(64) });
            expect(() => insertItem({})).toThrow(/UNIQUE/);
        });

        it("refuses an unknown kind, a bad built-in flag or a short hash", () => {
            expect(() => insertItem({ kind: "prop" })).toThrow(/CHECK/);
            expect(() => insertItem({ built_in: 2 })).toThrow(/CHECK/);
            expect(() => insertItem({ version_hash: "abc" })).toThrow(/CHECK/);
        });

        it("refuses a blob with a short hash or no bytes", () => {
            const insertBlob = db.prepare(
                "INSERT INTO library_blobs (hash, data) VALUES (?, ?)",
            );
            insertBlob.run(HASH, new Uint8Array([1]));
            expect(() => insertBlob.run("abc", new Uint8Array([1]))).toThrow(
                /CHECK/,
            );
            expect(() => insertBlob.run("b".repeat(64), "text")).toThrow(
                /CHECK/,
            );
            expect(() => insertBlob.run(HASH, new Uint8Array([2]))).toThrow(
                /UNIQUE/,
            );
        });
    });
});
