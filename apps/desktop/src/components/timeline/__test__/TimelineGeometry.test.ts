import { describe, expect, it } from "vitest";
import {
    clientXToNearestBeat,
    filterMarkersByMinimumSpacing,
    getInspectorRange,
    getPlayheadLabel,
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

    it("fits inspector view around the track with one beat of context", () => {
        expect(
            getInspectorRange(
                timelineStoryTracks.find((track) => track.id === "shape"),
                timelineStoryModel.beatCount,
            ),
        ).toEqual({ startBeat: 7, endBeat: 25 });
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

    it("formats the playhead from current page, measure, and count", () => {
        expect(getPlayheadLabel(timelineStoryModel, 11)).toBe(
            "Pg 2 · M3 · ct 4",
        );
    });

    it("accepts the story model and flags non-page track endpoints", () => {
        expect(validateTimelineViewModel(timelineStoryModel)).toEqual([]);
        expect(
            validateTimelineViewModel({
                ...timelineStoryModel,
                tracks: [
                    {
                        ...timelineStoryTracks[0],
                        legs: [
                            {
                                id: "invalid-leg",
                                startBeat: 1,
                                endBeat: 7,
                                texture: "move",
                            },
                        ],
                    },
                ],
            }),
        ).toEqual([
            "m1 must start on a page boundary",
            "m1 must end on a page boundary",
        ]);
    });
});
