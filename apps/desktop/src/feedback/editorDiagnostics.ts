/**
 * Starts the diagnostics log in the editor window and answers the report
 * window's request for it (through the main process). Fork #801.
 */
import { subscribeToActionRuns } from "@/shortcuts/registry";
import { createDiagnosticsLog, installDiagnostics } from "./diagnostics";

export function installEditorDiagnostics() {
    const log = createDiagnosticsLog();
    installDiagnostics(log, {
        console,
        events: window,
        subscribeToActions: subscribeToActionRuns,
    });
    window.electron?.report?.answerDiagnostics(() => log.entries());
}
