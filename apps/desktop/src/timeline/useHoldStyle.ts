import { useMemo } from "react";
import tolgee from "@/global/singletons/Tolgee";
import { db } from "@/global/database/db";
import { isInsideHeldMark } from "@/db-functions/timelineHeldArrival";
import { setHoldStyle } from "@/db-functions/timelineHoldStyle";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { sharedHoldStyle, type HoldStyle } from "./holdStyle";
import { toastTimelineError } from "./timelineErrorMessages";
import { useHeldMarksStore } from "./useHeldMarks";

/** The selection's hold style at the playhead (`useSelectionHoldStyle`). */
export interface SelectionHoldStyle {
    /** How many selected marchers are Held at the playhead: only their holds take a style */
    readonly held: number;
    /**
     * The style those holds share (`null` is the show setting), `"mixed"` where they differ, or
     * `undefined` when no selected marcher is Held there
     */
    readonly style: HoldStyle | null | "mixed" | undefined;
    /** Sets the style of those holds, as one undo step; a failure is a toast */
    readonly set: (style: HoldStyle | null) => void;
}

/**
 * **Hold style** for the selection (ADR 0015 D-5; fork #775): the style of the selected marchers'
 * Held holds the playhead is inside, and the command that sets it. It reads the count the Held
 * count line reads (`useExpertHolds`): the end of the edit window, which is the playhead. Outside
 * timeline mode, or on the starting spots, nobody is Held.
 *
 * @param marcherIds the selected marchers; keep the array stable while the selection is
 */
export function useSelectionHoldStyle(
    marcherIds: readonly number[],
): SelectionHoldStyle {
    const beat = useTimelineSelectionStore((s) =>
        s.selection.kind === "range" ? s.selection.end : null,
    );
    const marks = useHeldMarksStore((s) => s.marks);
    return useMemo(() => {
        const selected = new Set(marcherIds);
        const held =
            beat === null
                ? []
                : marks.filter(
                      (m) =>
                          selected.has(m.marcherId) &&
                          isInsideHeldMark(m, beat),
                  );
        return {
            held: held.length,
            style: sharedHoldStyle(held.map((m) => m.style)),
            set: (style) => {
                if (beat === null) return;
                void setHoldStyle({ db, marcherIds, beat, style }).catch(
                    (error) =>
                        toastTimelineError(
                            error,
                            tolgee.t(
                                "timeline.holdEdge.styleError",
                                "Couldn't change the hold style",
                            ),
                        ),
                );
            },
        };
    }, [marcherIds, marks, beat]);
}
