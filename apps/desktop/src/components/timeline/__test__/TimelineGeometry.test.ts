import { describe, expect, it } from "vitest";
import {
    clientXToNearestBeat,
    filterMarkersByMinimumSpacing,
    getPageCountAt,
    parseTimelineGoTo,
    getPageRange,
    getPageSnapBeats,
    getPlayheadLabel,
    getPlayheadReadout,
    getVisiblePageCounts,
    getWindowCountLabel,
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

    it("formats the playhead as page, count and measure (UI-13)", () => {
        expect(getPlayheadLabel(timelineStoryModel, 0)).toBe("Home");
        expect(getPlayheadLabel(timelineStoryModel, 11)).toBe(
            "Pg 2 · ct 3/8 · m3 beat 4",
        );
        // On a flag, the page ending there, as the transport counts it
        expect(getPlayheadLabel(timelineStoryModel, 16)).toBe(
            "Pg 2 · ct 8/8 · m5 beat 1",
        );
        // The last page has no flag in this model, so no total
        expect(getPlayheadLabel(timelineStoryModel, 27)).toBe(
            "Pg 4 · ct 3 · m7 beat 4",
        );
    });

    it("leaves the measure out when the show has none (UI-13)", () => {
        const model = { ...timelineStoryModel, measures: [] };
        expect(getPlayheadLabel(model, 11)).toBe("Pg 2 · ct 3/8");
        expect(getPlayheadReadout(model, 11).spoken).toBe(
            "Page 2, count 3 of 8",
        );
        expect(getPlayheadReadout(timelineStoryModel, 11).spoken).toBe(
            "Page 2, count 3 of 8, measure 3 beat 4",
        );
    });

    it("reads past the last flag as after that page (UI-13)", () => {
        const model = {
            ...timelineStoryModel,
            pages: timelineStoryModel.pages.map((page) =>
                page.id === "page-4" ? { ...page, endBeat: 28 } : page,
            ),
        };
        expect(getPlayheadReadout(model, 30).page).toBe("After pg 4 · +2");
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

describe("getPageCountAt (UI-12)", () => {
    it("counts to a page's flag: its flag is its last count, the next beat is the next page's 1", () => {
        expect(getPageCountAt(timelineStoryModel, 8)).toEqual({
            pageLabel: "1",
            count: 8,
            total: 8,
            startBeat: 0,
        });
        expect(getPageCountAt(timelineStoryModel, 9)).toEqual({
            pageLabel: "2",
            count: 1,
            total: 8,
            startBeat: 8,
        });
        expect(getPageCountAt(timelineStoryModel, 0)).toEqual({
            pageLabel: "0",
            count: 0,
            home: true,
        });
    });
});

describe("getVisiblePageCounts (UI-13)", () => {
    it("numbers every count when there is room, always ending on the flag", () => {
        expect(getVisiblePageCounts(8, 20)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it("doubles the step until the numbers fit, keeping the flag's count", () => {
        // Two digits need 18px: every 2nd count at 10px a beat, every 4th at 5px
        expect(getVisiblePageCounts(16, 10)).toEqual([
            2, 4, 6, 8, 10, 12, 14, 16,
        ]);
        expect(getVisiblePageCounts(16, 5)).toEqual([4, 8, 12, 16]);
        // A number too close to the flag's gives way to it
        expect(getVisiblePageCounts(14, 5)).toEqual([4, 8, 14]);
    });

    it("still numbers a short page's flag, and nothing when it can't fit one", () => {
        expect(getVisiblePageCounts(3, 4)).toEqual([3]);
        expect(getVisiblePageCounts(2, 4)).toEqual([]);
    });
});

describe("getWindowCountLabel (UI-13)", () => {
    it("names the counts inside one page box, counted to its flag", () => {
        expect(
            getWindowCountLabel(timelineStoryModel, {
                startBeatIndex: 10,
                endBeatIndex: 14,
            }),
        ).toBe("counts 3–6");
        expect(
            getWindowCountLabel(timelineStoryModel, {
                startBeatIndex: 12,
                endBeatIndex: 13,
            }),
        ).toBe("count 5");
    });

    it("gives a length when the window passes a flag", () => {
        expect(
            getWindowCountLabel(timelineStoryModel, {
                startBeatIndex: 4,
                endBeatIndex: 16,
            }),
        ).toBe("12 counts");
    });
});

describe("parseTimelineGoTo (UI-12)", () => {
    const model = {
        beatCount: 11,
        pages: [
            { id: "p0", label: "0", atBeat: 0, isInitial: true },
            { id: "p1", label: "1", atBeat: 0, isInitial: false },
            { id: "p2a", label: "2A", atBeat: 8, isInitial: false },
        ],
        measures: [
            { id: "m1", label: "M1", atBeat: 0 },
            { id: "m2", label: "M2", atBeat: 4, rehearsalMark: "B" },
            { id: "m3", label: "M3", atBeat: 8 },
        ],
    };
    it("reads measures, pages and rehearsal marks as designers type them", () => {
        expect(parseTimelineGoTo("m2", model)).toEqual({
            kind: "beat",
            beat: 4,
        });
        expect(parseTimelineGoTo("M2.3", model)).toEqual({
            kind: "beat",
            beat: 6,
        });
        expect(parseTimelineGoTo("m1.4", model)).toEqual({
            kind: "beat",
            beat: 3,
        });
        expect(parseTimelineGoTo("b", model)).toEqual({
            kind: "beat",
            beat: 4,
        });
        expect(parseTimelineGoTo("2a", model)).toEqual({
            kind: "page",
            pageId: "p2a",
        });
        expect(parseTimelineGoTo("pg 1", model)).toEqual({
            kind: "page",
            pageId: "p1",
        });
        expect(parseTimelineGoTo("page 0", model)).toEqual({
            kind: "page",
            pageId: "p0",
        });
        expect(parseTimelineGoTo("m9", model)).toBeNull();
        expect(parseTimelineGoTo("", model)).toBeNull();
        expect(parseTimelineGoTo("zz", model)).toBeNull();
    });

    it("misses a count the measure doesn't have, rather than guessing (UI-12 review)", () => {
        expect(parseTimelineGoTo("m1.0", model)).toBeNull();
        // Measure 1 runs to measure 2, beats 0-3
        expect(parseTimelineGoTo("m1.5", model)).toBeNull();
        expect(parseTimelineGoTo("m1.9", model)).toBeNull();
        // The last measure runs to the show's end: beats 8-10
        expect(parseTimelineGoTo("m3.3", model)).toEqual({
            kind: "beat",
            beat: 10,
        });
        expect(parseTimelineGoTo("m3.4", model)).toBeNull();
        expect(parseTimelineGoTo("m3.40", model)).toBeNull();
    });
});
