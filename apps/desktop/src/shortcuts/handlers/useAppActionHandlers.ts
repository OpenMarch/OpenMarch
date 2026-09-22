import * as api from "@/api/api";
import { useDatabaseReady } from "@/hooks/useDatabaseReady";
import { useAppDialogStore, type ExportTab } from "@/stores/AppDialogStore";
import { EXPORT_ACTION_IDS } from "../definitions";
import { useActionHandler, useActionHandlerGroup } from "../useActionHandler";

/** App-level commands: settings, exporting and closing the show. */
export function useAppActionHandlers() {
    const databaseReady = useDatabaseReady();
    const setSettingsOpen = useAppDialogStore((s) => s.setSettingsOpen);
    const openExport = useAppDialogStore((s) => s.openExport);

    useActionHandler("openSettings", () => setSettingsOpen(true));
    useActionHandlerGroup(
        EXPORT_ACTION_IDS,
        (_id, args) => openExport(args?.tab as ExportTab | undefined),
        { enabled: databaseReady },
    );
    useActionHandler("closeFile", () => void api.closeCurrentFile(), {
        enabled: databaseReady,
    });
}
