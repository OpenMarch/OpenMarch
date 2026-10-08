import { useEffect, useRef } from "react";
import type CanvasMarcher from "@/global/classes/canvasObjects/CanvasMarcher";

type Appearances = Parameters<CanvasMarcher["setAppearance"]>[0];
type LabelColor = Parameters<CanvasMarcher["setAppearance"]>[2];

/**
 * Page mode: styles each marcher with the selected page's appearance. The query is keyed by page,
 * so every page change brings a new map, usually with the same appearances; a marcher whose
 * appearance is what was last applied to it is skipped, and nothing is redrawn when none changed.
 *
 * What was last applied is forgotten when `timelineMode` changes: timeline mode styles the same
 * canvas marchers by beat (`useTimelineAppearance`), so back in page mode every marcher is styled
 * again even when the page's appearance is the one recorded before.
 */
export function usePageAppearances({
    canvas,
    marchers,
    marcherVisuals,
    marcherAppearances,
    labelColor,
    timelineMode,
}: {
    canvas: { requestRenderAll(): void } | null | undefined;
    marchers: readonly { id: number }[] | null | undefined;
    marcherVisuals:
        | Record<number, { getCanvasMarcher(): CanvasMarcher } | undefined>
        | null
        | undefined;
    marcherAppearances:
        | Record<number, Appearances | undefined>
        | null
        | undefined;
    labelColor: LabelColor;
    timelineMode: boolean;
}): void {
    const appliedAppearances = useRef(new WeakMap<object, string>());
    const appliedInTimelineMode = useRef(timelineMode);
    useEffect(() => {
        if (appliedInTimelineMode.current !== timelineMode) {
            appliedInTimelineMode.current = timelineMode;
            appliedAppearances.current = new WeakMap();
        }
        if (
            !canvas ||
            !marchers ||
            marcherAppearances == null ||
            marcherVisuals == null
        )
            return;

        let changed = false;
        marchers.forEach((marcher) => {
            const visualGroup = marcherVisuals[marcher.id];
            const appearancesForMarcher = marcherAppearances[marcher.id];
            if (!visualGroup || !appearancesForMarcher) return;

            const canvasMarcher = visualGroup.getCanvasMarcher();
            const key = JSON.stringify([appearancesForMarcher, labelColor]);
            if (appliedAppearances.current.get(canvasMarcher) === key) return;
            appliedAppearances.current.set(canvasMarcher, key);
            changed = true;
            canvasMarcher.setAppearance(
                appearancesForMarcher,
                {
                    requestRenderAll: false,
                },
                labelColor,
            );
        });

        if (changed) canvas.requestRenderAll();
    }, [
        canvas,
        marchers,
        marcherAppearances,
        marcherVisuals,
        labelColor,
        timelineMode,
    ]);
}
