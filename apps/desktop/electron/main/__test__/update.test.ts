import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { automaticUpdatesAreEnabled, startAutomaticUpdates } from "../update";

const { autoUpdater } = vi.hoisted(() => ({
    autoUpdater: {
        autoDownload: false,
        autoInstallOnAppQuit: false,
        checkForUpdates: vi.fn(),
        on: vi.fn(),
    },
}));

vi.mock("electron-updater", () => ({
    autoUpdater,
}));

describe("startAutomaticUpdates", () => {
    beforeEach(() => {
        autoUpdater.autoDownload = false;
        autoUpdater.autoInstallOnAppQuit = false;
        autoUpdater.checkForUpdates.mockReset();
        autoUpdater.on.mockReset();
    });

    it("downloads updates and installs them when the user next quits", async () => {
        await startAutomaticUpdates({
            isPackaged: true,
            automaticUpdatesEnabled: true,
        });

        expect(autoUpdater.autoDownload).toBe(true);
        expect(autoUpdater.autoInstallOnAppQuit).toBe(true);
        expect(autoUpdater.checkForUpdates).toHaveBeenCalledOnce();
        expect(autoUpdater.on).toHaveBeenCalledWith(
            "error",
            expect.any(Function),
        );
    });

    it("does not block app startup when an update check fails", async () => {
        autoUpdater.checkForUpdates.mockRejectedValueOnce(
            new Error("Update server unavailable"),
        );

        await expect(
            startAutomaticUpdates({
                isPackaged: true,
                automaticUpdatesEnabled: true,
            }),
        ).resolves.toBeUndefined();
    });

    it("does not check for updates when the user opts out", async () => {
        await startAutomaticUpdates({
            isPackaged: true,
            automaticUpdatesEnabled: false,
        });

        expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    });

    it("leaves Snap updates to Snapcraft", async () => {
        await startAutomaticUpdates({
            isPackaged: true,
            automaticUpdatesEnabled: true,
            isSnap: true,
        });

        expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    });
});

describe("automaticUpdatesAreEnabled", () => {
    it("defaults to enabled unless the user explicitly turns it off", () => {
        expect(automaticUpdatesAreEnabled(undefined)).toBe(true);
        expect(automaticUpdatesAreEnabled(false)).toBe(false);
    });
});

describe("desktop release configuration", () => {
    it("keeps update-capable targets for every supported operating system", async () => {
        const config = await readFile("electron-builder.json5", "utf8");

        expect(config).toMatch(/mac:\s*\{[\s\S]*?target:\s*\["dmg", "zip"\]/);
        expect(config).toMatch(/win:\s*\{[\s\S]*?target:\s*"nsis"/);
        expect(config).toMatch(/nsis:\s*\{[\s\S]*?perMachine:\s*false/);
        expect(config).toMatch(
            /linux:\s*\{[\s\S]*?target:\s*\["snap", "AppImage"\]/,
        );
        expect(config).toMatch(/provider:\s*"github"/);
    });
});
