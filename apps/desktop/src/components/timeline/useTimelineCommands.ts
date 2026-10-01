import { useCallback, useEffect, useMemo, useState } from "react";
import {
    createTrack,
    shiftTimeline,
    type CreateTrackTarget,
} from "@/db-functions/timelineCommands";
import type { DbConnection } from "@/db-functions/types";
import { toastTimelineError } from "@/timeline/timelineErrorMessages";
import type { TimelineInput } from "./Timeline";
import type {
    TimelineCreateTrackRequest,
    TimelineRangeChange,
    TimelineSelection,
    TimelineTarget,
} from "./TimelineViewModel";

/**
 * The timeline's commands (P8.9, ui.md's mapping table), wired to the write path. Everything here
 * arrives in spec beats (`Timeline` converts from its view axis, UI-5).
 */

/**
 * The spec timeline a clip move shifts and by how much: the clip's track carries the spec timeline
 * as `linkId`, and every clip of it moves by the clip's drag. `null` for an unknown clip or one
 * dropped where it started (a no-op the write path would reject as an empty edit).
 */
export function timelineShiftFor(
    change: TimelineRangeChange,
    timelines: readonly TimelineInput[],
): { timelineId: number; delta: number } | null {
    const track = timelines.find((t) => t.id === change.timelineId);
    if (!track || track.linkId === undefined) return null;
    const delta = change.startBeatIndex - track.startBeatIndex;
    if (delta === 0) return null;
    return { timelineId: Number(track.linkId), delta };
}

/**
 * Create Track's target: a shape picked by selecting its track, which takes the selected marchers
 * (none when no marcher is selected, since there would be nobody to move into it); otherwise the
 * one selected marcher. With several marchers selected and no shape, there's none.
 */
export function selectedTimelineTarget(
    shape: TimelineTarget | null,
    selectedMarcherIds: ReadonlySet<number>,
): TimelineTarget | null {
    if (shape) return selectedMarcherIds.size > 0 ? shape : null;
    if (selectedMarcherIds.size !== 1) return null;
    const [id] = selectedMarcherIds;
    return { type: "marcher", id: id! };
}

/** The write path's target for a Create Track request. */
export function createTrackTargetFor(
    target: TimelineTarget,
    selectedMarcherIds: ReadonlySet<number>,
): CreateTrackTarget {
    return target.type === "shape"
        ? {
              kind: "shape",
              shapeId: Number(target.id),
              marcherIds: [...selectedMarcherIds],
          }
        : { kind: "marcher", marcherId: Number(target.id) };
}

/**
 * The panel's side of the commands: the selected target for Create Track, and the callbacks that
 * run each command as one undoable edit and show a refusal's friendly message (P8.6) as a toast.
 *
 * `noteSelection`: call it with every selection change. Selecting a shape's track picks that shape
 * as the target. A range selection keeps it, because Create Track is offered on a range, so the
 * shape is picked first and the range selected next. Any other selection (a marcher's track, a
 * page, or nothing) drops it, and so does its track disappearing (the shape was deleted, or no
 * longer has a move).
 */
export function useTimelineCommands({
    database,
    timelines,
    selectedMarcherIds,
}: {
    database: DbConnection;
    timelines: readonly TimelineInput[];
    selectedMarcherIds: ReadonlySet<number>;
}) {
    const [shape, setShape] = useState<TimelineTarget | null>(null);

    const noteSelection = useCallback(
        (next: TimelineSelection) => {
            if (next?.kind === "range") return;
            const track =
                next?.kind === "track"
                    ? timelines.find((t) => t.id === next.trackId)
                    : undefined;
            setShape(
                track?.targetType === "shape"
                    ? { type: "shape", id: track.targetId }
                    : null,
            );
        },
        [timelines],
    );

    // Drop a picked shape whose track is gone
    const shapeShown =
        shape !== null &&
        timelines.some(
            (t) => t.targetType === "shape" && t.targetId === shape.id,
        );
    useEffect(() => {
        if (shape !== null && !shapeShown) setShape(null);
    }, [shape, shapeShown]);

    const selectedTarget = useMemo(
        () =>
            selectedTimelineTarget(
                shapeShown ? shape : null,
                selectedMarcherIds,
            ),
        [shape, shapeShown, selectedMarcherIds],
    );

    const commitTimelineRange = useCallback(
        (change: TimelineRangeChange) => {
            const shift = timelineShiftFor(change, timelines);
            if (!shift) return;
            shiftTimeline({ db: database, ...shift }).catch((error: unknown) =>
                toastTimelineError(error),
            );
        },
        [database, timelines],
    );

    const createTrackFromRequest = useCallback(
        (request: TimelineCreateTrackRequest) => {
            createTrack({
                db: database,
                target: createTrackTargetFor(
                    request.target,
                    selectedMarcherIds,
                ),
                startBeat: request.range.startBeatIndex,
                endBeat: request.range.endBeatIndex,
            }).catch((error: unknown) => toastTimelineError(error));
        },
        [database, selectedMarcherIds],
    );

    return {
        selectedTarget,
        noteSelection,
        commitTimelineRange,
        createTrack: createTrackFromRequest,
    };
}
