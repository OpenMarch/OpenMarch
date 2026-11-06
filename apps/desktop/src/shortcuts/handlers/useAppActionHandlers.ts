import * as api from "@/api/api";
import { useDatabaseReady } from "@/hooks/useDatabaseReady";
import { useAppDialogStore, type ExportTab } from "@/stores/AppDialogStore";
import { EXPORT_ACTION_IDS } from "../definitions";
import { useActionHandler, useActionHandlerGroup } from "../useActionHandler";
import { isWebBuild } from "@/utilities/webBuild";

/**
 * On the web only video export and mobile upload work: the others need
 * Electron (printToPDF, file streams). Mobile upload says so in builds that
 * can't sign in.
 */
const WEB_EXPORT_ACTION_IDS = [
    "openExportDialog",
    "exportVideo",
    "exportToMobile",
] as const;

/** App-level commands: exporting and closing the show. */
export function useAppActionHandlers() {
    const databaseReady = useDatabaseReady();
    const openExport = useAppDialogStore((s) => s.openExport);

    useActionHandlerGroup(
        isWebBuild ? WEB_EXPORT_ACTION_IDS : EXPORT_ACTION_IDS,
        (id, args) =>
            // The web dialog opens on video unless mobile was asked for
            // (openExportDialog names mobile, the desktop app's first tab).
            openExport(
                isWebBuild
                    ? id === "exportToMobile"
                        ? "mobile"
                        : "video"
                    : (args?.tab as ExportTab | undefined),
            ),
        { enabled: databaseReady },
    );
    useActionHandler("closeFile", () => void api.closeCurrentFile(), {
        enabled: databaseReady,
    });
}
