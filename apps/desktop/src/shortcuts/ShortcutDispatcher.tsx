import { useEffect, useMemo } from "react";
import { useShortcutOverridesStore } from "@/stores/ShortcutOverridesStore";
import {
    isTimelineOwnKey,
    shortcutStillRuns,
    skipsAppNudge,
} from "@/components/timeline/timelineHotkeys";
import { layerIsOpen, readShortcutContext } from "./context";
import {
    buildKeymap,
    compileKeymap,
    resolveKeyEvent,
    type ShortcutOverrides,
} from "./keymap";
import { ACTIONS, NUDGE_ACTION_IDS, type ActionId } from "./definitions";
import { fieldEditMode } from "@/field/editMode/fieldEditModeStore";
import {
    actionIgnoresRepeat,
    isActionEnabled,
    pressAction,
    type ReleaseReason,
} from "./registry";

const NUDGE_IDS: ReadonlySet<ActionId> = new Set(NUDGE_ACTION_IDS);

/** The single keydown listener for all app shortcuts. Mount once. Uses the saved overrides unless given some. */
export default function ShortcutDispatcher({
    overrides,
}: {
    overrides?: ShortcutOverrides;
}) {
    const savedOverrides = useShortcutOverridesStore((s) => s.overrides);
    const activeOverrides = overrides ?? savedOverrides;
    const compiled = useMemo(
        () => compileKeymap(buildKeymap(activeOverrides)),
        [activeOverrides],
    );

    useEffect(() => {
        // Actions that last while their key is held (the playback speed keys), by physical key
        const held = new Map<string, (reason: ReleaseReason) => void>();
        const releaseAll = () => {
            const releases = [...held.values()];
            held.clear();
            releases.forEach((release) => release("lost"));
        };
        const onKeyUp = (event: KeyboardEvent) => {
            const release = held.get(event.code);
            if (!release) return;
            held.delete(event.code);
            release("keyup");
        };
        // Read before anything handles the press: Escape closes an open menu or list (Radix),
        // and by the time the press reaches this dispatcher the layer may be gone, so the same
        // Escape would also cancel the shape tool (sims, round 7)
        let layerOpenAtPress = false;
        const onKeyDownCapture = (event: KeyboardEvent) => {
            layerOpenAtPress = event.key === "Escape" && layerIsOpen();
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape" && layerOpenAtPress) return;
            // Space on a Shape tool control reached by keyboard presses that control, not Play
            // (sims, draw round 1: Shift+Tab to Natural, Space, and the show played). A clicked
            // control keeps Space for Play.
            const active = document.activeElement;
            if (
                event.key === " " &&
                active instanceof HTMLElement &&
                active.matches(":focus-visible") &&
                active.closest("[data-shape-ui]")
            )
                return;
            if (
                (event.defaultPrevented && !shortcutStillRuns(event)) ||
                event.isComposing
            )
                return;
            // UI-14 round-2 review: Enter and the arrows on the timeline's move controls are
            // theirs; Space still plays
            const focused = document.activeElement;
            if (isTimelineOwnKey(event, focused)) return;
            const entry = resolveKeyEvent(
                event,
                compiled,
                readShortcutContext(),
                // No nudge on a timeline move control (code review). While the Field panel is
                // open (#824) the drill's canvas keys are off: a line key that can't run now
                // (H with nothing picked, X on another tab) must not fall through to the
                // drill command on the same key
                (id) =>
                    isActionEnabled(id) &&
                    !(NUDGE_IDS.has(id) && skipsAppNudge(event, focused)) &&
                    !(
                        ACTIONS[id].scope === "canvas" &&
                        fieldEditMode.isActive()
                    ),
            );
            if (!entry) return;
            event.preventDefault();
            if (
                event.repeat &&
                (entry.ignoreRepeat || actionIgnoresRepeat(entry.id))
            )
                return;
            // A second press of a held key (no keyup seen) lets go of the first
            held.get(event.code)?.("lost");
            held.delete(event.code);
            const release = pressAction(entry.id);
            if (release) held.set(event.code, release);
        };
        window.addEventListener("keydown", onKeyDownCapture, true);
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);
        window.addEventListener("blur", releaseAll);
        return () => {
            window.removeEventListener("keydown", onKeyDownCapture, true);
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keyup", onKeyUp);
            window.removeEventListener("blur", releaseAll);
            releaseAll();
        };
    }, [compiled]);

    return null;
}
