import { describe, expect, it } from "vitest";
import { FIRST_PAGE_ID } from "@/db-functions";
import type Beat from "@/global/classes/Beat";
import type Page from "@/global/classes/Page";
import {
    buildOrderedSceneStarts,
    effectBarPx,
    getSceneEndPageIndex,
    getSceneStartBeatPosition,
    getSceneTotalBeats,
    packEffectsIntoLanes,
} from "../SceneTimeline.utils";

function beat(id: number, position: number, duration: number): Beat {
    return {
        id,
        position,
        duration,
        includeInMeasure: true,
        notes: null,
        index: position - 1,
        timestamp: 0,
    };
}

function pageStub(
    id: number,
    duration: number,
    beats: Beat[],
): Pick<Page, "id" | "duration" | "beats"> {
    return { id, duration, beats } as Pick<Page, "id" | "duration" | "beats">;
}

describe("packEffectsIntoLanes", () => {
    it("returns empty placements and zero lanes when no effects given", () => {
        expect(packEffectsIntoLanes([])).toEqual({
            placements: [],
            laneCount: 0,
        });
    });

    it("packs sequential, non-overlapping effects into a single lane", () => {
        const effects = [
            { id: 1, start_offset_beats: 0, duration_beats: 4 },
            { id: 2, start_offset_beats: 4, duration_beats: 2 },
            { id: 3, start_offset_beats: 6, duration_beats: 3 },
        ];
        const { placements, laneCount } = packEffectsIntoLanes(effects);
        expect(laneCount).toBe(1);
        expect(placements.map((p) => p.lane)).toEqual([0, 0, 0]);
    });

    it("uses N lanes when N effects fully overlap", () => {
        const effects = [
            { id: 1, start_offset_beats: 0, duration_beats: 8 },
            { id: 2, start_offset_beats: 0, duration_beats: 8 },
            { id: 3, start_offset_beats: 0, duration_beats: 8 },
        ];
        const { placements, laneCount } = packEffectsIntoLanes(effects);
        expect(laneCount).toBe(3);
        expect(placements.map((p) => p.lane).sort()).toEqual([0, 1, 2]);
    });

    it("greedily reuses earlier lanes when later effects no longer conflict", () => {
        const effects = [
            { id: 10, start_offset_beats: 0, duration_beats: 4 },
            { id: 11, start_offset_beats: 2, duration_beats: 4 },
            { id: 12, start_offset_beats: 4, duration_beats: 2 },
            { id: 13, start_offset_beats: 6, duration_beats: 2 },
        ];
        const { placements, laneCount } = packEffectsIntoLanes(effects);
        expect(laneCount).toBe(2);
        const byId = Object.fromEntries(
            placements.map((p) => [p.effectId, p.lane]),
        );
        expect(byId[10]).toBe(0);
        expect(byId[11]).toBe(1);
        expect(byId[12]).toBe(0);
        expect(byId[13]).toBe(0);
    });

    it("ties on start_offset_beats break by id (lower id first)", () => {
        const effects = [
            { id: 99, start_offset_beats: 0, duration_beats: 1 },
            { id: 1, start_offset_beats: 0, duration_beats: 1 },
        ];
        const { placements } = packEffectsIntoLanes(effects);
        expect(placements[0]!.effectId).toBe(1);
        expect(placements[0]!.lane).toBe(0);
        expect(placements[1]!.effectId).toBe(99);
        expect(placements[1]!.lane).toBe(1);
    });

    it("treats abutting bars (end == next start) as non-overlapping", () => {
        const effects = [
            { id: 1, start_offset_beats: 0, duration_beats: 3 },
            { id: 2, start_offset_beats: 3, duration_beats: 3 },
        ];
        const { placements, laneCount } = packEffectsIntoLanes(effects);
        expect(laneCount).toBe(1);
        expect(placements.every((p) => p.lane === 0)).toBe(true);
    });

    it("clamps negative start/duration to zero before packing", () => {
        const effects = [
            { id: 1, start_offset_beats: -2, duration_beats: -1 },
            { id: 2, start_offset_beats: 0, duration_beats: 1 },
        ];
        const { placements, laneCount } = packEffectsIntoLanes(effects);
        expect(laneCount).toBe(1);
        expect(placements[0]!.startBeats).toBe(0);
        expect(placements[0]!.durationBeats).toBe(0);
        expect(placements[1]!.lane).toBe(0);
    });
});

describe("effectBarPx", () => {
    const beats = [
        beat(1, 1, 0.5),
        beat(2, 2, 0.5),
        beat(3, 3, 1),
        beat(4, 4, 1),
        beat(5, 5, 0.25),
        beat(6, 6, 0.25),
    ];

    it("returns scene-local px for left and width using variable beat durations", () => {
        const pps = 100;
        const { leftPx, widthPx } = effectBarPx(beats, 1, 2, 2, pps);
        // Skip first 2 beats (0.5 + 0.5 = 1.0s), span next 2 beats (1 + 1 = 2.0s).
        expect(leftPx).toBeCloseTo(100, 5);
        expect(widthPx).toBeCloseTo(200, 5);
    });

    it("zero duration produces zero width", () => {
        const { widthPx } = effectBarPx(beats, 1, 0, 0, 100);
        expect(widthPx).toBe(0);
    });

    it("starts at zero px when offset is zero", () => {
        const { leftPx, widthPx } = effectBarPx(beats, 1, 0, 1, 100);
        expect(leftPx).toBe(0);
        expect(widthPx).toBeCloseTo(50, 5);
    });

    it("scales linearly with pixelsPerSecond", () => {
        const a = effectBarPx(beats, 1, 1, 2, 50);
        const b = effectBarPx(beats, 1, 1, 2, 200);
        expect(b.leftPx).toBeCloseTo(a.leftPx * 4, 5);
        expect(b.widthPx).toBeCloseTo(a.widthPx * 4, 5);
    });
});

describe("getSceneStartBeatPosition / getSceneTotalBeats / getSceneEndPageIndex", () => {
    const allBeats = Array.from({ length: 8 }, (_, i) =>
        beat(i + 1, i + 1, 0.5),
    );

    const pages = [
        pageStub(FIRST_PAGE_ID, 0, []),
        pageStub(20, 1, [allBeats[0]!, allBeats[1]!]),
        pageStub(30, 1, [allBeats[2]!, allBeats[3]!]),
        pageStub(40, 1, [allBeats[4]!, allBeats[5]!]),
        pageStub(50, 1, [allBeats[6]!, allBeats[7]!]),
    ];

    const scenes = [
        { id: 1, start_page_id: FIRST_PAGE_ID },
        { id: 2, start_page_id: 30 },
        { id: 3, start_page_id: 50 },
    ];
    const orderedStarts = buildOrderedSceneStarts(pages, scenes);

    it("returns the position of the start page's first beat", () => {
        expect(getSceneStartBeatPosition({ start_page_id: 30 }, pages)).toBe(3);
        expect(getSceneStartBeatPosition({ start_page_id: 50 }, pages)).toBe(7);
    });

    it("returns null when the start page has no beats", () => {
        expect(
            getSceneStartBeatPosition({ start_page_id: FIRST_PAGE_ID }, pages),
        ).toBeNull();
    });

    it("returns null when the start page is missing", () => {
        expect(
            getSceneStartBeatPosition({ start_page_id: 9999 }, pages),
        ).toBeNull();
    });

    it("getSceneEndPageIndex returns last page in the scene", () => {
        expect(getSceneEndPageIndex(orderedStarts, 1, pages)).toBe(1);
        expect(getSceneEndPageIndex(orderedStarts, 2, pages)).toBe(3);
        expect(getSceneEndPageIndex(orderedStarts, 3, pages)).toBe(4);
        expect(getSceneEndPageIndex(orderedStarts, 999, pages)).toBe(-1);
    });

    it("getSceneTotalBeats sums beats across the scene's pages", () => {
        const sceneA = { id: 2, start_page_id: 30 };
        expect(getSceneTotalBeats(sceneA, orderedStarts, pages)).toBe(4);
        const sceneB = { id: 3, start_page_id: 50 };
        expect(getSceneTotalBeats(sceneB, orderedStarts, pages)).toBe(2);
    });

    it("getSceneTotalBeats returns 0 for unknown scenes", () => {
        const unknownScene = { id: 999, start_page_id: 12345 };
        expect(getSceneTotalBeats(unknownScene, orderedStarts, pages)).toBe(0);
    });
});
