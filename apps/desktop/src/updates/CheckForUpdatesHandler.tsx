import { useEffect } from "react";
import { useTranslate } from "@tolgee/react";
import { CHECK_FOR_UPDATES_MENU_ACTION } from "@/global/menuActions";
import { useActionHandler } from "@/shortcuts/useActionHandler";
import { runAction } from "@/shortcuts/registry";
import { checkForUpdatesAndReport } from "./checkForUpdates";

/**
 * "Check for updates" (fork #404), from the command palette and the app menu. Mounted once at
 * the top of the app, so it works on every screen: launch page, welcome and editor. The
 * editor's own menu listener (`isMenuAction`) leaves this item alone.
 */
export default function CheckForUpdatesHandler() {
    const { t } = useTranslate();
    useActionHandler("checkForUpdates", () => {
        void checkForUpdatesAndReport(t);
    });
    useEffect(
        () =>
            window.electron?.onMenuAction?.((action) => {
                if (action === CHECK_FOR_UPDATES_MENU_ACTION.action)
                    runAction("checkForUpdates");
            }),
        [],
    );
    return null;
}
