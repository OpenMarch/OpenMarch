import {
    generateMarcherPages,
    generateMarchers,
    generateTimingObjects,
} from "@/__mocks__/generators";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { pageToDatabasePage } from "@/global/classes/Page";
import { describe, expect, it } from "vitest";
import { generateDrillChartExportSVGs } from "../svg-generator";
import { marcherPageMapFromArray } from "@/global/classes/MarcherPageIndex";
import { seedObj } from "@/test/base";

describe("svgGenerator", () => {
    describe("generateDrillChartExportSVGs - should generate SVGs for each page", () => {
        it.for(seedObj)("seed: $seed", async ({ seed }) => {
            const marchers = generateMarchers({ numberOfMarchers: 100, seed });
            const timingObjects = generateTimingObjects({
                numberOfBeats: 64,
                seed,
            });
            const marcherPages = generateMarcherPages({
                marchers,
                pages: timingObjects.pages.map(pageToDatabasePage),
                fieldProperties:
                    FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES,
                seed,
            });

            const marcherPagesMap = marcherPageMapFromArray(marcherPages);

            const output = await generateDrillChartExportSVGs({
                marchers,
                marcherPagesMap,
                sortedPages: timingObjects.pages,
                fieldProperties:
                    FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES,
                sectionAppearances: [],
                backgroundImage: undefined,
                gridLines: true,
                halfLines: true,
                individualCharts: false,
            });

            expect(output.SVGs, "Should only have one array").toHaveLength(1);
            expect(output.SVGs.flat()).toHaveLength(timingObjects.pages.length);
            expect(output.coords).toBeNull();
        });
    });
    describe("generateDrillChartExportSVGs - should generate individual SVGs for each page", () => {
        it.for(seedObj)("seed: $seed", async ({ seed }) => {
            const marchers = generateMarchers({ numberOfMarchers: 16, seed });
            const timingObjects = generateTimingObjects({
                numberOfBeats: 16,
                seed,
            });
            const marcherPages = generateMarcherPages({
                marchers,
                pages: timingObjects.pages.map(pageToDatabasePage),
                fieldProperties:
                    FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES,
                seed,
            });

            const marcherPagesMap = marcherPageMapFromArray(marcherPages);

            const output = await generateDrillChartExportSVGs({
                marchers,
                marcherPagesMap,
                sortedPages: timingObjects.pages,
                fieldProperties:
                    FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES,
                sectionAppearances: [],
                backgroundImage: undefined,
                gridLines: true,
                halfLines: true,
                individualCharts: true,
            });

            const expectedLength = timingObjects.pages.length * marchers.length;
            expect(output.coords).toBeDefined();
            expect(
                output.coords,
                "Should have one array for each marcher",
            ).toHaveLength(marchers.length);
            expect(output.coords!.flat()).toHaveLength(expectedLength);
            expect(
                output.SVGs,
                "Should have one array for each marcher",
            ).toHaveLength(marchers.length);
            expect(output.SVGs.flat()).toHaveLength(expectedLength);
        });
    });
});
