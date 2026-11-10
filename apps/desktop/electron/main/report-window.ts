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

const BOUNDS_KEY = "reportWindowBounds";
const DEFAULT_SIZE = { width: 640, height: 780 };

export const REPORT_CHANNELS = {
    open: "report:open",
    showInfo: "report:show-info",
    showCopy: "report:show-copy",
    diagnostics: "report:diagnostics",
    /** Main → main window: send your diagnostics back on `diagnosticsReply` */
    collectDiagnostics: "report:collect-diagnostics",
    diagnosticsReply: "report:diagnostics-reply",
} as const;

export interface ReportShowCopy {
    /** Where the scrubbed copy was written (a temp file) */
    readonly path: string;
    /** The show's own file name, for display */
    readonly fileName: string;
    readonly bytes: number;
}

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
        REPORT_CHANNELS.showCopy,
        (event, { includeAudio }: { includeAudio: boolean }) => {
            if (!isReportWindow(event.sender)) return null;
            const source = getDbPath();
            if (!source || !fs.existsSync(source)) return null;
            const destination = path.join(
                os.tmpdir(),
                `openmarch-report-${Date.now()}.dots`,
            );
            tempCopies.add(destination);
            writeReportCopy(source, destination, {
                includeAudio: !!includeAudio,
            });
            return {
                path: destination,
                fileName: path.basename(source),
                bytes: fs.statSync(destination).size,
            } satisfies ReportShowCopy;
        },
    );

    ipcMain.handle(REPORT_CHANNELS.diagnostics, (event) =>
        isReportWindow(event.sender)
            ? collectDiagnostics(options.getMainWindow())
            : [],
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
