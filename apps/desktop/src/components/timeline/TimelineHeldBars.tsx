import { memo, useMemo } from "react";
import tolgee from "@/global/singletons/Tolgee";
import { holdTerms } from "@/timeline/holdTerms";
import type { SelectionHeldBar } from "@/timeline/timelineHeldBars";
import type { TimelinePageMarker } from "./TimelineViewModel";
import {
    beatToX,
    getPageCountAt,
    TIMELINE_PAGE_ROW_BOTTOM,
} from "./TimelineGeometry";

/** A Held bar's thickness (px) */
const BAR_HEIGHT = 5;

/**
 * The selection's **Held** holds (holds README decision 10; fork #472): a solid bar at exact
 * counts from each hold's start, where its arrival's diamond is, to its end. Drawn on the page
 * row's bottom edge, the keyframe diamonds' row, under the diamonds and the flag grips, and
 * takes no pointer: the page boxes under it still select and scrub. Nothing selected, no bars.
 */
export const TimelineHeldBars = memo(function TimelineHeldBars({
    bars,
    pages,
    pixelsPerBeat,
}: {
    /** In view beats */
    bars: readonly SelectionHeldBar[];
    pages: readonly TimelinePageMarker[];
    pixelsPerBeat: number;
}) {
    const labels = useMemo(
        () => bars.map((bar) => heldBarLabel(bar, pages)),
        [bars, pages],
    );
    if (bars.length === 0) return null;
    return (
        <>
            {bars.map((bar, index) => {
                const left = beatToX(bar.start, pixelsPerBeat);
                return (
                    <div
                        key={`${bar.start}:${bar.end}`}
                        role="img"
                        aria-label={labels[index]}
                        data-testid={`timeline-held-bar-${bar.start}-${bar.end}`}
                        data-held={bar.marcherIds.length}
                        // Under the diamonds (z-36) and the flag grips (z-35)
                        className="bg-text pointer-events-none absolute z-[34] -translate-y-1/2 rounded-full"
                        style={{
                            left,
                            width: beatToX(bar.end, pixelsPerBeat) - left,
                            top: TIMELINE_PAGE_ROW_BOTTOM,
                            height: BAR_HEIGHT,
                        }}
                    />
                );
            })}
        </>
    );
});

/**
 * "Held · Page 3", or "Held · Pages 2–3" for a hold over several pages (joined holds), then, with
 * more than one marcher selected, "2 of 3 selected".
 */
function heldBarLabel(
    bar: SelectionHeldBar,
    pages: readonly TimelinePageMarker[],
): string {
    // The first count inside the hold is the one after its start
    const first = getPageCountAt({ pages }, bar.start + 1).pageLabel;
    const last = getPageCountAt({ pages }, bar.end).pageLabel;
    const title =
        first === last
            ? tolgee.t("timeline.heldBar.title", "{held} · Page {page}", {
                  ...holdTerms(),
                  page: last,
              })
            : tolgee.t(
                  "timeline.heldBar.titleRange",
                  "{held} · Pages {first}–{last}",
                  {
                      ...holdTerms(),
                      first,
                      last,
                  },
              );
    if (bar.total === 1) return title;
    return `${title}. ${tolgee.t(
        "timeline.heldBar.detail",
        "{held} of {total} selected",
        { held: bar.marcherIds.length, total: bar.total },
    )}`;
}
