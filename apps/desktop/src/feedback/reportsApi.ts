/**
 * Sending a report to app.openmarch.com (OpenMarch/om-online#92). The window
 * hands the text and the recording to the main process
 * (`electron/main/reportSubmit.ts`), which scrubs the show, collects the
 * editor's diagnostics, uploads the files straight to the reports bucket and
 * creates the report.
 */
import { OPENMARCH_APP_BASE_URL } from "@/global/Constants";
import type { ReportPayload } from "./reportForm";

/** The reporter's list of their reports on app.openmarch.com */
export const MY_REPORTS_URL = `${OPENMARCH_APP_BASE_URL}reports`;
export const reportUrl = (id: number) => `${MY_REPORTS_URL}/${id}`;

export interface ReportAttachments {
    readonly sendShowFile: boolean;
    /** The show the window showed; main refuses (409) if another is open now */
    readonly expectedShowFileName?: string;
    readonly includeAudio: boolean;
    readonly recording?: { readonly blob: Blob; readonly seconds: number };
}

export async function submitReport(
    report: ReportPayload,
    attachments: ReportAttachments,
): Promise<{ id: number; url: string; showFileTooLarge: boolean }> {
    const recording = attachments.recording
        ? {
              bytes: await attachments.recording.blob.arrayBuffer(),
              mimeType: attachments.recording.blob.type,
              seconds: attachments.recording.seconds,
          }
        : undefined;
    const result = await window.electron.report.submit({
        report: { ...report },
        sendShowFile: attachments.sendShowFile,
        expectedShowFileName: attachments.expectedShowFileName,
        includeAudio: attachments.includeAudio,
        recording,
    });
    if (!result.ok) throw new ReportSendError(result.message, result.status);
    return {
        id: result.id,
        url: reportUrl(result.id),
        showFileTooLarge: result.showFileTooLarge,
    };
}

export class ReportSendError extends Error {
    constructor(
        message: string,
        /** 401 signed out, 409 the open show changed, 429 too many today, 422 rejected */
        readonly status?: number,
    ) {
        super(message);
        this.name = "ReportSendError";
    }
}
