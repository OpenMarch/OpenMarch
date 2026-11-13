/**
 * Sends a bug report from the desktop main process (fork #801): files go
 * straight from disk to the reports bucket (no 1 GB show copy in the window's
 * memory, and no browser Origin for the bucket's CORS to judge). The steps
 * are in `src/feedback/reportUpload.ts`, shared with the web editor.
 */
import { createHash } from "crypto";
import * as fs from "fs";
import { Readable } from "stream";
import {
    ReportSubmitError,
    uploadReport,
    type ReportFileSlot,
    type ReportUploadDeps,
    type SubmitStep,
} from "../../src/feedback/reportUpload";

export { ReportSubmitError };
export type { ReportFileSlot, SubmitStep };
export type SubmitDeps = ReportUploadDeps;

export interface ReportFileToSend {
    readonly slot: ReportFileSlot;
    readonly path: string;
    readonly filename: string;
    readonly contentType: string;
    /** Recordings only: the server checks the 5-minute cap against it */
    readonly durationSeconds?: number;
}

/** Active Storage's checksum: base64 of the file's MD5. */
export async function md5Base64(path: string): Promise<string> {
    const hash = createHash("md5");
    for await (const chunk of fs.createReadStream(path)) hash.update(chunk);
    return hash.digest("base64");
}

/**
 * Uploads the files, then creates the report. `report` is the API's `report`
 * object without `files`. Returns the created report's id.
 */
export function submitReportFromMain(
    deps: SubmitDeps,
    report: Record<string, unknown>,
    files: readonly ReportFileToSend[],
): Promise<{ id: number }> {
    return uploadReport(
        deps,
        report,
        files.map((file) => {
            const byteSize = fs.statSync(file.path).size;
            return {
                slot: file.slot,
                filename: file.filename,
                contentType: file.contentType,
                durationSeconds: file.durationSeconds,
                byteSize,
                checksum: () => md5Base64(file.path),
                body: () => ({
                    body: Readable.toWeb(
                        fs.createReadStream(file.path),
                    ) as unknown as BodyInit,
                    // Node's fetch needs this to stream a request body
                    init: { duplex: "half" },
                    // Without it a stream goes out chunked, and R2 refuses the
                    // presigned PUT (it signs the length): 403 SignatureDoesNotMatch
                    headers: { "Content-Length": String(byteSize) },
                }),
            };
        }),
    );
}
