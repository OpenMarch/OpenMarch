/**
 * Visuals mode's counts in the transport's words (UI-12, UI-13): a cue's count is a show-wide
 * index (`CountIndex`), but the panel and the why readout say "Page 2 count 16", as the
 * transport does at the same playhead (`beatWhere`, `getPageCountAt`). Pure, for its tests.
 */
import { pageFlags, type FlagPage } from "@/timeline/timelinePlayhead";
import { beatWhere, type NamedPageBox } from "@/timeline/timelineRangeWords";
import type { TimelineEditSelection } from "@/stores/TimelineSelectionStore";
import tolgee from "@/global/singletons/Tolgee";
import { translateTimelineText } from "@/timeline/translateTimelineText";
import type { CountIndex } from "./visualsLanes";

type CountPage = FlagPage & { readonly name: string };

/** The page boxes, previous flag to flag (UI-9), with their pages' names. */
export function namedPageBoxes(pages: readonly CountPage[]): NamedPageBox[] {
    return pageFlags(pages).flatMap((f) =>
        f.range
            ? [{ start: f.range.start, end: f.range.end, name: f.page.name }]
            : [],
    );
}

/**
 * Words for each count: "Page 2 count 16", where the playhead on that count's beat reads
 * "Pg 2 · ct 16"; "count 3 after Page 4" past the last flag; "the start" where it reads Home;
 * else the show-wide count, from 1.
 */
export function countWords(
    beats: readonly { id: number; position: number }[],
    pages: readonly CountPage[],
    counts: CountIndex,
): (count: number) => string {
    const boxes = namedPageBoxes(pages);
    // A beat's spec index is its place among the show's beats (`countAtBeatIndex`)
    const indexOf = new Map(
        [...beats]
            .sort((a, b) => a.position - b.position)
            .map((b, i) => [b.id, i]),
    );
    const firstFlag = boxes[0]?.start ?? 0;
    const showCount = (count: number) =>
        tolgee.t("visuals.cue.count", "count {count}", { count: count + 1 });
    return (count) => {
        const beatId = counts.beatIdOfCount[count];
        const index = beatId === undefined ? undefined : indexOf.get(beatId);
        if (index === undefined) return showCount(count);
        const where = beatWhere(index, boxes);
        if (where) return translateTimelineText(where);
        // At or before the first page's start the transport says Home: nothing has stepped yet
        return index <= firstFlag
            ? tolgee.t("visuals.cue.start", "the start")
            : showCount(count);
    };
}

/**
 * The beat a paste at the playhead starts from. A page box puts the playhead on the page's flag
 * (UI-9), its last count; a paste then goes on the page's first count, the beat after the
 * previous flag. Anywhere else it is the playhead.
 */
export function pasteBeat(
    playheadBeat: number,
    selection: TimelineEditSelection,
    pages: readonly CountPage[],
): number {
    if (
        selection.kind === "range" &&
        selection.end === playheadBeat &&
        namedPageBoxes(pages).some(
            (box) => box.start === selection.start && box.end === selection.end,
        )
    )
        return selection.start + 1;
    return playheadBeat;
}
