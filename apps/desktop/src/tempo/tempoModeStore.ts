/**
 * Tempo mode: whether the timeline is in tempo mode. Its
 * own module, so the app's layout can read it without loading the tempo lanes.
 *
 * Tempo mode has one playhead and one Play (owner, 2026-10-30): the start flag is hidden and
 * parked while it's on (`setStartHidden`), and Play plays on from the playhead, or loops the
 * selected measures (`loop`).
 */
import { create } from "zustand";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";

/** The measures selected in tempo mode, which Play loops: spec beats, `to` exclusive */
export interface TempoLoop {
    readonly from: number;
    readonly to: number;
    /** As the Play button names it: "m. 11–12" */
    readonly label: string;
}

/** Whether the timeline is in tempo mode */
export const useTempoModeStore = create<{
    on: boolean;
    /** What Play loops; `null` with nothing selected, and Play plays on from the playhead */
    loop: TempoLoop | null;
    toggle: () => void;
    setOn: (on: boolean) => void;
    setLoop: (loop: TempoLoop | null) => void;
}>((set, get) => ({
    on: false,
    loop: null,
    toggle: () => get().setOn(!get().on),
    setOn: (on) => {
        if (on === get().on) return;
        useTimelineSelectionStore.getState().setStartHidden(on);
        set(on ? { on } : { on, loop: null });
    },
    setLoop: (loop) =>
        set((s) =>
            s.loop === loop ||
            (s.loop !== null &&
                loop !== null &&
                s.loop.from === loop.from &&
                s.loop.to === loop.to &&
                s.loop.label === loop.label)
                ? {}
                : { loop },
        ),
}));
