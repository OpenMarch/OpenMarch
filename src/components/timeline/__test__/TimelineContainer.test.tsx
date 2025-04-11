import { describe, expect, it } from "vitest";
import { getAvailableOffsets } from "../TimelineContainer";
import Beat from "@/global/classes/Beat";
import Page from "@/global/classes/Page";

describe("getAvailableOffsets", () => {
    it("should return correct offsets for a single page with no next page", () => {
        const currentPage = {
            beats: [
                { duration: 2 } as Beat,
                { duration: 3 } as Beat,
                { duration: 1 } as Beat,
            ],
        } as Page;

        const result = getAvailableOffsets({
            currentPage,
            nextPage: null,
            allBeats: [],
        });

        // Expected offsets:
        // -6 (total duration negative)
        // -4 (after first beat)
        // -1 (after second beat)
        // 0 (current position)
        expect(result).toEqual([-6, -4, -1, 0]);
    });

    it("should return correct offsets with both current and next page", () => {
        const currentPage = {
            beats: [{ duration: 2 } as Beat, { duration: 2 } as Beat],
        } as Page;

        const nextPage = {
            beats: [{ duration: 3 } as Beat, { duration: 1 } as Beat],
        } as Page;

        const result = getAvailableOffsets({
            currentPage,
            nextPage,
            allBeats: [],
        });

        // Expected offsets:
        // -4 (total duration negative)
        // -2 (after first beat of current page)
        // 0 (current position)
        // 3 (after first beat of next page)
        // 4 (after second beat of next page)
        expect(result).toEqual([-4, -2, 0, 3]);
    });

    it("should handle empty beats array", () => {
        const currentPage = {
            id: 1,
            name: "1",
            counts: 0,
            notes: null,
            order: 0,
            isSubset: false,
            duration: 0,
            beats: [],
            measures: null,
            measureBeatToStartOn: null,
            measureBeatToEndOn: null,
            timestamp: 0,
            previousPageId: null,
            nextPageId: null,
        } as Page;

        const result = getAvailableOffsets({
            currentPage,
            nextPage: null,
            allBeats: [],
        });

        // Should only return 0 since there are no beats
        expect(result).toEqual([0]);
    });

    it("should handle zero duration beats", () => {
        const currentPage = {
            beats: [{ duration: 0 } as Beat, { duration: 0 } as Beat],
        } as Page;

        const nextPage = {
            beats: [{ duration: 0 } as Beat],
        } as Page;

        const result = getAvailableOffsets({
            currentPage,
            nextPage,
            allBeats: [],
        });

        // Should return [0, 0, 0, 0]
        expect(result).toEqual([0, 0, 0]);
    });
});
