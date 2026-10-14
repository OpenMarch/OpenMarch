import { describe, expect, it } from "vitest";
import {
    generateMarchers,
    generateTimingObjects,
} from "@/__mocks__/generators";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import type Page from "@/global/classes/Page";
import {
    pagePositionMapFromRows,
    type PagePositionMap,
} from "../exportPagePositions";
import { generatePagePositions } from "../../__test__/pagePositions";
import { generateDrillChartExportSVGs } from "../svg-generator";

/**
 * Individual drill charts stay aligned with `marchers` when a marcher has no position on a page
 * (docs/timeline/phases/07-page-parity.md P7.7 review). Before, the missing marcher was skipped
 * and every later marcher's charts shifted onto the previous marcher's PDF.
 */

const fieldProperties =
    FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES;

const show = () => {
    const marchers = generateMarchers({ numberOfMarchers: 4, seed: 2 });
    const { pages } = generateTimingObjects({ numberOfBeats: 24, seed: 2 });
    const sortedPages = [...pages].sort((a, b) => a.order - b.order);
    const marcherPages = generatePagePositions({
        marchers,
        pages,
        fieldProperties,
        seed: 2,
    });
    return { marchers, sortedPages, marcherPages };
};

const toMap = pagePositionMapFromRows;

const render = (
    marchers: ReturnType<typeof show>["marchers"],
    sortedPages: Page[],
    marcherPagesMap: PagePositionMap,
) =>
    generateDrillChartExportSVGs({
        fieldProperties,
        marchers,
        sortedPages,
        marcherPagesMap,
        sectionAppearances: [],
        individualCharts: true,
    });

describe("individual drill charts", () => {
    it("keeps every marcher at its index when one has a missing position", async () => {
        const { marchers, sortedPages, marcherPages } = show();
        expect(sortedPages.length).toBeGreaterThan(2);
        const full = await render(marchers, sortedPages, toMap(marcherPages));
        const missing = marchers[1]!;
        const gap = marcherPages.filter(
            (mp) =>
                !(
                    mp.marcher_id === missing.id &&
                    mp.page_id === sortedPages[1]!.id
                ),
        );

        const result = await render(marchers, sortedPages, toMap(gap));

        expect(result.SVGs).toHaveLength(marchers.length);
        expect(result.coords).toHaveLength(marchers.length);
        // The incomplete marcher gets no pages, so its PDF is skipped, never shifted
        expect(result.SVGs[1]).toEqual([]);
        expect(result.coords[1]).toEqual([]);
        for (const i of [0, 2, 3]) {
            expect(result.SVGs[i]).toHaveLength(sortedPages.length);
            expect(result.coords[i]).toEqual(full.coords[i]);
        }
    });

    it("doesn't throw on a page that isn't in the positions", async () => {
        const { marchers, sortedPages, marcherPages } = show();
        // A page deleted after the positions were read, still in a stale page list
        const stale = { ...sortedPages[1]!, id: 99999 };
        const pages = [sortedPages[0]!, stale, ...sortedPages.slice(1)];

        const result = await render(
            marchers.slice(0, 2),
            pages,
            toMap(marcherPages),
        );

        expect(result.SVGs).toEqual([[], []]);
    });
});
