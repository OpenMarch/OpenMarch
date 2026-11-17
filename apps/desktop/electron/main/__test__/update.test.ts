// @vitest-environment node
/**
 * The desktop updater (`update.ts`, fork #404): electron-updater's events become one state for
 * the title bar and Settings, downloads wait for the person or the setting, and "Update now"
 * closes the show before it installs.
 */
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { UpdateState } from "../../../src/global/updates";
import {
    automaticUpdatesAreEnabled,
    createUpdateController,
    getAutoUpdater,
    INSTALL_TIMEOUT_MS,
    type InstallAttempt,
    updateChannelOf,
    updateUnsupportedReason,
    type UpdateControllerOptions,
} from "../update";

const { autoUpdater } = vi.hoisted(() => ({
    autoUpdater: { name: "updater" },
}));
vi.mock("electron-updater", () => ({ autoUpdater }));

class FakeUpdater extends EventEmitter {
    autoDownload = true;
    autoInstallOnAppQuit = false;
    /** What the next check emits; null leaves it hanging until the test resolves it */
    nextCheck: ((updater: FakeUpdater) => void) | Error = (u) =>
        u.emit("update-not-available", {});
    checkForUpdates = vi.fn(async () => {
        this.emit("checking-for-update");
        if (this.nextCheck instanceof Error) {
            this.emit("error", this.nextCheck);
            throw this.nextCheck;
        }
        this.nextCheck(this);
        return null;
    });
    downloadUpdate = vi.fn(async () => []);
    quitAndInstall = vi.fn();
    quitAndInstallCalled?: boolean;
}

const silentLog = { info: () => {}, error: () => {} };

function setup(overrides: Partial<UpdateControllerOptions> = {}) {
    const updater = new FakeUpdater();
    const states: UpdateState[] = [];
    const timers: { callback: () => void; ms: number }[] = [];
    let attempt: InstallAttempt | null = null;
    const options: UpdateControllerOptions = {
        updater,
        currentVersion: "0.2.0",
        unsupportedReason: null,
        needsMoveToApplications: () => false,
        automaticDownload: false,
        onChange: (state) => states.push(state),
        takeInstallAttempt: () => null,
        saveInstallAttempt: (saved) => (attempt = saved),
        prepareToQuit: vi.fn(async () => {}),
        relaunch: vi.fn(),
        log: silentLog,
        setTimer: (callback, ms) => timers.push({ callback, ms }),
        setRepeatingTimer: (callback, ms) => timers.push({ callback, ms }),
        now: () => 1000,
        ...overrides,
    };
    const controller = createUpdateController(options);
    return {
        updater,
        controller,
        states,
        timers,
        options,
        savedAttempt: () => attempt,
        phase: () => controller.getState().phase,
    };
}

const found =
    (version: string) =>
    (u: FakeUpdater): void => {
        u.emit("update-available", { version });
    };

describe("createUpdateController", () => {
    it("leaves downloading to itself and always installs a downloaded update on quit", () => {
        const { updater } = setup();
        expect(updater.autoDownload).toBe(false);
        expect(updater.autoInstallOnAppQuit).toBe(true);
    });

    it("says it's up to date when a check finds nothing", async () => {
        const { controller, phase } = setup();
        const state = await controller.check();
        expect(state.phase).toEqual({ kind: "upToDate", checkedAt: 1000 });
        expect(phase().kind).toBe("upToDate");
    });

    it("shows a found update and waits for Download when downloads aren't automatic", async () => {
        const { controller, updater, phase } = setup();
        updater.nextCheck = found("0.2.1");
        await controller.check();
        expect(phase()).toEqual({ kind: "available", version: "0.2.1" });
        expect(updater.downloadUpdate).not.toHaveBeenCalled();

        await controller.download();
        expect(updater.downloadUpdate).toHaveBeenCalledOnce();
    });

    it("downloads a found update by itself when the setting is on", async () => {
        const { controller, updater } = setup({ automaticDownload: true });
        updater.nextCheck = found("0.2.1");
        await controller.check();
        expect(updater.downloadUpdate).toHaveBeenCalledOnce();
    });

    it("keeps an automatic download quiet: no Update available on the way", async () => {
        const { controller, updater, states } = setup({
            automaticDownload: true,
        });
        updater.nextCheck = found("0.2.1");
        await controller.check();
        expect(states.map((s) => s.phase.kind)).not.toContain("available");
        updater.emit("download-progress", {
            percent: 50,
            bytesPerSecond: 1,
            transferred: 1,
            total: 2,
        });
        expect(controller.getState().phase).toMatchObject({
            kind: "downloading",
            requested: false,
        });
    });

    it("shows a download the person asked for, and its progress", async () => {
        const { controller, updater, phase } = setup();
        updater.nextCheck = found("0.2.1");
        await controller.check();
        await controller.download();
        updater.emit("download-progress", {
            percent: 50,
            bytesPerSecond: 1,
            transferred: 1,
            total: 2,
        });
        expect(phase()).toMatchObject({ kind: "downloading", requested: true });
    });

    it("brings an automatic download into view when the person checks for updates", async () => {
        const { controller, updater, phase } = setup({
            automaticDownload: true,
        });
        updater.nextCheck = found("0.2.1");
        await controller.check();
        await controller.check({ manual: true });
        expect(phase()).toMatchObject({ kind: "downloading", requested: true });
        expect(updater.checkForUpdates).toHaveBeenCalledOnce();
    });

    it("shows the download a person's own check found", async () => {
        const { controller, updater, phase } = setup({
            automaticDownload: true,
        });
        updater.nextCheck = found("0.2.1");
        await controller.check({ manual: true });
        expect(phase()).toMatchObject({ kind: "downloading", requested: true });
    });

    it("keeps a found update on screen through a background check, even a failed one", async () => {
        const { controller, updater, states, phase } = setup();
        updater.nextCheck = found("0.2.1");
        await controller.check();
        const before = states.length;
        updater.nextCheck = new Error("net::ERR_INTERNET_DISCONNECTED");
        await controller.check();
        expect(phase()).toEqual({ kind: "available", version: "0.2.1" });
        expect(states.slice(before).map((s) => s.phase.kind)).not.toContain(
            "checking",
        );
    });

    it("reports a failed check the person asked for", async () => {
        const { controller, updater, phase } = setup();
        updater.nextCheck = found("0.2.1");
        await controller.check();
        updater.nextCheck = new Error("net::ERR_INTERNET_DISCONNECTED");
        await controller.check({ manual: true });
        expect(phase()).toMatchObject({ kind: "error", version: "0.2.1" });
    });

    it("on macOS, is ready only once Squirrel has the update too", async () => {
        const native = new EventEmitter();
        const { controller, updater, phase } = setup({ nativeStaging: native });
        updater.nextCheck = found("0.2.1");
        await controller.check();
        await controller.download();
        updater.emit("update-downloaded", { version: "0.2.1" });
        expect(phase().kind).toBe("downloading");
        await controller.install();
        expect(updater.quitAndInstall).not.toHaveBeenCalled();

        native.emit("update-downloaded");
        expect(phase()).toEqual({ kind: "downloaded", version: "0.2.1" });
    });

    it("starts the waiting download when the setting is turned on", async () => {
        const { controller, updater } = setup();
        updater.nextCheck = found("0.2.1");
        await controller.check();
        controller.setAutomaticDownload(true);
        expect(updater.downloadUpdate).toHaveBeenCalledOnce();
        expect(controller.getState().automaticDownload).toBe(true);
    });

    it("reports download progress, then the ready update", async () => {
        const { controller, updater, phase } = setup();
        updater.nextCheck = found("0.2.1");
        await controller.check();
        await controller.download();
        updater.emit("download-progress", {
            percent: 42.5,
            bytesPerSecond: 2_000_000,
            transferred: 42_500_000,
            total: 100_000_000,
        });
        expect(phase()).toMatchObject({
            kind: "downloading",
            version: "0.2.1",
            percent: 42.5,
            total: 100_000_000,
        });
        updater.emit("update-downloaded", { version: "0.2.1" });
        expect(phase()).toEqual({ kind: "downloaded", version: "0.2.1" });
    });

    it("doesn't check again while an update downloads or waits to install", async () => {
        const { controller, updater } = setup();
        updater.nextCheck = found("0.2.1");
        await controller.check();
        updater.emit("update-downloaded", { version: "0.2.1" });
        await controller.check();
        expect(updater.checkForUpdates).toHaveBeenCalledOnce();
    });

    it("shows a failed check as an error with the updater's message", async () => {
        const { controller, updater, phase } = setup();
        updater.nextCheck = new Error("net::ERR_INTERNET_DISCONNECTED");
        const state = await controller.check();
        expect(state.phase).toEqual({
            kind: "error",
            message: "net::ERR_INTERNET_DISCONNECTED",
            version: undefined,
        });
        expect(phase().kind).toBe("error");
    });

    it("keeps the found version on a failed download, and Try again downloads it again", async () => {
        const { controller, updater, phase } = setup();
        updater.nextCheck = found("0.2.1");
        await controller.check();
        updater.downloadUpdate.mockRejectedValueOnce(new Error("404"));
        await controller.download();
        expect(phase()).toEqual({
            kind: "error",
            message: "404",
            version: "0.2.1",
        });
        await controller.download();
        expect(updater.downloadUpdate).toHaveBeenCalledTimes(2);
    });

    it("on macOS outside Applications, finds updates but never downloads them", async () => {
        const { controller, updater } = setup({
            automaticDownload: true,
            needsMoveToApplications: () => true,
        });
        updater.nextCheck = found("0.2.1");
        await controller.check();
        await controller.download();
        expect(updater.downloadUpdate).not.toHaveBeenCalled();
        expect(controller.getState().needsMoveToApplications).toBe(true);
    });

    it("closes the show before it installs, and records the attempt", async () => {
        const order: string[] = [];
        const { controller, updater, savedAttempt } = setup({
            prepareToQuit: async () => {
                order.push("close show");
            },
        });
        updater.quitAndInstall.mockImplementation(() => order.push("install"));
        updater.nextCheck = found("0.2.1");
        await controller.check();
        updater.emit("update-downloaded", { version: "0.2.1" });

        await controller.install();
        expect(order).toEqual(["close show", "install"]);
        // Windows: silent install, then open the app again
        expect(updater.quitAndInstall).toHaveBeenCalledWith(true, true);
        expect(savedAttempt()).toEqual({ from: "0.2.0", to: "0.2.1" });
    });

    it("installs only a downloaded update, and only once", async () => {
        const { controller, updater } = setup();
        await controller.install();
        expect(updater.quitAndInstall).not.toHaveBeenCalled();

        updater.emit("update-downloaded", { version: "0.2.1" });
        await Promise.all([controller.install(), controller.install()]);
        expect(updater.quitAndInstall).toHaveBeenCalledOnce();
    });

    it("on Linux, installs without starting the new copy, then opens it after this one exits", async () => {
        const relaunchAfterInstall = vi.fn();
        const { controller, updater } = setup({ relaunchAfterInstall });
        updater.quitAndInstall.mockImplementation(() => {
            updater.quitAndInstallCalled = true;
        });
        updater.emit("update-downloaded", { version: "0.2.1" });
        await controller.install();
        expect(updater.quitAndInstall).toHaveBeenCalledWith(true, false);
        expect(relaunchAfterInstall).toHaveBeenCalledOnce();
    });

    it("on Linux, doesn't open a new copy when the install didn't go through", async () => {
        const relaunchAfterInstall = vi.fn();
        const { controller, updater } = setup({ relaunchAfterInstall });
        updater.quitAndInstall.mockImplementation(() => {
            updater.quitAndInstallCalled = false;
        });
        updater.emit("update-downloaded", { version: "0.2.1" });
        await controller.install();
        expect(relaunchAfterInstall).not.toHaveBeenCalled();
    });

    it("opens the app again when closing the show for the install fails", async () => {
        const { controller, updater, options } = setup({
            prepareToQuit: async () => {
                throw new Error("disk full");
            },
        });
        updater.emit("update-downloaded", { version: "0.2.1" });
        await controller.install();
        expect(updater.quitAndInstall).not.toHaveBeenCalled();
        expect(options.relaunch).toHaveBeenCalledOnce();
        expect(controller.getState().phase.kind).toBe("error");
    });

    it("keeps a download going when a background check finds the same update", async () => {
        const { controller, updater, phase } = setup();
        updater.nextCheck = found("0.2.1");
        await controller.check();
        await controller.download();
        updater.emit("update-available", { version: "0.2.1" });
        expect(phase().kind).toBe("downloading");
    });

    it("reports a download that fails while a background check runs", async () => {
        const { controller, updater, phase } = setup();
        updater.nextCheck = found("0.2.1");
        await controller.check();
        let finishCheck = () => {};
        updater.checkForUpdates.mockImplementationOnce(
            () => new Promise((resolve) => (finishCheck = () => resolve(null))),
        );
        const check = controller.check();
        updater.downloadUpdate.mockRejectedValueOnce(new Error("404"));
        await controller.download();
        finishCheck();
        await check;
        expect(phase()).toMatchObject({ kind: "error", message: "404" });
    });

    it("opens the app again when Update now doesn't quit", async () => {
        const { controller, updater, timers, options } = setup();
        updater.emit("update-downloaded", { version: "0.2.1" });
        await controller.install();
        const timeout = timers.find((t) => t.ms === INSTALL_TIMEOUT_MS);
        timeout?.callback();
        expect(options.relaunch).toHaveBeenCalledOnce();
        expect(controller.getState().phase.kind).toBe("error");
    });

    it("opens the app again when the install fails after the show closed", async () => {
        const { controller, updater, options } = setup();
        updater.emit("update-downloaded", { version: "0.2.1" });
        await controller.install();
        updater.emit("error", new Error("Squirrel could not install"));
        expect(options.relaunch).toHaveBeenCalledOnce();
    });

    it("remembers an install that opened on the old version", () => {
        const { controller } = setup({
            takeInstallAttempt: () => ({ from: "0.2.0", to: "0.2.1" }),
        });
        expect(controller.getState().failedInstallVersion).toBe("0.2.1");
    });

    it("forgets an install that took", () => {
        const { controller } = setup({
            currentVersion: "0.2.1",
            takeInstallAttempt: () => ({ from: "0.2.0", to: "0.2.1" }),
        });
        expect(controller.getState().failedInstallVersion).toBeUndefined();
    });

    it("checks on start and every hour, never while a check runs", async () => {
        const { controller, updater, timers } = setup();
        controller.start();
        expect(updater.checkForUpdates).toHaveBeenCalledOnce();
        const hourly = timers.find((t) => t.ms === 60 * 60 * 1000);
        await controller.check();
        hourly?.callback();
        expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
    });

    it("does nothing where the app can't update itself", async () => {
        const { controller, updater } = setup({ unsupportedReason: "snap" });
        controller.start();
        await controller.check();
        expect(updater.checkForUpdates).not.toHaveBeenCalled();
        expect(controller.getState().phase).toEqual({
            kind: "unsupported",
            reason: "snap",
        });
    });
});

describe("updateUnsupportedReason", () => {
    const packaged = {
        isPackaged: true,
        platform: "darwin" as const,
        env: {},
        hasFeed: true,
    };
    it("updates packaged macOS and Windows builds and AppImages", () => {
        expect(updateUnsupportedReason(packaged)).toBeNull();
        expect(
            updateUnsupportedReason({ ...packaged, platform: "win32" }),
        ).toBeNull();
        expect(
            updateUnsupportedReason({
                ...packaged,
                platform: "linux",
                env: { APPIMAGE: "/home/a/OpenMarch.AppImage" },
            }),
        ).toBeNull();
    });
    it("leaves a build with no update feed alone", () => {
        expect(updateUnsupportedReason({ ...packaged, hasFeed: false })).toBe(
            "noFeed",
        );
    });
    it("leaves development, Snap and other Linux installs alone", () => {
        expect(
            updateUnsupportedReason({ ...packaged, isPackaged: false }),
        ).toBe("development");
        expect(
            updateUnsupportedReason({
                ...packaged,
                platform: "linux",
                env: { SNAP: "/snap/openmarch/1" },
            }),
        ).toBe("snap");
        expect(
            updateUnsupportedReason({ ...packaged, platform: "linux" }),
        ).toBe("linuxPackage");
    });
});

describe("updateChannelOf", () => {
    it("tells nightlies from releases and betas", () => {
        expect(updateChannelOf("0.2.0-beta.2-nightly.20261111.42")).toBe(
            "nightly",
        );
        expect(updateChannelOf("0.2.0-beta.2")).toBe("stable");
        expect(updateChannelOf("0.2.0")).toBe("stable");
    });
});

describe("getAutoUpdater", () => {
    it("reads autoUpdater off the module itself, as the main bundle loads it", () => {
        expect(getAutoUpdater()).toBe(autoUpdater);
    });
});

describe("automaticUpdatesAreEnabled", () => {
    it("defaults to on unless the person turns it off", () => {
        expect(automaticUpdatesAreEnabled(undefined)).toBe(true);
        expect(automaticUpdatesAreEnabled(false)).toBe(false);
    });
});
