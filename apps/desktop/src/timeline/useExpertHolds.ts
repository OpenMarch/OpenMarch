import { useMemo } from "react";
import { isInsideHeldMark } from "@/db-functions/timelineHeldArrival";
import { useTimingObjects } from "@/hooks";
import { useIsBasicMode } from "@/stores/EditorModeStore";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { clearHoldLight, setHoldLight } from "./holdLight";
import { holdOverWindowLight } from "./timelineExpertHolds";
import { movesFromSpans } from "./timelineKeepLater";
import { pageFlags } from "./timelinePlayhead";
import { resolverSpans, useTimelineResolverStore } from "./timelineStore";
import { useHeldMarksStore } from "./useHeldMarks";

/** Who lights the hold bars while **Hold over the window** is highlighted (`setHoldLight`) */
const WINDOW_PREVIEW_LIGHT = "hold-over-window";

/** The selection's Expert hold state, from the edit window (`useExpertHolds`). */
export interface ExpertHolds {
    /**
     * The window **Hold over the window** would hold over (`[S, P)`): set in Expert timeline
     * mode, outside isolation, with a window and marchers selected; null otherwise
     */
    readonly window: { readonly start: number; readonly end: number } | null;
    /** How many selected marchers are Held at the playhead, when it's only some of them */
    readonly partlyHeld: {
        readonly held: number;
        readonly total: number;
    } | null;
    /** Shows (`on`) or stops the hold **Hold over the window** would make on the bars */
    readonly onPreview: (on: boolean) => void;
}

const stopPreview = (_on: boolean) => clearHoldLight(WINDOW_PREVIEW_LIGHT);

/**
 * The selection's Expert hold state (fork #476): the window to hold over, its preview, and how
 * many of the selection are Held at the playhead. Worked out again when the window, the resolver
 * or the marks change.
 *
 * @param marcherIds the selected marchers; keep the array stable while the selection is
 */
export function useExpertHolds(marcherIds: readonly number[]): ExpertHolds {
    const selection = useTimelineSelectionStore((s) => s.selection);
    const isolated = useTimelineSelectionStore((s) => s.isolation !== null);
    const basic = useIsBasicMode();
    const resolver = useTimelineResolverStore((s) => s.resolver);
    const version = useTimelineResolverStore((s) => s.version);
    const marks = useHeldMarksStore((s) => s.marks);
    const pages = useTimingObjects()?.pages;
    const showEnd = useTimelineSelectionStore((s) =>
        s.pageBoxes.reduce((end, box) => Math.max(end, box.end), 0),
    );
    return useMemo(() => {
        void version; // a new version means new spans
        const none = { window: null, partlyHeld: null, onPreview: stopPreview };
        if (selection.kind !== "range" || isolated || marcherIds.length === 0)
            return none;
        // No resolver: not in timeline mode, or still loading
        if (!resolver || !pages) return none;
        const window = basic
            ? null
            : { start: selection.start, end: selection.end };
        const held = marcherIds.filter((id) =>
            marks.some(
                (m) => m.marcherId === id && isInsideHeldMark(m, selection.end),
            ),
        ).length;
        return {
            window,
            partlyHeld:
                held > 0 && held < marcherIds.length
                    ? { held, total: marcherIds.length }
                    : null,
            onPreview: (on: boolean) => {
                if (!on || !window) return stopPreview(on);
                setHoldLight(
                    WINDOW_PREVIEW_LIGHT,
                    holdOverWindowLight({
                        window,
                        marcherIds,
                        marks,
                        rowsOf: (id) =>
                            movesFromSpans(resolverSpans(resolver, id)),
                        showStart:
                            pageFlags(pages).find((f) => f.range)?.range
                                ?.start ?? 0,
                        showEnd,
                    }),
                );
            },
        };
    }, [
        selection,
        isolated,
        basic,
        resolver,
        version,
        marks,
        pages,
        showEnd,
        marcherIds,
    ]);
}
