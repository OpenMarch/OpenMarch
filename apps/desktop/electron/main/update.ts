import * as electronUpdater from "electron-updater";
import {
    type UpdatePhase,
    type UpdateState,
    type UpdateUnsupportedReason,
} from "../../src/global/updates";

/**
 * The desktop updater (fork #404). electron-updater finds, downloads and installs every
 * update; this module turns its events into one `UpdateState` for the title bar's update pill
 * and Settings, and runs the steps the person chooses there:
 *
 * - It checks on launch and every hour, and when asked ("Check for Updates…").
 * - A found update downloads by itself when "Automatically download updates" is on, and
 *   otherwise waits for "Download". The pill shows the download's progress.
 * - A downloaded update installs the next time the app quits, or now with "Update now", which
 *   closes the show, installs and opens the app (and the show) again.
 * - An install that didn't take (the app opens on its old version) shows as an error.
 *
 * The state machine (`createUpdateController`) takes electron-updater and the app as
 * arguments, so tests drive it with a fake updater.
 */

/**
 * electron-updater's `autoUpdater`. It's CommonJS marked `__esModule`, so the main bundle's
 * interop hands back the module itself, with no `default` (reading `.default.autoUpdater`
 * threw at launch in packaged builds, and they never checked for updates). Other bundlers put
 * it under `default` (electron-builder#7976), so take whichever is there.
 */
export function getAutoUpdater() {
    const module = electronUpdater as typeof electronUpdater & {
        default?: typeof electronUpdater;
    };
    return module.autoUpdater ?? module.default!.autoUpdater;
}

/** How often to look for an update while the app is open */
export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
/** How long "Update now" waits for the app to quit before it counts the install as failed */
export const INSTALL_TIMEOUT_MS = 30 * 1000;

/** The setting is on unless turned off: it was on before anyone could choose */
export function automaticUpdatesAreEnabled(value: unknown): boolean {
    return value !== false;
}

/** Why this copy of the app can't replace itself, or null when it can */
export function updateUnsupportedReason({
    isPackaged,
    platform,
    env,
    hasFeed,
}: {
    isPackaged: boolean;
    platform: NodeJS.Platform;
    env: Record<string, string | undefined>;
    /** The build has an update feed (`resources/app-update.yml`) */
    hasFeed: boolean;
}): UpdateUnsupportedReason | null {
    if (!isPackaged) return "development";
    if (env.SNAP) return "snap";
    if (platform === "linux" && !env.APPIMAGE) return "linuxPackage";
    if (!hasFeed) return "noFeed";
    return null;
}

/** Nightly builds carry "-nightly." in their version (`.github/workflows/nightly.yaml`) */
export function updateChannelOf(version: string): UpdateState["channel"] {
    return version.includes("-nightly.") ? "nightly" : "stable";
}

/** What "Update now" leaves behind, so the next launch can tell whether the install took */
export interface InstallAttempt {
    readonly from: string;
    readonly to: string;
}

/** The part of electron-updater the controller uses */
export interface UpdaterLike {
    autoDownload: boolean;
    autoInstallOnAppQuit: boolean;
    on(event: string, listener: (...args: any[]) => void): unknown;
    checkForUpdates(): Promise<unknown>;
    downloadUpdate(): Promise<unknown>;
    quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
    /** electron-updater keeps this true once an install went through, false if it failed */
    quitAndInstallCalled?: boolean;
}

export interface UpdateControllerOptions {
    updater: UpdaterLike;
    currentVersion: string;
    unsupportedReason: UpdateUnsupportedReason | null;
    /** macOS: the app runs outside Applications and can't replace itself there */
    needsMoveToApplications: () => boolean;
    automaticDownload: boolean;
    /** Called with every new state */
    onChange: (state: UpdateState) => void;
    /** The install "Update now" started last session, if any; cleared once read */
    takeInstallAttempt: () => InstallAttempt | null;
    saveInstallAttempt: (attempt: InstallAttempt) => void;
    /** Closes the show so it reopens after the restart; resolves when it's safe to quit */
    prepareToQuit: () => Promise<void>;
    /** Opens the app again on this version, when "Update now" couldn't install */
    relaunch: () => void;
    /**
     * macOS: Electron's own updater (Squirrel.Mac). electron-updater says "downloaded" once the
     * zip is on disk, but Squirrel still fetches and unpacks it after that, and installing has
     * to wait for it. The update counts as ready only when this says so.
     */
    nativeStaging?: {
        once(event: "update-downloaded", listener: () => void): unknown;
    };
    /**
     * Linux: opens the new AppImage after this app exits. electron-updater would start it right
     * away, while this one still holds the profile's storage, so the controller installs without
     * starting it and calls this instead.
     */
    relaunchAfterInstall?: () => void;
    log?: Pick<Console, "info" | "error">;
    setTimer?: (callback: () => void, ms: number) => unknown;
    setRepeatingTimer?: (callback: () => void, ms: number) => unknown;
    now?: () => number;
}

export interface UpdateController {
    getState(): UpdateState;
    /** Starts the launch check and the hourly checks */
    start(): void;
    /**
     * Looks for an update; resolves with the state once the check ends. A `manual` check (the
     * person asked) shows its download in the title bar and reports failures; a background one
     * keeps an update already found on screen even if the check fails.
     */
    check(options?: { manual?: boolean }): Promise<UpdateState>;
    /** Downloads the found update because the person asked: the title bar shows its progress */
    download(): Promise<void>;
    /** Closes the show, quits and installs the downloaded update */
    install(): Promise<void>;
    setAutomaticDownload(enabled: boolean): void;
}

const messageOf = (error: unknown) =>
    error instanceof Error ? error.message : String(error);

// eslint-disable-next-line max-lines-per-function -- one closure holds the state and its events
export function createUpdateController(
    options: UpdateControllerOptions,
): UpdateController {
    const {
        updater,
        currentVersion,
        unsupportedReason,
        onChange,
        log = console,
        setTimer = (callback, ms) => setTimeout(callback, ms),
        setRepeatingTimer = (callback, ms) => setInterval(callback, ms),
        now = Date.now,
    } = options;

    const canInstallHere = () =>
        !unsupportedReason && !options.needsMoveToApplications();

    let state: UpdateState = {
        currentVersion,
        channel: updateChannelOf(currentVersion),
        phase: unsupportedReason
            ? { kind: "unsupported", reason: unsupportedReason }
            : { kind: "idle" },
        needsMoveToApplications:
            !unsupportedReason && options.needsMoveToApplications(),
        automaticDownload: options.automaticDownload,
    };
    /** The version the current download is about, once a check found one */
    let foundVersion: string | undefined;
    let pendingCheck: Promise<UpdateState> | null = null;
    /** The check running now: whether someone asked for it, and the phase before it */
    let currentCheck: { manual: boolean; before: UpdatePhase } | null = null;
    /** A background check while an update waits for Download: it shouldn't disturb the pill */
    const quietCheck = () =>
        currentCheck !== null &&
        !currentCheck.manual &&
        currentCheck.before.kind === "available";
    let installing = false;

    const set = (phase: UpdatePhase) => {
        state = {
            ...state,
            phase,
            needsMoveToApplications:
                !unsupportedReason && options.needsMoveToApplications(),
        };
        onChange(state);
    };

    /** Read fresh after an await: events may have moved the state on meanwhile */
    const phaseKind = (): UpdatePhase["kind"] => state.phase.kind;

    const fail = (error: unknown) => {
        set({
            kind: "error",
            message: messageOf(error),
            version: foundVersion,
        });
        // "Update now" already closed the show (and on macOS, the windows): open the app again
        // on this version rather than leave it half closed. The next launch reports it.
        if (installing) {
            installing = false;
            options.relaunch();
        }
    };

    const checkFailed = (error: unknown) => {
        // A background check that fails changes nothing about an update already found
        if (quietCheck() && currentCheck) set(currentCheck.before);
        else fail(error);
    };

    const controller: UpdateController = {
        getState: () => state,

        start() {
            if (unsupportedReason) return;
            void controller.check();
            setRepeatingTimer(() => {
                if (state.phase.kind !== "checking") void controller.check();
            }, UPDATE_CHECK_INTERVAL_MS);
        },

        check({ manual = false } = {}) {
            if (unsupportedReason) return Promise.resolve(state);
            // Nothing new to find while one downloads or waits to install. Asking during an
            // automatic download brings its progress into the title bar.
            const { phase } = state;
            if (manual && phase.kind === "downloading" && !phase.requested)
                set({ ...phase, requested: true });
            if (phase.kind === "downloading" || phase.kind === "downloaded")
                return Promise.resolve(state);
            // Asking while a background check runs makes it the person's check
            if (currentCheck) currentCheck.manual ||= manual;
            if (pendingCheck) return pendingCheck;
            currentCheck = { manual, before: phase };
            pendingCheck = updater
                .checkForUpdates()
                .then(() => {
                    // A check that ends without an event found nothing to do
                    if (phaseKind() === "checking")
                        set({ kind: "upToDate", checkedAt: now() });
                })
                .catch((error: unknown) => {
                    log.error("Unable to check for updates:", error);
                    // The error event usually got there first
                    if (phaseKind() === "checking") checkFailed(error);
                })
                .then(() => {
                    pendingCheck = null;
                    currentCheck = null;
                    return state;
                });
            return pendingCheck;
        },

        async download() {
            if (!canInstallHere()) return;
            const { kind } = state.phase;
            if (kind !== "available" && kind !== "error") return;
            // An error before anything was found has nothing to download: look again
            if (!foundVersion) {
                await controller.check();
                return;
            }
            await startDownload(true);
        },

        async install() {
            if (installing || state.phase.kind !== "downloaded") return;
            if (!canInstallHere()) return;
            installing = true;
            const to = state.phase.version;
            options.saveInstallAttempt({ from: currentVersion, to });
            const relaunchAfter = options.relaunchAfterInstall;
            try {
                await options.prepareToQuit();
                log.info(`Installing OpenMarch ${to} and restarting`);
                // Windows: install without the installer's pages, then open the app again.
                // macOS reopens by itself. Linux opens the new AppImage only after this app
                // exits (`relaunchAfterInstall`).
                updater.quitAndInstall(true, !relaunchAfter);
                if (relaunchAfter && updater.quitAndInstallCalled !== false)
                    relaunchAfter();
            } catch (error) {
                fail(error);
                return;
            }
            // Still running long after: the install never started
            setTimer(() => {
                if (installing)
                    fail(new Error(`The update to ${to} didn't start.`));
            }, INSTALL_TIMEOUT_MS);
        },

        setAutomaticDownload(enabled) {
            state = { ...state, automaticDownload: enabled };
            onChange(state);
            if (enabled && state.phase.kind === "available" && canInstallHere())
                void startDownload(false);
        },
    };

    async function startDownload(requested: boolean) {
        // A check still running mustn't treat this download's errors as its own quiet failure
        if (currentCheck) currentCheck.manual = true;
        set({
            kind: "downloading",
            version: foundVersion ?? "",
            requested,
            percent: 0,
            bytesPerSecond: 0,
            transferred: 0,
            total: 0,
        });
        try {
            await updater.downloadUpdate();
        } catch (error) {
            log.error("Unable to download the update:", error);
            if (phaseKind() === "downloading") fail(error);
        }
    }

    if (!unsupportedReason) {
        // The controller starts downloads itself, so it can wait for a move to Applications
        updater.autoDownload = false;
        // A downloaded update always installs on quit: the person chose it, or chose automatic
        updater.autoInstallOnAppQuit = true;

        updater.on("checking-for-update", () => {
            if (!quietCheck()) set({ kind: "checking" });
        });
        updater.on("update-not-available", () => {
            foundVersion = undefined;
            set({ kind: "upToDate", checkedAt: now() });
        });
        updater.on("update-available", (info: { version: string }) => {
            foundVersion = info.version;
            // A check that ends while its update already downloads changes nothing
            const { kind } = state.phase;
            if (kind === "downloading" || kind === "downloaded") return;
            // Straight to a quiet download, so "Update available" never flashes in the title
            // bar on its way to "Update ready"
            if (state.automaticDownload && canInstallHere())
                void startDownload(currentCheck?.manual ?? false);
            else set({ kind: "available", version: info.version });
        });
        updater.on(
            "download-progress",
            (progress: {
                percent: number;
                bytesPerSecond: number;
                transferred: number;
                total: number;
            }) =>
                set({
                    kind: "downloading",
                    version: foundVersion ?? "",
                    requested:
                        state.phase.kind === "downloading" &&
                        state.phase.requested,
                    percent: progress.percent,
                    bytesPerSecond: progress.bytesPerSecond,
                    transferred: progress.transferred,
                    total: progress.total,
                }),
        );
        updater.on("update-downloaded", (info: { version: string }) => {
            foundVersion = info.version;
            const ready = () =>
                set({ kind: "downloaded", version: info.version });
            // macOS: stays at 100% until Squirrel has it too (`nativeStaging`)
            if (options.nativeStaging)
                options.nativeStaging.once("update-downloaded", ready);
            else ready();
        });
        updater.on("error", (error: unknown) => {
            log.error("Updater error:", error);
            if (currentCheck) checkFailed(error);
            else fail(error);
        });

        // "Update now" last session, and still the old version: the install didn't take.
        // The checks go on (a fresh download may install), and the pill offers the installer.
        const attempt = options.takeInstallAttempt();
        if (attempt && attempt.from === currentVersion)
            state = { ...state, failedInstallVersion: attempt.to };
    }

    return controller;
}
