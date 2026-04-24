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

/** Sorted scene rows with derived page start indices. */
export type OrderedSceneStart = {
    sceneId: number;
    startPageId: number;
    startPageIndex: number;
};

export function buildOrderedSceneStarts(
    pages: readonly Pick<Page, "id">[],
    scenes: readonly Pick<DatabaseLightingScene, "id" | "start_page_id">[],
): OrderedSceneStart[] {
    const pageIdToIndex = new Map<number, number>();
    for (let i = 0; i < pages.length; i++) {
        pageIdToIndex.set(pages[i]!.id, i);
    }

    return [...scenes]
        .filter((s) => pageIdToIndex.has(s.start_page_id))
        .sort((a, b) => {
            const ia = pageIdToIndex.get(a.start_page_id)!;
            const ib = pageIdToIndex.get(b.start_page_id)!;
            if (ia !== ib) return ia - ib;
            return a.id - b.id;
        })
        .map((scene) => ({
            sceneId: scene.id,
            startPageId: scene.start_page_id,
            startPageIndex: pageIdToIndex.get(scene.start_page_id)!,
        }));
}

/** Resolve which scene contains the given page id in show order. */
export function findSceneIdForPageId(
    pages: readonly Pick<Page, "id">[],
    orderedStarts: readonly OrderedSceneStart[],
    pageId: number | null | undefined,
): number | null {
    if (pageId == null || orderedStarts.length === 0) return null;
    const pageIndex = pages.findIndex((p) => p.id === pageId);
    if (pageIndex < 0) return null;

    for (let i = 0; i < orderedStarts.length; i++) {
        const start = orderedStarts[i]!;
        const nextStartIdx =
            i + 1 < orderedStarts.length
                ? orderedStarts[i + 1]!.startPageIndex
                : pages.length;
        if (pageIndex >= start.startPageIndex && pageIndex < nextStartIdx) {
            return start.sceneId;
        }
    }
    return null;
}

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

    const orderedStarts = buildOrderedSceneStarts(pages, scenes);

    const segments: SceneTimelineSegment[] = [];
    for (let i = 0; i < orderedStarts.length; i++) {
        const startIdx = orderedStarts[i]!.startPageIndex;
        const nextStartIdx =
            i + 1 < orderedStarts.length
                ? orderedStarts[i + 1]!.startPageIndex
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
            sceneId: orderedStarts[i]!.sceneId,
            leftPx,
            widthPx,
            internalSplitPageIndices,
        });
    }
    return segments;
}

/** Wall-clock window for a lighting scene (half-open in show time, last window uses inclusive end). */
export type LightingSceneTimeWindow = {
    sceneId: number;
    startMs: number;
    endMs: number;
};

/**
 * Same scene ordering as {@link buildSceneTimelineSegments}, but using page timestamps in ms.
 * Use with {@link findLightingSceneAtShowTime} to map global show time to scene-local time.
 */
export function buildLightingSceneTimeWindowsMs(
    pages: readonly Pick<Page, "id" | "timestamp" | "duration">[],
    scenes: readonly Pick<DatabaseLightingScene, "id" | "start_page_id">[],
): LightingSceneTimeWindow[] {
    if (pages.length === 0) return [];

    const orderedStarts = buildOrderedSceneStarts(pages, scenes);

    const lastPage = pages[pages.length - 1]!;
    const showEndMs = Math.round(
        (lastPage.timestamp + lastPage.duration) * 1000,
    );

    const windows: LightingSceneTimeWindow[] = [];
    for (let i = 0; i < orderedStarts.length; i++) {
        const startIdx = orderedStarts[i]!.startPageIndex;
        const nextStartIdx =
            i + 1 < orderedStarts.length
                ? orderedStarts[i + 1]!.startPageIndex
                : pages.length;
        if (nextStartIdx - 1 < startIdx) continue;

        const startMs = Math.round(pages[startIdx]!.timestamp * 1000);
        const endMsExclusive =
            nextStartIdx < pages.length
                ? Math.round(pages[nextStartIdx]!.timestamp * 1000)
                : showEndMs + 1;

        if (endMsExclusive <= startMs) continue;

        windows.push({
            sceneId: orderedStarts[i]!.sceneId,
            startMs,
            endMs: endMsExclusive,
        });
    }
    return windows;
}

/**
 * @param tShowMs global show time in ms (same convention as coordinate timelines).
 * @returns scene id and time since that scene’s start, or null if outside all windows.
 */
export function findLightingSceneAtShowTime(
    windows: readonly LightingSceneTimeWindow[],
    tShowMs: number,
): { sceneId: number; tSceneMs: number } | null {
    for (const w of windows) {
        if (tShowMs >= w.startMs && tShowMs < w.endMs) {
            return { sceneId: w.sceneId, tSceneMs: tShowMs - w.startMs };
        }
    }
    return null;
}
