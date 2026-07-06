import { describe, expect, it } from "vitest";
import {
    findOverlappingEffectsWithGroup,
    lightingEffectBeatIntervalsOverlap,
} from "../SceneTimeline.utils";

describe("lightingEffectBeatIntervalsOverlap", () => {
    it("returns false for zero-duration effects", () => {
        expect(
            lightingEffectBeatIntervalsOverlap(
                { start_offset_beats: 0, duration_beats: 4 },
                { start_offset_beats: 2, duration_beats: 0 },
            ),
        ).toBe(false);
    });

    it("returns false when intervals only touch at a boundary", () => {
        expect(
            lightingEffectBeatIntervalsOverlap(
                { start_offset_beats: 0, duration_beats: 5 },
                { start_offset_beats: 5, duration_beats: 3 },
            ),
        ).toBe(false);
    });

    it("returns true when intervals share interior range", () => {
        expect(
            lightingEffectBeatIntervalsOverlap(
                { start_offset_beats: 0, duration_beats: 10 },
                { start_offset_beats: 9, duration_beats: 4 },
            ),
        ).toBe(true);
    });

    it("handles negative durations as non-overlapping", () => {
        expect(
            lightingEffectBeatIntervalsOverlap(
                { start_offset_beats: 0, duration_beats: -1 },
                { start_offset_beats: 0, duration_beats: 4 },
            ),
        ).toBe(false);
    });
});

describe("findOverlappingEffectsWithGroup", () => {
    const fallback = "Effect";

    it("finds conflicting effects excluding target", () => {
        const effects = [
            {
                id: 1,
                name: "Target",
                start_offset_beats: 0,
                duration_beats: 4,
                lighting_group_ids: [] as readonly number[],
            },
            {
                id: 2,
                name: "Other",
                start_offset_beats: 2,
                duration_beats: 4,
                lighting_group_ids: [10] as readonly number[],
            },
        ];
        const found = findOverlappingEffectsWithGroup({
            effects,
            targetEffectId: 1,
            groupId: 10,
            effectNameFallback: fallback,
        });
        expect(found).toEqual([{ id: 2, name: "Other" }]);
    });

    it("returns empty when group is not used on overlapping peers", () => {
        const effects = [
            {
                id: 1,
                name: null,
                start_offset_beats: 0,
                duration_beats: 4,
                lighting_group_ids: [],
            },
            {
                id: 2,
                name: null,
                start_offset_beats: 2,
                duration_beats: 4,
                lighting_group_ids: [],
            },
        ];
        expect(
            findOverlappingEffectsWithGroup({
                effects,
                targetEffectId: 1,
                groupId: 10,
                effectNameFallback: fallback,
            }),
        ).toEqual([]);
    });

    it("ignores touching intervals at boundary", () => {
        const effects = [
            {
                id: 1,
                name: "Target",
                start_offset_beats: 0,
                duration_beats: 5,
                lighting_group_ids: [],
            },
            {
                id: 2,
                name: null,
                start_offset_beats: 5,
                duration_beats: 3,
                lighting_group_ids: [10],
            },
        ];
        expect(
            findOverlappingEffectsWithGroup({
                effects,
                targetEffectId: 1,
                groupId: 10,
                effectNameFallback: fallback,
            }),
        ).toEqual([]);
    });
});
