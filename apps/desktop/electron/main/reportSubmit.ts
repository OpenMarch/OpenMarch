/**
 * Sends a bug report to app.openmarch.com (fork #801, OpenMarch/om-online#92).
 *
 * Runs in the main process: files go straight from disk to the reports
 * bucket (no 1 GB show copy in the window's memory, and no browser Origin for
 * the bucket's CORS to judge). For each file: ask the editor API for a direct
 * upload (`POST report_uploads`, with size and MD5), PUT the bytes to the URL
 * it returns, keep the `signed_id`. Then create the report with those ids.
 */
import { createHash } from "crypto";
import * as fs from "fs";
import { Readable } from "stream";

export type ReportFileSlot = "recording" | "show_file" | "diagnostics";

export interface ReportFileToSend {
    readonly slot: ReportFileSlot;
    readonly path: string;
    readonly filename: string;
    readonly contentType: string;
    /** Recordings only: the server checks the 5-minute cap against it */
    readonly durationSeconds?: number;
}

export interface SubmitDeps {
    /** The editor API's base, ending in a slash (VITE_EDITOR_API_URL) */
    readonly apiBase: string;
    readonly getToken: () => Promise<string | null>;
    readonly fetch: typeof fetch;
    /** Told before each step, for the window's progress line */
    readonly onProgress?: (step: SubmitStep) => void;
}

export type SubmitStep =
    | { readonly kind: "uploading"; readonly slot: ReportFileSlot }
    | { readonly kind: "creating" };

export class ReportSubmitError extends Error {
    constructor(
        message: string,
        readonly status?: number,
    ) {
        super(message);
        this.name = "ReportSubmitError";
    }
}

/** Active Storage's checksum: base64 of the file's MD5. */
export async function md5Base64(path: string): Promise<string> {
    const hash = createHash("md5");
    for await (const chunk of fs.createReadStream(path)) hash.update(chunk);
    return hash.digest("base64");
}

async function apiPost(
    deps: SubmitDeps,
    token: string,
    path: string,
    body: unknown,
): Promise<unknown> {
    const response = await deps.fetch(`${deps.apiBase}${path}`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify(body),
    });
    const json = (await response.json().catch(() => ({}))) as {
        error?: string;
    };
    if (!response.ok)
        throw new ReportSubmitError(
            json.error ?? `${path} failed (${response.status})`,
            response.status,
        );
    return json;
}

async function uploadFile(
    deps: SubmitDeps,
    token: string,
    file: ReportFileToSend,
): Promise<string> {
    const byteSize = fs.statSync(file.path).size;
    const checksum = await md5Base64(file.path);
    const started = (await apiPost(deps, token, "v1/report_uploads", {
        file: file.slot,
        blob: {
            filename: file.filename,
            byte_size: byteSize,
            checksum,
            content_type: file.contentType,
            ...(file.durationSeconds !== undefined
                ? { duration_seconds: file.durationSeconds }
                : {}),
        },
    })) as {
        signed_id: string;
        direct_upload: { url: string; headers: Record<string, string> };
    };

    const put = await deps.fetch(started.direct_upload.url, {
        method: "PUT",
        headers: started.direct_upload.headers,
        body: Readable.toWeb(
            fs.createReadStream(file.path),
        ) as unknown as BodyInit,
        // Node's fetch needs this to stream a request body
        duplex: "half",
    } as RequestInit);
    if (!put.ok)
        throw new ReportSubmitError(
            `Uploading the ${file.slot} failed (${put.status})`,
            put.status,
        );
    return started.signed_id;
}

/**
 * Uploads the files, then creates the report. `report` is the API's `report`
 * object without `files`. Returns the created report's id.
 */
export async function submitReportFromMain(
    deps: SubmitDeps,
    report: Record<string, unknown>,
    files: readonly ReportFileToSend[],
): Promise<{ id: number }> {
    const token = await deps.getToken();
    if (!token) throw new ReportSubmitError("Not signed in", 401);

    const signedIds: Partial<Record<ReportFileSlot, string>> = {};
    for (const file of files) {
        deps.onProgress?.({ kind: "uploading", slot: file.slot });
        signedIds[file.slot] = await uploadFile(deps, token, file);
    }

    deps.onProgress?.({ kind: "creating" });
    const created = (await apiPost(deps, token, "v1/reports", {
        report: { ...report, files: signedIds },
    })) as { report: { id: number } };
    return { id: created.report.id };
}
