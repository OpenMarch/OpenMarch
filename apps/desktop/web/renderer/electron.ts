/**
 * Stands in for the `electron` module when the real preload script
 * (`electron/preload/index.ts`) is bundled for the web build. Every
 * `window.electron` member is the app's own code; only the transport
 * differs (see `./ipc.ts`).
 */
export { ipcRenderer } from "./ipc";

export const contextBridge = {
    exposeInMainWorld(key: string, api: unknown) {
        (window as unknown as Record<string, unknown>)[key] = api;
    },
};

/** The browser's zoom is outside the page's control, so the page's own zoom is 1. */
export const webFrame = { getZoomFactor: () => 1 };

export type IpcRendererEvent = unknown;
export type SaveDialogOptions = Record<string, unknown>;
