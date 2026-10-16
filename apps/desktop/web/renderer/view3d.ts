/**
 * The 3D View on the web: a second browser window (`?view=3d`) in place of
 * Electron's 3D View window (`electron/main/view3dWindow.ts`).
 *
 * The show lives in the editor tab's worker, so the editor tab plays main's
 * part: the two pages talk over a `BroadcastChannel`, and the editor tab
 * relays the 3D window's reads to its worker, its clock, selection and
 * invalidations to the window, and the window's hello, venue and playback
 * requests to the editor, as main relays them in Electron.
 *
 * Each editor tab has an id, kept for the tab's session so it survives the
 * reload that opening a show does, and its 3D window only talks to it. The
 * 3D window gets the editor's preload-free `window.view3d` from
 * `installView3dApi`, so the window code in `src/view3d` runs unchanged.
 */
import {
    VIEW3D_HELLO_CHANNEL,
    VIEW3D_INVALIDATE_CHANNEL,
    VIEW3D_PLAYBACK_REQUEST_CHANNEL,
    VIEW3D_PUBLISH_CHANNELS,
    VIEW3D_VENUE_CHANGE_REQUEST_CHANNEL,
    VIEW3D_WINDOW_STATE_CHANNEL,
    type View3dPublishChannel,
} from "../../src/view3d/sync/protocol";
import type { View3dApi } from "../../electron/preload/view3d";
import { storageKey } from "./channel";
import {
    emit,
    handleInPage,
    invokeWorker,
    ipcRenderer,
    listenInPage,
} from "./ipc";

/** Editor tab to 3D window. */
type FromEditor =
    | { type: "publish"; channel: View3dPublishChannel; payload: unknown }
    | { type: "sql-result"; id: number; ok: true; value: unknown }
    | { type: "sql-result"; id: number; ok: false; error: string }
    /** The editor tab (re)started with this show open, or none. */
    | { type: "started"; show: string | null }
    /** The editor tab is unloading: closing, or reloading into another show. */
    | { type: "gone" };

/** 3D window to editor tab. */
type FromView3d =
    | { type: "hello" }
    | { type: "bye" }
    | { type: "venue"; settings: unknown }
    | { type: "playback"; action: unknown }
    | {
          type: "sql";
          id: number;
          sql: string;
          params: unknown[];
          method: string;
      }
    | { type: "sql-batch"; id: number; queries: unknown[] };

type Envelope<T> = T & { from: "editor" | "view3d"; editor: string };

/** How long the 3D window waits for a reloading editor before it closes. */
const EDITOR_RETURN_MS = 10_000;
/** A reloaded editor may not listen yet: hello again this often, this many times. */
const HELLO_RETRY_MS = 500;
const HELLO_TRIES = 20;
/** A read the editor never answers (it closed mid-read) fails after this. */
const SQL_TIMEOUT_MS = 20_000;

function openChannel(): BroadcastChannel | null {
    return typeof BroadcastChannel === "function"
        ? new BroadcastChannel(storageKey("view3d"))
        : null;
}

/** This tab's id, kept across reloads of the tab. */
function editorId(): string {
    const key = storageKey("editor-id");
    try {
        const saved = sessionStorage.getItem(key);
        if (saved) return saved;
        const id = crypto.randomUUID();
        sessionStorage.setItem(key, id);
        return id;
    } catch {
        // Storage blocked: the id lasts for this page only.
        return crypto.randomUUID();
    }
}

/** The show's file name without `.dots`, for the window's title. */
function showName(path: string): string {
    return (path.split("/").pop() ?? path).replace(/\.dots$/i, "");
}

async function openShowName(): Promise<string | null> {
    const ready = await invokeWorker<boolean>("database:isReady").catch(
        () => false,
    );
    if (!ready) return null;
    return showName(await invokeWorker<string>("database:getPath"));
}

/**
 * The editor tab's side: opens the 3D window and relays between it, the
 * worker and the editor. Call after the worker has started.
 */
// eslint-disable-next-line max-lines-per-function
export function registerView3dHost() {
    const channel = openChannel();
    const id = editorId();
    let view3dWindow: Window | null = null;
    /** Whether a 3D window has said hello and not yet goodbye. */
    let open = false;

    const post = (message: FromEditor) =>
        channel?.postMessage({
            ...message,
            from: "editor",
            editor: id,
        } satisfies Envelope<FromEditor>);

    const setOpen = (next: boolean) => {
        if (open === next) return;
        open = next;
        emit(VIEW3D_WINDOW_STATE_CHANNEL, next);
    };

    handleInPage("view3d:open", async (options?: { background?: boolean }) => {
        const show = await openShowName();
        if (show === null || !channel) return false;
        // The app asks in the background when it opens a show with the
        // "open with the show" setting on. A browser blocks a window opened
        // without a click, so only one that is already open counts.
        if (options?.background) return open;
        if (view3dWindow && !view3dWindow.closed) {
            view3dWindow.focus();
            return true;
        }
        const url = new URL(window.location.href);
        url.hash = "";
        url.search = new URLSearchParams({
            view: "3d",
            show,
            theme: document.documentElement.classList.contains("dark")
                ? "dark"
                : "light",
            lang: String((await ipcRenderer.invoke("get-language")) || "en"),
            editor: id,
        }).toString();
        // A window of its own, not a tab, so the editor stays visible and
        // keeps animating (browsers pause animation frames in hidden tabs).
        // After the editor reloads, the same name reaches a window it opened
        // before, which then reloads.
        view3dWindow = window.open(
            url,
            `openmarch-3d-${id}`,
            "popup,width=1280,height=800",
        );
        return view3dWindow !== null;
    });

    const relay = (publishChannel: View3dPublishChannel, payload: unknown) => {
        if (open) post({ type: "publish", channel: publishChannel, payload });
    };
    for (const publishChannel of VIEW3D_PUBLISH_CHANNELS)
        listenInPage(publishChannel, (payload: unknown) =>
            relay(publishChannel, payload),
        );

    channel?.addEventListener(
        "message",
        (event: MessageEvent<Envelope<FromView3d>>) => {
            const message = event.data;
            if (message?.from !== "view3d" || message.editor !== id) return;
            switch (message.type) {
                case "hello":
                    setOpen(true);
                    emit(VIEW3D_HELLO_CHANNEL);
                    break;
                case "bye":
                    setOpen(false);
                    break;
                case "venue":
                    emit(VIEW3D_VENUE_CHANGE_REQUEST_CHANNEL, {
                        settings: message.settings,
                    });
                    break;
                case "playback":
                    emit(VIEW3D_PLAYBACK_REQUEST_CHANNEL, {
                        action: message.action,
                    });
                    break;
                case "sql":
                case "sql-batch":
                    (message.type === "sql"
                        ? invokeWorker(
                              "view3d:sql-read",
                              message.sql,
                              message.params,
                              message.method,
                          )
                        : invokeWorker("view3d:sql-read-batch", message.queries)
                    ).then(
                        (value) =>
                            post({
                                type: "sql-result",
                                id: message.id,
                                ok: true,
                                value,
                            }),
                        (error: unknown) =>
                            post({
                                type: "sql-result",
                                id: message.id,
                                ok: false,
                                error:
                                    error instanceof Error
                                        ? error.message
                                        : String(error),
                            }),
                    );
                    break;
            }
        },
    );

    window.addEventListener("pagehide", () => post({ type: "gone" }));
    // A 3D window left open from before a reload says hello again, or
    // closes if the show is gone.
    void openShowName().then((show) => post({ type: "started", show }));
}

/**
 * The 3D window's side: `window.view3d`, talking to the editor tab named in
 * the query string. Call before the app's renderer loads.
 */
// eslint-disable-next-line max-lines-per-function
export function installView3dApi() {
    const query = new URLSearchParams(window.location.search);
    const id = query.get("editor") ?? "";
    const channel = openChannel();
    const listeners = new Map<
        View3dPublishChannel,
        Set<(p: unknown) => void>
    >();
    const pending = new Map<
        number,
        { resolve: (value: any) => void; reject: (error: Error) => void }
    >();
    let nextId = 1;
    let closeTimer: ReturnType<typeof setTimeout> | null = null;

    const post = (message: FromView3d) =>
        channel?.postMessage({
            ...message,
            from: "view3d",
            editor: id,
        } satisfies Envelope<FromView3d>);

    let helloTimer: ReturnType<typeof setInterval> | null = null;
    const stopHello = () => {
        if (helloTimer) clearInterval(helloTimer);
        helloTimer = null;
    };
    const helloUntilAnswered = () => {
        stopHello();
        let tries = 0;
        post({ type: "hello" });
        helloTimer = setInterval(() => {
            if (++tries >= HELLO_TRIES) stopHello();
            post({ type: "hello" });
        }, HELLO_RETRY_MS);
    };

    const deliver = (publishChannel: View3dPublishChannel, payload: unknown) =>
        listeners.get(publishChannel)?.forEach((listener) => listener(payload));

    channel?.addEventListener(
        "message",
        (event: MessageEvent<Envelope<FromEditor>>) => {
            const message = event.data;
            if (message?.from !== "editor" || message.editor !== id) return;
            switch (message.type) {
                case "publish":
                    stopHello();
                    deliver(message.channel, message.payload);
                    break;
                case "sql-result": {
                    const call = pending.get(message.id);
                    pending.delete(message.id);
                    if (!call) break;
                    if (message.ok) call.resolve(message.value);
                    else call.reject(new Error(message.error));
                    break;
                }
                case "started":
                    if (closeTimer) clearTimeout(closeTimer);
                    closeTimer = null;
                    if (message.show === null) {
                        // Electron closes the window with the show.
                        window.close();
                    } else if (message.show !== query.get("show")) {
                        query.set("show", message.show);
                        window.location.search = query.toString();
                    } else {
                        // The same show, reopened: read it all again, and
                        // say hello until the editor, which may not have
                        // rendered yet, answers.
                        deliver(VIEW3D_INVALIDATE_CHANNEL, { queryKeys: [[]] });
                        helloUntilAnswered();
                    }
                    break;
                case "gone":
                    // Electron closes the window with the editor. A reload
                    // comes back with "started" well within this.
                    closeTimer ??= setTimeout(
                        () => window.close(),
                        EDITOR_RETURN_MS,
                    );
                    break;
            }
        },
    );
    window.addEventListener("pagehide", () => post({ type: "bye" }));

    /** Sends a read to the editor tab, which runs it in the worker and answers with its id. */
    const callEditor = (
        message:
            | Omit<Extract<FromView3d, { type: "sql" }>, "id">
            | Omit<Extract<FromView3d, { type: "sql-batch" }>, "id">,
    ): Promise<unknown> => {
        if (!channel)
            return Promise.reject(
                new Error("This browser can't reach the editor tab"),
            );
        const callId = nextId++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                pending.delete(callId);
                reject(new Error("The editor tab didn't answer"));
            }, SQL_TIMEOUT_MS);
            pending.set(callId, {
                resolve: (value) => {
                    clearTimeout(timer);
                    resolve(value);
                },
                reject: (error) => {
                    clearTimeout(timer);
                    reject(error);
                },
            });
            post({ ...message, id: callId });
        });
    };

    const api: View3dApi = {
        isMacOS: false,
        sqlRead: (sql, params, method) =>
            callEditor({ type: "sql", sql, params, method }) as ReturnType<
                View3dApi["sqlRead"]
            >,
        sqlReadBatch: (queries) =>
            callEditor({ type: "sql-batch", queries }) as ReturnType<
                View3dApi["sqlReadBatch"]
            >,
        hello: () => post({ type: "hello" }),
        on: (publishChannel, callback) => {
            const set = listeners.get(publishChannel) ?? new Set();
            listeners.set(publishChannel, set);
            const listener = callback as (payload: unknown) => void;
            set.add(listener);
            return () => {
                set.delete(listener);
            };
        },
        requestVenueChange: (settings) => post({ type: "venue", settings }),
        requestPlayback: (action) => post({ type: "playback", action }),
    };
    (window as unknown as { view3d: View3dApi }).view3d = api;
}
