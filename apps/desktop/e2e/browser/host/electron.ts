/**
 * Stands in for the `electron` module when main-process code is bundled to
 * run in plain Node (see `./index.ts`). Only `ipcMain` is provided: handlers
 * the app registers land in maps the host dispatches from.
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
