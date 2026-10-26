/**
 * Messages between the page (the renderer) and the worker that stands in for
 * Electron's main process. Values are copied by `postMessage`, as Electron's
 * IPC copies them.
 */

import type { ShowSummary } from "@/utilities/webLibrary";

/** Page to worker. */
export type ToWorker =
    | { type: "invoke"; id: number; channel: string; args: unknown[] }
    | { type: "send"; channel: string; args: unknown[] };

/** Worker to page. */
export type FromWorker =
    | { type: "ready"; status: WorkerStatus }
    | { type: "fatal"; message: string }
    | {
          type: "result";
          id: number;
          ok: true;
          value: unknown;
      }
    | { type: "result"; id: number; ok: false; error: string }
    | { type: "emit"; channel: string; args: unknown[] };

/**
 * Why a tab keeps its show in memory only: another tab has the library, the
 * browser has no usable storage, or the library was written by a newer
 * version (it is left as it is).
 */
export type StorageProblem = "other-tab" | "unsupported" | "newer-format";

export type WorkerStatus = {
    /**
     * Where the show is kept. "opfs": a copy in the browser's storage, so it
     * survives a reload. "memory": only for this page, because the browser
     * has no usable storage (e.g. a private window) or another tab holds it.
     */
    storage: "opfs" | "memory";
    /** Why storage is "memory", for the person. */
    storageProblem?: StorageProblem;
};

/**
 * Channels only the web build has, handled by the worker. The renderer's
 * stand-ins for Electron's file dialogs use them.
 */
export const WEB_CHANNELS = {
    /**
     * (bytes: Uint8Array, name: string, force?: boolean, backedUp?: boolean)
     * => number (200, or an error code): adds a show to the library and opens
     * it. `backedUp`: it came from a file the person picked (a show handed
     * across a reload passes its own state). Throws if the open show's latest
     * changes can't be stored first, unless forced.
     */
    openShow: "web:openShow",
    /**
     * (force?: boolean) => void: closes the open show (it stays in the
     * library). Throws, leaving it open, if its latest changes can't be
     * stored, unless forced.
     */
    closeShow: "web:closeShow",
    /** () => { name: string; bytes: Uint8Array } | null: the open show's latest bytes */
    exportShow: "web:exportShow",
    /**
     * () => FlushResult: stores the open show's latest changes now (as the
     * page is hidden, or before it's closed or replaced) and says whether
     * they are safely stored.
     */
    flush: "web:flush",
    /** (bytes: Uint8Array) => PreviousDotsImportResult, for the new-show wizard */
    readPreviousDots: "web:readPreviousDots",
    /** (data: ArrayBuffer, name: string) => LegacyDatabaseResponse */
    insertAudio: "web:insertAudio",

    /** () => LibraryState */
    library: "web:library",
    /** (id: string) => number: makes a stored show the one to open (the page then reloads) */
    openStored: "web:openStored",
    /** (id: string, name: string) => void */
    renameShow: "web:renameShow",
    /** (id: string, copyName: string) => string: the copy's id */
    duplicateShow: "web:duplicateShow",
    /** (id: string) => void */
    deleteShow: "web:deleteShow",
    /** (id: string) => { name: string; bytes: Uint8Array }: a stored show's latest bytes, for a backup */
    exportStored: "web:exportStored",
    /** (id: string) => void: the show was just backed up */
    recordBackup: "web:recordBackup",
    /**
     * (id: string, versionId: string) => boolean: makes a version the show's
     * current state, keeping the replaced state as a version. True if it was
     * the open show (the page then reloads into it).
     */
    restoreVersion: "web:restoreVersion",
} as const;

export type FlushResult = { safe: boolean; memoryOnly?: true; error?: string };

/** The library as the page sees it. */
export type LibraryState = {
    shows: ShowSummary[];
    /** The show open in this tab, if it's stored in the library. */
    openId: string | null;
    /** A stored show that couldn't be opened when the page loaded. */
    openFailed: string | null;
};

export type SaveStatus =
    | { state: "saving" }
    | { state: "saved"; at: number }
    | { state: "error"; reason: "full" | "other"; message: string };

/** Messages the worker sends the page unasked, like `webContents.send`. */
export const WEB_EVENTS = {
    /** The show has changes its last download doesn't (memory-only tabs). */
    changed: "web:changed",
    /**
     * Browser storage failed (e.g. it's full), so the worker stopped keeping
     * the show there: the page treats it as kept in memory only.
     */
    storageLost: "web:storageLost",
    /** (state: LibraryState): the library changed */
    library: "web:library",
    /** (status: SaveStatus): saving the open show started, finished or failed */
    saveStatus: "web:saveStatus",
} as const;
