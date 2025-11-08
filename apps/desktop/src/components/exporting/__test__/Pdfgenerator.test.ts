import {
    generateMarcherPages,
    generateMarchers,
    generateTimingObjects,
} from "@/__mocks__/generators";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { pageToDatabasePage } from "@/global/classes/Page";
import { describe, expect, it } from "vitest";
import { generateFieldSVGs } from "../PdfGenerator";
import { marcherPageMapFromArray } from "@/global/classes/MarcherPageIndex";
import { seedObj } from "@/test/base";

describe("PdfGenerator", () => {
    describe("generateFieldSVGs - should generate SVGs for each page", () => {
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

            const svgs = await generateFieldSVGs({
                marchers,
                marcherPagesMap,
                pages: timingObjects.pages,
                fieldProperties:
                    FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES,
            });

            expect(svgs.length).toBe(timingObjects.pages.length);
        });
    });
});
