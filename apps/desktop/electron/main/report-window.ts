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
import { writeReportCopy } from "../database/reportCopy";
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
/** Scrubbed copies written for the open window; deleted when it closes. */
const tempCopies = new Set<string>();

function deleteTempCopies() {
    for (const file of tempCopies) fs.rmSync(file, { force: true });
    tempCopies.clear();
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
        reportWindow = null;
        deleteTempCopies();
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

/** The show copy, the recording and the diagnostics, written to temp files for upload. */
async function gatherReportFiles(
    request: ReportSubmitRequest,
    temp: (name: string) => string,
    getMainWindow: () => BrowserWindow | null,
): Promise<ReportFileToSend[]> {
    const out: ReportFileToSend[] = [];
    if (request.sendShowFile) {
        const source = getDbPath();
        if (source && fs.existsSync(source)) {
            const copy = temp("show.dots");
            writeReportCopy(source, copy, {
                includeAudio: !!request.includeAudio,
            });
            out.push({
                slot: "show_file",
                path: copy,
                filename: path.basename(source),
                contentType: "application/octet-stream",
            });
        }
    }
    if (request.recording) {
        const ext = request.recording.mimeType.includes("mp4") ? "mp4" : "webm";
        const file = temp(`recording.${ext}`);
        fs.writeFileSync(file, Buffer.from(request.recording.bytes));
        out.push({
            slot: "recording",
            path: file,
            filename: `screen-recording.${ext}`,
            contentType: request.recording.mimeType.split(";")[0],
            durationSeconds: request.recording.seconds,
        });
    }
    const diagnostics = temp("diagnostics.json");
    fs.writeFileSync(
        diagnostics,
        JSON.stringify(await collectDiagnostics(getMainWindow())),
    );
    out.push({
        slot: "diagnostics",
        path: diagnostics,
        filename: "diagnostics.json",
        contentType: "application/json",
    });

    return out;
}

export function registerReportWindow(options: FeedbackOptions) {
    ipcMain.handle(REPORT_CHANNELS.open, () => openReportWindow(options));

    app.on("will-quit", deleteTempCopies);

    ipcMain.handle(REPORT_CHANNELS.showInfo, (event) => {
        const source = getDbPath();
        if (!isReportWindow(event.sender) || !source || !fs.existsSync(source))
            return null;
        return { fileName: path.basename(source) };
    });

    ipcMain.handle(
        REPORT_CHANNELS.submit,
        async (event, request: ReportSubmitRequest) => {
            if (!isReportWindow(event.sender))
                throw new Error("Only the report window can send reports");
            const files: ReportFileToSend[] = [];
            const stamp = Date.now();
            const temp = (name: string) => {
                const file = path.join(
                    os.tmpdir(),
                    `openmarch-report-${stamp}-${name}`,
                );
                tempCopies.add(file);
                return file;
            };
            try {
                files.push(
                    ...(await gatherReportFiles(
                        request,
                        temp,
                        options.getMainWindow,
                    )),
                );
                const { id } = await submitReportFromMain(
                    {
                        apiBase: EDITOR_API_BASE,
                        getToken: getValidAccessToken,
                        fetch,
                        onProgress: (step) =>
                            event.sender.send(REPORT_CHANNELS.progress, step),
                    },
                    request.report,
                    files,
                );
                return { ok: true as const, id };
            } catch (error) {
                return {
                    ok: false as const,
                    status:
                        error instanceof ReportSubmitError
                            ? error.status
                            : undefined,
                    message:
                        error instanceof Error ? error.message : String(error),
                };
            } finally {
                for (const file of files) {
                    fs.rmSync(file.path, { force: true });
                    tempCopies.delete(file.path);
                }
            }
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
