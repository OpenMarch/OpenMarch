import { FIRST_PAGE_ID, type DatabaseLightingScene } from "@/db-functions";
import type Beat from "@/global/classes/Beat";
import { compareBeats } from "@/global/classes/Beat";
import type Page from "@/global/classes/Page";
import { lightingEffectBeatWindowToSceneLocalMs } from "@/utilities/lightingBeatSpans";

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
    if (pageIndex <= 0) return FIRST_PAGE_TIMELINE_WIDTH_PX;
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

export type SceneDeletePlan = {
    canDelete: boolean;
    reassignedSceneId: number | null;
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

export function buildSceneDeletePlan(
    orderedStarts: readonly OrderedSceneStart[],
    targetSceneId: number,
): SceneDeletePlan {
    if (orderedStarts.length <= 1) {
        return { canDelete: false, reassignedSceneId: null };
    }

    const sceneIndex = orderedStarts.findIndex(
        (scene) => scene.sceneId === targetSceneId,
    );
    if (sceneIndex < 0) {
        return { canDelete: false, reassignedSceneId: null };
    }

    return {
        canDelete: true,
        reassignedSceneId:
            sceneIndex === 0 ? (orderedStarts[1]?.sceneId ?? null) : null,
    };
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
 * In lighting inspector mode, selecting a scene should move selection to the
 * page immediately before that scene's start page so users preview the upcoming
 * scene transition. Scenes that start on FIRST_PAGE_ID select FIRST_PAGE_ID.
 */
export function resolveLightingInspectorSelectedPageId(
    pages: readonly Pick<Page, "id">[],
    startPageId: number,
): number | null {
    if (startPageId === FIRST_PAGE_ID) return FIRST_PAGE_ID;
    const startPageIndex = pages.findIndex((p) => p.id === startPageId);
    if (startPageIndex < 0) return null;
    if (startPageIndex === 0) return FIRST_PAGE_ID;
    return pages[startPageIndex - 1]?.id ?? null;
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

// ============================================================================
// EFFECT-BAR LAYOUT (used by SceneTimeline.tsx for the expanded scene)
// ============================================================================

/**
 * Index in `pages` of the last page that belongs to `sceneId` in show order.
 * Returns -1 if the scene is unknown.
 */
export function getSceneEndPageIndex(
    orderedStarts: readonly OrderedSceneStart[],
    sceneId: number,
    pages: readonly unknown[],
): number {
    const sceneIdx = orderedStarts.findIndex((s) => s.sceneId === sceneId);
    if (sceneIdx < 0) return -1;
    const nextStart = orderedStarts[sceneIdx + 1];
    return nextStart ? nextStart.startPageIndex - 1 : pages.length - 1;
}

/**
 * Global beat position where a lighting scene begins. This matches the
 * `sceneStartBeatPosition` argument of {@link lightingEffectBeatWindowToSceneLocalMs}.
 */
export function getSceneStartBeatPosition(
    scene: Pick<DatabaseLightingScene, "start_page_id">,
    pages: readonly Pick<Page, "id" | "beats">[],
): number | null {
    const startPage = pages.find((p) => p.id === scene.start_page_id);
    if (!startPage || startPage.beats.length === 0) return null;
    return startPage.beats[0]!.position;
}

/**
 * Total number of beats spanned by a scene: from the scene's start beat through
 * the last beat of its last page. Used to clamp drag operations.
 */
export function getSceneTotalBeats(
    scene: Pick<DatabaseLightingScene, "id" | "start_page_id">,
    orderedStarts: readonly OrderedSceneStart[],
    pages: readonly Pick<Page, "id" | "beats">[],
): number {
    const endIdx = getSceneEndPageIndex(orderedStarts, scene.id, pages);
    if (endIdx < 0) return 0;
    const startIdx = pages.findIndex((p) => p.id === scene.start_page_id);
    if (startIdx < 0) return 0;
    let total = 0;
    for (let i = startIdx; i <= endIdx; i++) {
        total += pages[i]!.beats.length;
    }
    return total;
}

/**
 * Pixel rect for an effect bar inside its scene's expanded container.
 * Both values are scene-local (left edge of the scene container is x=0).
 */
export function effectBarPx(
    beatsSortedAscending: readonly Beat[],
    sceneStartBeatPosition: number,
    startOffsetBeats: number,
    durationBeats: number,
    pixelsPerSecond: number,
): { leftPx: number; widthPx: number } {
    const { startMs, durationMs } = lightingEffectBeatWindowToSceneLocalMs(
        [...beatsSortedAscending].sort(compareBeats),
        sceneStartBeatPosition,
        startOffsetBeats,
        durationBeats,
    );
    return {
        leftPx: (startMs * pixelsPerSecond) / 1000,
        widthPx: (durationMs * pixelsPerSecond) / 1000,
    };
}

export type EffectLanePlacement = {
    effectId: number;
    lane: number;
    startBeats: number;
    durationBeats: number;
};

/**
 * Greedy left-to-right packing into vertical lanes. Each effect drops into the
 * lowest lane whose last bar ends at or before the new bar's start. Effects are
 * processed sorted by `start_offset_beats` then `id` (stable order).
 */
export function packEffectsIntoLanes(
    effects: readonly {
        id: number;
        start_offset_beats: number;
        duration_beats: number;
    }[],
): { placements: EffectLanePlacement[]; laneCount: number } {
    const sorted = [...effects].sort((a, b) => {
        if (a.start_offset_beats !== b.start_offset_beats) {
            return a.start_offset_beats - b.start_offset_beats;
        }
        return a.id - b.id;
    });
    const laneEnds: number[] = [];
    const placements: EffectLanePlacement[] = [];
    for (const effect of sorted) {
        const start = Math.max(0, effect.start_offset_beats);
        const dur = Math.max(0, effect.duration_beats);
        const end = start + dur;
        let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
        if (lane === -1) {
            lane = laneEnds.length;
            laneEnds.push(end);
        } else {
            laneEnds[lane] = end;
        }
        placements.push({
            effectId: effect.id,
            lane,
            startBeats: start,
            durationBeats: dur,
        });
    }
    return { placements, laneCount: laneEnds.length };
}
