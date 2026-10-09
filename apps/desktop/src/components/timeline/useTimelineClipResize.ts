import { useMemo } from "react";
import {
    readTimelineResizeLimits,
    resizeTimeline,
    type TimelineResizeBound,
} from "@/db-functions/timelineResize";
import type { DbConnection } from "@/db-functions/types";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { toastTimelineError } from "@/timeline/timelineErrorMessages";
import type { TimelineInput } from "./Timeline";
import type {
    ClipResizeBound,
    ClipResizeLimits,
    TimelineClipResizeCommands,
} from "./TimelineClipResize";

/**
 * The panel's side of resizing a clip (docs/timeline/research/resize-move): the limits a drag
 * stops at, read from the database when it starts, and the commit, one undoable edit after which
 * a selected or isolated window follows the new range. In spec beats; `Timeline` maps them to its
 * view axis.
 */

/** What to call the timeline over `[start, end)`: its page, or its clip's label. */
export function timelineName(
    range: { readonly start: number; readonly end: number },
    timelineId: number,
    timelines: readonly TimelineInput[],
    pageBoxes: readonly { start: number; end: number; name?: string }[],
): string {
    const page = pageBoxes.find(
        (b) => b.start === range.start && b.end === range.end,
    );
    if (page?.name) return `Page ${page.name}'s move`;
    const clip = timelines.find(
        (t) => t.linkId !== undefined && Number(t.linkId) === timelineId,
    );
    return clip?.label ?? "another move";
}

/** A bound's reason as the drag tag says it (`null`: the show's edge, nothing to say). */
export function resizeBoundReason(
    bound: TimelineResizeBound,
    nameOf: (range: { start: number; end: number }, id: number) => string,
): string | null {
    switch (bound.stop.kind) {
        case "show":
            return null;
        case "minimum":
            return "1 count minimum";
        case "member":
            return "a marcher joins or leaves here";
        case "move":
            return `stops at ${nameOf(bound.stop, bound.stop.timelineId)}`;
    }
}

export function useTimelineClipResize({
    database,
    timelines,
}: {
    database: DbConnection;
    timelines: readonly TimelineInput[];
}): TimelineClipResizeCommands {
    return useMemo((): TimelineClipResizeCommands => {
        const timelineIdOf = (trackId: string | number) => {
            const track = timelines.find((t) => t.id === trackId);
            return track?.linkId === undefined ? null : Number(track.linkId);
        };
        return {
            limits: async (trackId) => {
                const timelineId = timelineIdOf(trackId);
                if (timelineId === null) return null;
                const limits = await readTimelineResizeLimits(
                    database,
                    timelineId,
                );
                if (!limits) return null;
                const { pageBoxes } = useTimelineSelectionStore.getState();
                const nameOf = (
                    range: { start: number; end: number },
                    id: number,
                ) => timelineName(range, id, timelines, pageBoxes);
                const bound = (b: TimelineResizeBound): ClipResizeBound => ({
                    beat: b.beat,
                    reason: resizeBoundReason(b, nameOf),
                });
                const result: ClipResizeLimits = {
                    startEdge: {
                        min: bound(limits.startEdge.min),
                        max: bound(limits.startEdge.max),
                    },
                    endEdge: {
                        min: bound(limits.endEdge.min),
                        max: bound(limits.endEdge.max),
                    },
                    // A page box with no stored timeline is fine: the move becomes its page's
                    // move (resize-move E9). A stored one's range isn't (E8)
                    taken: limits.taken.map((t) => ({
                        startBeatIndex: t.start,
                        endBeatIndex: t.end,
                        reason: `${nameOf(t, t.timelineId)} already has these counts`,
                    })),
                };
                return result;
            },
            commit: (change) => {
                const timelineId = timelineIdOf(change.timelineId);
                const track = timelines.find((t) => t.id === change.timelineId);
                if (timelineId === null || !track) return;
                const from = {
                    start: track.startBeatIndex,
                    end: track.endBeatIndex,
                };
                const to = {
                    start: change.startBeatIndex,
                    end: change.endBeatIndex,
                };
                resizeTimeline({
                    db: database,
                    timelineId,
                    ...to,
                }).then(
                    (result) => {
                        if (result)
                            useTimelineSelectionStore
                                .getState()
                                .followTimelineRange(from, to);
                    },
                    (error: unknown) => toastTimelineError(error),
                );
            },
        };
    }, [database, timelines]);
}
