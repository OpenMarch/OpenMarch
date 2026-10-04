/**
 * Preload for the 3D View window (ADR 0002 D-3). It runs sandboxed, so it may
 * import only `electron`, and it exposes only `window.view3d`. Channel names
 * are hard-coded, like the editor's preload.
 */
import { contextBridge, ipcRenderer } from "electron";
// Types only: a value import would be split into a chunk shared with the
// editor's preload, which a sandboxed preload can't `require`.
import type {
    View3dPayloads,
    View3dPublishChannel,
    View3dVenueChangeRequest,
} from "../../src/view3d/sync/protocol";

const PUBLISH_CHANNELS: readonly View3dPublishChannel[] = [
    "view3d:clock",
    "view3d:selection",
    "view3d:invalidate",
];

const isPublishChannel = (channel: unknown): channel is View3dPublishChannel =>
    (PUBLISH_CHANNELS as readonly unknown[]).includes(channel);

const VIEW3D_API = {
    isMacOS: process.platform === "darwin",

    /**
     * Read-only proxy for the window's Drizzle instance. Main rejects any
     * statement that doesn't start with `SELECT` or `WITH`, and the `run`
     * method.
     */
    sqlRead: (
        sql: string,
        params: unknown[],
        method: "all" | "run" | "get" | "values",
    ) =>
        ipcRenderer.invoke("view3d:sql-read", sql, params, method) as Promise<{
            rows: any[] | any;
        }>,

    /**
     * Tells the editor, through main, that the window is ready. The editor
     * answers with a fresh clock and selection, so subscribe with `on` first.
     */
    hello: () => ipcRenderer.send("view3d:hello"),

    /**
     * Listens to what the editor publishes: `view3d:clock`,
     * `view3d:selection` and `view3d:invalidate`. Payloads arrive unchecked.
     *
     * @returns a function that removes the listener.
     */
    on: <C extends View3dPublishChannel>(
        channel: C,
        callback: (payload: View3dPayloads[C]) => void,
    ): (() => void) => {
        if (!isPublishChannel(channel)) {
            throw new Error(`3D View: unknown channel ${String(channel)}`);
        }
        const listener = (
            _event: Electron.IpcRendererEvent,
            payload: View3dPayloads[C],
        ) => callback(payload);
        ipcRenderer.on(channel, listener);
        return () => {
            ipcRenderer.removeListener(channel, listener);
        };
    },

    /**
     * Asks the editor to store new venue settings. The editor validates them,
     * writes them with history, and then invalidates the venue query.
     */
    requestVenueChange: (settings: unknown) =>
        ipcRenderer.send("view3d:venue-change-request", {
            settings,
        } satisfies View3dVenueChangeRequest),
};

contextBridge.exposeInMainWorld("view3d", VIEW3D_API);

export type View3dApi = typeof VIEW3D_API;
