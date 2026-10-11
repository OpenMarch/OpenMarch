/**
 * TEMPORARY (see ../README.md). Stands in for `electron` in the web build,
 * where the main-process code and the renderer share one page.
 *
 * `ipcMain` collects the handlers the app's main-process modules register,
 * and `ipcRenderer` calls them directly. Arguments and results are copied
 * with `structuredClone`, as Electron's IPC copies them, so neither side can
 * change the other's objects.
 */

type Handler = (event: unknown, ...args: any[]) => unknown;
type Listener = (event: unknown, ...args: any[]) => void;

export const ipcHandlers = new Map<string, Handler>();
export const ipcListeners = new Map<string, Handler>();
const rendererListeners = new Map<string, Set<Listener>>();

const event = {
    sender: {
        send: (channel: string, ...args: unknown[]) => emit(channel, ...args),
    },
};

export const ipcMain = {
    handle(channel: string, handler: Handler) {
        if (ipcHandlers.has(channel))
            throw new Error(
                `Attempted to register a second handler for '${channel}'`,
            );
        ipcHandlers.set(channel, handler);
    },
    on(channel: string, listener: Handler) {
        ipcListeners.set(channel, listener);
    },
};

/** Sends a main-to-renderer message, like `webContents.send`. */
export function emit(channel: string, ...args: unknown[]) {
    for (const listener of rendererListeners.get(channel) ?? [])
        listener({}, ...structuredClone(args));
}

export const ipcRenderer = {
    async invoke(channel: string, ...args: unknown[]) {
        const handler = ipcHandlers.get(channel);
        try {
            if (!handler)
                throw new Error(`No handler registered for '${channel}'`);
            return structuredClone(
                await handler(event, ...structuredClone(args)),
            );
        } catch (error) {
            // Same wording as Electron, since callers match on the message.
            throw new Error(
                `Error invoking remote method '${channel}': ${String(error)}`,
            );
        }
    },
    send(channel: string, ...args: unknown[]) {
        const listener = ipcListeners.get(channel);
        if (listener)
            queueMicrotask(() => listener(event, ...structuredClone(args)));
    },
    on(channel: string, listener: Listener) {
        if (!rendererListeners.has(channel))
            rendererListeners.set(channel, new Set());
        rendererListeners.get(channel)!.add(listener);
        return ipcRenderer;
    },
    once(channel: string, listener: Listener) {
        const wrapped: Listener = (...args) => {
            ipcRenderer.removeListener(channel, wrapped);
            listener(...args);
        };
        return ipcRenderer.on(channel, wrapped);
    },
    removeListener(channel: string, listener: Listener) {
        rendererListeners.get(channel)?.delete(listener);
        return ipcRenderer;
    },
    removeAllListeners(channel: string) {
        rendererListeners.delete(channel);
        return ipcRenderer;
    },
};

export const contextBridge = {
    exposeInMainWorld(key: string, api: unknown) {
        (window as unknown as Record<string, unknown>)[key] = api;
    },
};

/** The page has no Electron zoom of its own here, so its zoom is always 1. */
export const webFrame = { getZoomFactor: () => 1 };

/** For main-process modules that import `app` and only use it on paths the web build never takes. */
export const app = {
    getPath: () => "/",
    getVersion: () => "web",
    isPackaged: false,
};

const electron = { ipcMain, ipcRenderer, contextBridge, webFrame, app };
export default electron;
