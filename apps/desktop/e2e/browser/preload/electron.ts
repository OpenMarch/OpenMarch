/**
 * Stands in for the `electron` module when the real preload script
 * (`electron/preload/index.ts`) is bundled for a plain browser.
 *
 * `ipcRenderer` forwards to two functions the Playwright fixture exposes on
 * the page, so every `window.electron` member is the app's own code and only
 * the transport differs.
 */

type Listener = (event: unknown, ...args: any[]) => void;

declare global {
    interface Window {
        /** Exposed by the fixture. Runs the main-process handler for a channel. */
        __omIpcInvoke: (
            channel: string,
            args: unknown[],
        ) => Promise<
            { ok: true; value: unknown } | { ok: false; error: string }
        >;
        /** Exposed by the fixture. Delivers a one-way message. */
        __omIpcSend: (channel: string, args: unknown[]) => Promise<void>;
        /** Called by the fixture to push a main-to-renderer message. */
        __omIpcEmit: (channel: string, ...args: unknown[]) => void;
    }
}

const listeners = new Map<string, Set<Listener>>();

window.__omIpcEmit = (channel, ...args) => {
    for (const listener of listeners.get(channel) ?? []) listener({}, ...args);
};

export const ipcRenderer = {
    async invoke(channel: string, ...args: unknown[]) {
        const result = await window.__omIpcInvoke(channel, args);
        if (result.ok) return result.value;
        // Same wording as Electron, since callers match on the message.
        throw new Error(
            `Error invoking remote method '${channel}': ${result.error}`,
        );
    },
    send(channel: string, ...args: unknown[]) {
        void window.__omIpcSend(channel, args);
    },
    on(channel: string, listener: Listener) {
        if (!listeners.has(channel)) listeners.set(channel, new Set());
        listeners.get(channel)!.add(listener);
        return ipcRenderer;
    },
    removeListener(channel: string, listener: Listener) {
        listeners.get(channel)?.delete(listener);
        return ipcRenderer;
    },
    removeAllListeners(channel: string) {
        listeners.delete(channel);
        return ipcRenderer;
    },
};

export const contextBridge = {
    exposeInMainWorld(key: string, api: unknown) {
        (window as unknown as Record<string, unknown>)[key] = api;
    },
};
