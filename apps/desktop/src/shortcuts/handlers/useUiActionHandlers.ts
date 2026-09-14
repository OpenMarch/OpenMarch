import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useActionHandler } from "../useActionHandler";

export function useUiActionHandlers() {
    const { uiSettings, setUiSettings } = useUiSettingsStore();
    const focus = (focussedComponent: "canvas" | "timeline") =>
        setUiSettings({ ...uiSettings, focussedComponent });

    useActionHandler("toggleNextPagePaths", () =>
        setUiSettings({ ...uiSettings, nextPaths: !uiSettings.nextPaths }),
    );
    useActionHandler("togglePreviousPagePaths", () =>
        setUiSettings({
            ...uiSettings,
            previousPaths: !uiSettings.previousPaths,
        }),
    );
    useActionHandler("focusCanvas", () => focus("canvas"));
    useActionHandler("exitTimelineFocus", () => focus("canvas"));
    useActionHandler("focusTimeline", () => focus("timeline"));
}
