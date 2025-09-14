import AudioFile, { ModifiedAudioFileArgs } from "@/global/classes/AudioFile";
import MarcherPage from "@/global/classes/MarcherPage";
import Page from "@/global/classes/Page";
import { contextBridge, ipcRenderer, SaveDialogOptions } from "electron";
import * as DbServices from "electron/database/database.services";
import { DatabaseResponse } from "electron/database/DatabaseActions";
import {
    ModifiedShapePageMarcherArgs,
    NewShapePageMarcherArgs,
    ShapePageMarcher,
} from "electron/database/tables/ShapePageMarcherTable";
import {
    ModifiedShapePageArgs,
    NewShapePageArgs,
    ShapePage,
} from "electron/database/tables/ShapePageTable";
import {
    ModifiedShapeArgs,
    NewShapeArgs,
    Shape,
} from "electron/database/tables/ShapeTable";

import Plugin from "../../src/global/classes/Plugin";
import type { RecentFile } from "electron/main/services/recent-files-service";

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
domReady().then(appendLoading);

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
    isMacOS: process.platform === "darwin",

    // Environment
    getEnv: () => ipcRenderer.invoke("env:get"),
    isCodegen: !!process.env.PLAYWRIGHT_CODEGEN,
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
    closeCurrentFile: () => ipcRenderer.invoke("closeCurrentFile"),

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
    openRecentFile: (filePath: string) =>
        ipcRenderer.invoke("recent-files:open", filePath),

    removeFetchListener: () => ipcRenderer.removeAllListeners("fetch:all"),

    showSaveDialog: (options: SaveDialogOptions) =>
        ipcRenderer.invoke("show-save-dialog", options),

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

        generateDocForMarcher: (
            svgPages: string[],
            drillNumber: string,
            marcherCoordinates: string[],
            pages: Page[],
            showName: string,
            exportDir: string,
            individualCharts: boolean,
        ) =>
            ipcRenderer.invoke(
                "export:generateSVGsForMarcher",
                svgPages,
                drillNumber,
                marcherCoordinates,
                pages,
                showName,
                exportDir,
                individualCharts,
            ),
    },

    getCurrentFilename: () => ipcRenderer.invoke("get-current-filename"),
    openExportDirectory: (exportDir: string) =>
        ipcRenderer.invoke("open-export-directory", exportDir),

    buffer: {
        from: (data: any) => Buffer.from(data),
    },

    // History
    /** Activates on undo or redo. */
    onHistoryAction: (callback: (args: DbServices.HistoryResponse) => void) =>
        ipcRenderer.on(
            "history:action",
            (event, args: DbServices.HistoryResponse) => callback(args),
        ),
    removeHistoryActionListener: () =>
        ipcRenderer.removeAllListeners("history:action"),
    undo: () => ipcRenderer.invoke("history:undo"),
    redo: () => ipcRenderer.invoke("history:redo"),
    flattenUndoGroupsAbove: (group: number) =>
        ipcRenderer.invoke("history:flattenUndoGroupsAbove", group),
    getCurrentUndoGroup: () =>
        ipcRenderer.invoke("history:getCurrentUndoGroup") as Promise<
            DatabaseResponse<number>
        >,
    getCurrentRedoGroup: () =>
        ipcRenderer.invoke("history:getCurrentRedoGroup") as Promise<
            DatabaseResponse<number>
        >,
    getUndoStackLength: () => ipcRenderer.invoke("history:getUndoStackLength"),
    getRedoStackLength: () => ipcRenderer.invoke("history:getRedoStackLength"),

    // FieldProperties
    /** Update the FieldProperties associated with this file */
    exportFieldPropertiesFile: () =>
        ipcRenderer.invoke("field_properties:export"),
    importFieldPropertiesFile: () =>
        ipcRenderer.invoke("field_properties:import"),
    onImportFieldPropertiesFile: (callback: () => void) =>
        ipcRenderer.on("field_properties:onImport", (event) => callback()),
    removeImportFieldPropertiesFileListener: () =>
        ipcRenderer.removeAllListeners("field_properties:onImport"),

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

    /*********** SHAPES ***********/
    // Shape
    getShapes: () =>
        ipcRenderer.invoke("shape:getAll") as Promise<
            DatabaseResponse<Shape[]>
        >,
    createShapes: (newShapes: NewShapeArgs[]) =>
        ipcRenderer.invoke("shape:insert", newShapes) as Promise<
            DatabaseResponse<Shape[]>
        >,
    updateShapes: (modifiedShapes: ModifiedShapeArgs[]) =>
        ipcRenderer.invoke("shape:update", modifiedShapes) as Promise<
            DatabaseResponse<Shape[]>
        >,
    deleteShapes: (idsToDelete: Set<number>) =>
        ipcRenderer.invoke("shape:delete", idsToDelete) as Promise<
            DatabaseResponse<Shape[]>
        >,

    // ShapePage
    getShapePages: () =>
        ipcRenderer.invoke("shape_page:getAll") as Promise<
            DatabaseResponse<ShapePage[]>
        >,
    createShapePages: (newShapePages: NewShapePageArgs[]) =>
        ipcRenderer.invoke("shape_page:insert", newShapePages) as Promise<
            DatabaseResponse<ShapePage[]>
        >,
    updateShapePages: (modifiedShapePages: ModifiedShapePageArgs[]) =>
        ipcRenderer.invoke("shape_page:update", modifiedShapePages) as Promise<
            DatabaseResponse<ShapePage[]>
        >,
    deleteShapePages: (idsToDelete: Set<number>) =>
        ipcRenderer.invoke("shape_page:delete", idsToDelete) as Promise<
            DatabaseResponse<ShapePage[]>
        >,
    copyShapePageToPage: (shapePageId: number, targetPageId: number) =>
        ipcRenderer.invoke(
            "shape_page:copy",
            shapePageId,
            targetPageId,
        ) as Promise<DatabaseResponse<ShapePage[]>>,

    //ShapePageMarcher
    getShapePageMarchers: (shapePageId?: number, marcherIds?: Set<number>) =>
        ipcRenderer.invoke(
            "shape_page_marcher:get",
            shapePageId,
            marcherIds,
        ) as Promise<DatabaseResponse<ShapePageMarcher[]>>,
    getShapePageMarcherByMarcherPage: (marcherPage: {
        marcher_id: number;
        page_id: number;
    }) =>
        ipcRenderer.invoke(
            "shape_page_marcher:get_by_marcher_page",
            marcherPage,
        ) as Promise<DatabaseResponse<ShapePageMarcher[]>>,
    createShapePageMarchers: (
        newShapePageMarcherArgs: NewShapePageMarcherArgs[],
    ) =>
        ipcRenderer.invoke(
            "shape_page_marcher:insert",
            newShapePageMarcherArgs,
        ) as Promise<DatabaseResponse<ShapePageMarcher[]>>,
    updateShapePageMarchers: (
        modifiedShapePageMarcher: ModifiedShapePageMarcherArgs[],
    ) =>
        ipcRenderer.invoke(
            "shape_page_marcher:update",
            modifiedShapePageMarcher,
        ) as Promise<DatabaseResponse<ShapePageMarcher[]>>,
    deleteShapePageMarchers: (idsToDelete: Set<number>) =>
        ipcRenderer.invoke("shape_page_marcher:delete", idsToDelete) as Promise<
            DatabaseResponse<void>
        >,

    // SQL Proxy for Drizzle
    sqlProxy: (
        sql: string,
        params: any[],
        method: "all" | "run" | "get" | "values",
    ) =>
        ipcRenderer.invoke("sql:proxy", sql, params, method) as Promise<{
            rows: any[] | any;
        }>,

    // Utilities
    swapMarchers: (args: {
        pageId: number;
        marcher1Id: number;
        marcher2Id: number;
    }) =>
        ipcRenderer.invoke("utilities:swap_marchers", args) as Promise<
            DatabaseResponse<MarcherPage[]>
        >,
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
