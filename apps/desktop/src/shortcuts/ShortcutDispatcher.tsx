import { useEffect, useMemo } from "react";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { readShortcutContext } from "./context";
import {
    buildKeymap,
    compileKeymap,
    resolveKeyEvent,
    type ShortcutOverrides,
} from "./keymap";
import { isActionEnabled, runAction } from "./registry";

const NO_OVERRIDES: ShortcutOverrides = {};

/** The single keydown listener for all app shortcuts. Mount once. */
export default function ShortcutDispatcher({
    overrides = NO_OVERRIDES,
}: {
    overrides?: ShortcutOverrides;
}) {
    const compiled = useMemo(
        () => compileKeymap(buildKeymap(overrides)),
        [overrides],
    );

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.isComposing) return;
            // Read the store directly rather than via a hook-driven ref: a
            // hook selector only updates on React's next render, which can
            // lag behind a keydown that arrives immediately after a state
            // change (e.g. outside of an act()-wrapped event in tests, or a
            // rapid focus switch in the app).
            const baseScope =
                useUiSettingsStore.getState().uiSettings.focussedComponent;
            const entry = resolveKeyEvent(
                event,
                compiled,
                readShortcutContext(baseScope),
                isActionEnabled,
            );
            if (!entry) return;
            event.preventDefault();
            runAction(entry.id);
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [compiled]);

    return null;
}
