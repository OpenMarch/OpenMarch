/**
 * Moves the renderer's `localStorage` from `file://` to `app://openmarch` once (fork #1011).
 * Storage belongs to an origin, so a packaged app that used to load from `file://` would start
 * with none of its UI settings, shortcut overrides, notices already seen and so on.
 *
 * Runs in main before the first window opens. It copies only keys the new origin doesn't have,
 * and leaves the old copy in place, so an older build still finds its settings after a
 * downgrade. A failure is logged and never blocks startup: the app then starts with what the new
 * origin has.
 */
import { app, BrowserWindow } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { APP_BLANK_URL, APP_ORIGIN } from "./appProtocol";

/** electron-store key, set once the move has run */
export const STORAGE_MOVED_KEY = "rendererStorageMovedTo";

type Entries = Record<string, string>;

export interface StorageMoveDeps {
    movedTo(): unknown;
    setMovedTo(origin: string): void;
    /** Every key in the old origin's storage */
    readOld(): Promise<Entries>;
    /** Writes the entries the new origin doesn't have; returns how many it wrote */
    writeMissing(entries: Entries): Promise<number>;
    log(message: string, error?: unknown): void;
}

/**
 * Moves the storage unless that's done; never throws. Gives up after `timeoutMs` so startup
 * goes on: once the editor may be writing its own storage, the move neither writes nor marks
 * itself done, and the next start tries again.
 */
export async function moveRendererStorage(
    deps: StorageMoveDeps,
    timeoutMs = 10_000,
): Promise<void> {
    if (deps.movedTo() === APP_ORIGIN) return;
    let late = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<void>((resolve) => {
        timer = setTimeout(() => {
            late = true;
            deps.log(
                `renderer storage: not moved within ${timeoutMs} ms, will try at the next start`,
            );
            resolve();
        }, timeoutMs);
    });
    await Promise.race([move(deps, () => late), deadline]);
    clearTimeout(timer);
}

async function move(deps: StorageMoveDeps, isLate: () => boolean) {
    try {
        const old = await deps.readOld();
        if (isLate()) return;
        const count = Object.keys(old).length;
        const written = count ? await deps.writeMissing(old) : 0;
        if (isLate()) return;
        deps.setMovedTo(APP_ORIGIN);
        deps.log(
            `renderer storage: ${written} of ${count} keys moved to ${APP_ORIGIN}`,
        );
    } catch (error) {
        // Not marked done, so the next start tries again
        deps.log("renderer storage: couldn't move it", error);
    }
}

/** Reads every key (a script run in the page) */
const READ_ALL = `(() => {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key !== null) out[key] = localStorage.getItem(key);
    }
    return out;
})()`;

/** Writes the keys the page's storage doesn't have yet (a script run in the page) */
const writeMissingScript = (entries: Entries) => `((entries) => {
    let written = 0;
    for (const [key, value] of Object.entries(entries)) {
        if (localStorage.getItem(key) !== null) continue;
        localStorage.setItem(key, value);
        written++;
    }
    return written;
})(${JSON.stringify(entries)})`;

/** Runs `script` in a hidden window on `load`'s page, then closes it. */
async function inHiddenPage<T>(
    load: (window: BrowserWindow) => Promise<void>,
    script: string,
): Promise<T> {
    const window = new BrowserWindow({
        show: false,
        webPreferences: {
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    try {
        await load(window);
        return (await window.webContents.executeJavaScript(script)) as T;
    } finally {
        window.destroy();
    }
}

/** The move as the packaged app runs it. Every `file://` page shares one storage. */
export function electronStorageMoveDeps(
    store: {
        get(key: string): unknown;
        set(key: string, value: unknown): void;
    },
    /** True when the app started with no settings at all */
    isNewProfile: boolean,
): StorageMoveDeps {
    return {
        movedTo: () => store.get(STORAGE_MOVED_KEY),
        setMovedTo: (origin) => store.set(STORAGE_MOVED_KEY, origin),
        async readOld() {
            // A new install (or a test's fresh profile) has no old storage: nothing to read,
            // and no hidden window opens
            const storageDir = path.join(
                app.getPath("userData"),
                "Local Storage",
            );
            if (isNewProfile || !(await fs.stat(storageDir).catch(() => null)))
                return {};
            // A folder of its own: the temp folder is shared with other users on Linux
            const dir = await fs.mkdtemp(
                path.join(app.getPath("temp"), "openmarch-storage-move-"),
            );
            const page = path.join(dir, "read.html");
            try {
                await fs.writeFile(
                    page,
                    "<!doctype html><title>OpenMarch</title>",
                    { mode: 0o600, flag: "wx" },
                );
                return await inHiddenPage<Entries>(
                    (window) => window.loadFile(page),
                    READ_ALL,
                );
            } finally {
                await fs.rm(dir, { recursive: true, force: true });
            }
        },
        writeMissing: (entries) =>
            inHiddenPage<number>(
                (window) => window.loadURL(APP_BLANK_URL),
                writeMissingScript(entries),
            ),
        log: (message, error) =>
            error === undefined
                ? // eslint-disable-next-line no-console
                  console.log(message)
                : console.error(message, error),
    };
}
