import {
    generateMarchers,
    generateTimingObjects,
} from "@/__mocks__/generators";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { describe, expect, it } from "vitest";
import {
    generateDrillChartExportSVGs,
    OPENMARCH_FIELD_IMAGE_PLACEHOLDER,
} from "../svg-generator";
import { pagePositionMapFromRows } from "../exportPagePositions";
import { generatePagePositions } from "../../__test__/pagePositions";
import { seedObj } from "@/test/base";
import type { MarcherAppearancesByPageId } from "../exportAppearances";

describe("svgGenerator", () => {
    describe("generateDrillChartExportSVGs - should generate SVGs for each page", () => {
        it.for(seedObj)("seed: $seed", async ({ seed }) => {
            const marchers = generateMarchers({ numberOfMarchers: 100, seed });
            const timingObjects = generateTimingObjects({
                numberOfBeats: 64,
                seed,
            });
            const positions = generatePagePositions({
                marchers,
                pages: timingObjects.pages,
                fieldProperties:
                    FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES,
                seed,
            });

            const marcherPagesMap = pagePositionMapFromRows(positions);

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

            const pagesLength = timingObjects.pages.length;
            expect(output.SVGs, "Should only have one array").toHaveLength(1);
            expect(output.SVGs.flat()).toHaveLength(pagesLength);
            expect(output.coords[0]).toHaveLength(pagesLength);
            for (const coord of output.coords[0]) {
                expect(
                    coord,
                    "expect each coordinate to be an empty string",
                ).toEqual("");
            }
        });
    });
    describe("generateDrillChartExportSVGs - should generate individual SVGs for each page", () => {
        it.for(seedObj)("seed: $seed", async ({ seed }) => {
            const marchers = generateMarchers({ numberOfMarchers: 16, seed });
            const timingObjects = generateTimingObjects({
                numberOfBeats: 16,
                seed,
            });
            const positions = generatePagePositions({
                marchers,
                pages: timingObjects.pages,
                fieldProperties:
                    FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES,
                seed,
            });

            const marcherPagesMap = pagePositionMapFromRows(positions);

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

    describe("generateDrillChartExportSVGs - missing marcher page mapping", () => {
        it("renders field-only SVG when a page has no marcher pages", async () => {
            const marchers = generateMarchers({ numberOfMarchers: 2, seed: 1 });
            const timingObjects = generateTimingObjects({
                numberOfBeats: 8,
                seed: 1,
            });
            const [pageWithCoords, pageWithoutCoords] = timingObjects.pages;
            const fieldProperties =
                FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES;
            const positions = generatePagePositions({
                marchers,
                pages: [pageWithCoords],
                fieldProperties,
                seed: 1,
            });
            const marcherPagesMap = pagePositionMapFromRows(positions);

            const output = await generateDrillChartExportSVGs({
                marchers,
                marcherPagesMap,
                sortedPages: [pageWithCoords, pageWithoutCoords],
                fieldProperties,
                sectionAppearances: [],
                backgroundImage: undefined,
                gridLines: false,
                halfLines: false,
                individualCharts: false,
            });

            expect(output.SVGs).toHaveLength(1);
            expect(output.SVGs[0]).toHaveLength(2);
            for (const svg of output.SVGs[0]) {
                expect(svg).toContain("<svg");
            }
        });
    });

    describe("generateDrillChartExportSVGs - applies tag appearances", () => {
        it("renders tag fill color in exported SVG", async () => {
            const marchers = generateMarchers({ numberOfMarchers: 1, seed: 3 });
            const timingObjects = generateTimingObjects({
                numberOfBeats: 8,
                seed: 3,
            });
            const page = timingObjects.pages[0];
            const fieldProperties =
                FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES;
            const positions = generatePagePositions({
                marchers,
                pages: timingObjects.pages,
                fieldProperties,
                seed: 3,
            });
            const marcherPagesMap = pagePositionMapFromRows(positions);
            const tagFill = { r: 200, g: 50, b: 75, a: 1 };
            const marcherAppearancesByPageId: MarcherAppearancesByPageId =
                new Map([
                    [
                        page.id,
                        {
                            [marchers[0].id]: [
                                {
                                    fill_color: tagFill,
                                    outline_color: null,
                                    visible: true,
                                    label_visible: true,
                                    shape_type: "square",
                                },
                                {
                                    fill_color:
                                        fieldProperties.theme.defaultMarcher
                                            .fill,
                                    outline_color:
                                        fieldProperties.theme.defaultMarcher
                                            .outline,
                                    visible: true,
                                    label_visible: true,
                                    shape_type: fieldProperties.theme.shapeType,
                                },
                            ],
                        },
                    ],
                ]);

            const output = await generateDrillChartExportSVGs({
                marchers,
                marcherPagesMap,
                sortedPages: [page],
                fieldProperties,
                sectionAppearances: [],
                marcherAppearancesByPageId,
                backgroundImage: undefined,
                gridLines: false,
                halfLines: false,
                individualCharts: false,
            });

            const svg = output.SVGs[0][0];
            expect(svg).toContain("rgb(200,50,75)");
        });
    });
});

describe("generateDrillChartExportSVGs - field image", () => {
    const image = {
        href: "data:image/png;base64,AAAA",
        width: 400,
        height: 200,
    };
    const render = async (useImagePlaceholder?: boolean) => {
        const marchers = generateMarchers({ numberOfMarchers: 2, seed: 4 });
        const { pages } = generateTimingObjects({ numberOfBeats: 8, seed: 4 });
        const fieldProperties =
            FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES;
        const marcherPagesMap = pagePositionMapFromRows(
            generatePagePositions({
                marchers,
                pages,
                fieldProperties,
                seed: 4,
            }),
        );
        const output = await generateDrillChartExportSVGs({
            marchers,
            marcherPagesMap,
            sortedPages: pages,
            fieldProperties,
            backgroundImage: image,
            individualCharts: false,
            useImagePlaceholder,
        });
        return output.SVGs[0]![0]!;
    };

    it("writes the placeholder the PDF export fills in", async () => {
        const svg = await render();
        expect(svg).toContain(
            `xlink:href="${OPENMARCH_FIELD_IMAGE_PLACEHOLDER}"`,
        );
        expect(svg).not.toContain(image.href);
    });

    it("embeds the image itself for previews", async () => {
        const svg = await render(false);
        expect(svg).toContain(`xlink:href="${image.href}"`);
    });
});
