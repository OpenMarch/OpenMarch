import type { Resolver } from "@openmarch/core";
import type Page from "@/global/classes/Page";
import { pageEndBeat } from "@/timeline/pageEndBeat";

/**
 * The mobile app gets one position per marcher per page, at the page's end beat
 * (`dots-to-om.ts`), and draws a straight line from each page to the next. A timeline show can
 * move in ways those lines can't show: a move that starts or ends partway through a page, or a
 * curved path. This finds out whether the show has any such motion, so the export panel can
 * say so.
 */

/**
 * How far, in canvas pixels, a marcher may stray from the page-to-page line before the motion
 * counts as one the phone can't show. Well under a step, and well over rounding.
 */
export const PAGE_LINE_TOLERANCE_PX = 0.5;

/** Samples per count between page flags: every half count, so a one-count page is checked too. */
const SAMPLES_PER_COUNT = 2;

/**
 * Whether any marcher in `marcherIds` (every marcher the resolver knows if omitted) is off the
 * straight line between its page positions at some count, by more than
 * `PAGE_LINE_TOLERANCE_PX`. Each page is checked from the previous page's end beat to its own,
 * at every half count, against the line between the two positions the export writes. Time runs
 * in counts, as a timeline move does.
 */
export function hasMotionBetweenPages({
    resolver,
    pages,
    marcherIds,
}: {
    resolver: Pick<Resolver, "marcherIds" | "positionsAt">;
    pages: readonly Pick<Page, "beats">[];
    marcherIds?: ReadonlySet<number>;
}): boolean {
    const ids = resolver.marcherIds();
    const checked = ids
        .map((id, i) => (marcherIds && !marcherIds.has(id) ? -1 : i))
        .filter((i) => i >= 0);
    if (checked.length === 0 || pages.length < 2) return false;

    const n = ids.length;
    const from = new Float64Array(2 * n);
    const to = new Float64Array(2 * n);
    const at = new Float64Array(2 * n);
    const ends = pages.map(pageEndBeat);
    resolver.positionsAt(ends[0]!, to);
    for (let p = 1; p < ends.length; p++) {
        from.set(to);
        const start = ends[p - 1]!;
        const end = ends[p]!;
        resolver.positionsAt(end, to);
        const steps = Math.round((end - start) * SAMPLES_PER_COUNT);
        for (let s = 1; s < steps; s++) {
            const u = s / steps;
            resolver.positionsAt(start + u * (end - start), at);
            for (const i of checked) {
                const x = from[2 * i]! + u * (to[2 * i]! - from[2 * i]!);
                const y =
                    from[2 * i + 1]! + u * (to[2 * i + 1]! - from[2 * i + 1]!);
                if (
                    Math.hypot(at[2 * i]! - x, at[2 * i + 1]! - y) >
                    PAGE_LINE_TOLERANCE_PX
                )
                    return true;
            }
        }
    }
    return false;
}
