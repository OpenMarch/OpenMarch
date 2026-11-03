import { useMemo } from "react";
import tolgee from "@/global/singletons/Tolgee";
import {
    readTimelineResizeLimits,
    resizeTimeline,
    type TimelineResizeBound,
} from "@/db-functions/timelineResize";
import type { DbConnection } from "@/db-functions/types";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { toastTimelineError } from "@/timeline/timelineErrorMessages";
import { pageTimelineIds } from "@/timeline/timelineViewModel";
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

/**
 * What to call the timeline over `[start, end)`: its page, when it is the page's own timeline
 * (`pageIds`, from `pageTimelineIds`), or its clip's label. A move split off a page's timeline shares the page's
 * box but goes by its own label (UI-25).
 */
export function timelineName(
    range: { readonly start: number; readonly end: number },
    timelineId: number,
    timelines: readonly TimelineInput[],
    pageBoxes: readonly { start: number; end: number; name?: string }[],
    pageIds: ReadonlySet<number>,
): string {
    const page = pageBoxes.find(
        (b) => b.start === range.start && b.end === range.end,
    );
    const pageName = page?.name
        ? tolgee.t("timeline.rangeName.pageMove", { page: page.name })
        : undefined;
    if (pageName && pageIds.has(timelineId)) return pageName;
    const clip = timelines.find(
        (t) => t.linkId !== undefined && Number(t.linkId) === timelineId,
    );
    return clip?.label ?? pageName ?? tolgee.t("timeline.moveClip.anotherMove");
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
            return tolgee.t("timeline.clipResize.minimum");
        case "member":
            return tolgee.t("timeline.clipResize.member");
        case "move":
            return tolgee.t("timeline.clipResize.stopsAt", {
                name: nameOf(bound.stop, bound.stop.timelineId),
            });
    }
}

/** Why an edge can't land where another move has exactly the range it would give */
const takenReason = (name: string, pageTakeover: boolean | undefined) =>
    tolgee.t(
        pageTakeover
            ? "timeline.clipResize.takenMerge"
            : "timeline.clipResize.taken",
        { name },
    );

/** A commit that threw: its refusal is a toast, and nothing was written. */
const refused = (error: unknown) => {
    toastTimelineError(error);
    return false;
};

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
                const { pageBoxes, storedTimelines } =
                    useTimelineSelectionStore.getState();
                const pages = pageTimelineIds(storedTimelines ?? [], pageBoxes);
                const nameOf = (
                    range: { start: number; end: number },
                    id: number,
                ) => timelineName(range, id, timelines, pageBoxes, pages);
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
                        reason: takenReason(
                            nameOf(t, t.timelineId),
                            t.pageTakeover,
                        ),
                    })),
                };
                return result;
            },
            commit: (change) => {
                const timelineId = timelineIdOf(change.timelineId);
                const track = timelines.find((t) => t.id === change.timelineId);
                if (timelineId === null || !track)
                    return Promise.resolve(false);
                const from = {
                    start: track.startBeatIndex,
                    end: track.endBeatIndex,
                };
                const to = {
                    start: change.startBeatIndex,
                    end: change.endBeatIndex,
                };
                return resizeTimeline({
                    db: database,
                    timelineId,
                    ...to,
                }).then((result) => {
                    if (result)
                        useTimelineSelectionStore
                            .getState()
                            .followTimelineRange(from, to, timelineId);
                    return result !== null;
                }, refused);
            },
        };
    }, [database, timelines]);
}
