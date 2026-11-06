import * as api from "@/api/api";
import { useDatabaseReady } from "@/hooks/useDatabaseReady";
import { useAppDialogStore, type ExportTab } from "@/stores/AppDialogStore";
import { EXPORT_ACTION_IDS } from "../definitions";
import { useActionHandler, useActionHandlerGroup } from "../useActionHandler";
import { isWebBuild } from "@/utilities/webBuild";
import { isSignInEnabled } from "@/global/auth/constants";

/**
 * On the web only video export works, and mobile upload where the build can
 * sign in: the others need Electron (printToPDF, file streams).
 */
const WEB_EXPORT_ACTION_IDS = isSignInEnabled
    ? (["openExportDialog", "exportVideo", "exportToMobile"] as const)
    : (["openExportDialog", "exportVideo"] as const);

/** App-level commands: exporting and closing the show. */
export function useAppActionHandlers() {
    const databaseReady = useDatabaseReady();
    const openExport = useAppDialogStore((s) => s.openExport);

    useActionHandlerGroup(
        isWebBuild ? WEB_EXPORT_ACTION_IDS : EXPORT_ACTION_IDS,
        (_id, args) => {
            const tab = args?.tab as ExportTab | undefined;
            // The web dialog opens on video unless mobile was asked for.
            openExport(isWebBuild && tab !== "mobile" ? "video" : tab);
        },
        { enabled: databaseReady },
    );
    useActionHandler("closeFile", () => void api.closeCurrentFile(), {
        enabled: databaseReady,
    });
}
