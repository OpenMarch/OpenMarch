import { describe, expect, it } from "vitest";
import {
    clientXToNearestBeat,
    filterMarkersByMinimumSpacing,
    getPageRange,
    getPageSnapBeats,
    getPlayheadLabel,
    getSelectionRange,
    isPageSnapDisabled,
    packTimelineTracks,
    sameRange,
    snapBoundary,
    snapRangeOffset,
    TIMELINE_PAGE_SNAP_PX,
    validateTimelineViewModel,
} from "../TimelineGeometry";
import {
    timelineStoryModel,
    timelineStoryTracks,
} from "../TimelineStoryFixtures";
import { getDraggedRange } from "../TimelinePrimitives";

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
            getSelectionRange({
                kind: "range",
                range: { startBeatIndex: 8, endBeatIndex: 24 },
            }),
        ).toEqual({ startBeatIndex: 8, endBeatIndex: 24 });
        // UI-9: home and nothing have no range
        expect(getSelectionRange({ kind: "home" })).toBeNull();
        expect(getSelectionRange(null)).toBeNull();
    });

    it("compares ranges by their bounds", () => {
        const range = { startBeatIndex: 8, endBeatIndex: 16 };
        expect(sameRange(range, { ...range })).toBe(true);
        expect(sameRange(range, { startBeatIndex: 8, endBeatIndex: 15 })).toBe(
            false,
        );
        expect(sameRange(range, null)).toBe(false);
        expect(sameRange(null, null)).toBe(false);
    });

    it("turns a drag into a range, snapping each edge to page lines", () => {
        const snapBeats = [8, 16, 24];
        // Within 24px of page lines 8 and 16 at 16px a beat
        expect(
            getDraggedRange({
                fromBeat: 8.6,
                toBeat: 15.2,
                snapBeats,
                pixelsPerBeat: 16,
                beatCount: 32,
            }),
        ).toEqual({ startBeatIndex: 8, endBeatIndex: 16 });
        // Dragged right to left, and without snapping
        expect(
            getDraggedRange({
                fromBeat: 12.6,
                toBeat: 3.2,
                snapBeats: [],
                pixelsPerBeat: 16,
                beatCount: 32,
            }),
        ).toEqual({ startBeatIndex: 3, endBeatIndex: 13 });
        // Clamped to the show, and empty when both edges land on one beat
        expect(
            getDraggedRange({
                fromBeat: 30,
                toBeat: 40,
                snapBeats: [],
                pixelsPerBeat: 16,
                beatCount: 32,
            }),
        ).toEqual({ startBeatIndex: 30, endBeatIndex: 32 });
        expect(
            getDraggedRange({
                fromBeat: 4.1,
                toBeat: 4.3,
                snapBeats: [],
                pixelsPerBeat: 16,
                beatCount: 32,
            }),
        ).toBeNull();
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
        // A caller-named page (the selected page while paused) wins over the page under the beat
        expect(getPlayheadLabel(timelineStoryModel, 16, "2")).toBe(
            "Pg 2 · m5.1",
        );
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

    it("accepts a track that starts and ends mid-page (UI-2)", () => {
        expect(
            validateTimelineViewModel({
                ...timelineStoryModel,
                tracks: [
                    {
                        ...timelineStoryTracks[0],
                        legs: [
                            {
                                id: "mid",
                                startBeat: 5,
                                endBeat: 13,
                                texture: "move",
                            },
                        ],
                        activitySpans: [
                            {
                                startBeatIndex: 5,
                                endBeatIndex: 13,
                                active: true,
                            },
                        ],
                    },
                ],
            }),
        ).toEqual([]);
    });
});

describe("page snapping (UI-2)", () => {
    const snapBeats = getPageSnapBeats(timelineStoryModel);

    it("snaps to timed page starts and the end of the show", () => {
        // The initial page shares beat 0 with page 1; the show ends at beat 32
        expect(snapBeats).toEqual([0, 8, 16, 24, 32]);
    });

    it("lands a boundary on a page line within the snap distance, else on the nearest beat", () => {
        const at = (beat: number, pixelsPerBeat = 16) =>
            snapBoundary({ beat, snapBeats, pixelsPerBeat });

        expect(TIMELINE_PAGE_SNAP_PX).toBe(24);
        // 16 px from the line at 8
        expect(at(7)).toBe(8);
        expect(at(9.4)).toBe(8);
        // 25.6 px from 8: too far, so the nearest beat
        expect(at(6.4)).toBe(6);
        expect(at(12.2)).toBe(12);
        // The same distance in beats is fewer pixels zoomed out
        expect(at(5, 4)).toBe(8);
        expect(at(5, 64)).toBe(5);
    });

    it("places a boundary on any beat with snapping off", () => {
        expect(
            snapBoundary({ beat: 7, snapBeats: [], pixelsPerBeat: 16 }),
        ).toBe(7);
        expect(
            snapBoundary({ beat: 7.6, snapBeats: [], pixelsPerBeat: 16 }),
        ).toBe(8);
    });

    it("moves a clip so that its nearer edge sits on a page line", () => {
        const offset = (
            range: { startBeatIndex: number; endBeatIndex: number },
            raw: number,
            beats = snapBeats,
        ) =>
            snapRangeOffset({
                range,
                offset: raw,
                snapBeats: beats,
                pixelsPerBeat: 16,
            });

        // The start edge reaches 7.3, 11.2 px from 8
        expect(offset({ startBeatIndex: 2, endBeatIndex: 6 }, 5.3)).toBe(6);
        // The end edge reaches 15.5, 8 px from 16; the start is 3.5 beats from any line
        expect(offset({ startBeatIndex: 2, endBeatIndex: 7 }, 8.5)).toBe(9);
        // Both edges are 32 px from a line: whole beats
        expect(offset({ startBeatIndex: 0, endBeatIndex: 16 }, 2)).toBe(2);
        // Snapping off
        expect(offset({ startBeatIndex: 2, endBeatIndex: 6 }, 5.3, [])).toBe(5);
    });

    it("turns snapping off while Alt is held", () => {
        expect(isPageSnapDisabled({ altKey: true })).toBe(true);
        expect(isPageSnapDisabled({ altKey: false })).toBe(false);
    });
});
