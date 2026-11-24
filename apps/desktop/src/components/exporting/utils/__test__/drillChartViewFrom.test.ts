import { describe, expect, it } from "vitest";
import {
    generateMarchers,
    generateTimingObjects,
} from "@/__mocks__/generators";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { pagePositionMapFromRows } from "../exportPagePositions";
import { generatePagePositions } from "../../__test__/pagePositions";
import { generateDrillChartExportSVGs } from "../svg-generator";

/** Drill charts seen from the performers' side (#1268): the field turned, the coordinates not. */

const fieldProperties =
    FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES;

const show = () => {
    const marchers = generateMarchers({ numberOfMarchers: 3, seed: 5 });
    const { pages } = generateTimingObjects({ numberOfBeats: 16, seed: 5 });
    const sortedPages = [...pages].sort((a, b) => a.order - b.order);
    const marcherPagesMap = pagePositionMapFromRows(
        generatePagePositions({ marchers, pages, fieldProperties, seed: 5 }),
    );
    return { marchers, sortedPages, marcherPagesMap };
};

const render = (
    viewFrom: "audience" | "performer" | undefined,
    individualCharts: boolean,
) => {
    const { marchers, sortedPages, marcherPagesMap } = show();
    return generateDrillChartExportSVGs({
        fieldProperties,
        marchers,
        sortedPages,
        marcherPagesMap,
        sectionAppearances: [],
        individualCharts,
        viewFrom,
    });
};

/** Each dot's center, by marcher id, from `dotSvg`'s translate */
const dotCenters = (svg: string) =>
    new Map(
        [
            ...svg.matchAll(
                /data-marcher-id="(\d+)" transform="translate\(([-\d.]+) ([-\d.]+)\)"/g,
            ),
        ].map(([, id, x, y]) => [Number(id), [Number(x), Number(y)]]),
    );

describe("drill charts seen from the performers' side", () => {
    it("draws from the audience by default", async () => {
        const plain = await render(undefined, false);
        const audience = await render("audience", false);
        expect(plain.SVGs).toEqual(audience.SVGs);
    });

    it("turns every dot half a turn about the field's center", async () => {
        const audience = await render("audience", false);
        const performer = await render("performer", false);
        audience.SVGs[0]!.forEach((svg, page) => {
            const before = dotCenters(svg);
            const after = dotCenters(performer.SVGs[0]![page]!);
            expect(after.size).toBe(before.size);
            expect(before.size).toBeGreaterThan(0);
            for (const [id, [x, y]] of before) {
                const [tx, ty] = after.get(id)!;
                expect(tx).toBeCloseTo(fieldProperties.width - x!, 2);
                expect(ty).toBeCloseTo(fieldProperties.height - y!, 2);
            }
        });
    });

    it("prints the same coordinates in either view", async () => {
        const audience = await render("audience", true);
        const performer = await render("performer", true);
        expect(performer.coords).toEqual(audience.coords);
        expect(performer.coords.flat().length).toBeGreaterThan(0);
        expect(performer.SVGs[0]![1]).not.toEqual(audience.SVGs[0]![1]);
    });

    it("draws only the marchers asked for, with every dot on their charts", async () => {
        const { marchers, sortedPages, marcherPagesMap } = show();
        const only = marchers[1]!.id;
        const { SVGs } = await generateDrillChartExportSVGs({
            fieldProperties,
            marchers,
            sortedPages,
            marcherPagesMap,
            sectionAppearances: [],
            individualCharts: true,
            viewFrom: "performer",
            onlyMarcherIds: new Set([only]),
        });
        expect(SVGs[0]).toEqual([]);
        expect(SVGs[2]).toEqual([]);
        expect(SVGs[1]).toHaveLength(sortedPages.length);
        expect(dotCenters(SVGs[1]![0]!).size).toBe(marchers.length);
    });

    it("turns the walked paths, their midpoints and the previous and next marks", async () => {
        const { marchers, sortedPages, marcherPagesMap } = show();
        const walk = { d: "M 10 10 A 5 5 0 0 1 20 10", mid: { x: 15, y: 12 } };
        const { SVGs } = await generateDrillChartExportSVGs({
            fieldProperties,
            marchers,
            sortedPages,
            marcherPagesMap,
            walkedPaths: () => walk,
            sectionAppearances: [],
            individualCharts: true,
            viewFrom: "performer",
        });
        const { width, height } = fieldProperties;
        const r = (n: number) => String(Math.round(n * 1000) / 1000);
        const svg = SVGs[0]![1]!;
        expect(svg).toContain(
            `<path d="M ${r(width - 10)} ${r(height - 10)} A 5 5 0 0 1 ${r(width - 20)} ${r(height - 10)}"`,
        );
        expect(svg).toContain(`cx="${r(width - 15)}" cy="${r(height - 12)}"`);
        // The box on the previous position and the circle on the next, at their turned points
        const at = (pageIndex: number) => {
            const p =
                marcherPagesMap.marcherPagesByPage[sortedPages[pageIndex]!.id]![
                    marchers[0]!.id
                ]!;
            return { x: width - p.x, y: height - p.y };
        };
        const previous = at(0);
        const next = at(2);
        expect(svg).toContain(
            `<rect x="${r(previous.x - 10)}" y="${r(previous.y - 10)}" width="20" height="20"`,
        );
        expect(svg).toContain(
            `<circle cx="${r(next.x)}" cy="${r(next.y)}" r="10"`,
        );
    });
});
