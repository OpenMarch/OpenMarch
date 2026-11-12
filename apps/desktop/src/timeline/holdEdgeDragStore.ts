import { useMemo } from "react";
import { create } from "zustand";
import type { HeldMark } from "@/db-functions/timelineHeldArrival";
import { applyHoldEdgeDrag, type HoldEdgeDrag } from "./holdExtent";
import type { BeatRange, HoldLight } from "./timelineHoldBars";

/**
 * A Held hold's end being dragged on the timeline (fork #475), as it would land: the hold bars
 * draw it there (`useSelectionHolds`) until the drag ends and the marks it wrote are read.
 */
export const useHoldEdgeDragStore = create<{ drag: HoldEdgeDrag | null }>(
    () => ({ drag: null }),
);

/**
 * `marks` as the bars draw them: while a hold's end is dragged, where it would land
 * (`applyHoldEdgeDrag`, touching holds joined), with the dragged holds lit instead of `light`;
 * otherwise `marks` and `light` as they are.
 */
export function useDraggedHoldMarks(
    marks: readonly HeldMark[],
    light: HoldLight | null,
): { shownMarks: readonly HeldMark[]; light: HoldLight | null } {
    const drag = useHoldEdgeDragStore((s) => s.drag);
    return useMemo(() => {
        if (!drag) return { shownMarks: marks, light };
        const shown = applyHoldEdgeDrag(marks, drag);
        const dragged = new Set(drag.marcherIds);
        const byMarcher = new Map<number, readonly BeatRange[]>();
        for (const mark of shown) {
            if (!dragged.has(mark.marcherId)) continue;
            if (mark.start < drag.to && drag.to <= mark.end)
                byMarcher.set(mark.marcherId, [mark]);
        }
        return { shownMarks: shown, light: { byMarcher } };
    }, [marks, drag, light]);
}
