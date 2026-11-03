import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useStartFlagKeyStore } from "@/stores/StartFlagKeyStore";
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
    // Start flag positions (#331): N shows the Hold N state while held, and a quick tap latches
    // it. A lost key (the window lost focus) lets go without counting as a tap. The palette has
    // no key to let go, so it toggles the latch.
    const startFlagKey = useStartFlagKeyStore.getState;
    useActionHandler(
        "toggleStartFlagPositions",
        () => startFlagKey().toggleLatched(),
        {
            onPress: () => startFlagKey().press(),
            onRelease: (reason) =>
                reason === "keyup"
                    ? startFlagKey().release()
                    : startFlagKey().blurRelease(),
        },
    );
    useActionHandler("focusCanvas", () => focus("canvas"));
    useActionHandler("exitTimelineFocus", () => focus("canvas"));
    useActionHandler("focusTimeline", () => focus("timeline"));
    useActionHandler("openView3d", () => {
        void window.electron.openView3d();
    });
    // UI-17 follow-up: ? lists every shortcut
    useActionHandler("showShortcuts", () =>
        useShortcutsDialogStore.getState().setOpen(true),
    );
}
