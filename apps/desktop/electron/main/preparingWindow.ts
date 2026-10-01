/* eslint-disable no-console */
/**
 * The "preparing your file" window for convert on open (P9.3), apart from
 * Electron so tests can drive it with a fake window. `convertOnOpenDialogs.ts`
 * passes a real `BrowserWindow`.
 */
import type { ConvertProgress } from "../database/convertOnOpenProtocol";

const escapeHtml = (s: string) =>
    s.replace(
        /[&<>"']/g,
        (c) =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
            })[c]!,
    );

function preparingHtml(fileName: string): string {
    return `<!doctype html><html><head><meta charset="utf-8"><title>Preparing your file</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<style>
:root { color-scheme: light dark; }
body { margin: 0; height: 100vh; display: flex; flex-direction: column; justify-content: center;
  padding: 0 24px; box-sizing: border-box; font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: Canvas; color: CanvasText; user-select: none; cursor: default; }
h1 { font-size: 15px; margin: 0 0 6px; }
p { margin: 0; opacity: .75; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
progress { width: 100%; margin: 10px 0 4px; }
</style></head><body>
<h1>Preparing your file…</h1>
<p>Backing up ${escapeHtml(fileName)} and converting it to timelines.</p>
<progress id="bar"></progress>
<p id="status">Starting…</p>
</body></html>`;
}

/** The status line and bar fraction (undefined: indeterminate) for `progress`. */
export function describePreparingProgress(progress: ConvertProgress): {
    status: string;
    fraction: number | undefined;
} {
    if (progress.phase === "backup")
        return { status: "Backing up…", fraction: undefined };
    const { pagesDone, pagesTotal } = progress;
    return {
        status: `Converting page ${pagesDone} of ${pagesTotal}…`,
        fraction: pagesTotal > 0 ? pagesDone / pagesTotal : undefined,
    };
}

/**
 * Passes progress on to `show` at most every `intervalMs` (10 a second by
 * default), so a show with many pages doesn't flood the window with scripts.
 * A new phase and the final page are always passed on.
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

/**
 * Shows `progress` in the preparing window (its status line and bar) and on
 * the parent's taskbar or dock icon. Runs in the main process while the worker
 * converts (P9.8); never throws, since the window is a courtesy.
 */
export function showPreparingProgress(
    window: PreparingWindow | undefined,
    parent: PreparingParent | undefined,
    progress: ConvertProgress,
): void {
    const { status, fraction } = describePreparingProgress(progress);
    try {
        if (parent && !parent.isDestroyed())
            parent.setProgressBar(fraction ?? 2); // 2: indeterminate
        if (window && !window.isDestroyed())
            void window.webContents
                .executeJavaScript(
                    `(() => {
  const status = document.getElementById("status");
  if (status) status.textContent = ${JSON.stringify(status)};
  const bar = document.getElementById("bar");
  if (bar) { ${fraction === undefined ? 'bar.removeAttribute("value");' : `bar.value = ${fraction};`} }
})()`,
                )
                .catch(() => undefined);
    } catch (error) {
        console.error("Could not show the conversion progress:", error);
    }
}

/** Resolves `promise`, or undefined after `ms`, so a window problem can never hang the open. */
const withTimeout = <T>(promise: Promise<T>, ms: number) =>
    Promise.race([
        promise,
        new Promise<undefined>((resolve) => setTimeout(resolve, ms)),
    ]);

/** The parts of a `BrowserWindow` the preparing window uses (tests pass a fake). */
export interface PreparingWindow {
    once(event: "ready-to-show", listener: () => void): unknown;
    loadURL(url: string): Promise<void>;
    show(): void;
    destroy(): void;
    isDestroyed(): boolean;
    webContents: { executeJavaScript(code: string): Promise<unknown> };
}

/** The parts of the main window the preparing window uses. */
export interface PreparingParent {
    setProgressBar(progress: number): void;
    isDestroyed(): boolean;
}

/**
 * Shows a small modal window over `parent`, and waits until it has painted:
 * `ready-to-show`, then two animation frames after showing it. Only then does
 * the blocking work start. Never throws, and never leaves a window behind when
 * something fails (the window can't be closed by hand); the window is a
 * courtesy.
 */
export async function showPreparingWindow<Parent extends PreparingParent>(
    parent: Parent,
    fileName: string,
    createWindow: (parent: Parent) => PreparingWindow,
): Promise<PreparingWindow | undefined> {
    let preparing: PreparingWindow | undefined;
    try {
        preparing = createWindow(parent);
        const window = preparing;
        const ready = new Promise<void>((resolve) =>
            window.once("ready-to-show", () => resolve()),
        );
        await window.loadURL(
            `data:text/html;charset=utf-8,${encodeURIComponent(preparingHtml(fileName))}`,
        );
        await withTimeout(ready, 2000);
        window.show();
        parent.setProgressBar(2); // indeterminate
        // Two animation frames after showing: the window's first frame has been produced.
        await withTimeout(
            window.webContents.executeJavaScript(
                "new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))",
            ),
            1000,
        );
        return window;
    } catch (error) {
        console.error("Could not show the preparing window:", error);
        try {
            if (preparing && !preparing.isDestroyed()) preparing.destroy();
        } catch {
            // already gone
        }
        if (!parent.isDestroyed()) parent.setProgressBar(-1);
        return undefined;
    }
}
