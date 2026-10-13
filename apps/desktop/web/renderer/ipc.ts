/**
 * The page's end of the web build's IPC. A channel goes to a handler in the
 * page if one is registered (`./handlers.ts`), otherwise to the worker that
 * stands in for the main process (`../worker/index.ts`).
 */
import type { FromWorker, ToWorker, WorkerStatus } from "../protocol";

type Handler = (...args: any[]) => unknown;
type Listener = (event: unknown, ...args: any[]) => void;

const pageHandlers = new Map<string, Handler>();
const pageListeners = new Map<string, Handler>();
const rendererListeners = new Map<string, Set<Listener>>();
const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
>();

let worker: Worker | null = null;
let nextId = 1;

/** The worker is gone: fails every waiting call, and later calls at once. */
function workerFailed(error: Error) {
    worker?.terminate();
    worker = null;
    for (const call of pending.values()) call.reject(error);
    pending.clear();
}

/** Handles an `invoke` channel in the page instead of the worker. */
export function handleInPage(channel: string, handler: Handler) {
    pageHandlers.set(channel, handler);
}

/** Handles a `send` channel in the page instead of the worker. */
export function listenInPage(channel: string, listener: Handler) {
    pageListeners.set(channel, listener);
}

/** Sends a main-to-renderer message, like `webContents.send`. */
export function emit(channel: string, ...args: unknown[]) {
    for (const listener of rendererListeners.get(channel) ?? [])
        listener({}, ...args);
}

/** Runs a channel's handler in the worker. */
export function invokeWorker<T = unknown>(
    channel: string,
    ...args: unknown[]
): Promise<T> {
    if (!worker)
        return Promise.reject(
            new Error(`No handler registered for '${channel}'`),
        );
    const id = nextId++;
    const message: ToWorker = { type: "invoke", id, channel, args };
    return new Promise<T>((resolve, reject) => {
        pending.set(id, {
            resolve: resolve as (value: unknown) => void,
            reject,
        });
        worker!.postMessage(message);
    });
}

/** Starts the worker and resolves once it has reopened the last show, if any. */
export function startWorker(): Promise<WorkerStatus> {
    return new Promise((resolve, reject) => {
        worker = new Worker(new URL("../worker/index.ts", import.meta.url), {
            type: "module",
            name: "openmarch-main",
        });
        let ready = false;
        // After `ready`, an uncaught error leaves the worker running (calls
        // still get answers), so only a failure to start ends it.
        worker.addEventListener("error", (event) => {
            if (ready) return;
            const error = new Error(
                event.message || "The worker failed to start",
            );
            workerFailed(error);
            reject(error);
        });
        worker.addEventListener(
            "message",
            (event: MessageEvent<FromWorker>) => {
                const message = event.data;
                switch (message.type) {
                    case "ready":
                        ready = true;
                        resolve(message.status);
                        break;
                    case "fatal": {
                        const error = new Error(message.message);
                        workerFailed(error);
                        reject(error);
                        break;
                    }
                    case "emit":
                        emit(message.channel, ...message.args);
                        break;
                    case "result": {
                        const call = pending.get(message.id);
                        pending.delete(message.id);
                        if (!call) break;
                        if (message.ok) call.resolve(message.value);
                        else call.reject(new Error(message.error));
                        break;
                    }
                }
            },
        );
    });
}

export const ipcRenderer = {
    async invoke(channel: string, ...args: unknown[]) {
        try {
            const handler = pageHandlers.get(channel);
            return handler
                ? await handler(...args)
                : await invokeWorker(channel, ...args);
        } catch (error) {
            // Same wording as Electron, since callers match on the message.
            throw new Error(
                `Error invoking remote method '${channel}': ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }
    },
    send(channel: string, ...args: unknown[]) {
        const listener = pageListeners.get(channel);
        if (listener) {
            queueMicrotask(() => listener(...args));
            return;
        }
        const message: ToWorker = { type: "send", channel, args };
        worker?.postMessage(message);
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
