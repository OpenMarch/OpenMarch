import { useEffect } from "react";
import type OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";

/**
 * Keeps the canvas's UI settings in step with the store: set once, then on every change, through
 * a store subscription so a settings change doesn't re-render the component holding the canvas.
 */
export function useCanvasUiSettings(canvas: OpenMarchCanvas | null): void {
    useEffect(() => {
        if (!canvas) return;
        canvas.setUiSettings(useUiSettingsStore.getState().uiSettings);
        return useUiSettingsStore.subscribe((state, prevState) => {
            if (state.uiSettings === prevState.uiSettings) return;
            // Inside the store's write: a failed update mustn't reach the settings change that
            // made it, or stop the store's other listeners
            try {
                canvas.setUiSettings(state.uiSettings);
            } catch (error) {
                console.error(
                    "Error applying the UI settings to the canvas",
                    error,
                );
            }
        });
    }, [canvas]);
}
