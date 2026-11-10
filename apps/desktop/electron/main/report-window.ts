/**
 * The "Report a bug or send feedback" window (fork #801) and what it asks the
 * main process for: a scrubbed copy of the open show, the main window's
 * diagnostics, and permission to record the main window.
 */
import {
    app,
    BrowserWindow,
    ipcMain,
    screen,
    session,
    shell,
    type WebContents,
} from "electron";
import type Store from "electron-store";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { handleWindowOpen } from "./window-open-policy";
import { t } from "./i18n";
import { TRAFFIC_LIGHT_POSITION } from "./traffic-lights";
import { fitBounds, type Rectangle } from "./settings-window-bounds";
import { getDbPath } from "../database/database.services";
import { MAX_SHOW_FILE_BYTES } from "../../src/feedback/reportDraft";
import { Worker } from "node:worker_threads";
import { getValidAccessToken } from "./auth/token-manager";
import {
    ReportSubmitError,
    submitReportFromMain,
    type ReportFileToSend,
} from "./reportSubmit";

const BOUNDS_KEY = "reportWindowBounds";
const DEFAULT_SIZE = { width: 640, height: 780 };

export const REPORT_CHANNELS = {
    open: "report:open",
    showInfo: "report:show-info",
    submit: "report:submit",
    /** Main → report window: which step of sending is under way */
    progress: "report:progress",
    /** Main → main window: send your diagnostics back on `diagnosticsReply` */
    collectDiagnostics: "report:collect-diagnostics",
    diagnosticsReply: "report:diagnostics-reply",
} as const;

/** What the report window sends; main adds the show copy and diagnostics. */
export interface ReportSubmitRequest {
    /** The API's `report` object, without `files` */
    readonly report: Record<string, unknown>;
    readonly sendShowFile: boolean;
    /** The show file name the window showed; sending is refused if another show is open now */
    readonly expectedShowFileName?: string;
    readonly includeAudio: boolean;
    readonly recording?: {
        readonly bytes: ArrayBuffer;
        readonly mimeType: string;
        readonly seconds: number;
    };
}

const ensureSlash = (url: string) => (url.endsWith("/") ? url : `${url}/`);
const EDITOR_API_BASE = ensureSlash(
    import.meta.env.VITE_EDITOR_API_URL ??
        "https://app.openmarch.com/api/editor/",
);

let reportWindow: BrowserWindow | null = null;
/** Each send's private temp folder (0700), deleted when the send ends. */
const TEMP_PREFIX = "openmarch-report-";
const sendDirs = new Set<string>();

function deleteSendDirs() {
    for (const dir of sendDirs)
        fs.rmSync(dir, { recursive: true, force: true });
    sendDirs.clear();
}

/** Removes leftovers from a send the app didn't finish (a crash, a kill). */
function sweepOldTempFiles() {
    try {
        for (const entry of fs.readdirSync(os.tmpdir()))
            if (entry.startsWith(TEMP_PREFIX))
                fs.rmSync(path.join(os.tmpdir(), entry), {
                    recursive: true,
                    force: true,
                });
    } catch {
        // Nothing to sweep, or the folder isn't readable; try again next start
    }
}

/** Writes the scrubbed copy on a worker thread so the app stays responsive. */
function writeReportCopyInWorker(
    source: string,
    destination: string,
    includeAudio: boolean,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const worker = new Worker(
            path.join(__dirname, "../worker", "reportCopyWorker.js"),
            { workerData: { source, destination, includeAudio } },
        );
        worker.once("message", (result: { ok: boolean; message?: string }) =>
            result.ok ? resolve() : reject(new Error(result.message)),
        );
        worker.once("error", reject);
        worker.once("exit", (code) => {
            if (code !== 0)
                reject(new Error(`The show copy stopped (exit ${code})`));
        });
    });
}

interface FeedbackOptions {
    store: Store;
    getMainWindow: () => BrowserWindow | null;
    preload: string;
    /** Same value the main window uses for `frame` (true only in Playwright codegen). */
    frame: boolean;
    load: (win: BrowserWindow) => void;
}

function openReportWindow({
    store,
    getMainWindow,
    preload,
    frame,
    load,
}: FeedbackOptions) {
    if (reportWindow && !reportWindow.isDestroyed()) {
        if (reportWindow.isMinimized()) reportWindow.restore();
        reportWindow.show();
        reportWindow.focus();
        return;
    }
    const parent = getMainWindow();
    const anchor = parent?.getBounds() ?? screen.getPrimaryDisplay().workArea;
    const area = screen.getDisplayMatching(anchor).workArea;
    const width = Math.min(DEFAULT_SIZE.width, area.width);
    const height = Math.min(DEFAULT_SIZE.height, area.height);
    // Beside the editor's right edge when there's room, so the field stays visible
    const fallback: Rectangle = {
        width,
        height,
        x: Math.round(
            Math.min(
                anchor.x + anchor.width - width - 24,
                area.x + area.width - width,
            ),
        ),
        y: Math.round(anchor.y + Math.max(0, (anchor.height - height) / 2)),
    };
    const bounds = fitBounds(
        store.get(BOUNDS_KEY) as Rectangle | undefined,
        screen.getAllDisplays().map((d) => d.workArea),
        fallback,
    );

    const created = new BrowserWindow({
        ...bounds,
        minWidth: 520,
        minHeight: 560,
        title: t("feedback.window.title"),
        show: false,
        autoHideMenuBar: true,
        frame,
        titleBarStyle: "hidden",
        trafficLightPosition: TRAFFIC_LIGHT_POSITION,
        webPreferences: {
            preload,
            contextIsolation: true,
            nodeIntegration: false,
            // It records while hidden; don't let Chromium throttle it then.
            backgroundThrottling: false,
        },
    });
    reportWindow = created;
    created.webContents.setWindowOpenHandler(({ url }) =>
        handleWindowOpen(url, (u) => void shell.openExternal(u)),
    );
    created.once("ready-to-show", () => created.show());
    created.on("close", () => store.set(BOUNDS_KEY, created.getNormalBounds()));
    created.on("closed", () => {
        // A send still under way keeps its files until it finishes
        reportWindow = null;
    });
    load(created);
}

const isReportWindow = (contents: WebContents | null | undefined) =>
    !!reportWindow &&
    !reportWindow.isDestroyed() &&
    contents === reportWindow.webContents;

/** Asks the main window for its diagnostics log; resolves to [] if it can't answer in time. */
function collectDiagnostics(main: BrowserWindow | null): Promise<unknown[]> {
    if (!main || main.isDestroyed()) return Promise.resolve([]);
    const requestId = `${Date.now()}-${Math.random()}`;
    return new Promise((resolve) => {
        const timer = setTimeout(() => finish([]), 2000);
        function finish(entries: unknown[]) {
            clearTimeout(timer);
            ipcMain.removeListener(REPORT_CHANNELS.diagnosticsReply, onReply);
            resolve(entries);
        }
        function onReply(
            event: Electron.IpcMainEvent,
            id: string,
            entries: unknown[],
        ) {
            if (id === requestId && event.sender === main?.webContents)
                finish(Array.isArray(entries) ? entries : []);
        }
        ipcMain.on(REPORT_CHANNELS.diagnosticsReply, onReply);
        main.webContents.send(REPORT_CHANNELS.collectDiagnostics, requestId);
    });
}

/** The open show isn't the one the report window showed (409, like the API's conflicts). */
export const SHOW_CHANGED_STATUS = 409;

/**
 * The show copy, the recording and the diagnostics, written into `dir` for
 * upload. A copy over the server's 1 GB cap is left out (`showFileTooLarge`)
 * rather than failing the whole report.
 */
async function gatherReportFiles(
    request: ReportSubmitRequest,
    dir: string,
    getMainWindow: () => BrowserWindow | null,
): Promise<{ files: ReportFileToSend[]; showFileTooLarge: boolean }> {
    const files: ReportFileToSend[] = [];
    let showFileTooLarge = false;
    if (request.sendShowFile) {
        const source = getDbPath();
        if (
            !source ||
            !fs.existsSync(source) ||
            path.basename(source) !== request.expectedShowFileName
        )
            throw new ReportSubmitError(
                "The open show changed",
                SHOW_CHANGED_STATUS,
            );
        const copy = path.join(dir, "show.dots");
        await writeReportCopyInWorker(source, copy, !!request.includeAudio);
        if (fs.statSync(copy).size > MAX_SHOW_FILE_BYTES)
            showFileTooLarge = true;
        else
            files.push({
                slot: "show_file",
                path: copy,
                // Not the real file name: it often holds the school's name
                filename: "show.dots",
                contentType: "application/octet-stream",
            });
    }
    if (request.recording) {
        const ext = request.recording.mimeType.includes("mp4") ? "mp4" : "webm";
        const file = path.join(dir, `recording.${ext}`);
        fs.writeFileSync(file, Buffer.from(request.recording.bytes));
        files.push({
            slot: "recording",
            path: file,
            filename: `screen-recording.${ext}`,
            contentType: request.recording.mimeType.split(";")[0],
            durationSeconds: request.recording.seconds,
        });
    }
    const diagnostics = path.join(dir, "diagnostics.json");
    fs.writeFileSync(
        diagnostics,
        JSON.stringify(await collectDiagnostics(getMainWindow())),
    );
    files.push({
        slot: "diagnostics",
        path: diagnostics,
        filename: "diagnostics.json",
        contentType: "application/json",
    });
    return { files, showFileTooLarge };
}

async function handleSubmit(
    event: Electron.IpcMainInvokeEvent,
    request: ReportSubmitRequest,
    options: FeedbackOptions,
) {
    // Private (0700) and unique, so other users of a shared /tmp can't read it
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
    sendDirs.add(dir);
    const sender = event.sender;
    try {
        const { files, showFileTooLarge } = await gatherReportFiles(
            request,
            dir,
            options.getMainWindow,
        );
        const { id } = await submitReportFromMain(
            {
                apiBase: EDITOR_API_BASE,
                getToken: getValidAccessToken,
                fetch,
                onProgress: (step) => {
                    // The window may be closed mid-send; the send carries on
                    if (!sender.isDestroyed())
                        sender.send(REPORT_CHANNELS.progress, step);
                },
            },
            request.report,
            files,
        );
        return { ok: true as const, id, showFileTooLarge };
    } catch (error) {
        return {
            ok: false as const,
            status:
                error instanceof ReportSubmitError ? error.status : undefined,
            message: error instanceof Error ? error.message : String(error),
        };
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
        sendDirs.delete(dir);
    }
}

export function registerReportWindow(options: FeedbackOptions) {
    ipcMain.handle(REPORT_CHANNELS.open, () => openReportWindow(options));

    sweepOldTempFiles();
    app.on("will-quit", deleteSendDirs);

    ipcMain.handle(REPORT_CHANNELS.showInfo, (event) => {
        const source = getDbPath();
        if (!isReportWindow(event.sender) || !source || !fs.existsSync(source))
            return null;
        return { fileName: path.basename(source) };
    });

    ipcMain.handle(
        REPORT_CHANNELS.submit,
        (event, request: ReportSubmitRequest) => {
            if (!isReportWindow(event.sender))
                throw new Error("Only the report window can send reports");
            return handleSubmit(event, request, options);
        },
    );

    // Recording: the report window asks for the screen and gets only the
    // editor window's own picture — no system picker, nothing else on screen.
    // Every other request is refused, as before this handler existed.
    void app.whenReady().then(() =>
        session.defaultSession.setDisplayMediaRequestHandler(
            (request, callback) => {
                const main = options.getMainWindow();
                const fromReport =
                    !!reportWindow &&
                    !reportWindow.isDestroyed() &&
                    request.frame?.top === reportWindow.webContents.mainFrame;
                if (fromReport && main && !main.isDestroyed())
                    callback({ video: main.webContents.mainFrame });
                else callback({});
            },
        ),
    );
}
