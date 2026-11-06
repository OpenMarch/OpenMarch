import { useMemo } from "react";
import tolgee from "@/global/singletons/Tolgee";
import { db } from "@/global/database/db";
import {
    setHoldEdge,
    splitHoldAt,
    splitsAnyHold,
} from "@/db-functions/timelineHoldExtent";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import {
    holdEdgeHandles,
    type BeatRange,
    type HoldEdgeDrag,
    type HoldEdgeHandle,
} from "./holdExtent";
import { useHoldEdgeDragStore } from "./holdEdgeDragStore";
import { toastTimelineError } from "./timelineErrorMessages";
import { refreshHeldMarks, useHeldMarksStore } from "./useHeldMarks";
import { resolverSpans, useTimelineResolverStore } from "./timelineStore";

/**
 * **Shaping a hold** as the timeline runs it (fork #475): the draggable ends of the selected
 * marchers' Held bars, and **Split hold here** on a bar's right-click. Spec beats throughout;
 * `Timeline` converts to its view axis.
 */

/** The selected marchers' hold edges and the commands that drag them, in spec beats. */
export interface TimelineHoldEdgesInput {
    readonly handles: readonly HoldEdgeHandle[];
    /** The drag as it would land, while it runs; `null` when it ends or is cancelled */
    readonly preview: (drag: HoldEdgeDrag | null) => void;
    /** Writes a drag, once, on release; a refusal is a toast */
    readonly commit: (drag: HoldEdgeDrag) => Promise<void>;
}

/** **Split hold here** on a Held bar's right-click (holds decision 5), in spec beats. */
export interface TimelineSplitHoldMenu {
    /** Whether a selected marcher's Held hold has `beat` strictly inside it */
    readonly offeredAt: (beat: number) => boolean;
    readonly onSplit: (beat: number) => void;
}

/** A marcher's moves, from its resolver spans: everything but its holds. */
const movesFrom = (
    spans: readonly { start: number; end: number; kind: string }[],
): BeatRange[] =>
    spans
        .filter((s) => s.kind !== "hold")
        .map((s) => ({ start: s.start, end: s.end }));

/**
 * The selected marchers' hold edges and Split hold here, or nothing while `enabled` is off
 * (playing) or nothing is selected.
 *
 * @param marcherIds the selected marchers; keep the array stable while the selection is
 */
export function useHoldExtentCommands(
    marcherIds: readonly number[],
    enabled: boolean,
): {
    holdEdges: TimelineHoldEdgesInput | undefined;
    splitHold: TimelineSplitHoldMenu | undefined;
} {
    const marks = useHeldMarksStore((s) => s.marks);
    const resolver = useTimelineResolverStore((s) => s.resolver);
    const version = useTimelineResolverStore((s) => s.version);
    const showEnd = useTimelineSelectionStore((s) =>
        s.pageBoxes.reduce((end, box) => Math.max(end, box.end), 0),
    );
    const holdEdges = useMemo<TimelineHoldEdgesInput | undefined>(() => {
        void version; // a new version means new spans
        if (!enabled || !resolver || marcherIds.length === 0) return undefined;
        const handles = holdEdgeHandles({
            marcherIds,
            movesOf: (id) => movesFrom(resolverSpans(resolver, id)),
            marks,
            showEnd,
        });
        if (handles.length === 0) return undefined;
        return {
            handles,
            preview: (drag) => useHoldEdgeDragStore.setState({ drag }),
            commit: async (drag) => {
                useHoldEdgeDragStore.setState({ drag });
                try {
                    await setHoldEdge({ db, ...drag });
                    // Drawn where it was dropped until the marks it wrote are read
                    await refreshHeldMarks(db);
                } catch (error) {
                    toastTimelineError(
                        error,
                        tolgee.t(
                            "timeline.holdEdge.changeError",
                            "Error changing the hold",
                        ),
                    );
                } finally {
                    if (useHoldEdgeDragStore.getState().drag === drag)
                        useHoldEdgeDragStore.setState({ drag: null });
                }
            },
        };
    }, [enabled, resolver, version, marcherIds, marks, showEnd]);
    const splitHold = useMemo<TimelineSplitHoldMenu | undefined>(() => {
        if (!enabled || marcherIds.length === 0) return undefined;
        const selected = new Set(marcherIds);
        const own = marks.filter((m) => selected.has(m.marcherId));
        if (own.length === 0) return undefined;
        return {
            offeredAt: (beat) =>
                Number.isInteger(beat) && splitsAnyHold(own, beat),
            onSplit: (beat) => {
                void splitHoldAt({ db, marcherIds, beat }).catch((error) =>
                    toastTimelineError(
                        error,
                        tolgee.t(
                            "timeline.holdEdge.splitError",
                            "Error splitting the hold",
                        ),
                    ),
                );
            },
        };
    }, [enabled, marcherIds, marks]);
    return { holdEdges, splitHold };
}
