/**
 * Tempo mode's keys, for as long as the editor's timeline is on screen: Shift+T turns tempo mode
 * ("Edit music") on and off, and while it's on, a capture-phase guard leaves only navigation keys
 * on (`installTempoKeyGuard`). They used to live in the Edit music button, which the touch
 * transport doesn't show (tablet 3.5, #888): mounted from the timeline panel, they work whichever
 * control turned tempo mode on.
 */
import { useEffect } from "react";
import { useTempoModeStore } from "./tempoModeStore";
import { dialogHasKeys, installTempoKeyGuard } from "./tempoShortcuts";

export function useTempoModeKeys(): void {
    // Tempo mode leaves only navigation keys on (and its own)
    useEffect(() => installTempoKeyGuard(), []);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
            if (e.key !== "T" && e.key !== "t") return;
            const target = e.target as HTMLElement | null;
            if (target?.closest("input, textarea, [contenteditable=true]"))
                return;
            // not behind a dialog, nor from a held key flicking it on and off
            if (dialogHasKeys(target)) return;
            e.preventDefault();
            if (e.repeat) return;
            useTempoModeStore.getState().toggle();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);
}
