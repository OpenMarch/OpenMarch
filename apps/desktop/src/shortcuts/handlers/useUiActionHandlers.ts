import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useShortcutsDialogStore } from "@/stores/ShortcutsDialogStore";
import { useActionHandler } from "../useActionHandler";

export function useUiActionHandlers() {
    // Read when an action runs, so a settings change (such as a timeline zoom save) doesn't
    // re-render the handlers
    const setUiSettings = useUiSettingsStore((s) => s.setUiSettings);
    const settings = () => useUiSettingsStore.getState().uiSettings;
    const focus = (focussedComponent: "canvas" | "timeline") =>
        setUiSettings({ ...settings(), focussedComponent });

    useActionHandler("toggleNextPagePaths", () =>
        setUiSettings({ ...settings(), nextPaths: !settings().nextPaths }),
    );
    useActionHandler("togglePreviousPagePaths", () =>
        setUiSettings({
            ...settings(),
            previousPaths: !settings().previousPaths,
        }),
    );
    useActionHandler("focusCanvas", () => focus("canvas"));
    useActionHandler("exitTimelineFocus", () => focus("canvas"));
    useActionHandler("focusTimeline", () => focus("timeline"));
    // UI-17 follow-up: ? lists every shortcut
    useActionHandler("showShortcuts", () =>
        useShortcutsDialogStore.getState().setOpen(true),
    );
}
