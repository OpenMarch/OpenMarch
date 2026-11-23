// @vitest-environment node
import * as fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { DrizzleMigrationService } from "../DrizzleMigrationService";
import { getOrm } from "../../db";
import { applyFileVersionDecision } from "../../fileVersion";

const migrationsFolder = path.resolve(__dirname, "../../migrations");

describe("DrizzleMigrationService", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("falls back from dist-electron migrations path when checking pending migrations", () => {
        const migrator = new DrizzleMigrationService({} as any, {} as any);
        vi.spyOn(migrator, "getAppliedMigrations").mockReturnValue([]);

        const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "openmarch-"));
        const providedPath = path.join(
            rootPath,
            "dist-electron",
            "main",
            "electron",
            "database",
            "migrations",
        );
        const fallbackPath = path.join(
            rootPath,
            "electron",
            "database",
            "migrations",
        );
        fs.mkdirSync(fallbackPath, { recursive: true });
        fs.writeFileSync(
            path.join(fallbackPath, "0000_initial.sql"),
            "-- test",
        );

        try {
            expect(migrator.hasPendingMigrations(providedPath)).toBe(true);
        } finally {
            fs.rmSync(rootPath, { recursive: true, force: true });
        }
    });

    it("returns false when no migrations folder can be resolved", () => {
        const migrator = new DrizzleMigrationService({} as any, {} as any);
        vi.spyOn(migrator, "getAppliedMigrations").mockReturnValue([]);

        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        expect(
            migrator.hasPendingMigrations(
                "/tmp/openmarch/dist-electron/main/electron/database/migrations",
            ),
        ).toBe(false);
        expect(warnSpy).toHaveBeenCalledOnce();
    });

    it("rebuilds the triggers on open without committing one statement at a time", async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openmarch-"));
        const db = new DatabaseSync(path.join(dir, "show.dots"));
        try {
            applyFileVersionDecision(db, true);
            const orm = getOrm(db);
            await new DrizzleMigrationService(orm, db).applyPendingMigrations(
                migrationsFolder,
            );
            await DrizzleMigrationService.initializeDatabase(orm, db);

            // Reopen, nothing pending: each schema statement run outside a transaction is a
            // commit of its own, which syncs the file (about 100 of them took 12-15 s per open
            // on a spinning disk or a Windows VM).
            const exec = db.exec.bind(db);
            const outsideTransaction: string[] = [];
            let schemaStatements = 0;
            vi.spyOn(db, "exec").mockImplementation((sql: string) => {
                if (/^\s*(CREATE|DROP)\s+(TRIGGER|VIEW)\b/i.test(sql)) {
                    schemaStatements++;
                    if (!db.isTransaction)
                        outsideTransaction.push(sql.slice(0, 60));
                }
                return exec(sql);
            });
            await new DrizzleMigrationService(orm, db).applyPendingMigrations(
                migrationsFolder,
            );

            expect(schemaStatements).toBeGreaterThan(50);
            expect(outsideTransaction).toEqual([]);
        } finally {
            db.close();
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});
