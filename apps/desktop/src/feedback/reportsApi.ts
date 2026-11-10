/**
 * Sending a report to app.openmarch.com (OpenMarch/om-online#91).
 *
 * Not connected yet: the endpoints are being built in om-online. Once its PR
 * lands, regenerate the editor API client (om-online `pnpm api-generate`) and
 * replace `submitReport` with: direct-upload each file to the reports bucket,
 * then create the report with the signed blob ids. Nothing else in the window
 * needs to change.
 */
import { OPENMARCH_APP_BASE_URL } from "@/global/Constants";
import type { ReportPayload } from "./reportForm";

/** The reporter's list of their reports on app.openmarch.com */
export const MY_REPORTS_URL = `${OPENMARCH_APP_BASE_URL}reports`;

export interface ReportFiles {
    /** Path of the scrubbed show copy the main process wrote */
    readonly showFilePath?: string;
    readonly recording?: Blob;
    readonly diagnostics: readonly unknown[];
}

export class ReportsNotConnectedError extends Error {
    constructor() {
        super("Sending reports isn't connected yet (om-online#91)");
        this.name = "ReportsNotConnectedError";
    }
}

// eslint-disable-next-line @typescript-eslint/require-await
export async function submitReport(
    _payload: ReportPayload,
    _files: ReportFiles,
): Promise<{ reportUrl: string }> {
    throw new ReportsNotConnectedError();
}
