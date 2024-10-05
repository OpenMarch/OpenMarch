import AudioFile, { ModifiedAudioFileArgs } from "@/global/classes/AudioFile";
import { FieldProperties } from "@/global/classes/FieldProperties";
import Marcher, {
    ModifiedMarcherArgs,
    NewMarcherArgs,
} from "@/global/classes/Marcher";
import MarcherPage, {
    ModifiedMarcherPageArgs,
} from "@/global/classes/MarcherPage";
import Page, {
    ModifiedPageContainer,
    NewPageContainer,
} from "@/global/classes/Page";
import { TablesWithHistory } from "@/global/Constants";
import { contextBridge, ipcRenderer } from "electron";
import { DatabaseResponse } from "electron/database/database.services";
import { isMacOS } from "../main/detectPlatform";

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
        animation: spin 1s 0s linear infinite;
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
        background: #EBEDF0;
        z-index: 9;
    }
    @media (prefers-color-scheme: dark) {
        .loader > svg {
            fill: white;
        }
        .app-loading-wrap {
            background: #0D1014;
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

const APP_API = {
    // Titlebar
    minimizeWindow: () => ipcRenderer.send("window:minimize"),
    maximizeWindow: () => ipcRenderer.send("window:maximize"),
    closeWindow: () => ipcRenderer.send("window:close"),
    isMacOS: process.platform === "darwin",

    // Database
    databaseIsReady: () => ipcRenderer.invoke("database:isReady"),
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
    sendExportIndividualCoordinateSheets: async (coordinateSheets: string[]) =>
        ipcRenderer.send("send:exportIndividual", coordinateSheets),

    // History
    /** Activates on undo or redo. */
    onHistoryAction: (
        callback: (args: {
            tableName: string;
            marcher_ids: number[];
            page_id: number;
        }) => string,
    ) => ipcRenderer.on("history:action", (event, args) => callback(args)),
    removeHistoryActionListener: () =>
        ipcRenderer.removeAllListeners("history:action"),
    undo: () => ipcRenderer.invoke("history:undo"),
    redo: () => ipcRenderer.invoke("history:redo"),

    // FieldProperties
    /** Get the FieldProperties associated with this file */
    getFieldProperties: () =>
        ipcRenderer.invoke("field_properties:get") as Promise<FieldProperties>,

    // Marcher
    /**
     * @returns A serialized array of all marchers in the database.
     * This means you must call `new Marcher(marcher)` on each marcher or else the instance methods will not work.
     */
    getMarchers: () =>
        ipcRenderer.invoke("marcher:getAll") as Promise<Marcher[]>,
    createMarcher: (newMarcher: NewMarcherArgs) =>
        ipcRenderer.invoke(
            "marcher:insert",
            newMarcher,
        ) as Promise<DatabaseResponse>,
    updateMarchers: (modifiedMarchers: ModifiedMarcherArgs[]) =>
        ipcRenderer.invoke(
            "marcher:update",
            modifiedMarchers,
        ) as Promise<DatabaseResponse>,
    deleteMarcher: (id: number) => ipcRenderer.invoke("marcher:delete", id),

    // Page
    /**
     * @returns A serialized array of all pages in the database.
     * This means you must call `new Page(page)` on each page or else the instance methods will not work.
     */
    getPages: () => ipcRenderer.invoke("page:getAll") as Promise<Page[]>,
    createPages: (pages: NewPageContainer[]) =>
        ipcRenderer.invoke("page:insert", pages) as Promise<DatabaseResponse>,
    updatePages: (
        modifiedPages: ModifiedPageContainer[],
        addToHistoryQueue?: boolean,
        updateInReverse?: boolean,
    ) =>
        ipcRenderer.invoke(
            "page:update",
            modifiedPages,
            addToHistoryQueue,
            updateInReverse,
        ) as Promise<DatabaseResponse>,
    deletePage: (id: number) =>
        ipcRenderer.invoke("page:delete", id) as Promise<DatabaseResponse>,

    // MarcherPage
    getMarcherPages: (args: { marcher_id?: number; page_id?: number }) =>
        ipcRenderer.invoke("marcher_page:getAll", args) as Promise<
            MarcherPage[]
        >,
    getMarcherPage: (id: { marcher_id: number; page_id: number }) =>
        ipcRenderer.invoke("marcher_page:get", id),
    updateMarcherPages: (args: ModifiedMarcherPageArgs[]) =>
        ipcRenderer.invoke("marcher_page:update", args),

    // Measure
    /**
     * @returns A serialized array of all measures in the database.
     * This means you must call `new Measure(measure)` on each measure or else the instance methods will not work.
     */
    getMeasuresAbcString: () =>
        ipcRenderer.invoke("measure:getAll") as Promise<string>,
    updateMeasureAbcString: (abcString: string) =>
        ipcRenderer.invoke(
            "measure:update",
            abcString,
        ) as Promise<DatabaseResponse>,
    launchImportMusicXmlFileDialogue: () =>
        ipcRenderer.invoke("measure:insert") as Promise<string | undefined>,

    // Audio File
    launchInsertAudioFileDialogue: () =>
        ipcRenderer.invoke("audio:insert") as Promise<DatabaseResponse>,
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
};

contextBridge.exposeInMainWorld("electron", APP_API);

// TODO, figure out how to send message to renderer
// const HISTORY_API = {
//   undo: () => ipcRenderer.invoke('history:undo'),
// }

export type ElectronApi = typeof APP_API;
