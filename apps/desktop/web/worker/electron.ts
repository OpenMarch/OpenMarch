/**
 * Stands in for the `electron` module in the worker, where the app's
 * main-process database code runs. Only `ipcMain` does anything: handlers
 * the app registers land in maps the worker dispatches from.
 */

type Handler = (event: unknown, ...args: any[]) => unknown;

export const ipcHandlers = new Map<string, Handler>();
export const ipcListeners = new Map<string, Handler>();

export const ipcMain = {
    handle(channel: string, handler: Handler) {
        if (ipcHandlers.has(channel)) {
            throw new Error(
                `Attempted to register a second handler for '${channel}'`,
            );
        }
        ipcHandlers.set(channel, handler);
    },
    on(channel: string, listener: Handler) {
        ipcListeners.set(channel, listener);
    },
};

/** For modules that import `app` but only use it on paths the web build never takes. */
export const app = {
    getPath: () => "/",
    getAppPath: () => "/",
    getVersion: () => import.meta.env.VITE_PUBLIC_APP_VERSION ?? "web",
    isPackaged: true,
};

/** Native dialogs belong to the page; see `../renderer/handlers.ts`. */
export const dialog = new Proxy(
    {},
    {
        get(_, name) {
            return () => {
                throw new Error(
                    `dialog.${String(name)} is not available in the web build`,
                );
            };
        },
    },
);

const electron = { ipcMain, app, dialog };
export default electron;
