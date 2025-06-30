import AudioFile, { ModifiedAudioFileArgs } from "@/global/classes/AudioFile";
import FieldProperties from "@/global/classes/FieldProperties";
import {
    DatabaseMarcher,
    ModifiedMarcherArgs,
    NewMarcherArgs,
} from "@/global/classes/Marcher";
import MarcherPage, {
    ModifiedMarcherPageArgs,
} from "@/global/classes/MarcherPage";
import { TablesWithHistory } from "@/global/Constants";
import { contextBridge, ipcRenderer, SaveDialogOptions } from "electron";
import * as DbServices from "electron/database/database.services";
import { DatabaseResponse } from "electron/database/DatabaseActions";
import {
    DatabaseBeat,
    NewBeatArgs,
    ModifiedBeatArgs,
} from "electron/database/tables/BeatTable";
import {
    DatabaseMeasure,
    NewMeasureArgs,
    ModifiedMeasureArgs,
} from "electron/database/tables/MeasureTable";
import {
    DatabasePage,
    ModifiedPageArgs,
    NewPageArgs,
} from "electron/database/tables/PageTable";
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

import {
    UtilityRecord,
    ModifiedUtilityRecord,
} from "electron/database/tables/UtilityTable";

import Plugin from "../../src/global/classes/Plugin";

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

    // Themes
    getTheme: () => ipcRenderer.invoke("get-theme"),
    setTheme: (theme: string) => ipcRenderer.invoke("set-theme", theme),

    // Settings
    send: (channel: string, ...args: any[]) => {
        ipcRenderer.send(channel, ...args);
    },
    getShowWaveform: () => ipcRenderer.invoke("get:showWaveform"),
    setShowWaveform: (showWaveform: boolean) =>
        ipcRenderer.invoke("set:showWaveform", showWaveform),

    // Database
    databaseIsReady: () => ipcRenderer.invoke("database:isReady"),
    databaseGetPath: () => ipcRenderer.invoke("database:getPath"),
    databaseSave: () => ipcRenderer.invoke("database:save"),
    databaseLoad: () => ipcRenderer.invoke("database:load"),
    databaseCreate: () => ipcRenderer.invoke("database:create"),

    // Triggers
    onFetch: (callback: (type: (typeof TablesWithHistory)[number]) => void) =>
        ipcRenderer.on("fetch:all", (event, type) => callback(type)),
    removeFetchListener: () => ipcRenderer.removeAllListeners("fetch:all"),
    sendSelectedPage: (selectedPageId: number) =>
        ipcRenderer.send("send:selectedPage", selectedPageId),
    sendSelectedMarchers: (selectedMarchersId: number[]) =>
        ipcRenderer.send("send:selectedMarchers", selectedMarchersId),
    sendLockX: (lockX: boolean) => ipcRenderer.send("send:lockX", lockX),
    sendLockY: (lockY: boolean) => ipcRenderer.send("send:lockY", lockY),
    sendShowWaveform: (showWaveform: boolean) =>
        ipcRenderer.send("send:showWaveform", showWaveform),
    showSaveDialog: (options: SaveDialogOptions) =>
        ipcRenderer.invoke("show-save-dialog", options),

    getCurrentFilename: () => ipcRenderer.invoke("get-current-filename"),

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
        svgPagesToPdf: (svgPages: string[], options: { fileName: string }) =>
            ipcRenderer.invoke("export:svgPagesToPdf", svgPages, options),
    },

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
    /** Get the FieldProperties associated with this file */
    getFieldProperties: () =>
        ipcRenderer.invoke("field_properties:get") as Promise<
            DatabaseResponse<FieldProperties>
        >,
    /** Update the FieldProperties associated with this file */
    updateFieldProperties: (newFieldProperties: FieldProperties) =>
        ipcRenderer.invoke(
            "field_properties:update",
            newFieldProperties,
        ) as Promise<DatabaseResponse<FieldProperties | null>>,
    exportFieldPropertiesFile: () =>
        ipcRenderer.invoke("field_properties:export"),
    importFieldPropertiesFile: () =>
        ipcRenderer.invoke("field_properties:import"),
    importFieldPropertiesImage: () =>
        ipcRenderer.invoke("field_properties:import_image"),
    getFieldPropertiesImage: () =>
        ipcRenderer.invoke("field_properties:get_image") as Promise<
            DatabaseResponse<Buffer | null>
        >,

    onImportFieldPropertiesFile: (callback: () => void) =>
        ipcRenderer.on("field_properties:onImport", (event) => callback()),
    removeImportFieldPropertiesFileListener: () =>
        ipcRenderer.removeAllListeners("field_properties:onImport"),

    // Marcher
    /**
     * @returns A serialized array of all marchers in the database.
     * This means you must call `new Marcher(marcher)` on each marcher or else the instance methods will not work.
     */
    getMarchers: () =>
        ipcRenderer.invoke("marcher:getAll") as Promise<
            DatabaseResponse<DatabaseMarcher[]>
        >,
    createMarchers: (newMarchers: NewMarcherArgs[]) =>
        ipcRenderer.invoke("marcher:insert", newMarchers) as Promise<
            DatabaseResponse<DatabaseMarcher[]>
        >,
    updateMarchers: (modifiedMarchers: ModifiedMarcherArgs[]) =>
        ipcRenderer.invoke("marcher:update", modifiedMarchers) as Promise<
            DatabaseResponse<DatabaseMarcher[]>
        >,
    deleteMarchers: (marcherIds: Set<number>) =>
        ipcRenderer.invoke("marcher:delete", marcherIds) as Promise<
            DatabaseResponse<DatabaseMarcher[]>
        >,

    // MarcherPage
    getMarcherPages: (args: { marcher_id?: number; page_id?: number }) =>
        ipcRenderer.invoke("marcher_page:getAll", args) as Promise<
            DatabaseResponse<MarcherPage[]>
        >,
    getMarcherPage: (id: { marcher_id: number; page_id: number }) =>
        ipcRenderer.invoke("marcher_page:get", id) as Promise<
            DatabaseResponse<MarcherPage>
        >,
    updateMarcherPages: (args: ModifiedMarcherPageArgs[]) =>
        ipcRenderer.invoke("marcher_page:update", args) as Promise<
            DatabaseResponse<MarcherPage>
        >,

    // **** Timing Objects ****

    // Page
    getPages: () =>
        ipcRenderer.invoke("page:getAll") as Promise<
            DatabaseResponse<DatabasePage[]>
        >,
    createPages: (pages: NewPageArgs[]) =>
        ipcRenderer.invoke("page:insert", pages) as Promise<
            DatabaseResponse<DatabasePage[]>
        >,
    updatePages: (
        modifiedPages: ModifiedPageArgs[],
        addToHistoryQueue?: boolean,
        updateInReverse?: boolean,
    ) =>
        ipcRenderer.invoke(
            "page:update",
            modifiedPages,
            addToHistoryQueue,
            updateInReverse,
        ) as Promise<DatabaseResponse<DatabasePage[]>>,
    deletePages: (pageIds: Set<number>) =>
        ipcRenderer.invoke("page:delete", pageIds) as Promise<
            DatabaseResponse<DatabasePage[]>
        >,

    // Beat
    getBeats: () =>
        ipcRenderer.invoke("beat:getAll") as Promise<
            DatabaseResponse<DatabaseBeat[]>
        >,
    createBeats: (newBeats: NewBeatArgs[], startingPosition?: number) =>
        ipcRenderer.invoke(
            "beat:insert",
            newBeats,
            startingPosition,
        ) as Promise<DatabaseResponse<DatabaseBeat[]>>,
    updateBeats: (modifiedBeats: ModifiedBeatArgs[]) =>
        ipcRenderer.invoke("beat:update", modifiedBeats) as Promise<
            DatabaseResponse<DatabaseBeat[]>
        >,
    deleteBeats: (beatIds: Set<number>) =>
        ipcRenderer.invoke("beat:delete", beatIds) as Promise<
            DatabaseResponse<DatabaseBeat[]>
        >,

    // Measure
    getMeasures: () =>
        ipcRenderer.invoke("measure:getAll") as Promise<
            DatabaseResponse<DatabaseMeasure[]>
        >,
    createMeasures: (newMeasures: NewMeasureArgs[]) =>
        ipcRenderer.invoke("measure:insert", newMeasures) as Promise<
            DatabaseResponse<DatabaseMeasure[]>
        >,
    updateMeasures: (modifiedMeasures: ModifiedMeasureArgs[]) =>
        ipcRenderer.invoke("measure:update", modifiedMeasures) as Promise<
            DatabaseResponse<DatabaseMeasure[]>
        >,
    deleteMeasures: (measureIds: Set<number>) =>
        ipcRenderer.invoke("measure:delete", measureIds) as Promise<
            DatabaseResponse<DatabaseMeasure[]>
        >,

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
        ipcRenderer.invoke("audio:delete", audioFileId) as Promise<AudioFile[]>,

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
    getUtilityRecord: () =>
        ipcRenderer.invoke("utility:getRecord") as Promise<
            DatabaseResponse<UtilityRecord | null>
        >,
    updateUtilityRecord: (
        utilityRecord: ModifiedUtilityRecord,
        useNextUndoGroup: boolean = true,
    ) =>
        ipcRenderer.invoke(
            "utility:updateRecord",
            utilityRecord,
            useNextUndoGroup,
        ) as Promise<DatabaseResponse<UtilityRecord>>,

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
