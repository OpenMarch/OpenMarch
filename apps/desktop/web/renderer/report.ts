/**
 * Bug reports in the web editor (fork #801): the channels the desktop main
 * process answers (`electron/main/reports.ts`), answered in the page. The
 * worker makes the scrubbed show copy, and the files go from the page
 * straight to the reports bucket, the same steps the desktop app takes
 * (`src/feedback/reportUpload.ts`).
 */
import { md5 } from "@noble/hashes/legacy";
import { OPENMARCH_API_ENDPOINT } from "../../src/global/Constants";
import { MAX_SHOW_FILE_BYTES } from "../../src/feedback/reportDraft";
import {
    ReportSubmitError,
    uploadReport,
    type ReportUploadSource,
} from "../../src/feedback/reportUpload";
import type { ReportSubmitRequest } from "../../electron/main/reports";
import { WEB_CHANNELS } from "../protocol";
import { emit, handleInPage, invokeWorker, ipcRenderer } from "./ipc";

/** The open show isn't the one the form showed (as on desktop). */
const SHOW_CHANGED_STATUS = 409;

/** Base64 of a Blob's MD5, read in chunks. */
export async function blobMd5Base64(blob: Blob): Promise<string> {
    const hash = md5.create();
    const reader = blob.stream().getReader();
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        hash.update(value);
    }
    let binary = "";
    for (const byte of hash.digest()) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function blobSource(
    slot: ReportUploadSource["slot"],
    blob: Blob,
    filename: string,
    durationSeconds?: number,
): ReportUploadSource {
    return {
        slot,
        filename,
        contentType: blob.type.split(";")[0] || "application/octet-stream",
        durationSeconds,
        byteSize: blob.size,
        checksum: () => blobMd5Base64(blob),
        body: () => ({ body: blob }),
    };
}

async function getToken(): Promise<string | null> {
    const result = (await ipcRenderer.invoke("auth:get-access-token")) as {
        token: string | null;
    };
    return result.token;
}

async function submit(request: ReportSubmitRequest) {
    try {
        const files: ReportUploadSource[] = [];
        let showFileTooLarge = false;
        if (request.sendShowFile) {
            const bytes = await invokeWorker<Uint8Array | null>(
                WEB_CHANNELS.reportCopy,
                request.expectedShowFileName ?? "",
                !!request.includeAudio,
            );
            if (!bytes)
                throw new ReportSubmitError(
                    "The open show changed",
                    SHOW_CHANGED_STATUS,
                );
            if (bytes.byteLength > MAX_SHOW_FILE_BYTES) showFileTooLarge = true;
            else
                files.push(
                    blobSource(
                        "show_file",
                        new Blob([bytes as BlobPart], {
                            type: "application/octet-stream",
                        }),
                        // Not the real file name: it often holds the school's name
                        "show.dots",
                    ),
                );
        }
        if (request.recording) {
            const { bytes, mimeType, seconds } = request.recording;
            const ext = mimeType.includes("mp4") ? "mp4" : "webm";
            files.push(
                blobSource(
                    "recording",
                    new Blob([bytes], { type: mimeType }),
                    `screen-recording.${ext}`,
                    seconds,
                ),
            );
        }
        files.push(
            blobSource(
                "diagnostics",
                new Blob([JSON.stringify(request.diagnostics ?? [])], {
                    type: "application/json",
                }),
                "diagnostics.json",
            ),
        );
        const { id } = await uploadReport(
            {
                apiBase: OPENMARCH_API_ENDPOINT,
                getToken,
                fetch: (...args) => fetch(...args),
                onProgress: (step) => emit("report:progress", step),
            },
            request.report,
            files,
        );
        return { ok: true as const, id, showFileTooLarge };
    } catch (error) {
        return {
            ok: false as const,
            status:
                error instanceof ReportSubmitError ? error.status : undefined,
            message: error instanceof Error ? error.message : String(error),
        };
    }
}

export function registerReportHandlers() {
    handleInPage("report:show-info", () =>
        invokeWorker(WEB_CHANNELS.reportShowInfo),
    );
    handleInPage("report:submit", (request: ReportSubmitRequest) =>
        submit(request),
    );
}
