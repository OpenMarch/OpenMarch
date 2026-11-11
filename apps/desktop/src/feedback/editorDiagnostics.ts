/**
 * Starts the diagnostics log in the editor window and answers the report
 * window's request for it (through the main process). Fork #801.
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
    window.electron?.report?.answerDiagnostics(() => log.entries());
}

/** The log's entries, for the web editor, whose report form is in the same page */
export const editorDiagnosticsEntries = (): readonly DiagnosticEntry[] =>
    editorLog?.entries() ?? [];
