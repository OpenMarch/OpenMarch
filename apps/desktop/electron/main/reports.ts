/**
 * Bug and feedback reports from the editor's report drawer (fork #801): the
 * main process makes a scrubbed copy of the open show, uploads it with the
 * recording and the diagnostics, and lets the editor record its own window.
 */
import { app, ipcMain, session, type BrowserWindow } from "electron";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { getDbPath } from "../database/database.services";
import { MAX_SHOW_FILE_BYTES } from "../../src/feedback/reportDraft";
import { Worker } from "node:worker_threads";
import { getValidAccessToken } from "./auth/token-manager";
import {
    ReportSubmitError,
    submitReportFromMain,
    type ReportFileToSend,
} from "./reportSubmit";

export const REPORT_CHANNELS = {
    showInfo: "report:show-info",
    submit: "report:submit",
    /** Main → editor: which step of sending is under way */
    progress: "report:progress",
} as const;

/** What the report drawer sends; main adds the show copy. */
export interface ReportSubmitRequest {
    /** The API's `report` object, without `files` */
    readonly report: Record<string, unknown>;
    readonly sendShowFile: boolean;
    /** The show file name the drawer showed; sending is refused if another show is open now */
    readonly expectedShowFileName?: string;
    readonly includeAudio: boolean;
    readonly recording?: {
        readonly bytes: ArrayBuffer;
        readonly mimeType: string;
        readonly seconds: number;
    };
    /** The editor's recent actions and errors (src/feedback/diagnostics.ts) */
    readonly diagnostics: readonly unknown[];
}

const ensureSlash = (url: string) => (url.endsWith("/") ? url : `${url}/`);
const EDITOR_API_BASE = ensureSlash(
    import.meta.env.VITE_EDITOR_API_URL ??
        "https://app.openmarch.com/api/editor/",
);

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

interface ReportOptions {
    getMainWindow: () => BrowserWindow | null;
}

/** The open show isn't the one the drawer showed (409, like the API's conflicts). */
export const SHOW_CHANGED_STATUS = 409;

/**
 * The show copy, the recording and the diagnostics, written into `dir` for
 * upload. A copy over the server's 1 GB cap is left out (`showFileTooLarge`)
 * rather than failing the whole report.
 */
async function gatherReportFiles(
    request: ReportSubmitRequest,
    dir: string,
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
        JSON.stringify(
            Array.isArray(request.diagnostics) ? request.diagnostics : [],
        ),
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
) {
    // Private (0700) and unique, so other users of a shared /tmp can't read it
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
    sendDirs.add(dir);
    const sender = event.sender;
    try {
        const { files, showFileTooLarge } = await gatherReportFiles(
            request,
            dir,
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

export function registerReports(options: ReportOptions) {
    sweepOldTempFiles();
    app.on("will-quit", deleteSendDirs);

    const isEditor = (contents: Electron.WebContents) => {
        const main = options.getMainWindow();
        return !!main && !main.isDestroyed() && contents === main.webContents;
    };

    ipcMain.handle(REPORT_CHANNELS.showInfo, (event) => {
        const source = getDbPath();
        if (!isEditor(event.sender) || !source || !fs.existsSync(source))
            return null;
        return { fileName: path.basename(source) };
    });

    ipcMain.handle(
        REPORT_CHANNELS.submit,
        (event, request: ReportSubmitRequest) => {
            if (!isEditor(event.sender))
                throw new Error("Only the editor can send reports");
            return handleSubmit(event, request);
        },
    );

    // Recording: the editor asks for the screen and gets its own window's
    // picture: no system picker, nothing else on screen. Every other request
    // is refused, as before this handler existed.
    void app.whenReady().then(() =>
        session.defaultSession.setDisplayMediaRequestHandler(
            (request, callback) => {
                const main = options.getMainWindow();
                if (
                    main &&
                    !main.isDestroyed() &&
                    request.frame?.top === main.webContents.mainFrame
                )
                    callback({ video: main.webContents.mainFrame });
                else callback({});
            },
        ),
    );
}
