/**
 * Sends a bug report to app.openmarch.com (fork #801, OpenMarch/om-online#92),
 * from wherever the files are: the desktop main process (files on disk,
 * `electron/main/reportSubmit.ts`) or the web editor's page (Blobs,
 * `web/renderer/report.ts`).
 *
 * For each file: ask the editor API for a direct upload (`POST
 * report_uploads`, with size and MD5), PUT the bytes to the URL it returns,
 * keep the `signed_id`. Then create the report with those ids.
 */

export type ReportFileSlot = "recording" | "show_file" | "diagnostics";

export interface ReportUploadSource {
    readonly slot: ReportFileSlot;
    readonly filename: string;
    readonly contentType: string;
    /** Recordings only: the server checks the 5-minute cap against it */
    readonly durationSeconds?: number;
    readonly byteSize: number;
    /** Base64 of the bytes' MD5, Active Storage's checksum */
    readonly checksum: () => Promise<string>;
    /**
     * The request body for the PUT, any extra fetch options it needs, and any
     * headers to add to the ones the API returned (a streamed body must state
     * its Content-Length: the presigned URL signs it)
     */
    readonly body: () => {
        body: BodyInit;
        init?: Record<string, unknown>;
        headers?: Record<string, string>;
    };
}

export interface ReportUploadDeps {
    /** The editor API's base, ending in a slash */
    readonly apiBase: string;
    readonly getToken: () => Promise<string | null>;
    readonly fetch: typeof fetch;
    /** Told before each step, for the window's progress line */
    readonly onProgress?: (step: SubmitStep) => void;
}

export type SubmitStep =
    | { readonly kind: "uploading"; readonly slot: ReportFileSlot }
    | { readonly kind: "creating" };

/** The message when there's no sign-in to send with */
export const NOT_SIGNED_IN = "Not signed in";

export class ReportSubmitError extends Error {
    constructor(
        message: string,
        readonly status?: number,
    ) {
        super(message);
        this.name = "ReportSubmitError";
    }
}

async function apiPost(
    deps: ReportUploadDeps,
    path: string,
    body: unknown,
): Promise<unknown> {
    // Asked for each request: a big upload can outlast the token it started with
    const token = await deps.getToken();
    if (!token) throw new ReportSubmitError(NOT_SIGNED_IN, 401);
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
    deps: ReportUploadDeps,
    file: ReportUploadSource,
): Promise<string> {
    const started = (await apiPost(deps, "v1/report_uploads", {
        file: file.slot,
        blob: {
            filename: file.filename,
            byte_size: file.byteSize,
            checksum: await file.checksum(),
            content_type: file.contentType,
            ...(file.durationSeconds !== undefined
                ? { duration_seconds: file.durationSeconds }
                : {}),
        },
    })) as {
        signed_id: string;
        direct_upload: { url: string; headers: Record<string, string> };
    };

    const { body, init, headers } = file.body();
    const put = await deps.fetch(started.direct_upload.url, {
        ...init,
        method: "PUT",
        headers: { ...started.direct_upload.headers, ...headers },
        body,
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
export async function uploadReport(
    deps: ReportUploadDeps,
    report: Record<string, unknown>,
    files: readonly ReportUploadSource[],
): Promise<{ id: number }> {
    // Signed out: say so before uploading anything
    if (!(await deps.getToken()))
        throw new ReportSubmitError(NOT_SIGNED_IN, 401);

    const signedIds: Partial<Record<ReportFileSlot, string>> = {};
    for (const file of files) {
        deps.onProgress?.({ kind: "uploading", slot: file.slot });
        signedIds[file.slot] = await uploadFile(deps, file);
    }

    deps.onProgress?.({ kind: "creating" });
    const created = (await apiPost(deps, "v1/reports", {
        report: { ...report, files: signedIds },
    })) as { report: { id: number } };
    return { id: created.report.id };
}
