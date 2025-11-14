import {
    generateMarcherPages,
    generateMarchers,
    generateTimingObjects,
} from "@/__mocks__/generators";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { pageToDatabasePage } from "@/global/classes/Page";
import { describe, expect, it } from "vitest";
import {
    generateDrillChartExportSVGs,
    OPENMARCH_FIELD_IMAGE_PLACEHOLDER,
    replaceImageDataWithPlaceholder,
} from "../svg-generator";
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

describe.only("replaceImageDataWithPlaceholder", () => {
    const testString = `pre-svg-pages <?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="440" height="320" viewBox="-40 -40 440 320" xml:space="preserve">
<desc>Created with Fabric.js 5.5.2</desc>
<defs>
</defs>
<g transform="matrix(1 0 0 1 180.25 121.55)"  >
<g style=""   >
		<g transform="matrix(1 0 0 1 0.25 -1.05)"  >
<rect style="stroke: none; stroke-width: 1; stroke-dasharray: none; stroke-linecap: butt; stroke-dashoffset: 0; stroke-linejoin: miter; stroke-miterlimit: 4; fill: rgb(255,255,255); fill-rule: nonzero; opacity: 1;"  x="-180" y="-120" rx="0" ry="0" width="360" height="240" />
</g>
		<g transform="matrix(0.23 0 0 0.23 -0.25 -1.55)"  >
	<image style="stroke: none; stroke-width: 0; stroke-dasharray: none; stroke-linecap: butt; stroke-dashoffset: 0; stroke-linejoin: miter; stroke-miterlimit: 4; fill: rgb(0,0,0); fill-rule: nonzero; opacity: 1;"  xlink:href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABgAAAAQACAIAAACoEw8PSv/j8yTeftbttDFOSNhVyc3eorTHCpkOoZjhmcmE1QyIiJEIbwaUAJqRjgNogEYBMhyICSOGOBGomBOZBZcEY4YYyGbioJWNH/Mfqdz/89tOL0HasPorHlYJQ5la1GzKYRqolOgevqQu2wcEYQ4OJS2nqe3o0aSGYkH0f47JXTHtHQB0ZM2tloHBnTBfGhCTnoOgWY/BcQap3H27Loak5aVLNbjHVSp5FJMCn03x+exWUw+nm9fnNNE3bHnWS6KGXNwneWhsjorIA0h45FQcHgPTkTA8tUxmr1amNblmihqTANrQSMRfduqcJIRBPpah1RAmEDORCkeDbPh8WRWWHcNa+l9NBNUptRBZ7dzNBcs8UTEtiAqD/Adx58g/vb+JFAAAAAElFTkSuQmCC" x="-768" y="-512" width="1536" height="1024"></image>
</g>
		<g transform="matrix(1 0 0 1 0.25 -1.55)"  >
<line style="stroke: rgb(221,221,221); stroke-width: 1; stroke-dasharray: none; stroke-linecap: butt; stroke-dashoffset: 0; stroke-linejoin: miter; stroke-miterlimit: 4; fill: rgb(0,0,0); fill-rule: nonzero; opacity: 1;"  x1="0" y1="-120" x2="0" y2="120" />
</g>`;

    it("replaces the image with the placeholder", () => {
        const result = replaceImageDataWithPlaceholder(testString);

        expect(result).toContain(OPENMARCH_FIELD_IMAGE_PLACEHOLDER);
    });
});
