import type OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import type MarcherVisualGroup from "@/global/classes/MarcherVisualGroup";
import { useHighlightedMarchersStore } from "@/stores/HighlightedMarchersStore";
import { useEffect, useRef } from "react";

function applyHighlightToMarcher(
    canvas: OpenMarchCanvas,
    marcherId: number,
    active: boolean,
) {
    const canvasMarcher = canvas.getCanvasMarchersByIds([marcherId])[0];
    canvasMarcher?.setMarcherHighlight(active);
}

function syncHighlightedMarchers(
    canvas: OpenMarchCanvas,
    nextIds: ReadonlySet<number>,
    prevIds: Set<number>,
): boolean {
    let changed = false;

    for (const id of prevIds) {
        if (!nextIds.has(id)) {
            applyHighlightToMarcher(canvas, id, false);
            changed = true;
        }
    }

    // Re-apply for all current IDs (including unchanged) so highlights survive page/visual sync
    for (const id of nextIds) {
        applyHighlightToMarcher(canvas, id, true);
        changed = true;
    }

    return changed;
}

export function useHighlightedMarchers({
    canvas,
    marcherVisuals,
    selectedPageId,
}: {
    canvas: OpenMarchCanvas | null;
    marcherVisuals: Record<number, MarcherVisualGroup> | undefined;
    selectedPageId: number | undefined;
}) {
    const highlightedMarcherIds =
        useHighlightedMarchersStore.use.highlightedMarcherIds();
    const prevIdsRef = useRef<Set<number>>(new Set());

    useEffect(() => {
        if (!canvas) {
            return;
        }

        const prevIds = prevIdsRef.current;
        const changed = syncHighlightedMarchers(
            canvas,
            highlightedMarcherIds,
            prevIds,
        );
        prevIdsRef.current = new Set(highlightedMarcherIds);

        if (changed) {
            canvas.requestRenderAll();
        }

        return () => {
            for (const id of prevIdsRef.current) {
                applyHighlightToMarcher(canvas, id, false);
            }
            prevIdsRef.current = new Set();
            canvas.requestRenderAll();
        };
    }, [canvas, highlightedMarcherIds, marcherVisuals, selectedPageId]);
}
