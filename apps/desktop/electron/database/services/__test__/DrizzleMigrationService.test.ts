import * as fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DrizzleMigrationService } from "../DrizzleMigrationService";

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
});
