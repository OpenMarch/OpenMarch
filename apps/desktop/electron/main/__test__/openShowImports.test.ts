// @vitest-environment node
/**
 * With convert on open off (the default), opening a file loads none of the
 * renderer modules the converter needs (P9.3): the main process imports
 * `convertOnOpenFlow` and the converter only once the gate is on. The second
 * test checks the spies do see those modules once the gate is on; since P9.8
 * the converter loads no renderer module either (it also runs in a worker).
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
vi.mock("@om-electron/database/convertOnOpen", async (importOriginal) => {
    loaded.add("convertOnOpen");
    return importOriginal();
});
vi.mock("../convertOnOpenFlow", async (importOriginal) => {
    loaded.add("convertOnOpenFlow");
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
        warnOlderRelease: async () => "stop" as const,
        whilePreparing: <T>(_name: string, work: () => Promise<T>) => work(),
        converted: () => {},
        backupFailed: async () => {},
        conversionFailed: async () => {},
    });

    it("gate off: opening a page-era file loads no renderer module", async () => {
        const { openShowFile } = await import("../openShow");
        const { createPageShow, migrationsFolder } =
            await import("@om-electron/database/__test__/convertOnOpenFixtures");
        const showPath = path.join(tempDir, "show.dots");
        await createPageShow(showPath, { undoTriggers: false });
        expect([...loaded]).toEqual([]);

        const result = await openShowFile(showPath, false, {
            migrationsFolder,
            env: {},
            dialogs,
        });
        result.db?.close();
        const newFile = await openShowFile(
            path.join(tempDir, "new.dots"),
            true,
            { migrationsFolder, env: {}, dialogs },
        );
        newFile.db?.close();

        expect(result.status).toBe(200);
        expect(newFile.status).toBe(200);
        expect([...loaded]).toEqual([]);
    });

    it("gate on: the converter loads (the spies work), and still no renderer module (P9.8)", async () => {
        const { openShowFile } = await import("../openShow");
        const { createPageShow, migrationsFolder, GATE_ON } =
            await import("@om-electron/database/__test__/convertOnOpenFixtures");
        const showPath = path.join(tempDir, "show.dots");
        await createPageShow(showPath, { undoTriggers: false });
        expect([...loaded]).toEqual([]);

        const result = await openShowFile(showPath, false, {
            migrationsFolder,
            env: GATE_ON,
            dialogs,
        });
        result.db?.close();

        expect(result.status).toBe(200);
        expect([...loaded].sort()).toEqual([
            "convertOnOpen",
            "convertOnOpenFlow",
        ]);
    });
});
