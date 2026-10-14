/* eslint-disable no-console */
/**
 * Sends the conversion's progress to the renderer, whose convert dialog shows
 * it, and to the window's taskbar or dock icon. Apart from Electron so tests
 * can drive it with a fake window.
 */
import type { ConvertProgress } from "../database/convertOnOpenProtocol";

/** IPC channel the main process sends `ConvertProgress` on while a file converts. */
export const CONVERSION_PROGRESS_CHANNEL = "conversion:progress";

/**
 * Passes progress on to `show` at most every `intervalMs` (10 a second by
 * default), so a show with many pages doesn't flood the renderer. A new phase
 * and the final page are always passed on.
 */
export function throttleProgress(
    show: (progress: ConvertProgress) => void,
    intervalMs = 100,
    now: () => number = () => Date.now(),
): (progress: ConvertProgress) => void {
    let lastShown = -Infinity;
    let lastPhase: ConvertProgress["phase"] | undefined;
    return (progress) => {
        const t = now();
        const final =
            progress.phase === "convert" &&
            progress.pagesDone >= progress.pagesTotal;
        if (
            progress.phase !== lastPhase ||
            final ||
            t - lastShown >= intervalMs
        ) {
            lastShown = t;
            lastPhase = progress.phase;
            show(progress);
        }
    };
}

/** The parts of a `BrowserWindow` the progress uses (tests pass a fake). */
export interface ProgressWindow {
    isDestroyed(): boolean;
    setProgressBar(progress: number): void;
    webContents: { send(channel: string, ...args: unknown[]): void };
}

/**
 * Shows `progress` in the renderer and on the window's taskbar or dock icon.
 * Never throws, since progress is a courtesy.
 */
export function showConversionProgress(
    win: ProgressWindow | undefined,
    progress: ConvertProgress,
): void {
    if (!win || win.isDestroyed()) return;
    try {
        const fraction =
            progress.phase === "convert" && progress.pagesTotal > 0
                ? progress.pagesDone / progress.pagesTotal
                : 2; // 2: indeterminate
        win.setProgressBar(fraction);
        win.webContents.send(CONVERSION_PROGRESS_CHANNEL, progress);
    } catch (error) {
        console.error("Could not show the conversion progress:", error);
    }
}
