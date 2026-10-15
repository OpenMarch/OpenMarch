/**
 * Registers the `library:*` IPC (package C1.9) on `ipcMain`. Every handler
 * goes through `handleEditor`, which drops calls whose sender isn't the
 * editor's `webContents` (the 3D View can't reach the Library: D-3, D-12)
 * before the channel's zod schema runs. Main process only; call once, after
 * `app` is ready.
 */
/* eslint-disable no-console */
import path from "node:path";
import {
    app,
    BrowserWindow,
    dialog,
    ipcMain,
    utilityProcess,
    type IpcMainEvent,
    type IpcMainInvokeEvent,
} from "electron";
import {
    fail,
    LIBRARY_CHANGED_CHANNEL,
    LIBRARY_IMPORT_CLOSE_CHANNEL,
    LIBRARY_INVOKE_CHANNELS,
    type LibraryInvokeChannel,
} from "../../../src/view3d/library/protocol";
import {
    closeAllPdfRenderers,
    createElectronPdfRenderer,
    type PdfRenderer,
} from "../artwork-import";
import { openLibraryStore, type LibraryStore } from "../library/store";
import {
    createLibraryIpcService,
    type IpcSender,
    type LibraryIpcService,
} from "./service";
import { ImportWorkerClient, type WorkerChild } from "./worker-client";

export interface LibraryIpcConfig {
    getEditorWindow: () => BrowserWindow | null;
    getSetting: (key: string) => unknown;
    setSetting: (key: string, value: unknown) => void;
    /** `dist-electron/main/import-worker.js`. */
    workerPath: string;
    /** Defaults to `userData/library`. */
    libraryRoot?: string;
}

const LAST_FOLDER_SETTING = "libraryImportFolder";

let service: LibraryIpcService | null = null;

function senderOf(event: IpcMainInvokeEvent | IpcMainEvent): IpcSender {
    const contents = event.sender;
    return {
        id: contents.id,
        send: (channel, payload) => {
            if (!contents.isDestroyed()) contents.send(channel, payload);
        },
    };
}

export function initLibraryIpc(config: LibraryIpcConfig): LibraryIpcService {
    if (service) return service;

    const editorContents = () => {
        const editor = config.getEditorWindow();
        return editor && !editor.isDestroyed() ? editor.webContents : null;
    };
    const isEditorSender = (sender: Electron.WebContents) =>
        sender === editorContents();

    let storePromise: Promise<LibraryStore> | null = null;
    let pdfRenderer: PdfRenderer | null = null;

    const worker = new ImportWorkerClient({
        spawn: () =>
            utilityProcess.fork(config.workerPath, [], {
                serviceName: "OpenMarch import",
            }) as unknown as WorkerChild,
    });

    const created = createLibraryIpcService({
        getStore: () => {
            storePromise ??= openLibraryStore({
                root:
                    config.libraryRoot ??
                    path.join(app.getPath("userData"), "library"),
            }).catch((error: unknown) => {
                storePromise = null;
                throw error;
            });
            return storePromise;
        },
        worker,
        showOpenDialog: async (spec) => {
            const editor = config.getEditorWindow();
            const result = editor
                ? await dialog.showOpenDialog(editor, spec)
                : await dialog.showOpenDialog(spec);
            return result.canceled ? null : result.filePaths;
        },
        showSaveDialog: async (spec) => {
            const editor = config.getEditorWindow();
            const result = editor
                ? await dialog.showSaveDialog(editor, spec)
                : await dialog.showSaveDialog(spec);
            return result.canceled || !result.filePath ? null : result.filePath;
        },
        getLastFolder: () => {
            const value = config.getSetting(LAST_FOLDER_SETTING);
            return typeof value === "string" && value ? value : null;
        },
        setLastFolder: (folder) =>
            config.setSetting(LAST_FOLDER_SETTING, folder),
        pdfRenderer: () => (pdfRenderer ??= createElectronPdfRenderer()),
        sendChanged: (payload) =>
            editorContents()?.send(LIBRARY_CHANGED_CHANNEL, payload),
    });
    service = created;

    for (const channel of Object.values(
        LIBRARY_INVOKE_CHANNELS,
    ) as LibraryInvokeChannel[]) {
        const handler = created.handlers[channel];
        ipcMain.handle(channel, async (event, payload: unknown) => {
            if (!isEditorSender(event.sender)) {
                return fail(
                    "invalid-request",
                    `${channel} is only for the editor`,
                );
            }
            return handler(senderOf(event), payload);
        });
    }
    ipcMain.on(LIBRARY_IMPORT_CLOSE_CHANNEL, (event, payload: unknown) => {
        if (!isEditorSender(event.sender)) return;
        created.close(senderOf(event), payload);
    });

    app.on("before-quit", () => {
        created.dispose();
        closeAllPdfRenderers();
    });
    return created;
}

/**
 * Wires one editor window: a reload ends its sessions; closing it (C1.9
 * §11, Q56) cancels every session, closes open PDF documents (destroying
 * their hidden windows) and kills the import worker.
 */
export function watchEditorWindow(win: BrowserWindow) {
    const id = win.webContents.id;
    win.webContents.on(
        "did-start-navigation",
        (_event, _url, isInPlace, isMainFrame) => {
            // A hash or history change keeps the page, and so its sessions.
            if (isMainFrame && !isInPlace) service?.closeSender(id);
        },
    );
    win.on("closed", () => {
        service?.closeAll();
        const closed = closeAllPdfRenderers();
        if (closed) console.log(`Closed ${closed} PDF renderer window(s)`);
    });
}
