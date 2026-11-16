/**
 * Starts the diagnostics log in the editor; the report drawer sends its
 * entries with a report. Fork #801.
 */
import { subscribeToActionRuns } from "@/shortcuts/registry";
import {
    createDiagnosticsLog,
    installDiagnostics,
    type DiagnosticEntry,
} from "./diagnostics";

let editorLog: ReturnType<typeof createDiagnosticsLog> | null = null;

export function installEditorDiagnostics() {
    const log = createDiagnosticsLog();
    editorLog = log;
    installDiagnostics(log, {
        console,
        events: window,
        subscribeToActions: subscribeToActionRuns,
    });
}

/** The log's entries, sent with a report */
export const editorDiagnosticsEntries = (): readonly DiagnosticEntry[] =>
    editorLog?.entries() ?? [];
