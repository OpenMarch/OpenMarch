import { useMemo } from "react";
import { useTimingObjects } from "@/hooks";
import { useIsBasicMode } from "@/stores/EditorModeStore";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import {
    holdDragPreview,
    makeHeldCount,
    type DragPreview,
} from "./holdDragPreview";
import { pageFlags } from "./timelinePlayhead";
import { resolverSpans, useTimelineResolverStore } from "./timelineStore";
import { useHeldMarksStore } from "./useHeldMarks";

/** The Expert hold tools' state for the selection, from the edit window (`useExpertHolds`). */
export interface ExpertHolds {
    /**
     * The window **Hold over the window** would hold over (`[S, P)`): set in Expert timeline
     * mode, outside isolation, with a window and marchers selected; null otherwise
     */
    readonly window: { readonly start: number; readonly end: number } | null;
    /** The count a drag edits, the playhead; null with no window (home or nothing) */
    readonly beat: number | null;
    /** What a drag at the playhead will do, when some selected marchers are Held there */
    readonly preview: DragPreview | null;
    /** How many selected marchers **Make all selected Held** would hold there */
    readonly makeHeld: number;
}

/**
 * The selection's Expert hold tools (fork #476): the window to hold over, what a drag would do to
 * Held and other marchers (`holdDragPreview`), and how many Make all selected Held would hold
 * (`makeHeldCount`). Worked out again when the window, the resolver or the marks change.
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
    return useMemo(() => {
        void version; // a new version means new spans
        const none = { window: null, beat: null, preview: null, makeHeld: 0 };
        if (selection.kind !== "range" || isolated || marcherIds.length === 0)
            return none;
        // No resolver: not in timeline mode, or still loading
        if (!resolver || !pages) return none;
        const window = basic
            ? null
            : { start: selection.start, end: selection.end };
        const spansOf = (id: number) => resolverSpans(resolver, id);
        const flags = pageFlags(pages).map((f) => ({
            beat: f.flag,
            name: f.page.name,
        }));
        const beat = selection.end;
        return {
            window,
            beat,
            preview: holdDragPreview({
                target: basic
                    ? { kind: "point", beat }
                    : { kind: "range", start: selection.start, end: beat },
                marcherIds,
                marks,
                spansOf,
                flags,
            }),
            makeHeld: makeHeldCount({ beat, marcherIds, marks, spansOf }),
        };
    }, [
        selection,
        isolated,
        basic,
        resolver,
        version,
        marks,
        pages,
        marcherIds,
    ]);
}
