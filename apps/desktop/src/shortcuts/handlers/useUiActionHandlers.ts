import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useStartFlagKeyStore } from "@/stores/StartFlagKeyStore";
import { useShortcutsDialogStore } from "@/stores/ShortcutsDialogStore";
import { isBasicMode, useEditorModeStore } from "@/stores/EditorModeStore";
import tolgee from "@/global/singletons/Tolgee";
import { useActionHandler } from "../useActionHandler";
import { useTempoModeStore } from "@/tempo/tempoModeStore";

export function useUiActionHandlers() {
    // Read when an action runs, so a settings change (such as a timeline zoom save) doesn't
    // re-render the handlers
    const setUiSettings = useUiSettingsStore((s) => s.setUiSettings);
    const settings = () => useUiSettingsStore.getState().uiSettings;

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
    // Tablet 3.5 (#888): Edit music (tempo mode) on or off, as its button and Shift+T do
    useActionHandler("toggleTempoMode", () =>
        useTempoModeStore.getState().toggle(),
    );
    useActionHandler("openView3d", () => {
        void window.electron.openView3d();
    });
    // UI-17 follow-up: ? lists every shortcut
    useActionHandler("showShortcuts", () =>
        useShortcutsDialogStore.getState().setOpen(true),
    );
    // Tablet 0.6 (#846): Basic or Expert, through the same setter as Settings › Timeline (no
    // confirmation there either). Unset or loading counts as Expert, as everywhere else. The
    // palette names the mode it switches to and the one that is on
    useActionHandler("toggleEditorMode", toggleEditorMode, {
        label: () =>
            isBasicMode()
                ? tolgee.t("actions.timeline.toggleEditorModeToExpert")
                : tolgee.t("actions.timeline.toggleEditorModeToBasic"),
    });
}

/** Switches to the other editor mode and saves it, as the Editor mode setting does */
export function toggleEditorMode() {
    useEditorModeStore.getState().setMode(isBasicMode() ? "expert" : "basic");
}
