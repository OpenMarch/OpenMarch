import type AudioFile from "@/global/classes/AudioFile";
import type { ModifiedAudioFileArgs } from "@/global/classes/AudioFile";
import type Page from "@/global/classes/Page";
import {
    contextBridge,
    ipcRenderer,
    webFrame,
    type IpcRendererEvent,
    type SaveDialogOptions,
} from "electron";
import * as DbServices from "@om-electron/database/database.services";

import Plugin from "../../src/global/classes/Plugin";
import type { RecentFile } from "@om-electron/main/services/recent-files-service";
import type { PreviousDotsImportResult } from "@om-electron/main/services/previous-dots-import-service";
import type {
    AuthState,
    AuthError,
    LoginResult,
    LogoutResult,
    AccessTokenResult,
} from "@om-electron/main/auth/types";
import { AUTH_IPC_CHANNELS } from "../../src/global/auth/constants";
import { MENU_ACTION_CHANNEL } from "../../src/global/menuActions";
import { GPU_CRASHED_CHANNEL, GPU_PROCESS_GONE_CHANNEL } from "../main/gpu";
import type { HistoryResponse } from "@/db-functions";
import type { PendingConversion } from "@om-electron/database/convertOnOpenGate";
import type {
    SqlBatchQuery,
    SqlReadBatchResult,
} from "@om-electron/database/sqlProxy";
import type { ConvertProgress } from "@om-electron/database/convertOnOpenProtocol";
// Types only, so this preload doesn't share a chunk with the sandboxed 3D
// View preload.
import type {
    View3dPayloads,
    View3dPlaybackRequest,
    View3dPublishChannel,
    View3dVenueChangeRequest,
} from "../../src/view3d/sync/protocol";
// Types only, like the sync protocol above.
import type {
    AddFromShowRequest,
    AddVersionResultDto,
    BytesPayload,
    ImportCommitRequest,
    ImportCommitResult,
    ImportInspectRequest,
    ImportInspection,
    ImportPickRequest,
    ImportPreviewRequest,
    ImportProgress,
    ImportSession,
    LibraryChanged,
    LibraryItem,
    LibraryItemKind,
    LibraryItemSummary,
    ReadPartsRequest,
    Result,
    SizePreset,
    TemplateSaveRequest,
    ThumbnailsRequest,
    UpdateItemRequest,
} from "../../src/view3d/library/protocol";

const VIEW3D_PUBLISH_CHANNELS: readonly string[] = [
    "view3d:clock",
    "view3d:selection",
    "view3d:invalidate",
] satisfies View3dPublishChannel[];

function domReady(
    condition: DocumentReadyState[] = ["complete", "interactive"],
) {
    return new Promise((resolve) => {
        if (condition.includes(document.readyState)) {
            resolve(true);
        } else {
            document.addEventListener("readystatechange", () => {
                if (condition.includes(document.readyState)) {
                    resolve(true);
                }
            });
        }
    });
}

const safeDOM = {
    append(parent: HTMLElement, child: HTMLElement) {
        if (!Array.from(parent.children).find((e) => e === child)) {
            return parent.appendChild(child);
        }
    },
    remove(parent: HTMLElement, child: HTMLElement) {
        if (Array.from(parent.children).find((e) => e === child)) {
            return parent.removeChild(child);
        }
    },
};

function useLoading() {
    const styleContent = `
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    .loader > svg {
        width: 50px;
        height: 50px;
        fill: black;
        animation: spin 700ms linear infinite;
    }
    .app-loading-wrap {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #ECEBF0;
        z-index: 9;
    }
    @media (prefers-color-scheme: dark) {
        .loader > svg {
            fill: white;
        }
        .app-loading-wrap {
            background: #0F0E13;
        }
    }
    `;
    const oStyle = document.createElement("style");
    const oDiv = document.createElement("div");

    oStyle.id = "app-loading-style";
    oStyle.innerHTML = styleContent;
    oDiv.className = "app-loading-wrap";
    oDiv.innerHTML = `<div class="loader"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 256 256"><path d="M232,128a104,104,0,0,1-208,0c0-41,23.81-78.36,60.66-95.27a8,8,0,0,1,6.68,14.54C60.15,61.59,40,93.27,40,128a88,88,0,0,0,176,0c0-34.73-20.15-66.41-51.34-80.73a8,8,0,0,1,6.68-14.54C208.19,49.64,232,87,232,128Z"></path></svg></div>`;

    return {
        appendLoading() {
            safeDOM.append(document.head, oStyle);
            safeDOM.append(document.body, oDiv);
        },
        removeLoading() {
            safeDOM.remove(document.head, oStyle);
            safeDOM.remove(document.body, oDiv);
        },
    };
}
// ----------------------------------------------------------------------

// eslint-disable-next-line react-hooks/rules-of-hooks
const { appendLoading, removeLoading } = useLoading();
void domReady().then(appendLoading);

window.onmessage = (ev) => {
    ev.data.payload === "removeLoading" && removeLoading();
};

setTimeout(removeLoading, 4999);

// ----------------------------------------------------------------------

/**
 *  The APP_API is how the renderer process (react) communicates with Electron.
 *  Everything implemented here must be done hard-coded and cannot be dynamically imported (I tried)
 *
 *  I.e. you must type `marchers:readAll` rather than `${table_name}:readAll` for the channel
 */
const APP_API = {
    // Titlebar
    minimizeWindow: () => ipcRenderer.send("window:minimize"),
    maximizeWindow: () => ipcRenderer.send("window:maximize"),
    closeWindow: () => ipcRenderer.send("window:close"),
    openMenu: () => ipcRenderer.send("menu:open"),
    openSettingsWindow: () => ipcRenderer.invoke("settings:open"),
    reloadMainWindow: () => ipcRenderer.send("main-window:reload"),
    onSettingsChanged: (
        callback: (change: Record<string, unknown>) => void,
    ) => {
        const listener = (
            _event: Electron.IpcRendererEvent,
            change: Record<string, unknown>,
        ) => callback(change);
        ipcRenderer.on("settings:changed", listener);
        return () => ipcRenderer.removeListener("settings:changed", listener);
    },
    /** Whether the GPU process crashed this session (ADR 0005 D-3) */
    gpuCrashed: () =>
        ipcRenderer.invoke(GPU_CRASHED_CHANNEL) as Promise<boolean>,
    /** Calls `callback` when the GPU process crashes; returns the unsubscribe */
    onGpuCrashed: (callback: () => void) => {
        const listener = () => callback();
        ipcRenderer.on(GPU_PROCESS_GONE_CHANNEL, listener);
        return () =>
            ipcRenderer.removeListener(GPU_PROCESS_GONE_CHANNEL, listener);
    },
    isMacOS: process.platform === "darwin",
    /** Page zoom (View → Zoom In/Out), so native-sized UI can undo it. */
    getZoomFactor: () => webFrame.getZoomFactor(),

    // Environment
    getEnv: () => ipcRenderer.invoke("env:get"),
    isCodegen: !!process.env.PLAYWRIGHT_CODEGEN,
    isPlaywrightSession: !!process.env.PLAYWRIGHT_SESSION,
    codegen: {
        clearMouseActions: () =>
            ipcRenderer.invoke("codegen:clear-mouse-actions"),
        addMouseAction: (action: string) =>
            ipcRenderer.send("codegen:add-mouse-action", action),
    },

    // Themes
    getTheme: () => ipcRenderer.invoke("get-theme"),
    setTheme: (theme: string) => ipcRenderer.invoke("set-theme", theme),

    // Language
    getLanguage: () => ipcRenderer.invoke("get-language"),
    setLanguage: (language: string) =>
        ipcRenderer.invoke("set-language", language),

    // Settings
    send: (channel: string, ...args: any[]) => {
        ipcRenderer.send(channel, ...args);
    },
    invoke: (channel: string, ...args: any[]) => {
        return ipcRenderer.invoke(channel, ...args);
    },

    // Database / file management
    databaseIsReady: () => ipcRenderer.invoke("database:isReady"),
    databaseGetPath: () => ipcRenderer.invoke("database:getPath"),
    databaseSave: () => ipcRenderer.invoke("database:save"),
    databaseLoad: () => ipcRenderer.invoke("database:load"),
    databaseCreate: () => ipcRenderer.invoke("database:create"),
    databaseCreateAtPath: (filePath: string) =>
        ipcRenderer.invoke("database:createAtPath", filePath),
    getDefaultDocumentsPath: () =>
        ipcRenderer.invoke("getDefaultDocumentsPath") as Promise<string>,
    fileExists: (filePath: string) =>
        ipcRenderer.invoke("file:exists", filePath) as Promise<boolean>,
    /**
     * Repairs the file and opens the repaired copy. Resolves its path, or null when it didn't
     * open and the main process already showed a dialog saying why (convert on open, P9.3).
     */
    repairDatabase: (dbPath: string): Promise<string | null> =>
        ipcRenderer.invoke("database:repair", dbPath),
    closeCurrentFile: () => ipcRenderer.invoke("closeCurrentFile"),
    onLoadFileResponse: (callback: (value: number) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, value: number) =>
            callback(value);
        ipcRenderer.on("load-file-response", listener);
        return () => ipcRenderer.removeListener("load-file-response", listener);
    },
    /**
     * The status of a refused open that closed the show that was open and reloaded the window
     * to the launch page, or null. Taking it clears it.
     */
    takeLoadFileRefusal: () =>
        ipcRenderer.invoke("load-file:takeRefusal") as Promise<number | null>,

    // Converting a page-era show to timelines when it opens (ADR 0001 §6)
    /** The page-era file waiting for the person to agree to convert it, or null. */
    getPendingConversion: () =>
        ipcRenderer.invoke(
            "conversion:getPending",
        ) as Promise<PendingConversion | null>,
    /**
     * Closes the show that is open, then backs up, converts and opens the pending file. Resolves
     * the open's status (200 when it opened); the window reloads either way, and the main
     * process explains failures.
     */
    confirmConversion: () =>
        ipcRenderer.invoke("conversion:confirm") as Promise<number>,
    /** Forgets the pending file without writing to it; the show that is open stays open. */
    cancelConversion: () =>
        ipcRenderer.invoke("conversion:cancel") as Promise<void>,
    /**
     * Calls `callback` when the main process asks about another file, or forgets the question
     * (null) because another file opened or the show closed. Returns an unsubscribe.
     */
    onPendingConversion: (
        callback: (pending: PendingConversion | null) => void,
    ) => {
        const listener = (
            _event: Electron.IpcRendererEvent,
            pending: PendingConversion | null,
        ) => callback(pending);
        ipcRenderer.on("conversion:pending", listener);
        return () => {
            ipcRenderer.removeListener("conversion:pending", listener);
        };
    },
    /** Calls `callback` with the conversion's progress while it runs. Returns an unsubscribe. */
    onConversionProgress: (callback: (progress: ConvertProgress) => void) => {
        const listener = (
            _event: Electron.IpcRendererEvent,
            progress: ConvertProgress,
        ) => callback(progress);
        ipcRenderer.on("conversion:progress", listener);
        return () => {
            ipcRenderer.removeListener("conversion:progress", listener);
        };
    },

    // SVG Generation
    onGetSvgForClose: (callback: () => Promise<string>) => {
        ipcRenderer.on("get-svg-on-close", async (event, requestId) => {
            const result = await callback();
            ipcRenderer.send(`get-svg-response-${requestId}`, result);
        });
    },

    // Recent files
    getRecentFiles: () =>
        ipcRenderer.invoke("recent-files:get") as Promise<RecentFile[]>,
    removeRecentFile: (filePath: string) =>
        ipcRenderer.invoke("recent-files:remove", filePath),
    clearRecentFiles: () => ipcRenderer.invoke("recent-files:clear"),
    clearMissingRecentFiles: () =>
        ipcRenderer.invoke("recent-files:clear-missing"),
    openRecentFile: (filePath: string) =>
        ipcRenderer.invoke("recent-files:open", filePath),

    removeFetchListener: () => ipcRenderer.removeAllListeners("fetch:all"),

    showSaveDialog: (options: SaveDialogOptions) =>
        ipcRenderer.invoke("dialog:showSaveDialog", options),

    getPendingNewShowDialog: () =>
        ipcRenderer.invoke("newShow:getPending") as Promise<boolean>,
    clearPendingNewShowDialog: () =>
        ipcRenderer.invoke("newShow:clearPending") as Promise<void>,
    /** An app menu item chose a renderer action (docs/adr/0003-menu-actions-ipc.md) */
    onMenuAction: (callback: (action: unknown) => void) => {
        const listener = (_event: unknown, action: unknown) => callback(action);
        ipcRenderer.on(MENU_ACTION_CHANNEL, listener);
        return () => {
            ipcRenderer.removeListener(MENU_ACTION_CHANNEL, listener);
        };
    },
    onNewShowOpen: (callback: () => void) => {
        const listener = () => callback();
        ipcRenderer.on("new-show:open", listener);
        return () => {
            ipcRenderer.removeListener("new-show:open", listener);
        };
    },
    createNewShowDraft: () =>
        ipcRenderer.invoke("newShow:createDraft") as Promise<
            { path: string } | number
        >,
    finalizeNewShowDraft: (targetPath: string, projectName: string) =>
        ipcRenderer.invoke(
            "newShow:finalizeDraft",
            targetPath,
            projectName,
        ) as Promise<number>,
    discardNewShowDraft: () =>
        ipcRenderer.invoke("newShow:discardDraft") as Promise<number>,
    getNewShowDraftPath: () =>
        ipcRenderer.invoke("newShow:getDraftPath") as Promise<string | null>,
    choosePreviousDotsFile: () =>
        ipcRenderer.invoke(
            "newShow:choosePreviousDotsFile",
        ) as Promise<PreviousDotsImportResult | null>,

    export: {
        pdf: (params: {
            sheets: Array<{
                name: string;
                section: string;
                renderedPage: string;
            }>;
            organizeBySection: boolean;
            quarterPages: boolean;
        }) => ipcRenderer.invoke("export:pdf", params),

        createExportDirectory: (defaultName: string) =>
            ipcRenderer.invoke("export:createExportDirectory", defaultName),

        generateDocForMarcher: (args: {
            svgPages: string[];
            drillNumber: string;
            marcherCoordinates: string[];
            pages: Page[];
            showName: string;
            exportDir: string;
            individualCharts: boolean;
            notesAppendixPages?: { pageName: string; notes: string }[];
        }) => ipcRenderer.invoke("export:generateDocForMarcher", args),

        videoStart: (
            fileExtension: string,
        ): Promise<{ sessionId: string; filePath: string } | null> =>
            ipcRenderer.invoke("export:videoStart", fileExtension),
        videoChunk: (
            sessionId: string,
            data: Uint8Array,
            position: number,
        ): Promise<void> =>
            ipcRenderer.invoke("export:videoChunk", sessionId, data, position),
        videoEnd: (
            sessionId: string,
            success: boolean,
        ): Promise<string | null> =>
            ipcRenderer.invoke("export:videoEnd", sessionId, success),
    },

    getCurrentFilename: () => ipcRenderer.invoke("get-current-filename"),
    openExportDirectory: (exportDir: string) =>
        ipcRenderer.invoke("open-export-directory", exportDir),

    buffer: {
        from: (data: any) => Buffer.from(data),
    },

    // 3D View
    /**
     * Opens the 3D View window, or focuses it. With `background`, it opens
     * without taking focus and leaves an open window alone. Resolves false
     * when no show is open.
     */
    openView3d: (options?: { background?: boolean }) =>
        ipcRenderer.invoke("view3d:open", options) as Promise<boolean>,
    /** Sends a clock, selection or invalidate to the 3D View, through main. */
    publishToView3d: <C extends View3dPublishChannel>(
        channel: C,
        payload: View3dPayloads[C],
    ) => {
        if (!VIEW3D_PUBLISH_CHANNELS.includes(channel))
            throw new Error(`Unknown 3D View channel ${String(channel)}`);
        ipcRenderer.send(channel, payload);
    },
    /** Main says whether a 3D View window is open. Returns an unsubscribe function. */
    onView3dWindowState: (callback: (open: boolean) => void) => {
        const listener = (_event: IpcRendererEvent, open: boolean) =>
            callback(open === true);
        ipcRenderer.on("view3d:window-state", listener);
        return () => {
            ipcRenderer.removeListener("view3d:window-state", listener);
        };
    },
    /** The 3D View window is ready for a fresh clock and selection. */
    onView3dHello: (callback: () => void) => {
        const listener = () => callback();
        ipcRenderer.on("view3d:hello", listener);
        return () => {
            ipcRenderer.removeListener("view3d:hello", listener);
        };
    },
    /** The 3D View asks for new venue settings. The payload is unchecked. */
    onView3dVenueChangeRequest: (
        callback: (request: View3dVenueChangeRequest) => void,
    ) => {
        const listener = (
            _event: IpcRendererEvent,
            request: View3dVenueChangeRequest,
        ) => callback(request);
        ipcRenderer.on("view3d:venue-change-request", listener);
        return () => {
            ipcRenderer.removeListener("view3d:venue-change-request", listener);
        };
    },
    /** The 3D View asks for a playback action. The payload is unchecked. */
    onView3dPlaybackRequest: (
        callback: (request: View3dPlaybackRequest) => void,
    ) => {
        const listener = (
            _event: IpcRendererEvent,
            request: View3dPlaybackRequest,
        ) => callback(request);
        ipcRenderer.on("view3d:playback-request", listener);
        return () => {
            ipcRenderer.removeListener("view3d:playback-request", listener);
        };
    },

    // Library and import (C1.9, ADR 0002 D-13). Main checks the sender and
    // validates every payload; each invoke answers a `Result`.
    library: {
        importPick: (request: ImportPickRequest) =>
            ipcRenderer.invoke("library:import-pick", request) as Promise<
                Result<ImportSession | null>
            >,
        importInspect: (request: ImportInspectRequest) =>
            ipcRenderer.invoke("library:import-inspect", request) as Promise<
                Result<ImportInspection>
            >,
        importPreview: (request: ImportPreviewRequest) =>
            ipcRenderer.invoke("library:import-preview", request) as Promise<
                Result<BytesPayload>
            >,
        importCommit: (request: ImportCommitRequest) =>
            ipcRenderer.invoke("library:import-commit", request) as Promise<
                Result<ImportCommitResult>
            >,
        importCancel: (request: { sessionId: string; fileId?: string }) =>
            ipcRenderer.invoke("library:import-cancel", request) as Promise<
                Result<void>
            >,
        /** Frees the session's bytes in main. */
        importClose: (request: { sessionId: string }) =>
            ipcRenderer.send("library:import-close", request),
        /** Returns an unsubscribe function. */
        onImportProgress: (callback: (progress: ImportProgress) => void) => {
            const listener = (
                _event: IpcRendererEvent,
                progress: ImportProgress,
            ) => callback(progress);
            ipcRenderer.on("library:import-progress", listener);
            return () => {
                ipcRenderer.removeListener("library:import-progress", listener);
            };
        },
        list: (request: { kind?: LibraryItemKind } = {}) =>
            ipcRenderer.invoke("library:list", request) as Promise<
                Result<LibraryItemSummary[]>
            >,
        get: (request: { itemId: string }) =>
            ipcRenderer.invoke("library:get", request) as Promise<
                Result<LibraryItem | null>
            >,
        readParts: (request: ReadPartsRequest) =>
            ipcRenderer.invoke("library:read-parts", request) as Promise<
                Result<Record<string, Uint8Array>>
            >,
        thumbnails: (request: ThumbnailsRequest) =>
            ipcRenderer.invoke("library:thumbnails", request) as Promise<
                Result<(BytesPayload | null)[]>
            >,
        updateItem: (request: UpdateItemRequest) =>
            ipcRenderer.invoke("library:update-item", request) as Promise<
                Result<LibraryItem>
            >,
        deleteItem: (request: { itemId: string }) =>
            ipcRenderer.invoke("library:delete-item", request) as Promise<
                Result<void>
            >,
        addFromShow: (request: AddFromShowRequest) =>
            ipcRenderer.invoke("library:add-from-show", request) as Promise<
                Result<AddVersionResultDto>
            >,
        sizePresets: () =>
            ipcRenderer.invoke("library:size-presets") as Promise<
                Result<SizePreset[]>
            >,
        sizePresetSave: (request: {
            id?: string;
            name: string;
            data: SizePreset["data"];
        }) =>
            ipcRenderer.invoke("library:size-preset-save", request) as Promise<
                Result<SizePreset>
            >,
        sizePresetDelete: (request: { id: string }) =>
            ipcRenderer.invoke(
                "library:size-preset-delete",
                request,
            ) as Promise<Result<void>>,
        templateSave: (request: TemplateSaveRequest) =>
            ipcRenderer.invoke("library:template-save", request) as Promise<
                Result<{ filename: string } | null>
            >,
        /** After every Library write. Returns an unsubscribe function. */
        onChanged: (callback: (changed: LibraryChanged) => void) => {
            const listener = (
                _event: IpcRendererEvent,
                changed: LibraryChanged,
            ) => callback(changed);
            ipcRenderer.on("library:changed", listener);
            return () => {
                ipcRenderer.removeListener("library:changed", listener);
            };
        },
    },

    // History
    /** Activates on undo or redo. */
    onHistoryAction: (callback: (args: HistoryResponse) => void) =>
        ipcRenderer.on("history:action", (event, args: HistoryResponse) =>
            callback(args),
        ),
    removeHistoryActionListener: () =>
        ipcRenderer.removeAllListeners("history:action"),
    undo: () => ipcRenderer.invoke("history:undo"),
    redo: () => ipcRenderer.invoke("history:redo"),
    flattenUndoGroupsAbove: (group: number) =>
        ipcRenderer.invoke("history:flattenUndoGroupsAbove", group),
    getUndoStackLength: () => ipcRenderer.invoke("history:getUndoStackLength"),
    getRedoStackLength: () => ipcRenderer.invoke("history:getRedoStackLength"),

    // **** Timing Objects ****

    // Audio File
    launchInsertAudioFileDialogue: () =>
        ipcRenderer.invoke("audio:insert") as Promise<
            DbServices.LegacyDatabaseResponse<AudioFile[]>
        >,
    getAudioFilesDetails: () =>
        ipcRenderer.invoke("audio:getAll") as Promise<AudioFile[]>,
    getSelectedAudioFile: () =>
        ipcRenderer.invoke("audio:getSelected") as Promise<AudioFile>,
    setSelectedAudioFile: (audioFileId: number) =>
        ipcRenderer.invoke("audio:select", audioFileId) as Promise<AudioFile>,
    updateAudioFiles: (modifiedAudioFileArgs: ModifiedAudioFileArgs[]) =>
        ipcRenderer.invoke("audio:update", modifiedAudioFileArgs) as Promise<
            AudioFile[]
        >,
    deleteAudioFile: (audioFileId: number) =>
        ipcRenderer.invoke(
            "audio:delete",
            audioFileId,
        ) as Promise<AudioFile | null>,

    // SQL Proxy for Drizzle
    sqlProxy: (
        sql: string,
        params: any[],
        method: "all" | "run" | "get" | "values",
    ) =>
        ipcRenderer.invoke("sql:proxy", sql, params, method) as Promise<{
            rows: any[] | any;
        }>,
    /**
     * Runs read-only statements as one consistent snapshot (#224). `busy` means a transaction was
     * open on the connection and nothing ran: try again.
     */
    sqlReadBatch: (queries: SqlBatchQuery[]) =>
        ipcRenderer.invoke(
            "sql:read-batch",
            queries,
        ) as Promise<SqlReadBatchResult>,
    /** Only needed for the triggers */
    unsafeSqlProxy: (sql: string) =>
        ipcRenderer.invoke("unsafeSql:proxy", sql) as Promise<{
            success: boolean;
            changes: number;
        }>,

    // Logging
    log: (
        level: "log" | "info" | "warn" | "error",
        message: string,
        ...args: any[]
    ) => ipcRenderer.invoke("log:print", level, message, ...args),

    // Shell
    openExternal: (url: string) =>
        ipcRenderer.invoke("shell:openExternal", url),
    // Authentication
    auth: {
        /** Initiates OAuth login flow - opens browser to Clerk */
        login: () =>
            ipcRenderer.invoke(AUTH_IPC_CHANNELS.LOGIN) as Promise<LoginResult>,

        /** Logs out and clears all tokens */
        logout: () =>
            ipcRenderer.invoke(
                AUTH_IPC_CHANNELS.LOGOUT,
            ) as Promise<LogoutResult>,

        /** Gets the current authentication state */
        getState: () =>
            ipcRenderer.invoke(
                AUTH_IPC_CHANNELS.GET_STATE,
            ) as Promise<AuthState>,

        /** Gets a valid access token (auto-refreshes if needed) */
        getAccessToken: () =>
            ipcRenderer.invoke(
                AUTH_IPC_CHANNELS.GET_ACCESS_TOKEN,
            ) as Promise<AccessTokenResult>,

        /** Subscribes to auth state changes */
        onStateChanged: (callback: (state: AuthState) => void) => {
            const handler = (_event: IpcRendererEvent, state: AuthState) =>
                callback(state);
            ipcRenderer.on(AUTH_IPC_CHANNELS.STATE_CHANGED, handler);
            return () =>
                ipcRenderer.removeListener(
                    AUTH_IPC_CHANNELS.STATE_CHANGED,
                    handler,
                );
        },

        /** Subscribes to auth errors */
        onError: (callback: (error: AuthError) => void) => {
            const handler = (_event: IpcRendererEvent, error: AuthError) =>
                callback(error);
            ipcRenderer.on(AUTH_IPC_CHANNELS.ERROR, handler);
            return () =>
                ipcRenderer.removeListener(AUTH_IPC_CHANNELS.ERROR, handler);
        },
    },
};

contextBridge.exposeInMainWorld("electron", APP_API);

const PLUGINS_API = {
    list: () => ipcRenderer.invoke("plugins:list") as Promise<string[]>,
    get: (pluginPath: string) =>
        ipcRenderer.invoke("plugins:get", pluginPath) as Promise<string>,
    plugins: () => Plugin.getPlugins(),
    install: (pluginUrl: string) =>
        ipcRenderer.invoke("plugins:install", pluginUrl) as Promise<boolean>,
    uninstall: (file: string) =>
        ipcRenderer.invoke("plugins:uninstall", file) as Promise<boolean>,
};

contextBridge.exposeInMainWorld("plugins", PLUGINS_API);

export type ElectronApi = typeof APP_API;
export type PluginsApi = typeof PLUGINS_API;
