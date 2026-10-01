import {
    pagePositionMapFromRows,
    type PagePositionMap,
} from "@/components/exporting/utils/exportPagePositions";
import type Page from "@/global/classes/Page";
import { sampleTimelinePagePositions } from "@/timeline/timelinePagePositions";
import type { TimelineResolverState } from "@/timeline/timelineStore";

/**
 * Timeline mode's positions for the launch-page preview made when the app closes
 * (docs/timeline/phases/07-page-parity.md P7.7): the page's positions from the live store
 * resolver at its end beat. A preview may use the store's resolver; exports build a private one.
 *
 * Returns undefined at once unless the resolver is ready (no resolver, a cold build still
 * pending, or a failed build), and when sampling throws, so closing never waits on a build or a
 * lock.
 */
export async function timelinePreviewPositions(
    state: Pick<TimelineResolverState, "status" | "resolver">,
    page: Pick<Page, "id" | "beats">,
): Promise<PagePositionMap | undefined> {
    if (state.status !== "ready" || !state.resolver) return undefined;
    try {
        return pagePositionMapFromRows(
            await sampleTimelinePagePositions({
                resolver: state.resolver,
                pages: [page],
            }),
        );
    } catch (error) {
        console.error("Could not sample the timeline for the preview", error);
        return undefined;
    }
}
