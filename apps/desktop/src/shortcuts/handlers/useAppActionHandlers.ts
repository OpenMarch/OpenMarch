import * as api from "@/api/api";
import { useDatabaseReady } from "@/hooks/useDatabaseReady";
import { useAppDialogStore, type ExportTab } from "@/stores/AppDialogStore";
import { EXPORT_ACTION_IDS } from "../definitions";
import { useActionHandler, useActionHandlerGroup } from "../useActionHandler";
import { isWebBuild } from "@/utilities/webBuild";

const WEB_EXPORT_ACTION_IDS = ["openExportDialog", "exportVideo"] as const;

/** App-level commands: exporting and closing the show. */
export function useAppActionHandlers() {
    const databaseReady = useDatabaseReady();
    const openExport = useAppDialogStore((s) => s.openExport);

    useActionHandlerGroup(
        // On the web only video export works: the others need Electron
        // (printToPDF, file streams, sign-in).
        isWebBuild ? WEB_EXPORT_ACTION_IDS : EXPORT_ACTION_IDS,
        (_id, args) =>
            openExport(
                isWebBuild ? "video" : (args?.tab as ExportTab | undefined),
            ),
        { enabled: databaseReady },
    );
    useActionHandler("closeFile", () => void api.closeCurrentFile(), {
        enabled: databaseReady,
    });
}
