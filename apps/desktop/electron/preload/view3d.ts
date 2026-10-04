/**
 * Preload for the 3D View window (ADR 0002 D-3). It runs sandboxed, so it may
 * import only `electron`, and it exposes only `window.view3d`. Channel names
 * are hard-coded, like the editor's preload.
 *
 * P1.4 adds `on(channel, cb)` and `requestVenueChange(settings)`.
 */
import { contextBridge, ipcRenderer } from "electron";

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

    /** Tells the editor, through main, that the window is ready. */
    hello: () => ipcRenderer.send("view3d:hello"),
};

contextBridge.exposeInMainWorld("view3d", VIEW3D_API);

export type View3dApi = typeof VIEW3D_API;
