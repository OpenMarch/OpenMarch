import { FIRST_PAGE_ID, type DatabaseLightingScene } from "@/db-functions";
import type Page from "@/global/classes/Page";

/** Must match the first-page column width in PageTimeline. */
export const FIRST_PAGE_TIMELINE_WIDTH_PX = 40;

/**
 * Horizontal pixel offset of the left edge of `pages[pageIndex]`, using the same
 * rules as PageTimeline: index 0 is 40px wide; indices &gt;= 1 use duration × pps.
 */
export function timelineLeftPxAtPageStart(
    pages: readonly Pick<Page, "duration">[],
    pageIndex: number,
    pixelsPerSecond: number,
): number {
    if (pageIndex <= 0) return 0;
    let x = FIRST_PAGE_TIMELINE_WIDTH_PX;
    for (let i = 1; i < pageIndex; i++) {
        x += pages[i]!.duration * pixelsPerSecond;
    }
    return x;
}

export function totalTimelineWidthPx(
    pages: readonly Pick<Page, "duration">[],
    pixelsPerSecond: number,
): number {
    return timelineLeftPxAtPageStart(pages, pages.length, pixelsPerSecond);
}

export type SceneTimelineSegment = {
    sceneId: number;
    leftPx: number;
    widthPx: number;
    /** Page indices where a page boundary falls inside this segment (click to split). Omits the first-column boundary (after `FIRST_PAGE_ID`). */
    internalSplitPageIndices: number[];
};

/**
 * One segment per lighting scene: from its start page until the next scene’s start page
 * (by show order) or the end of the show. Skips orphan start pages. Duplicate start
 * pages sort by scene id; later scenes can get zero width until the next distinct start.
 */
export function buildSceneTimelineSegments(
    pages: readonly Pick<Page, "id" | "duration">[],
    scenes: readonly Pick<DatabaseLightingScene, "id" | "start_page_id">[],
    pixelsPerSecond: number,
): SceneTimelineSegment[] {
    if (pages.length === 0) return [];

    const pageIdToIndex = new Map<number, number>();
    for (let i = 0; i < pages.length; i++) {
        pageIdToIndex.set(pages[i]!.id, i);
    }

    const sorted = [...scenes]
        .filter((s) => pageIdToIndex.has(s.start_page_id))
        .sort((a, b) => {
            const ia = pageIdToIndex.get(a.start_page_id)!;
            const ib = pageIdToIndex.get(b.start_page_id)!;
            if (ia !== ib) return ia - ib;
            return a.id - b.id;
        });

    const segments: SceneTimelineSegment[] = [];
    for (let i = 0; i < sorted.length; i++) {
        const startIdx = pageIdToIndex.get(sorted[i]!.start_page_id)!;
        const nextStartIdx =
            i + 1 < sorted.length
                ? pageIdToIndex.get(sorted[i + 1]!.start_page_id)!
                : pages.length;
        const endIdx = nextStartIdx - 1;
        if (endIdx < startIdx) continue;

        const leftPx = timelineLeftPxAtPageStart(
            pages,
            startIdx,
            pixelsPerSecond,
        );
        const rightPx = timelineLeftPxAtPageStart(
            pages,
            nextStartIdx,
            pixelsPerSecond,
        );
        const widthPx = rightPx - leftPx;
        if (widthPx <= 0) continue;

        const internalSplitPageIndices: number[] = [];
        for (let j = startIdx + 1; j < nextStartIdx; j++) {
            if (pages[j - 1]!.id === FIRST_PAGE_ID) continue;
            internalSplitPageIndices.push(j);
        }

        segments.push({
            sceneId: sorted[i]!.id,
            leftPx,
            widthPx,
            internalSplitPageIndices,
        });
    }
    return segments;
}
