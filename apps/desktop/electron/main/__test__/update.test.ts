import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    applyAutomaticUpdatesSetting,
    automaticUpdatesAreEnabled,
    startAutomaticUpdates,
} from "../update";

const { autoUpdater } = vi.hoisted(() => ({
    autoUpdater: {
        autoDownload: false,
        autoInstallOnAppQuit: false,
        checkForUpdates: vi.fn(),
        on: vi.fn(),
        removeAllListeners: vi.fn(),
    },
}));

// electron-updater is CommonJS; the app reads autoUpdater off the default export.
vi.mock("electron-updater", () => ({
    default: { autoUpdater },
}));

describe("startAutomaticUpdates", () => {
    beforeEach(() => {
        autoUpdater.autoDownload = false;
        autoUpdater.autoInstallOnAppQuit = false;
        autoUpdater.checkForUpdates.mockReset();
        autoUpdater.on.mockReset();
        autoUpdater.removeAllListeners.mockReset();
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

    it("does not stack error listeners when started more than once", async () => {
        await startAutomaticUpdates({
            isPackaged: true,
            automaticUpdatesEnabled: true,
        });
        await startAutomaticUpdates({
            isPackaged: true,
            automaticUpdatesEnabled: true,
        });

        expect(autoUpdater.removeAllListeners).toHaveBeenCalledWith("error");
        expect(autoUpdater.on).toHaveBeenCalledTimes(
            autoUpdater.removeAllListeners.mock.calls.length,
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

    it("does not run in development", async () => {
        await startAutomaticUpdates({
            isPackaged: false,
            automaticUpdatesEnabled: true,
        });

        expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    });
});

describe("applyAutomaticUpdatesSetting", () => {
    it("cancels an already-staged install when the user opts out mid-session", async () => {
        await startAutomaticUpdates({
            isPackaged: true,
            automaticUpdatesEnabled: true,
        });
        expect(autoUpdater.autoInstallOnAppQuit).toBe(true);

        applyAutomaticUpdatesSetting(false);

        expect(autoUpdater.autoInstallOnAppQuit).toBe(false);
        expect(autoUpdater.autoDownload).toBe(false);
    });
});

describe("automaticUpdatesAreEnabled", () => {
    it("defaults to enabled unless the user explicitly turns it off", () => {
        expect(automaticUpdatesAreEnabled(undefined)).toBe(true);
        expect(automaticUpdatesAreEnabled(false)).toBe(false);
    });
});
