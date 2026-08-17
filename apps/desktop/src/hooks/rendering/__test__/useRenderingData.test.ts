import { describe, expect, it } from "vitest";
import { _coordinatesCoverPages } from "../useRenderingData";

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
