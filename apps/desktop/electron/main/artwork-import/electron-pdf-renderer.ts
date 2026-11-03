/**
 * The app's `PdfRenderer` (owner decision Q33, 2026-10-11): pdf.js
 * (`pdfjs-dist`, Apache-2.0) in a hidden, sandboxed BrowserWindow that main
 * owns, so PDF artwork needs no new native dependency.
 *
 * Each opened PDF gets its own window, destroyed on `close()`. The window
 * has no preload and no IPC: main hands the PDF over by answering the
 * page's own fetch inside a private in-memory session (see `pdfjs-page.ts`)
 * and calls the page with `executeJavaScript`, which returns page sizes and
 * PNG data URLs. Nothing here is exposed to the editor's renderer; the
 * public import IPC is package C1.9.
 *
 * Shutdown (C1.9 Q56): every hidden window is tracked. `closeAllPdfRenderers`
 * destroys them at once, for the editor's `closed` and `before-quit`; the
 * module also does it on `before-quit` itself, and whenever a window closes
 * and only hidden renderer windows remain, so they never hold
 * `window-all-closed` back. A call in flight on a destroyed window rejects.
 *
 * Main process only. Call after `app` is ready.
 */
import { randomBytes } from "node:crypto";
import path from "node:path";
// cspell:words nosniff
import { app, BrowserWindow, session as electronSession } from "electron";
import { HiddenWindowRegistry } from "./hidden-windows";
import type { PdfDocument, PdfPageInfo, PdfRenderer } from "./pdf";
import {
    PDF_RENDERER_CSP,
    PDF_RENDERER_HTML,
    PDF_RENDERER_ORIGIN,
    pdfjsContentType,
    pdfRendererScript,
    readPdfjsFile,
    routePdfRendererRequest,
} from "./pdfjs-page";

/** An in-memory partition (no `persist:`), used only by renderer windows. */
const PARTITION = "om-artwork-pdf-renderer";

/** Any single step (load pdf.js, open, render, close) gives up after this. */
const DEFAULT_TIMEOUT_MS = 60_000;

const PNG_DATA_URL = "data:image/png;base64,";

export interface ElectronPdfRendererOptions {
    /** The `pdfjs-dist` package folder; resolved from main's modules if left out. */
    readonly pdfjsRoot?: string;
    readonly timeoutMs?: number;
}

/** Every live hidden renderer window. */
const hiddenWindows = new HiddenWindowRegistry<BrowserWindow>();

let lifecycleHooked = false;

/**
 * Destroys every hidden PDF renderer window now; their open documents fail
 * and calls in flight reject. For C1.9 to call on the editor window's
 * `closed` and on `before-quit` after cancelling its import sessions.
 * Returns how many windows it destroyed. Renderers stay usable: the next
 * `open` makes a new window.
 */
export function closeAllPdfRenderers(): number {
    return hiddenWindows.destroyAll();
}

/** Whether `win` is one of the hidden PDF renderer windows, which callers of `getAllWindows()` skip. */
export function isPdfRendererWindow(win: BrowserWindow): boolean {
    return hiddenWindows.has(win);
}

/** How many hidden PDF renderer windows are alive. */
export function livePdfRendererCount(): number {
    return hiddenWindows.size;
}

function closeOrphanedRenderers() {
    // `closed` fires while the window is still being torn down; look once
    // it's gone.
    setImmediate(() =>
        hiddenWindows.closeIfOrphaned(BrowserWindow.getAllWindows()),
    );
}

function watchWindow(win: BrowserWindow) {
    win.once("closed", closeOrphanedRenderers);
}

/**
 * Once per process: destroy hidden windows on `before-quit`, and whenever a
 * window closes leaving only hidden ones, so they never keep the app alive.
 */
function hookLifecycle() {
    if (lifecycleHooked) return;
    lifecycleHooked = true;
    app.on("before-quit", closeAllPdfRenderers);
    for (const win of BrowserWindow.getAllWindows()) watchWindow(win);
    app.on("browser-window-created", (_event, win) => watchWindow(win));
}

/** PDFs waiting for their window's fetch, by one-time token. */
const pendingDocs = new Map<string, Uint8Array>();

let preparedSession: Electron.Session | null = null;
let pdfjsRootForSession: string | null = null;

function resolvePdfjsRoot(): string {
    return path.dirname(require.resolve("pdfjs-dist/package.json"));
}

function respond(
    body: Uint8Array | string | null,
    status: number,
    contentType: string,
): Response {
    return new Response(body as BodyInit | null, {
        status,
        headers: {
            "Content-Type": contentType,
            "Content-Security-Policy": PDF_RENDERER_CSP,
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "no-store",
        },
    });
}

/**
 * The renderer windows' session: every http(s) request is answered by main
 * from the allow-list, everything else is refused, and no permission is
 * ever granted. Set up once.
 */
function rendererSession(pdfjsRoot: string): Electron.Session {
    if (preparedSession) {
        if (pdfjsRootForSession !== pdfjsRoot) {
            throw new Error(
                "The PDF renderer session already serves another pdf.js folder.",
            );
        }
        return preparedSession;
    }
    const ses = electronSession.fromPartition(PARTITION, { cache: false });
    ses.setPermissionRequestHandler((_wc, _permission, callback) =>
        callback(false),
    );
    ses.setPermissionCheckHandler(() => false);
    ses.on("will-download", (event) => event.preventDefault());

    ses.protocol.handle("https", async (request) => {
        const route = routePdfRendererRequest(request.url);
        try {
            switch (route.kind) {
                case "html":
                    return respond(PDF_RENDERER_HTML, 200, "text/html");
                case "script":
                    return respond(pdfRendererScript(), 200, "text/javascript");
                case "pdfjs":
                    return respond(
                        await readPdfjsFile(pdfjsRoot, route.file),
                        200,
                        pdfjsContentType(route.file),
                    );
                case "doc": {
                    const bytes = pendingDocs.get(route.token);
                    pendingDocs.delete(route.token);
                    return bytes
                        ? respond(bytes, 200, "application/pdf")
                        : respond(null, 404, "text/plain");
                }
                case "none":
                    return respond(null, 404, "text/plain");
            }
        } catch {
            return respond(null, 404, "text/plain");
        }
    });
    ses.protocol.handle("http", () => respond(null, 404, "text/plain"));

    preparedSession = ses;
    pdfjsRootForSession = pdfjsRoot;
    return ses;
}

function withTimeout<T>(
    work: Promise<T>,
    ms: number,
    what: string,
): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
            () => reject(new Error(`Reading the PDF timed out (${what}).`)),
            ms,
        );
    });
    return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

type PageAnswer<T> = { ok: true; value: T } | { ok: false; error: string };

function isPositiveFinite(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function parsePages(value: unknown): PdfPageInfo[] {
    if (!Array.isArray(value)) throw new Error("No page list came back.");
    return value.map((page: unknown) => {
        const { widthPt, heightPt } = (page ?? {}) as Record<string, unknown>;
        if (!isPositiveFinite(widthPt) || !isPositiveFinite(heightPt)) {
            throw new Error("A page has no usable size.");
        }
        return { widthPt, heightPt };
    });
}

function createHiddenWindow(ses: Electron.Session): BrowserWindow {
    const win = new BrowserWindow({
        show: false,
        width: 64,
        height: 64,
        skipTaskbar: true,
        webPreferences: {
            session: ses,
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            nodeIntegrationInWorker: false,
            nodeIntegrationInSubFrames: false,
            webSecurity: true,
            webgl: false,
            spellcheck: false,
            navigateOnDragDrop: false,
            // Hidden windows are throttled by default; rendering must not be.
            backgroundThrottling: false,
            devTools: false,
        },
    });
    const contents = win.webContents;
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    contents.on("will-navigate", (event) => event.preventDefault());
    contents.on("will-redirect", (event) => event.preventDefault());
    contents.on("will-attach-webview", (event) => event.preventDefault());
    hiddenWindows.add(win);
    win.once("closed", () => hiddenWindows.remove(win));
    return win;
}

/** One hidden window and the way main talks to its page. */
interface RendererPage {
    readonly win: BrowserWindow;
    call<T>(expression: string, what: string): Promise<T>;
    /** `work`, rejected early if the window is destroyed first. */
    guard<T>(work: Promise<T>): Promise<T>;
    /** Whether the page can still answer. */
    alive(): boolean;
    destroy(): void;
}

function openRendererPage(
    ses: Electron.Session,
    timeoutMs: number,
): RendererPage {
    const win = createHiddenWindow(ses);
    let gone: string | null = null;
    let rejectClosed: (error: Error) => void = () => {};
    const closed = new Promise<never>((_, reject) => {
        rejectClosed = reject;
    });
    closed.catch(() => {});
    win.webContents.on("render-process-gone", (_event, details) => {
        gone = details.reason;
        rejectClosed(new Error(`The PDF reader stopped (${gone}).`));
    });
    win.once("closed", () =>
        rejectClosed(new Error("The PDF reader was closed.")),
    );
    const alive = () => !gone && !win.isDestroyed();
    const guard = <T>(work: Promise<T>) => Promise.race([work, closed]);
    return {
        win,
        alive,
        guard,
        destroy() {
            if (!win.isDestroyed()) win.destroy();
        },
        async call<T>(expression: string, what: string): Promise<T> {
            if (!alive()) {
                throw new Error(
                    `The PDF reader stopped${gone ? ` (${gone})` : ""}.`,
                );
            }
            const answer = (await withTimeout(
                guard(win.webContents.executeJavaScript(expression)),
                timeoutMs,
                what,
            )) as PageAnswer<T> | undefined;
            if (!answer || typeof answer !== "object") {
                throw new Error("The PDF reader gave no answer.");
            }
            if (!answer.ok) throw new Error(answer.error);
            return answer.value;
        },
    };
}

function checkRenderRequest(
    pages: readonly PdfPageInfo[],
    index: number,
    size: { width: number; height: number },
) {
    if (!Number.isInteger(index) || index < 0 || index >= pages.length) {
        throw new Error(`This PDF has no page ${index + 1}.`);
    }
    const { width, height } = size;
    if (
        !Number.isInteger(width) ||
        !Number.isInteger(height) ||
        width < 1 ||
        height < 1
    ) {
        throw new Error("A page size must be whole pixels.");
    }
}

function rendererDocument(
    page: RendererPage,
    id: number,
    pages: readonly PdfPageInfo[],
): PdfDocument {
    return {
        pages,
        async renderPage(index, size) {
            checkRenderRequest(pages, index, size);
            const dataUrl = await page.call<unknown>(
                `omPdf.render(${id}, ${index}, ${size.width}, ${size.height})`,
                `rendering page ${index + 1}`,
            );
            if (
                typeof dataUrl !== "string" ||
                !dataUrl.startsWith(PNG_DATA_URL)
            ) {
                throw new Error("The page didn't render as PNG.");
            }
            return new Uint8Array(
                Buffer.from(dataUrl.slice(PNG_DATA_URL.length), "base64"),
            );
        },
        async close() {
            // Destroying the window frees everything; asking pdf.js first is
            // only tidiness, so its errors don't matter.
            try {
                if (page.alive())
                    await page.call(`omPdf.close(${id})`, "closing");
            } catch {
                // The window goes either way.
            } finally {
                page.destroy();
            }
        },
    };
}

/** Loads pdf.js in a new window and opens `bytes` there. */
async function openInWindow(
    ses: Electron.Session,
    bytes: Uint8Array,
    timeoutMs: number,
): Promise<PdfDocument> {
    const page = openRendererPage(ses, timeoutMs);
    const token = randomBytes(16).toString("hex");
    try {
        await withTimeout(
            page.guard(page.win.loadURL(`${PDF_RENDERER_ORIGIN}/`)),
            timeoutMs,
            "loading pdf.js",
        );
        const ready = await page.guard(
            page.win.webContents.executeJavaScript(
                "globalThis.omPdfReady === true",
            ),
        );
        if (ready !== true) throw new Error("pdf.js didn't load.");

        pendingDocs.set(token, bytes);
        const opened = await page.call<{ id: unknown; pages: unknown }>(
            `omPdf.open(${JSON.stringify(token)})`,
            "opening",
        );
        pendingDocs.delete(token);
        if (typeof opened.id !== "number") {
            throw new Error("The PDF reader gave no document.");
        }
        return rendererDocument(page, opened.id, parsePages(opened.pages));
    } catch (error) {
        pendingDocs.delete(token);
        page.destroy();
        throw error;
    }
}

/**
 * Makes the app's PDF renderer. Pass it to `inspectArtwork` and
 * `importArtwork` as `pdfRenderer`.
 */
export function createElectronPdfRenderer(
    options: ElectronPdfRendererOptions = {},
): PdfRenderer {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    return {
        open(bytes: Uint8Array): Promise<PdfDocument> {
            hookLifecycle();
            const ses = rendererSession(
                options.pdfjsRoot ?? resolvePdfjsRoot(),
            );
            return openInWindow(ses, bytes, timeoutMs);
        },
    };
}
