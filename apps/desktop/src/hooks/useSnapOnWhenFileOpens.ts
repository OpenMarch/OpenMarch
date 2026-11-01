import { useEffect } from "react";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";

/**
 * Turns the Snap toggle back on when a file opens or a new one is made (`fileOpen` becomes true),
 * so a forgotten toggle doesn't carry into the next show
 */
export function useSnapOnWhenFileOpens(fileOpen: boolean) {
    useEffect(() => {
        if (fileOpen) useUiSettingsStore.getState().setSnap(true);
    }, [fileOpen]);
}
