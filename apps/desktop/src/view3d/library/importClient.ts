/**
 * The editor's typed client for the import and Library IPC (package C1.9).
 * No UI: the review modal (C1.10) and the Library panel build on this.
 *
 * - `inspectModel` drops replies older than the latest call for the same
 *   file, so a review that re-inspects on every choice only ever sees the
 *   newest report (main answers every call; C1.9 §4).
 * - Library images arrive as bytes and become `blob:` URLs (owner decision
 *   Q49): revoke them when the data is dropped.
 */
import type { ElectronApi } from "../../../electron/preload";
import type {
    BytesPayload,
    ImportInspection,
    ImportProgress,
    ModelImportChoices,
    ModelKind,
    Result,
} from "./protocol";

export type LibraryApi = ElectronApi["library"];

/** A reply superseded by a newer call: ignore it. */
export interface StaleReply {
    stale: true;
}

export function isStale(value: unknown): value is StaleReply {
    return (
        typeof value === "object" &&
        value !== null &&
        (value as { stale?: unknown }).stale === true
    );
}

export function createImportClient(
    api: LibraryApi = (window as unknown as { electron: ElectronApi }).electron
        .library,
) {
    /** Latest call number per `sessionId/fileId`. */
    const latest = new Map<string, number>();
    let calls = 0;

    return {
        api,

        /**
         * Opens the file dialog. A pick mixing models and artwork, or
         * holding two models, answers `mixed-selection` (Q52, Q59): show
         * "Import models and artwork separately" inline and let the user
         * pick again.
         */
        pick: api.importPick,

        /**
         * Runs the model pipeline with the review's current choices. Resolves
         * `{ stale: true }` when a newer inspect of the same file started
         * meanwhile.
         */
        async inspectModel(request: {
            sessionId: string;
            fileId: string;
            kind?: ModelKind;
            choices: ModelImportChoices;
        }): Promise<
            Result<Extract<ImportInspection, { type: "model" }>> | StaleReply
        > {
            const key = `${request.sessionId}/${request.fileId}`;
            const call = ++calls;
            latest.set(key, call);
            const result = await api.importInspect({
                ...request,
                type: "model",
            });
            if (latest.get(key) !== call) return { stale: true };
            if (!result.ok) return result;
            if (result.value.type !== "model") {
                return {
                    ok: false,
                    error: { code: "invalid-request", message: "not a model" },
                };
            }
            return { ok: true, value: result.value };
        },

        inspectArtwork: (sessionId: string) =>
            api.importInspect({ sessionId, type: "artwork" }) as Promise<
                Result<Extract<ImportInspection, { type: "artwork" }>>
            >,

        /**
         * Saves one Artwork template in one format (C1.12, Q53). Resolves
         * `null` when the user cancels the save dialog.
         */
        saveTemplate: api.templateSave,

        preview: api.importPreview,
        commit: api.importCommit,
        cancel: api.importCancel,

        close(sessionId: string) {
            for (const key of [...latest.keys()]) {
                if (key.startsWith(`${sessionId}/`)) latest.delete(key);
            }
            api.importClose({ sessionId });
        },

        /** Progress for one session only. Returns an unsubscribe function. */
        onProgress(sessionId: string, callback: (p: ImportProgress) => void) {
            return api.onImportProgress((progress) => {
                if (progress.sessionId === sessionId) callback(progress);
            });
        },
    };
}

export type ImportClient = ReturnType<typeof createImportClient>;

/** An object URL for IPC bytes; revoke it with `URL.revokeObjectURL`. */
export function bytesToObjectUrl(payload: BytesPayload): string {
    // Copy into a plain ArrayBuffer-backed view, which `Blob` accepts.
    const bytes = new Uint8Array(payload.bytes);
    return URL.createObjectURL(new Blob([bytes], { type: payload.mimeType }));
}
