import { describe, expect, it } from "vitest";
import { FIRST_PAGE_ID } from "@/db-functions";
import Page from "@/global/classes/Page";
import {
    buildSceneTimelineSegments,
    FIRST_PAGE_TIMELINE_WIDTH_PX,
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
