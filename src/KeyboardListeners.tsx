import { useCallback, useEffect } from "react";
import { useUiSettingsStore } from "./stores/uiSettings/useUiSettingsStore";

/**
 * Keyboard shortcuts for the application
 */
export const ReactKeyActions = {
    lockX: "z",
    lockY: "x",
    snapToNearestWhole: "1",
}

export default function KeyboardListener() {
    const { uiSettings, setUiSettings } = useUiSettingsStore()!;

    /**
     * Keydown and Keyup handler
     *
     * @param e
     * @param keydown true if keydown, false if keyup
     */
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (!document.activeElement?.matches("input, textarea, select, [contenteditable]") && !e.ctrlKey && !e.metaKey) {
            switch (e.key) {
                case ReactKeyActions.lockY:
                    setUiSettings({ ...uiSettings, lockY: !uiSettings.lockY }, "lockY");
                    break;
                case ReactKeyActions.lockX:
                    setUiSettings({ ...uiSettings, lockX: !uiSettings.lockX }, "lockX");
                    break;
            }
        }
    }, [uiSettings, setUiSettings]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [handleKeyDown]);
    return <></>; // Empty fragment
}
