import { useMemo } from "react";
import {
    marcherSetBeats,
    selectionKeyframes,
    type SelectionKeyframe,
} from "./timelineSetFollowing";
import { resolverSpans, useTimelineResolverStore } from "./timelineStore";

export const NO_KEYFRAMES: readonly SelectionKeyframe[] = [];

/**
 * The selection's keyframes on the timeline (#303, `selectionKeyframes`), from the resolver's
 * spans. Worked out once per selection and resolver version (a committed edit, undo or redo), so
 * playback and scrubbing never recompute them.
 *
 * @param marcherIds the selected marchers; keep the array stable while the selection is
 */
export function useSelectionKeyframes(
    marcherIds: readonly number[],
): readonly SelectionKeyframe[] {
    const resolver = useTimelineResolverStore((s) => s.resolver);
    const version = useTimelineResolverStore((s) => s.version);
    return useMemo(() => {
        void version; // a new version means new spans
        if (!resolver || marcherIds.length === 0) return NO_KEYFRAMES;
        return selectionKeyframes(
            marcherIds.map((id) =>
                marcherSetBeats(resolverSpans(resolver, id)),
            ),
            marcherIds,
        );
    }, [resolver, version, marcherIds]);
}
