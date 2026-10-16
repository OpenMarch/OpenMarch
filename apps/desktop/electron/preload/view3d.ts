/**
 * Preload for the 3D View window (ADR 0002 D-3). It runs sandboxed, so it may
 * import only `electron`, and it exposes only `window.view3d`. Channel names
 * are hard-coded, like the editor's preload.
 */
import { contextBridge, ipcRenderer } from "electron";
// Types only: a value import would be split into a chunk shared with the
// editor's preload, which a sandboxed preload can't `require`.
import type {
    View3dCameraProfileSave,
    View3dPayloads,
    View3dPlaybackAction,
    View3dPlaybackRequest,
    View3dPublishChannel,
    View3dVenueChangeRequest,
} from "../../src/view3d/sync/protocol";
import type { SqlBatchQuery, SqlReadBatchResult } from "../database/sqlProxy";
import type { CameraProfile } from "../../src/view3d/core/cameraList";

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
     * Read-only statements as one consistent snapshot, checked like `sqlRead`. `busy` means the
     * editor had a transaction open and nothing ran: try again.
     */
    sqlReadBatch: (queries: SqlBatchQuery[]) =>
        ipcRenderer.invoke(
            "view3d:sql-read-batch",
            queries,
        ) as Promise<SqlReadBatchResult>,

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

    /**
     * Asks the editor to store the show's camera lists. The editor validates
     * them and writes them without history (camera lists aren't undoable),
     * then invalidates `view3d_cameras`.
     */
    requestCamerasChange: (cameras: unknown) =>
        ipcRenderer.send("view3d:venue-change-request", {
            cameras,
        } satisfies View3dVenueChangeRequest),

    /**
     * This computer's camera profiles, kept in the Library (ADR 0002 D-12).
     * Main validates every call; these are the only Library calls the window
     * can make.
     */
    cameraProfiles: {
        list: () =>
            ipcRenderer.invoke("view3d:camera-profiles") as Promise<
                CameraProfile[]
            >,
        save: (profile: View3dCameraProfileSave) =>
            ipcRenderer.invoke(
                "view3d:camera-profile-save",
                profile,
            ) as Promise<CameraProfile>,
        remove: (id: string) =>
            ipcRenderer.invoke(
                "view3d:camera-profile-delete",
                id,
            ) as Promise<void>,
    },

    /**
     * Asks the editor to run a playback action (play/pause, a page or beat
     * step, a playback speed), as its own button or key would. With
     * `release`, the key that ran a held action (a speed key) was let go. The
     * new clock and selection arrive on `view3d:clock` and `view3d:selection`.
     */
    requestPlayback: (action: View3dPlaybackAction, release = false) =>
        ipcRenderer.send("view3d:playback-request", {
            action,
            release,
        } satisfies View3dPlaybackRequest),

    /** Asks the editor to choose this playback speed (`VIEW3D_SET_SPEED`). */
    requestPlaybackSpeed: (speed: number) =>
        ipcRenderer.send("view3d:playback-request", {
            action: "setPlaybackSpeed",
            speed,
        } satisfies View3dPlaybackRequest),
};

contextBridge.exposeInMainWorld("view3d", VIEW3D_API);

export type View3dApi = typeof VIEW3D_API;
