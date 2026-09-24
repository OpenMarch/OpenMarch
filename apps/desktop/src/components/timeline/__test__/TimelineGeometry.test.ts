import { describe, expect, it } from "vitest";
import {
    clientXToNearestBeat,
    filterMarkersByMinimumSpacing,
    getPageRange,
    getPlayheadLabel,
    getSelectionRange,
    packTimelineTracks,
    validateTimelineViewModel,
} from "../TimelineGeometry";
import {
    timelineStoryModel,
    timelineStoryTracks,
} from "../TimelineStoryFixtures";

describe("timeline geometry", () => {
    it("packs touching tracks together and separates overlaps", () => {
        const rows = packTimelineTracks(timelineStoryTracks);

        expect(rows.map((row) => row.map((track) => track.id))).toEqual([
            ["m1", "m7"],
            ["shape"],
        ]);
    });

    it("derives end-exclusive page and selection ranges", () => {
        expect(
            getPageRange({
                pages: timelineStoryModel.pages,
                pageId: "page-0",
                beatCount: timelineStoryModel.beatCount,
            }),
        ).toBeNull();
        expect(
            getPageRange({
                pages: timelineStoryModel.pages,
                pageId: "page-2",
                beatCount: timelineStoryModel.beatCount,
            }),
        ).toEqual({ startBeatIndex: 8, endBeatIndex: 16 });
        expect(
            getSelectionRange(
                { kind: "track", trackId: "shape" },
                timelineStoryModel,
            ),
        ).toEqual({ startBeatIndex: 8, endBeatIndex: 24 });
    });

    it("maps a pointer position to the nearest beat", () => {
        expect(
            clientXToNearestBeat({
                clientX: 169,
                surfaceLeft: 100,
                pixelsPerBeat: 16,
                startBeat: 0,
                beatCount: 32,
            }),
        ).toBe(4);
    });

    it("thins ruler labels at low zoom while retaining the local origin", () => {
        expect(
            filterMarkersByMinimumSpacing(
                timelineStoryModel.measures,
                4,
                32,
            ).map((marker) => marker.id),
        ).toEqual(["measure-1", "measure-3", "measure-5", "measure-7"]);
    });

    it("formats the playhead as page, measure, and count", () => {
        expect(getPlayheadLabel(timelineStoryModel, 0)).toBe("Pg 1 · m1.1");
        expect(getPlayheadLabel(timelineStoryModel, 11)).toBe("Pg 2 · m3.4");
    });

    it("accepts normalized activity partitions", () => {
        expect(validateTimelineViewModel(timelineStoryModel)).toEqual([]);
    });

    it("reports activity gaps and adjacent duplicate states", () => {
        expect(
            validateTimelineViewModel({
                ...timelineStoryModel,
                tracks: [
                    {
                        ...timelineStoryTracks[0],
                        activitySpans: [
                            {
                                startBeatIndex: 0,
                                endBeatIndex: 4,
                                active: true,
                            },
                            {
                                startBeatIndex: 5,
                                endBeatIndex: 8,
                                active: true,
                            },
                            {
                                startBeatIndex: 8,
                                endBeatIndex: 16,
                                active: false,
                            },
                        ],
                    },
                ],
            }),
        ).toEqual([
            "m1 activity must not have gaps or overlaps",
            "m1 adjacent activity spans must be normalized",
        ]);
    });
});
