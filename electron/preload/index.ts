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
import AllTables from "electron/database/tables/AllTables";

function domReady(
    condition: DocumentReadyState[] = ["complete", "interactive"]
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

/**
 * https://tobiasahlin.com/spinkit
 * https://connoratherton.com/loaders
 * https://projects.lukehaas.me/css-loaders
 * https://matejkustec.github.io/SpinThatShit
 */
function useLoading() {
    const className = `loaders-css__square-spin`;
    const styleContent = `
@keyframes square-spin {
  25% { transform: perspective(100px) rotateX(180deg) rotateY(0); }
  50% { transform: perspective(100px) rotateX(180deg) rotateY(180deg); }
  75% { transform: perspective(100px) rotateX(0) rotateY(180deg); }
  100% { transform: perspective(100px) rotateX(0) rotateY(0); }
}
.${className} > div {
  animation-fill-mode: both;
  width: 50px;
  height: 50px;
  background: #fff;
  animation: square-spin 3s 0s cubic-bezier(0.09, 0.57, 0.49, 0.9) infinite;
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
  background: #282c34;
  z-index: 9;
}
    `;
    const oStyle = document.createElement("style");
    const oDiv = document.createElement("div");

    oStyle.id = "app-loading-style";
    oStyle.innerHTML = styleContent;
    oDiv.className = "app-loading-wrap";
    oDiv.innerHTML = `<div class="${className}"><div></div></div>`;

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
        }) => string
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
            newMarcher
        ) as Promise<DatabaseResponse>,
    updateMarchers: (modifiedMarchers: ModifiedMarcherArgs[]) =>
        ipcRenderer.invoke(
            "marcher:update",
            modifiedMarchers
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
        updateInReverse?: boolean
    ) =>
        ipcRenderer.invoke(
            "page:update",
            modifiedPages,
            addToHistoryQueue,
            updateInReverse
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
            abcString
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

    marcherLine: AllTables.marcherLine.ipcCrudInvokers(),
};

contextBridge.exposeInMainWorld("electron", APP_API);

export type ElectronApi = typeof APP_API;
