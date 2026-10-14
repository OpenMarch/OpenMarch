// @vitest-environment node
/**
 * Opening a file, converting it included, loads none of the renderer modules
 * (React, zustand, sonner, the renderer's database proxy): the main process
 * and the convert-on-open worker share the converter, which must stay free of
 * them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const loaded = vi.hoisted(() => new Set<string>());

vi.mock("react", async (importOriginal) => {
    loaded.add("react");
    return importOriginal();
});
vi.mock("zustand", async (importOriginal) => {
    loaded.add("zustand");
    return importOriginal();
});
vi.mock("sonner", async (importOriginal) => {
    loaded.add("sonner");
    return importOriginal();
});
vi.mock("@/global/database/db", async (importOriginal) => {
    loaded.add("@/global/database/db");
    return importOriginal();
});

describe("the main-process open path's imports", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "openmarch-imports-"));
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "debug").mockImplementation(() => {});
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(async () => {
        const services =
            await import("@om-electron/database/database.services");
        services.forceResumeSqlProxy();
        services.closePersistentConnection();
        services.setDbPath("", false);
        fs.rmSync(tempDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    const dialogs = () => ({
        whilePreparing: <T>(work: () => Promise<T>) => work(),
        backupFailed: async () => {},
        conversionFailed: async () => {},
    });

    it("asking, converting and creating a file load no renderer module", async () => {
        const { openShowFile } = await import("../openShow");
        const { createPageShow, migrationsFolder } =
            await import("@om-electron/database/__test__/convertOnOpenFixtures");
        const showPath = path.join(tempDir, "show.dots");
        await createPageShow(showPath, { undoTriggers: false });
        expect([...loaded]).toEqual([]);

        const asked = await openShowFile(showPath, false, {
            migrationsFolder,
            dialogs,
        });
        const converted = await openShowFile(
            showPath,
            false,
            { migrationsFolder, dialogs },
            { conversionConfirmed: true },
        );
        converted.db?.close();
        const newFile = await openShowFile(
            path.join(tempDir, "new.dots"),
            true,
            { migrationsFolder, dialogs },
        );
        newFile.db?.close();

        expect(asked.status).toBe(428);
        expect(converted.status).toBe(200);
        expect(newFile.status).toBe(200);
        expect([...loaded]).toEqual([]);
    });
});
