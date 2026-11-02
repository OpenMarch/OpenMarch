import tolgee from "@/global/singletons/Tolgee";
import { LAYOUT_LABELS } from "../distribute/distribution";
import { layoutOf } from "../distribute/modes";
import { shownFamily } from "../distribute/layouts";
import {
    displayedBeat,
    useTimelineSelectionStore,
} from "@/stores/TimelineSelectionStore";
import { formatSignedSteps } from "../editor/format";
import type { PlacedBox } from "./placedBox";

/** "Page 3" for the page a shape was placed at the end of, when that is before `beat` */
export function useDrawnOnPage(box: PlacedBox | null): string | null {
    // Only with a box, so scrubbing doesn't re-render the editor for nothing (#455)
    const beat = useTimelineSelectionStore((s) => (box ? displayedBeat(s) : 0));
    const pages = useTimelineSelectionStore((s) => s.pageBoxes);
    if (!box || box.endBeat >= beat - 1e-9) return null;
    const page = pages.find((p) => Math.abs(p.end - box.endBeat) < 1e-9);
    return page?.name
        ? tolgee.t("timeline.page.label", "Page {pageName}", {
              pageName: page.name,
          })
        : null;
}

/**
 * A placed shape's numbers, from those its kind declares, as the floating editor shows them
 * (across is side to side however it's turned): its counts ("5 × 4", or "Stagger 3 × 3"), its intervals ("2", or
 * "2 × 1½" when they differ, a Line's groups "2 × 3 + 4 × 2"; null for a kind without), its notes ("1 short") and how many of its
 * spots are holes members left
 */
export function placedNumbers(box: PlacedBox, stepPx: number) {
    const { kind, params, spots } = box;
    // A count the kind hides says nothing (a spread box has no files or ranks)
    const shown = kind.params.filter((p) => p.shown?.(params, spots) ?? true);
    const counts = shown
        .filter((p) => p.unit === "count")
        .map((p) => p.display(params, spots, stepPx));
    // A layout other than Short back is named first, as the picker names it (#387)
    const resolved = layoutOf(kind, params, spots);
    const family = resolved && shownFamily(resolved);
    if (family && family !== "shortBack" && counts.length > 0)
        counts[0] = `${LAYOUT_LABELS[family]} ${counts[0]}`;
    // An interval the kind hides isn't shown either (a Line's one interval while two offset
    // numbers stand for it, which go below 0 the other way)
    const intervals = shown
        .filter((p) => p.interval && p.value)
        .map((p) => formatSignedSteps(p.value!(params, spots, stepPx)));
    // Groups of marchers (#526) as their chips read: "2 × 3 + 4 × 2", the groups it reaches
    const groups = kind.groups
        ?.shown(params, spots, stepPx)
        ?.filter((g) => !g.dropped)
        .map((g) => `${g.count} × ${g.interval}`)
        .join(" + ");
    return {
        counts: counts.length > 0 ? counts.join(" · ") : null,
        intervals: groups
            ? groups
            : intervals.length === 0
              ? null
              : intervals.every((i) => i === intervals[0])
                ? intervals[0]!
                : intervals.join(" × "),
        notes: shown.flatMap((p) => p.note?.(params, spots) ?? []),
        empty: spots - box.recipe.members.length,
    };
}

/**
 * The numbers of a placed shape: "5 × 4 · 2 steps · 1 short · 1 empty" for a box, across × deep
 * (short: spots the back rank never had; empty: holes members left), "2 steps" for a circle
 */
export function placedBoxSummary(box: PlacedBox, stepPx: number): string {
    const { counts, intervals, notes, empty } = placedNumbers(box, stepPx);
    return [
        ...(counts ? [counts] : []),
        ...(intervals
            ? [
                  tolgee.t("shapes.placed.summary.steps", "{interval} steps", {
                      interval: intervals,
                  }),
              ]
            : []),
        ...notes,
        ...(empty > 0
            ? [
                  tolgee.t(
                      "shapes.placed.summary.empty",
                      "{count, plural, other {# empty}}",
                      { count: empty },
                  ),
              ]
            : []),
    ].join(" · ");
}
