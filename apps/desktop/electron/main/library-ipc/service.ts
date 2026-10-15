/**
 * The `library:*` handlers (package C1.9; ADR 0002 D-13; design in
 * docs/3d/proposals/C1.9-import-ipc.md), free of Electron so tests drive
 * them with an injected dialog, a temp-dir store and an in-process worker.
 * `index.ts` binds them to `ipcMain` behind the editor-sender check.
 *
 * Every handler parses its payload with the channel's zod schema and
 * answers a `Result<T>`; nothing throws across IPC. Where things run (Q46):
 * the model pipeline and templates in the import worker; artwork, pdf.js,
 * the store and the dialogs here in main.
 */
// cspell:words gltf
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
    AddFromShowRequestSchema,
    fail,
    ImportCancelRequestSchema,
    ImportCloseRequestSchema,
    ImportCommitRequestSchema,
    ImportInspectRequestSchema,
    ImportPickRequestSchema,
    ImportPreviewRequestSchema,
    LIBRARY_IMPORT_PROGRESS_CHANNEL,
    LIBRARY_INVOKE_CHANNELS,
    LIBRARY_LIMITS,
    LibraryItemRequestSchema,
    LibraryListRequestSchema,
    ok,
    ReadPartsRequestSchema,
    SizePresetDeleteRequestSchema,
    SizePresetSaveRequestSchema,
    TemplateSaveRequestSchema,
    ThumbnailsRequestSchema,
    UpdateItemRequestSchema,
    type AddVersionResultDto,
    type BytesPayload,
    type ImportCommitResult,
    type ImportFileType,
    type ImportInspection,
    type ImportProgress,
    type ImportSession,
    type LibraryChanged,
    type LibraryInvokeChannel,
    type LibraryIpcErrorCode,
    type LibraryMatch,
    type Result,
} from "../../../src/view3d/library/protocol";
import { templateDownloadSurface } from "../../../src/view3d/core/artworkTemplates";
import {
    decodeArtworkSidecar,
    groupByAspect,
    importArtwork,
    inspectArtwork,
    isArtworkImportCancelled,
    renderArtworkPreview,
    type ArtworkImportReport,
    type ArtworkInspection,
    type PdfRenderer,
} from "../artwork-import";
import { sniffArtworkFormat } from "../artwork-import/formats";
import { computeVersionHash, sha256Hex } from "../library/hash";
import {
    LibraryError,
    type AddVersionResult,
    type LibraryStore,
} from "../library/store";
import type { LibraryItemKind } from "../library/types";
import { readModelFile as readModelFileFromDisk } from "../model-import/container";
import { saveModelToLibrary } from "../model-import/library";
import {
    ModelSidecarSchema,
    type ModelFileInput,
    type ModelImportResult,
    type ModelImportStage,
} from "../model-import/types";
import {
    openDialogSpec,
    readHead,
    sniffFileType,
    templateSaveFilter,
    type OpenDialogSpec,
} from "./files";
import {
    ImportSessionRegistry,
    sessionDto,
    type NewSessionFile,
    type Session,
    type SessionFile,
} from "./sessions";
import { ThumbnailCache } from "./thumbnails";
import { WorkerJobError, type ImportWorkerClient } from "./worker-client";

/** Who called: the editor's `webContents`, reduced to what handlers need. */
export interface IpcSender {
    readonly id: number;
    send(channel: string, payload: unknown): void;
}

export interface SaveDialogSpec {
    title: string;
    defaultPath: string;
    filters: { name: string; extensions: string[] }[];
}

export interface LibraryIpcDeps {
    getStore: () => Promise<LibraryStore>;
    worker: Pick<ImportWorkerClient, "run" | "cancel" | "dispose">;
    /** Shows the open dialog on the editor window; null or [] when cancelled. */
    showOpenDialog: (spec: OpenDialogSpec) => Promise<string[] | null>;
    showSaveDialog: (spec: SaveDialogSpec) => Promise<string | null>;
    getLastFolder: () => string | null;
    setLastFolder: (folder: string) => void;
    /** The PDF renderer; null leaves PDFs refused with `pdf-unavailable`. */
    pdfRenderer: () => PdfRenderer | null;
    /** Pushes `library:changed` to the editor. */
    sendChanged: (payload: LibraryChanged) => void;
    now?: () => number;
    readModelFile?: (filePath: string) => Promise<ModelFileInput>;
    /** Progress pushes per sender per second, at most. */
    progressPerSecond?: number;
    sweepIntervalMs?: number;
}

type Handler = (
    sender: IpcSender,
    payload: unknown,
) => Promise<Result<unknown>>;

export interface LibraryIpcService {
    readonly handlers: Readonly<Record<LibraryInvokeChannel, Handler>>;
    /** `library:import-close` (a send, no answer). */
    close(sender: IpcSender, payload: unknown): void;
    /** The editor reloaded or closed: end its sessions and jobs. */
    closeSender(senderId: number): void;
    /** Ends every session, kills the worker. */
    closeAll(): void;
    dispose(): void;
    /** For tests. */
    readonly sessions: ImportSessionRegistry;
}

class IpcFailure extends Error {
    constructor(
        readonly code: LibraryIpcErrorCode,
        message: string,
    ) {
        super(message);
    }
}

/** Absolute paths in log text become file names (§8: messages carry file names only). */
function scrubPaths(message: string): string {
    return message.replace(/(?:[A-Za-z]:)?(?:[\\/][^\\/\s'"`:]+){2,}/g, (p) =>
        path.basename(p),
    );
}

const LIBRARY_ERROR_CODES: Record<LibraryError["code"], LibraryIpcErrorCode> = {
    "not-found": "not-found",
    "read-only": "read-only",
    "kind-mismatch": "kind-mismatch",
    "invalid-input": "invalid-request",
    corrupt: "corrupt",
};

function toFailure(
    error: unknown,
    fallback: LibraryIpcErrorCode,
): { ok: false; error: { code: LibraryIpcErrorCode; message: string } } {
    const message = scrubPaths(
        error instanceof Error ? error.message : String(error),
    );
    if (error instanceof IpcFailure) return fail(error.code, message);
    if (error instanceof LibraryError) {
        return fail(LIBRARY_ERROR_CODES[error.code], message);
    }
    if (error instanceof WorkerJobError) {
        return fail(error.code === "failed" ? fallback : error.code, message);
    }
    if (isArtworkImportCancelled(error)) return fail("cancelled", message);
    const code = (error as { code?: unknown })?.code;
    if (typeof code === "string" && /^E[A-Z]+$/.test(code)) {
        return fail(
            fallback === "write-failed" ? fallback : "unreadable",
            message,
        );
    }
    return fail(fallback, message);
}

/** Canonical JSON (sorted keys), to compare choices. */
function canonical(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value && typeof value === "object") {
        return `{${Object.keys(value)
            .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
            .sort()
            .map(
                (k) =>
                    `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`,
            )
            .join(",")}}`;
    }
    return JSON.stringify(value);
}

const MODEL_PARTS = ["glb", "sidecar"];
const ARTWORK_PARTS_LIST = ["display", "original", "sidecar"];

// eslint-disable-next-line max-lines-per-function
export function createLibraryIpcService(
    deps: LibraryIpcDeps,
): LibraryIpcService {
    const now = deps.now ?? Date.now;
    const readModel = deps.readModelFile ?? readModelFileFromDisk;
    const sessions = new ImportSessionRegistry({
        idleMs: LIBRARY_LIMITS.sessionIdleMs,
        now,
        onClose: (session) => deps.worker.cancel(session.sessionId),
    });
    const sweep = setInterval(
        () => sessions.sweep(),
        deps.sweepIntervalMs ?? 60_000,
    );
    (sweep as { unref?: () => void }).unref?.();
    const picking = new Set<number>();
    let thumbs: ThumbnailCache | null = null;

    // -------------------------------------------------------------- helpers

    async function store() {
        const s = await deps.getStore();
        thumbs ??= new ThumbnailCache(s.root);
        return s;
    }

    function changed(itemIds: string[]) {
        if (itemIds.length) deps.sendChanged({ itemIds });
    }

    /** Progress to the sender only, throttled; a new stage always goes out. */
    function progressFor(sender: IpcSender, session: Session) {
        const minGap = 1000 / (deps.progressPerSecond ?? 10);
        let lastAt = -Infinity;
        let lastStage: string | null = null;
        return (progress: Omit<ImportProgress, "sessionId">) => {
            sessions.touch(session);
            const t = now();
            if (progress.stage === lastStage && t - lastAt < minGap) return;
            lastAt = t;
            lastStage = progress.stage;
            sender.send(LIBRARY_IMPORT_PROGRESS_CHANNEL, {
                sessionId: session.sessionId,
                ...progress,
            } satisfies ImportProgress);
        };
    }

    function lookup(sender: IpcSender, sessionId: string, fileId?: string) {
        const found = sessions.get(sender.id, sessionId, fileId);
        if (!found.ok) {
            throw new IpcFailure(
                found.code,
                found.code === "session-expired"
                    ? "No such import session (closed or expired)"
                    : "No such file in this import session",
            );
        }
        return found;
    }

    function requireOpen(session: Session) {
        if (session.closed) {
            throw new IpcFailure(
                "session-expired",
                "The import session closed",
            );
        }
    }

    function checkCancelled(session: Session, cancelAt: number) {
        requireOpen(session);
        if (session.cancelSeq !== cancelAt) {
            throw new IpcFailure("cancelled", "Cancelled");
        }
    }

    async function modelBytes(file: SessionFile): Promise<ModelFileInput> {
        if (file.model) return file.model;
        if (file.type !== "model") {
            throw new IpcFailure(
                "invalid-request",
                `${file.filename} isn't a model`,
            );
        }
        const size = (await stat(file.path)).size;
        if (file.tooLarge || size > LIBRARY_LIMITS.modelBytes) {
            throw new IpcFailure(
                "too-large",
                `${file.filename} is over the model limit`,
            );
        }
        const input = await readModel(file.path);
        let total = input.bytes.byteLength;
        for (const bytes of Object.values(input.resources ?? {})) {
            total += bytes.byteLength;
        }
        if (total > LIBRARY_LIMITS.modelBytes) {
            throw new IpcFailure(
                "too-large",
                `${file.filename} and its resources are over the model limit`,
            );
        }
        file.model = input;
        return input;
    }

    async function artworkBytes(file: SessionFile): Promise<Uint8Array> {
        if (file.artwork) return file.artwork;
        if (file.type !== "artwork") {
            throw new IpcFailure(
                "invalid-request",
                `${file.filename} isn't artwork`,
            );
        }
        const size = (await stat(file.path)).size;
        if (file.tooLarge || size > LIBRARY_LIMITS.artworkBytes) {
            throw new IpcFailure(
                "too-large",
                `${file.filename} is over the artwork limit`,
            );
        }
        const bytes = new Uint8Array(await readFile(file.path));
        if (bytes.byteLength > LIBRARY_LIMITS.artworkBytes) {
            throw new IpcFailure(
                "too-large",
                `${file.filename} is over the artwork limit`,
            );
        }
        file.artwork = bytes;
        return bytes;
    }

    async function findMatches(
        kind: LibraryItemKind,
        filename: string,
        kitItemId: string | null,
    ): Promise<LibraryMatch[]> {
        const s = await store();
        const matches: LibraryMatch[] = [];
        if (kitItemId && /^[0-9a-f-]{36}$/.test(kitItemId)) {
            const item = await s.getItem(kitItemId);
            if (item && item.kind === kind) {
                matches.push({
                    itemId: item.id,
                    name: item.name,
                    builtIn: item.builtIn,
                    reason: "kit-item-id",
                });
            }
        }
        for (const summary of await s.listItems({ kind })) {
            if (matches.length >= 20) break;
            if (matches.some((m) => m.itemId === summary.id)) continue;
            const item = await s.getItem(summary.id);
            if (item?.originalFilename === filename) {
                matches.push({
                    itemId: item.id,
                    name: item.name,
                    builtIn: item.builtIn,
                    reason: "filename",
                });
            }
        }
        return matches;
    }

    function runModel(
        session: Session,
        file: SessionFile,
        input: ModelFileInput,
        kind: string | undefined,
        choices: object,
        progress: (p: Omit<ImportProgress, "sessionId">) => void,
    ): Promise<ModelImportResult> {
        return deps.worker.run(
            "model-import",
            {
                file: input,
                ...(kind ? { kind: kind as never } : {}),
                choices,
            },
            {
                tag: session.sessionId,
                onStage: (stage: ModelImportStage) =>
                    progress({ fileId: file.fileId, stage, fraction: null }),
            },
        );
    }

    function addVersionDto(added: AddVersionResult): AddVersionResultDto {
        return {
            outcome: added.outcome,
            item: added.item,
            versionHash: added.version.hash,
        };
    }

    function beginArtworkJob(session: Session): AbortController {
        if (session.artworkJob) {
            throw new IpcFailure(
                "busy",
                "An artwork import is already running",
            );
        }
        const controller = new AbortController();
        session.artworkJob = controller;
        return controller;
    }

    function endArtworkJob(session: Session, controller: AbortController) {
        if (session.artworkJob === controller) session.artworkJob = null;
    }

    // -------------------------------------------------------------- import

    async function pick(
        sender: IpcSender,
        payload: unknown,
    ): Promise<ImportSession | null> {
        const request = ImportPickRequestSchema.parse(payload);
        if (picking.has(sender.id)) {
            throw new IpcFailure("busy", "A file dialog is already open");
        }
        picking.add(sender.id);
        let paths: string[] | null;
        try {
            paths = await deps.showOpenDialog(
                openDialogSpec(request.purpose, deps.getLastFolder()),
            );
        } finally {
            picking.delete(sender.id);
        }
        if (!paths || paths.length === 0) return null;
        if (paths.length > LIBRARY_LIMITS.filesPerPick) {
            throw new IpcFailure(
                "too-large",
                `At most ${LIBRARY_LIMITS.filesPerPick} files per import`,
            );
        }
        deps.setLastFolder(path.dirname(paths[0]));

        const files: NewSessionFile[] = [];
        for (const filePath of paths) {
            let sizeBytes = 0;
            let type: ImportFileType = "unsupported";
            try {
                const info = await stat(filePath);
                sizeBytes = info.size;
                if (info.isFile())
                    type = sniffFileType(await readHead(filePath));
            } catch {
                type = "unsupported";
            }
            const limit =
                type === "model"
                    ? LIBRARY_LIMITS.modelBytes
                    : type === "artwork"
                      ? LIBRARY_LIMITS.artworkBytes
                      : Infinity;
            files.push({
                path: filePath,
                filename: path.basename(filePath),
                sizeBytes,
                type,
                tooLarge: sizeBytes > limit,
            });
        }
        // Q52: models one file per session; a pick mixing models and artwork
        // is refused ("Import models and artwork separately") with its own
        // code (Q59).
        const models = files.filter((f) => f.type === "model").length;
        const artwork = files.filter((f) => f.type === "artwork").length;
        if (models > 0 && artwork > 0) {
            throw new IpcFailure(
                "mixed-selection",
                "import models and artwork separately",
            );
        }
        if (models > 1) {
            throw new IpcFailure(
                "mixed-selection",
                "import one model at a time",
            );
        }
        return sessionDto(
            sessions.open(sender.id, files, request.context ?? null),
        );
    }

    type InspectRequest = z.infer<typeof ImportInspectRequestSchema>;

    async function inspect(
        sender: IpcSender,
        payload: unknown,
    ): Promise<ImportInspection> {
        const request = ImportInspectRequestSchema.parse(payload);
        return request.type === "model"
            ? inspectModel(sender, request)
            : inspectArtworkFiles(sender, request);
    }

    async function inspectModel(
        sender: IpcSender,
        request: Extract<InspectRequest, { type: "model" }>,
    ): Promise<ImportInspection> {
        const { session, file } = lookup(
            sender,
            request.sessionId,
            request.fileId,
        );
        const progress = progressFor(sender, session);
        const seq = ++file!.inspectSeq;
        const cancelAt = session.cancelSeq;
        progress({
            fileId: file!.fileId,
            stage: "reading",
            fraction: null,
        });
        const input = await modelBytes(file!);
        checkCancelled(session, cancelAt);
        const result = await runModel(
            session,
            file!,
            input,
            request.kind,
            request.choices,
            progress,
        );
        checkCancelled(session, cancelAt);
        if (!file!.lastResult || seq > file!.lastResult.seq) {
            file!.lastResult = {
                seq,
                key: canonical(request.choices),
                result,
            };
        }
        const sidecar = result.output?.sidecar ?? null;
        return {
            type: "model",
            fileId: file!.fileId,
            requestSeq: seq,
            report: result.report,
            sidecar,
            previewReady: result.output !== null,
            matches: await findMatches(
                "model",
                file!.filename,
                sidecar?.stamp.itemId ?? null,
            ),
        };
    }

    async function inspectArtworkFiles(
        sender: IpcSender,
        request: Extract<InspectRequest, { type: "artwork" }>,
    ): Promise<ImportInspection> {
        const { session } = lookup(sender, request.sessionId);
        const progress = progressFor(sender, session);
        const targets = [...session.files.values()].filter(
            (f) => f.type === "artwork" && !f.tooLarge,
        );
        const controller = beginArtworkJob(session);
        try {
            const files: Extract<
                ImportInspection,
                { type: "artwork" }
            >["files"] = [];
            for (const [i, file] of targets.entries()) {
                const bytes = await artworkBytes(file);
                const isPdf = sniffArtworkFormat(bytes) === "pdf";
                const inspection: ArtworkInspection = await inspectArtwork(
                    { filename: file.filename, bytes },
                    {
                        pdfRenderer: deps.pdfRenderer(),
                        signal: controller.signal,
                        onProgress: (done, total) =>
                            progress({
                                fileId: file.fileId,
                                stage: isPdf ? "rendering-pdf" : "decoding",
                                fraction:
                                    (i + done / Math.max(1, total)) /
                                    targets.length,
                            }),
                    },
                );
                requireOpen(session);
                file.artworkInspection = inspection;
                files.push({
                    fileId: file.fileId,
                    inspection,
                    matches: await findMatches("artwork", file.filename, null),
                });
            }
            return {
                type: "artwork",
                files,
                aspectGroups: groupByAspect(files.map((f) => f.inspection)),
            };
        } finally {
            endArtworkJob(session, controller);
        }
    }

    async function preview(
        sender: IpcSender,
        payload: unknown,
    ): Promise<BytesPayload> {
        const request = ImportPreviewRequestSchema.parse(payload);
        const { session, file } = lookup(
            sender,
            request.sessionId,
            request.fileId,
        );
        if (request.type === "model") {
            const glb = file!.lastResult?.result.output?.glb;
            if (!glb) {
                throw new IpcFailure(
                    "not-found",
                    "No ready model result to preview",
                );
            }
            return { mimeType: "model/gltf-binary", bytes: glb };
        }
        const key = `${request.page}@${request.maxPx}`;
        const cached = file!.previews.get(key);
        if (cached) return { mimeType: "image/png", bytes: cached };
        const bytes = await artworkBytes(file!);
        const rendered = await renderArtworkPreview(
            { filename: file!.filename, bytes },
            request.page,
            request.maxPx,
            { pdfRenderer: deps.pdfRenderer() },
        );
        requireOpen(session);
        if (!rendered.ok) {
            const pdfMissing = rendered.notes.some(
                (n) => n.code === "pdf-unavailable",
            );
            throw new IpcFailure(
                pdfMissing ? "pdf-unavailable" : "unreadable",
                rendered.notes
                    .map((n) => `${n.code}: ${n.message}`)
                    .join("; ") || "no preview",
            );
        }
        file!.previews.set(key, rendered.png);
        return { mimeType: "image/png", bytes: rendered.png };
    }

    async function commit(
        sender: IpcSender,
        payload: unknown,
    ): Promise<ImportCommitResult> {
        const request = ImportCommitRequestSchema.parse(payload);
        return request.type === "model"
            ? commitModel(sender, request)
            : commitArtwork(sender, request);
    }

    type CommitRequest = z.infer<typeof ImportCommitRequestSchema>;

    async function commitModel(
        sender: IpcSender,
        request: Extract<CommitRequest, { type: "model" }>,
    ): Promise<ImportCommitResult> {
        const { session, file } = lookup(
            sender,
            request.sessionId,
            request.fileId,
        );
        const progress = progressFor(sender, session);
        const cancelAt = session.cancelSeq;
        const input = await modelBytes(file!);
        checkCancelled(session, cancelAt);
        const key = canonical(request.choices);
        const last = file!.lastResult;
        // Reuse the reviewed result when it ran with these choices and
        // came out as this kind; otherwise run again with them.
        let result =
            last && last.key === key && last.result.report.kind === request.kind
                ? last.result
                : null;
        result ??= await runModel(
            session,
            file!,
            input,
            request.kind,
            request.choices,
            progress,
        );
        checkCancelled(session, cancelAt);
        if (result.report.status !== "ready" || !result.output) {
            return { type: "model", report: result.report, saved: null };
        }
        progress({ fileId: file!.fileId, stage: "saving", fraction: null });
        const s = await store();
        const added = await saveModelToLibrary(s, {
            file: input,
            result,
            name: request.meta.name,
            tags: request.meta.tags,
            license: request.meta.license,
            ...(request.meta.itemId ? { itemId: request.meta.itemId } : {}),
        });
        if (request.thumbnail) {
            try {
                await thumbs!.putCapture(added.version.hash, request.thumbnail);
            } catch {
                // Not an image sharp reads: the kind icon stands in.
            }
        }
        changed([added.item.id]);
        return {
            type: "model",
            report: result.report,
            saved: addVersionDto(added),
        };
    }

    type ArtworkCommitEntry = Extract<
        CommitRequest,
        { type: "artwork" }
    >["files"][number];

    /** One file of an artwork commit; a cancel keeps (and announces) what was stored. */
    async function importOneArtwork(
        s: LibraryStore,
        entry: ArtworkCommitEntry,
        file: SessionFile,
        bytes: Uint8Array,
        signal: AbortSignal,
        onProgress: (done: number, total: number) => void,
    ): Promise<ArtworkImportReport> {
        const pageSizes = entry.pageSizes
            ? Object.fromEntries(
                  Object.entries(entry.pageSizes).map(([k, v]) => [
                      Number(k),
                      v,
                  ]),
              )
            : undefined;
        try {
            return await importArtwork(
                s,
                {
                    file: { filename: file.filename, bytes },
                    surface: entry.surface,
                    ...(entry.pages ? { pages: entry.pages } : {}),
                    ...(entry.size ? { size: entry.size } : {}),
                    ...(pageSizes ? { pageSizes } : {}),
                    name: entry.meta.name,
                    tags: entry.meta.tags,
                    license: entry.meta.license,
                    ...(entry.meta.itemId ? { itemId: entry.meta.itemId } : {}),
                },
                { pdfRenderer: deps.pdfRenderer(), signal, onProgress },
            );
        } catch (error) {
            if (isArtworkImportCancelled(error) && error.report) {
                changed(error.report.imported.map((p) => p.item.id));
            }
            if (
                error instanceof Error &&
                /itemId adds one Version/.test(error.message)
            ) {
                throw new IpcFailure("invalid-request", error.message);
            }
            throw error;
        }
    }

    async function commitArtwork(
        sender: IpcSender,
        request: Extract<CommitRequest, { type: "artwork" }>,
    ): Promise<ImportCommitResult> {
        const { session } = lookup(sender, request.sessionId);
        const targets = request.files.map((entry) => {
            const file = session.files.get(entry.fileId);
            if (!file)
                throw new IpcFailure(
                    "unknown-file",
                    "No such file in this import session",
                );
            if (file.type !== "artwork") {
                throw new IpcFailure(
                    "invalid-request",
                    `${file.filename} isn't artwork`,
                );
            }
            return { entry, file };
        });
        const progress = progressFor(sender, session);
        const controller = beginArtworkJob(session);
        const s = await store();
        const reports: ArtworkImportReport[] = [];
        try {
            for (const [i, { entry, file }] of targets.entries()) {
                if (controller.signal.aborted) {
                    throw new IpcFailure("cancelled", "Cancelled");
                }
                const bytes = await artworkBytes(file);
                const isPdf = sniffArtworkFormat(bytes) === "pdf";
                const report = await importOneArtwork(
                    s,
                    entry,
                    file,
                    bytes,
                    controller.signal,
                    (done, total) =>
                        progress({
                            fileId: file.fileId,
                            stage: isPdf ? "rendering-pdf" : "converting",
                            fraction:
                                (i + done / Math.max(1, total)) /
                                targets.length,
                            ...(isPdf
                                ? { page: { index: done, count: total } }
                                : {}),
                        }),
                );
                reports.push(report);
                changed([...new Set(report.imported.map((p) => p.item.id))]);
            }
            return { type: "artwork", reports };
        } finally {
            endArtworkJob(session, controller);
        }
    }

    async function cancel(sender: IpcSender, payload: unknown): Promise<void> {
        const request = ImportCancelRequestSchema.parse(payload);
        const { session } = lookup(sender, request.sessionId, request.fileId);
        session.cancelSeq++;
        session.artworkJob?.abort();
        deps.worker.cancel(session.sessionId);
    }

    // -------------------------------------------------------------- Library

    async function addFromShow(
        _sender: IpcSender,
        payload: unknown,
    ): Promise<AddVersionResultDto> {
        const request = AddFromShowRequestSchema.parse(payload);
        const roles = Object.keys(request.parts).sort();
        const expected =
            request.kind === "model"
                ? MODEL_PARTS
                : request.kind === "artwork"
                  ? ARTWORK_PARTS_LIST
                  : null;
        if (!expected) {
            // No Uniform sidecar schema exists yet (C1 has no uniforms).
            throw new IpcFailure(
                "invalid-request",
                "Uniforms can't be added yet",
            );
        }
        if (roles.join(",") !== expected.join(",")) {
            throw new IpcFailure(
                "invalid-request",
                `A ${request.kind} Version has the parts ${expected.join(", ")}`,
            );
        }
        const partHashes = Object.fromEntries(
            Object.entries(request.parts).map(([role, bytes]) => [
                role,
                sha256Hex(bytes),
            ]),
        );
        if (computeVersionHash(partHashes) !== request.versionHash) {
            throw new IpcFailure(
                "hash-mismatch",
                "The parts don't hash to the Version",
            );
        }
        try {
            const sidecar = request.parts.sidecar;
            if (request.kind === "model") {
                ModelSidecarSchema.parse(
                    JSON.parse(new TextDecoder().decode(sidecar)),
                );
            } else {
                decodeArtworkSidecar(sidecar);
            }
        } catch {
            throw new IpcFailure(
                "corrupt",
                "The sidecar doesn't match its schema",
            );
        }
        const s = await store();
        const added = await s.addVersion({
            itemId: request.itemId,
            kind: request.kind,
            name: request.name,
            tags: request.tags,
            license: request.license,
            parts: request.parts,
            derivedFrom: request.derivedFrom,
        });
        changed([added.item.id]);
        return addVersionDto(added);
    }

    async function templateSave(
        _sender: IpcSender,
        payload: unknown,
    ): Promise<{ filename: string } | null> {
        const request = TemplateSaveRequestSchema.parse(payload);
        const surface = templateDownloadSurface(request.surfaceId);
        if (!surface) {
            throw new IpcFailure(
                "not-found",
                `No template surface ${request.surfaceId}`,
            );
        }
        const filename = `${path.basename(surface.id)}.${request.format}`;
        const folder = deps.getLastFolder();
        const target = await deps.showSaveDialog({
            title: "Save template",
            defaultPath: folder ? path.join(folder, filename) : filename,
            filters: [templateSaveFilter(request.format)],
        });
        if (!target) return null;
        const file = await deps.worker.run("template", {
            surfaceId: surface.id,
            format: request.format,
        });
        try {
            await writeFile(target, file.bytes);
        } catch (error) {
            throw new IpcFailure(
                "write-failed",
                error instanceof Error ? error.message : String(error),
            );
        }
        deps.setLastFolder(path.dirname(target));
        return { filename: path.basename(target) };
    }

    // -------------------------------------------------------------- table

    const wrap =
        <T>(
            fn: (sender: IpcSender, payload: unknown) => Promise<T>,
            fallback: LibraryIpcErrorCode,
        ): Handler =>
        async (sender, payload) => {
            try {
                return ok(await fn(sender, payload));
            } catch (error) {
                if (error instanceof z.ZodError) {
                    return fail("invalid-request", scrubPaths(error.message));
                }
                return toFailure(error, fallback);
            }
        };

    const C = LIBRARY_INVOKE_CHANNELS;
    const handlers: Record<LibraryInvokeChannel, Handler> = {
        [C.importPick]: wrap(pick, "unreadable"),
        [C.importInspect]: wrap(inspect, "unreadable"),
        [C.importPreview]: wrap(preview, "unreadable"),
        [C.importCommit]: wrap(commit, "write-failed"),
        [C.importCancel]: wrap(cancel, "invalid-request"),
        [C.list]: wrap(async (_s, p) => {
            const { kind } = LibraryListRequestSchema.parse(p);
            return (await store()).listItems(kind ? { kind } : undefined);
        }, "corrupt"),
        [C.get]: wrap(async (_s, p) => {
            const { itemId } = LibraryItemRequestSchema.parse(p);
            return (await store()).getItem(itemId);
        }, "corrupt"),
        [C.readParts]: wrap(async (_s, p) => {
            const request = ReadPartsRequestSchema.parse(p);
            const s = await store();
            const item = await s.getItem(request.itemId);
            const version = item?.versions.find(
                (v) => v.hash === request.versionHash,
            );
            if (!version) throw new IpcFailure("not-found", "No such Version");
            const parts: Record<string, Uint8Array> = {};
            for (const role of request.roles) {
                const blob = version.parts[role];
                if (blob) parts[role] = await s.readBlob(blob);
            }
            return parts;
        }, "corrupt"),
        [C.thumbnails]: wrap(async (_s, p) => {
            const request = ThumbnailsRequestSchema.parse(p);
            const s = await store();
            const out: (BytesPayload | null)[] = [];
            for (const { itemId, versionHash } of request.items) {
                try {
                    const item = await s.getItem(itemId);
                    const png = item
                        ? await thumbs!.get(s, item, versionHash, request.maxPx)
                        : null;
                    out.push(
                        png ? { mimeType: "image/png", bytes: png } : null,
                    );
                } catch {
                    out.push(null);
                }
            }
            return out;
        }, "corrupt"),
        [C.updateItem]: wrap(async (_s, p) => {
            const { itemId, patch } = UpdateItemRequestSchema.parse(p);
            const item = await (await store()).updateItem(itemId, patch);
            changed([item.id]);
            return item;
        }, "write-failed"),
        [C.deleteItem]: wrap(async (_s, p) => {
            const { itemId } = LibraryItemRequestSchema.parse(p);
            await (await store()).deleteItem(itemId);
            changed([itemId]);
        }, "write-failed"),
        [C.addFromShow]: wrap(addFromShow, "write-failed"),
        [C.sizePresets]: wrap(async (_s, p) => {
            z.undefined().parse(p);
            return (await store()).listSizePresets();
        }, "corrupt"),
        [C.sizePresetSave]: wrap(async (_s, p) => {
            const request = SizePresetSaveRequestSchema.parse(p);
            return (await store()).saveSizePreset(request);
        }, "write-failed"),
        [C.sizePresetDelete]: wrap(async (_s, p) => {
            const { id } = SizePresetDeleteRequestSchema.parse(p);
            await (await store()).deleteSizePreset(id);
        }, "write-failed"),
        [C.templateSave]: wrap(templateSave, "write-failed"),
    };

    return {
        handlers,
        sessions,
        close(sender, payload) {
            const parsed = ImportCloseRequestSchema.safeParse(payload);
            if (parsed.success)
                sessions.closeById(sender.id, parsed.data.sessionId);
        },
        closeSender(senderId) {
            sessions.closeSender(senderId);
        },
        closeAll() {
            sessions.closeAll();
            deps.worker.dispose();
        },
        dispose() {
            clearInterval(sweep);
            sessions.closeAll();
            deps.worker.dispose();
        },
    };
}
