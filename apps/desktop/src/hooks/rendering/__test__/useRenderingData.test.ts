import { describe, expect, it } from "vitest";
import {
    _coordinatesCoverPages,
    combineMarcherTimelines,
    createTimelineCombineCache,
} from "../useRenderingData";

describe("_coordinatesCoverPages", () => {
    it("returns true when every page has a matching coordinate", () => {
        const coordinates = [{ page_id: 1 }, { page_id: 2 }, { page_id: 3 }];
        const pages = [{ page_id: 1 }, { page_id: 2 }, { page_id: 3 }];

        expect(_coordinatesCoverPages(coordinates, pages)).toBe(true);
    });

    it("returns true when coordinates are a superset of pages", () => {
        const coordinates = [{ page_id: 1 }, { page_id: 2 }, { page_id: 3 }];
        const pages = [{ page_id: 1 }, { page_id: 2 }];

        expect(_coordinatesCoverPages(coordinates, pages)).toBe(true);
    });

    it("returns false when a restored page is missing from coordinates", () => {
        const coordinates = [{ page_id: 1 }, { page_id: 2 }];
        const pages = [{ page_id: 1 }, { page_id: 2 }, { page_id: 27 }];

        expect(_coordinatesCoverPages(coordinates, pages)).toBe(false);
    });

    it("returns true for empty pages", () => {
        expect(_coordinatesCoverPages([{ page_id: 1 }], [])).toBe(true);
    });
});

describe("combineMarcherTimelines", () => {
    const pagesForTimeline = [
        { page_id: 1, timestamp: 0 },
        { page_id: 2, timestamp: 1000 },
    ];

    const dataFor = (x: number, y: number) => [
        { page_id: 1, x, y },
        { page_id: 2, x, y },
    ];

    it("returns a reference-equal result when nothing changed", () => {
        const cache = createTimelineCombineCache();
        const marcherIds = [1, 2];
        const marcherPages = [{ data: dataFor(0, 0) }, { data: dataFor(1, 1) }];

        const first = combineMarcherTimelines(
            cache,
            marcherIds,
            pagesForTimeline,
            marcherPages,
        );
        const second = combineMarcherTimelines(
            cache,
            marcherIds,
            pagesForTimeline,
            marcherPages,
        );

        expect(second).toBe(first);
    });

    it("only rebuilds the timeline whose data reference changed", () => {
        const cache = createTimelineCombineCache();
        const marcherIds = [1, 2];
        const marcherAData = dataFor(0, 0);
        const marcherBData = dataFor(1, 1);

        const first = combineMarcherTimelines(
            cache,
            marcherIds,
            pagesForTimeline,
            [{ data: marcherAData }, { data: marcherBData }],
        );

        const newMarcherAData = dataFor(5, 5);
        const second = combineMarcherTimelines(
            cache,
            marcherIds,
            pagesForTimeline,
            [{ data: newMarcherAData }, { data: marcherBData }],
        );

        expect(second).not.toBe(first);
        expect(second!.marcherTimelines[0]).not.toBe(
            first!.marcherTimelines[0],
        );
        expect(second!.marcherTimelines[1]).toBe(first!.marcherTimelines[1]);
    });

    it("rebuilds every timeline when pagesForTimeline changes", () => {
        const cache = createTimelineCombineCache();
        const marcherIds = [1];
        const data = dataFor(0, 0);

        const first = combineMarcherTimelines(
            cache,
            marcherIds,
            pagesForTimeline,
            [{ data }],
        );

        const newPagesForTimeline = [
            { page_id: 1, timestamp: 0 },
            { page_id: 2, timestamp: 2000 },
        ];
        const second = combineMarcherTimelines(
            cache,
            marcherIds,
            newPagesForTimeline,
            [{ data }],
        );

        expect(second!.marcherTimelines[0]).not.toBe(
            first!.marcherTimelines[0],
        );
    });

    it("reuses unaffected marchers and prunes removed ones when marcherIds changes", () => {
        const cache = createTimelineCombineCache();
        const marcherAData = dataFor(0, 0);
        const marcherBData = dataFor(1, 1);
        const marcherCData = dataFor(2, 2);

        const first = combineMarcherTimelines(cache, [1, 2], pagesForTimeline, [
            { data: marcherAData },
            { data: marcherBData },
        ]);

        const second = combineMarcherTimelines(
            cache,
            [1, 3],
            pagesForTimeline,
            [{ data: marcherAData }, { data: marcherCData }],
        );

        expect(second).not.toBe(first);
        expect(second!.marcherTimelines[0]).toBe(first!.marcherTimelines[0]);
        expect(second!.marcherTimelines[1]).not.toBe(
            first!.marcherTimelines[1],
        );
        expect(cache.perMarcher.size).toBe(2);
        expect(cache.perMarcher.has(2)).toBe(false);
    });

    it("returns undefined without corrupting the cache when data doesn't cover all pages", () => {
        const cache = createTimelineCombineCache();
        const marcherIds = [1];
        const validData = dataFor(0, 0);

        const valid = combineMarcherTimelines(
            cache,
            marcherIds,
            pagesForTimeline,
            [{ data: validData }],
        );
        expect(valid).toBeDefined();

        const incomplete = combineMarcherTimelines(
            cache,
            marcherIds,
            pagesForTimeline,
            [{ data: [{ page_id: 1, x: 0, y: 0 }] }],
        );
        expect(incomplete).toBeUndefined();

        const validAgain = combineMarcherTimelines(
            cache,
            marcherIds,
            pagesForTimeline,
            [{ data: validData }],
        );
        expect(validAgain).toBe(valid);
    });
});
