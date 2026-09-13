import { describe, expect, it } from "vitest";
import { dbToMarcherTimeline } from "../db-to-timeline";

describe("dbToMarcherTimeline", () => {
    it("builds a timeline when every page has coordinates", () => {
        const timeline = dbToMarcherTimeline(
            [
                { page_id: 1, x: 10, y: 20 },
                { page_id: 2, x: 30, y: 40 },
            ],
            [
                { page_id: 1, timestamp: 0 },
                { page_id: 2, timestamp: 1000 },
            ],
        );

        expect(Array.from(timeline.timestamps)).toEqual([0, 1000]);
        expect(Array.from(timeline.coordinates)).toEqual([10, 20, 30, 40]);
    });

    it("throws when a page is missing coordinates", () => {
        expect(() =>
            dbToMarcherTimeline(
                [
                    { page_id: 1, x: 10, y: 20 },
                    { page_id: 2, x: 30, y: 40 },
                ],
                [
                    { page_id: 1, timestamp: 0 },
                    { page_id: 2, timestamp: 1000 },
                    { page_id: 27, timestamp: 2000 },
                ],
            ),
        ).toThrow("Coordinate not found for page id: 27");
    });
});
