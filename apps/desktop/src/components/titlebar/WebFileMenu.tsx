import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@radix-ui/react-dropdown-menu";
import { ListIcon } from "@phosphor-icons/react";
import { useTolgee } from "@tolgee/react";
import { useSyncExternalStore } from "react";
import type { ActionId } from "@/shortcuts/definitions";
import { getActionLabel, getActionShortcutLabel } from "@/shortcuts/labels";
import {
    isActionEnabled,
    runAction,
    subscribeToActionHandlers,
} from "@/shortcuts/registry";
import { useShortcutOverridesStore } from "@/stores/ShortcutOverridesStore";
import { useShowShortcutHints } from "@/stores/KeyboardSeenStore";
import { useWebLibraryStore } from "@/stores/WebLibraryStore";

const itemClass =
    "rounded-4 text-body data-[highlighted]:bg-fg-2 flex cursor-pointer items-center justify-between gap-24 px-8 py-4 outline-hidden data-[disabled]:pointer-events-none data-[disabled]:opacity-50";

const FILE_ACTIONS: ActionId[] = [
    "launchNewFileDialogue",
    "launchLoadFileDialogue",
    "launchSaveFileDialogue",
    "closeFile",
    "openSettings",
];

/**
 * The web build's stand-in for the native app menu: the file actions, with
 * "Save a copy" as Back up (share or download the file: the show is already
 * saved in the browser) and the show's Versions.
 */
export default function WebFileMenu() {
    const { t } = useTolgee();
    const overrides = useShortcutOverridesStore((s) => s.overrides);
    // No ⌘O / Ctrl+, on a tablet until a keyboard has been used
    const showHints = useShowShortcutHints();
    const openId = useWebLibraryStore((state) => state.library?.openId ?? null);
    const setLibrary = useWebLibraryStore((state) => state.set);
    // Re-render when actions become available, e.g. Close once a show opens.
    useSyncExternalStore(subscribeToActionHandlers, () =>
        FILE_ACTIONS.map(isActionEnabled).join(),
    );

    const item = (action: ActionId, label = getActionLabel(action, t)) => (
        <DropdownMenuItem
            key={action}
            disabled={!isActionEnabled(action)}
            className={itemClass}
            onSelect={() => runAction(action)}
        >
            <span>{label}</span>
            {showHints && (
                <span className="text-sub text-text-subtitle">
                    {getActionShortcutLabel(action, { overrides })}
                </span>
            )}
        </DropdownMenuItem>
    );

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    aria-label={t("web.fileMenu")}
                    title={t("web.fileMenu")}
                    className="titlebar-button hover:text-accent touch:flex touch:size-44 touch:items-center touch:justify-center cursor-pointer outline-hidden duration-150 ease-out focus-visible:-translate-y-4"
                >
                    <ListIcon size={18} />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="start"
                sideOffset={8}
                className="rounded-6 border-stroke bg-bg-1 text-text z-50 flex min-w-[220px] flex-col border p-4 shadow-lg"
            >
                {item("launchNewFileDialogue")}
                {item("launchLoadFileDialogue")}
                {item("launchSaveFileDialogue", t("web.backUp"))}
                {openId && (
                    <DropdownMenuItem
                        className={itemClass}
                        onSelect={() => setLibrary({ versionsFor: openId })}
                    >
                        <span>{t("web.versionsMenu")}</span>
                    </DropdownMenuItem>
                )}
                {item("exportVideo")}
                {item("closeFile")}
                <DropdownMenuSeparator className="bg-stroke my-4 h-px" />
                {item("openSettings")}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
