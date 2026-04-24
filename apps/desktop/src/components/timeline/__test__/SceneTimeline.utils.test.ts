import { describe, expect, it } from "vitest";
import { FIRST_PAGE_ID } from "@/db-functions";
import Page from "@/global/classes/Page";
import {
    buildOrderedSceneStarts,
    buildLightingSceneTimeWindowsMs,
    buildSceneTimelineSegments,
    findSceneIdForPageId,
    findLightingSceneAtShowTime,
    FIRST_PAGE_TIMELINE_WIDTH_PX,
    resolveLightingInspectorSelectedPageId,
    timelineLeftPxAtPageStart,
    totalTimelineWidthPx,
} from "../SceneTimeline.utils";

function pageStub(id: number, duration: number): Pick<Page, "id" | "duration"> {
    return { id, duration } as Page;
}

describe("timelineLeftPxAtPageStart", () => {
    it("matches PageTimeline geometry at pps=1", () => {
        const pages = [pageStub(1, 0), pageStub(2, 10), pageStub(3, 5)];
        const pps = 1;
        expect(timelineLeftPxAtPageStart(pages, 0, pps)).toBe(0);
        expect(timelineLeftPxAtPageStart(pages, 1, pps)).toBe(
            FIRST_PAGE_TIMELINE_WIDTH_PX,
        );
        expect(timelineLeftPxAtPageStart(pages, 2, pps)).toBe(
            FIRST_PAGE_TIMELINE_WIDTH_PX + 10,
        );
        expect(timelineLeftPxAtPageStart(pages, 3, pps)).toBe(
            FIRST_PAGE_TIMELINE_WIDTH_PX + 15,
        );
    });
});

describe("totalTimelineWidthPx", () => {
    it("is left edge after the last page", () => {
        const pages = [pageStub(1, 0), pageStub(2, 2), pageStub(3, 3)];
        expect(totalTimelineWidthPx(pages, 1)).toBe(
            FIRST_PAGE_TIMELINE_WIDTH_PX + 5,
        );
    });
});

describe("buildSceneTimelineSegments", () => {
    it("builds segments until next scene start or end of show", () => {
        const pages = [
            pageStub(FIRST_PAGE_ID, 0),
            pageStub(20, 4),
            pageStub(30, 6),
        ];
        const scenes = [
            { id: 1, start_page_id: FIRST_PAGE_ID },
            { id: 2, start_page_id: 30 },
        ];
        const pps = 1;
        const segments = buildSceneTimelineSegments(pages, scenes, pps);

        expect(segments).toHaveLength(2);

        expect(segments[0]).toEqual({
            sceneId: 1,
            leftPx: 0,
            widthPx: FIRST_PAGE_TIMELINE_WIDTH_PX + 4,
            internalSplitPageIndices: [],
        });

        expect(segments[1]).toEqual({
            sceneId: 2,
            leftPx: FIRST_PAGE_TIMELINE_WIDTH_PX + 4,
            widthPx: 6,
            internalSplitPageIndices: [],
        });
    });

    it("lists internal split indices when one scene spans three pages", () => {
        const pages = [
            pageStub(FIRST_PAGE_ID, 0),
            pageStub(200, 2),
            pageStub(300, 2),
        ];
        const scenes = [{ id: 1, start_page_id: FIRST_PAGE_ID }];
        const segments = buildSceneTimelineSegments(pages, scenes, 1);
        expect(segments).toHaveLength(1);
        expect(segments[0]!.internalSplitPageIndices).toEqual([2]);
    });

    it("drops scenes whose start page is missing", () => {
        const pages = [pageStub(1, 0), pageStub(2, 1)];
        const scenes = [{ id: 9, start_page_id: 999 }];
        expect(buildSceneTimelineSegments(pages, scenes, 1)).toEqual([]);
    });
});

describe("buildOrderedSceneStarts", () => {
    it("returns scene starts sorted by page order then scene id", () => {
        const pages = [pageStub(10, 0), pageStub(20, 1), pageStub(30, 1)];
        const scenes = [
            { id: 7, start_page_id: 30 },
            { id: 4, start_page_id: 20 },
            { id: 6, start_page_id: 20 },
            { id: 2, start_page_id: 999 },
        ];

        expect(buildOrderedSceneStarts(pages, scenes)).toEqual([
            { sceneId: 4, startPageId: 20, startPageIndex: 1 },
            { sceneId: 6, startPageId: 20, startPageIndex: 1 },
            { sceneId: 7, startPageId: 30, startPageIndex: 2 },
        ]);
    });
});

describe("findSceneIdForPageId", () => {
    it("returns active scene for a page within scene range", () => {
        const pages = [pageStub(10, 0), pageStub(20, 1), pageStub(30, 1)];
        const orderedStarts = buildOrderedSceneStarts(pages, [
            { id: 1, start_page_id: 10 },
            { id: 2, start_page_id: 30 },
        ]);

        expect(findSceneIdForPageId(pages, orderedStarts, 10)).toBe(1);
        expect(findSceneIdForPageId(pages, orderedStarts, 20)).toBe(1);
        expect(findSceneIdForPageId(pages, orderedStarts, 30)).toBe(2);
        expect(findSceneIdForPageId(pages, orderedStarts, 999)).toBeNull();
    });
});

describe("resolveLightingInspectorSelectedPageId", () => {
    it("returns FIRST_PAGE_ID when scene starts on FIRST_PAGE_ID", () => {
        const pages = [pageStub(FIRST_PAGE_ID, 0), pageStub(20, 1)];
        expect(
            resolveLightingInspectorSelectedPageId(pages, FIRST_PAGE_ID),
        ).toBe(FIRST_PAGE_ID);
    });

    it("returns the previous page id for non-first scene starts", () => {
        const pages = [
            pageStub(FIRST_PAGE_ID, 0),
            pageStub(20, 1),
            pageStub(30, 1),
        ];
        expect(resolveLightingInspectorSelectedPageId(pages, 30)).toBe(20);
    });

    it("returns null when the scene start page is missing", () => {
        const pages = [pageStub(FIRST_PAGE_ID, 0), pageStub(20, 1)];
        expect(resolveLightingInspectorSelectedPageId(pages, 999)).toBeNull();
    });
});

function pageWithTime(
    id: number,
    duration: number,
    timestamp: number,
): Pick<Page, "id" | "duration" | "timestamp"> {
    return { id, duration, timestamp } as Pick<
        Page,
        "id" | "duration" | "timestamp"
    >;
}

describe("buildLightingSceneTimeWindowsMs", () => {
    it("aligns wall-clock windows with scene start pages", () => {
        const pages = [
            pageWithTime(FIRST_PAGE_ID, 0, 0),
            pageWithTime(20, 4, 0),
            pageWithTime(30, 6, 4),
        ];
        const scenes = [
            { id: 1, start_page_id: FIRST_PAGE_ID },
            { id: 2, start_page_id: 30 },
        ];
        const windows = buildLightingSceneTimeWindowsMs(pages, scenes);
        expect(windows).toHaveLength(2);
        expect(windows[0]).toEqual({ sceneId: 1, startMs: 0, endMs: 4000 });
        expect(windows[1]).toEqual({ sceneId: 2, startMs: 4000, endMs: 10001 });
    });
});

describe("findLightingSceneAtShowTime", () => {
    it("maps show ms to scene-local offset", () => {
        const windows = [
            { sceneId: 1, startMs: 0, endMs: 2000 },
            { sceneId: 2, startMs: 2000, endMs: 5001 },
        ];
        expect(findLightingSceneAtShowTime(windows, 1500)).toEqual({
            sceneId: 1,
            tSceneMs: 1500,
        });
        expect(findLightingSceneAtShowTime(windows, 2000)).toEqual({
            sceneId: 2,
            tSceneMs: 0,
        });
        expect(findLightingSceneAtShowTime(windows, 5000)).toEqual({
            sceneId: 2,
            tSceneMs: 3000,
        });
        expect(findLightingSceneAtShowTime(windows, 9999)).toBeNull();
    });
});
