/* eslint-disable no-control-regex */
import ReactDOMServer from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import {
    generateMarcherPages,
    generateMarchers,
    generateTimingObjects,
} from "@/__mocks__/generators";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import type Marcher from "@/global/classes/Marcher";
import MarcherPage, { getByMarcherId } from "@/global/classes/MarcherPage";
import { marcherPageMapFromArray } from "@/global/classes/MarcherPageIndex";
import { pageToDatabasePage } from "@/global/classes/Page";
import tolgee from "@/global/singletons/Tolgee";
import {
    StaticMarcherCoordinateSheet,
    StaticQuarterMarcherSheet,
} from "../../MarcherCoordinateSheet";
import {
    buildCoordinateSheets,
    type CoordinateSheetOptions,
} from "../coordinateSheets";
import { pagePositionMapFromRows } from "../exportPagePositions";

/**
 * docs/timeline/phases/07-page-parity.md P7.7. The page-mode guard compares
 * `buildCoordinateSheets` with the sheet rendering that `ExportCoordinatesModal` did inline
 * before P7.7 (copied below as `legacySheets`), so page-mode exports are unchanged.
 */

const fieldProperties =
    FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES;
const t = tolgee.t;

const show = (seed: number) => {
    const marchers = generateMarchers({ numberOfMarchers: 6, seed }).map(
        (m) => ({ ...m, name: m.name || m.drill_number }),
    ) as (Marcher & { name: string })[];
    // Enough pages that one marcher needs two quarter sheets (28 rows each)
    const { pages } = generateTimingObjects({ numberOfBeats: 600, seed });
    const marcherPages = generateMarcherPages({
        marchers,
        pages: pages.map(pageToDatabasePage),
        fieldProperties,
        seed,
    }) as unknown as MarcherPage[];
    return { marchers, pages, marcherPages };
};

/** The pre-P7.7 inline rendering from `ExportCoordinatesModal`'s sheet export. */
function legacySheets({
    marchers,
    pages,
    marcherPages,
    options,
}: ReturnType<typeof show> & { options: CoordinateSheetOptions }) {
    const map = marcherPageMapFromArray(marcherPages);
    const { quarterPages, terse, includeMeasures, useXY, roundingDenominator } =
        options;
    const pageOrderById: Record<number, number> = {};
    pages.forEach((page) => {
        pageOrderById[page.id] = page.order;
    });
    if (quarterPages) {
        return marchers.flatMap((marcher) => {
            const rows = Object.entries(map.marcherPagesByMarcher[marcher.id])
                .sort(
                    ([pageIdA], [pageIdB]) =>
                        (pageOrderById[Number(pageIdA)] ?? 0) -
                        (pageOrderById[Number(pageIdB)] ?? 0),
                )
                .map(([, mp]) => mp);
            const chunks: MarcherPage[][] = [];
            for (let i = 0; i < rows.length; i += 28)
                chunks.push(rows.slice(i, i + 28));
            return chunks.map((rowChunk, chunkIdx) => ({
                name: marcher.name,
                drillNumber: marcher.drill_number,
                section:
                    marcher.section || t("exportCoordinates.unsortedSection"),
                renderedPage: ReactDOMServer.renderToString(
                    <StaticQuarterMarcherSheet
                        marcher={marcher}
                        pages={pages}
                        marcherPages={rowChunk}
                        fieldProperties={fieldProperties}
                        roundingDenominator={roundingDenominator}
                        terse={terse}
                        quarterPageNumber={chunkIdx + 1}
                        useXY={useXY}
                        includeMeasures={includeMeasures}
                    />,
                )
                    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
                    .replace(/\s+/g, " ")
                    .trim(),
            }));
        });
    }
    return marchers.map((marcher) => {
        const rows = getByMarcherId(map, marcher.id).sort((a, b) => {
            const pageA = pages.find((p) => p.id === a.page_id);
            const pageB = pages.find((p) => p.id === b.page_id);
            return (pageA?.order ?? 0) - (pageB?.order ?? 0);
        });
        return {
            name: marcher.name,
            drillNumber: marcher.drill_number,
            section: marcher.section || t("exportCoordinates.unsortedSection"),
            renderedPage: ReactDOMServer.renderToString(
                <StaticMarcherCoordinateSheet
                    marcher={marcher}
                    pages={pages}
                    marcherPages={rows}
                    fieldProperties={fieldProperties}
                    includeMeasures={includeMeasures}
                    terse={terse}
                    useXY={useXY}
                    roundingDenominator={roundingDenominator}
                />,
            ),
        };
    });
}

const optionSets: CoordinateSheetOptions[] = [
    {
        quarterPages: false,
        terse: false,
        includeMeasures: true,
        useXY: false,
        roundingDenominator: 4,
    },
    {
        quarterPages: true,
        terse: true,
        includeMeasures: false,
        useXY: true,
        roundingDenominator: 10,
    },
];

describe("buildCoordinateSheets", () => {
    beforeAll(async () => {
        await tolgee.run();
    });

    describe("page mode is unchanged", () => {
        it.each(optionSets)(
            "matches the pre-P7.7 rendering (quarterPages: $quarterPages)",
            (options) => {
                const data = show(7);
                const expected = legacySheets({ ...data, options });

                const actual = buildCoordinateSheets({
                    marchers: data.marchers,
                    pages: data.pages,
                    positions: marcherPageMapFromArray(data.marcherPages),
                    fieldProperties,
                    options,
                    t,
                });

                expect(expected.length).toBeGreaterThan(
                    data.marchers.length - 1,
                );
                expect(actual).toEqual(expected);
                // Every sheet has real rows, so the guard compares rendered coordinates
                expect(actual[0]!.renderedPage).toContain("<td");
            },
        );

        it("splits a long show into quarter sheets of 28 rows", () => {
            const data = show(3);
            const sheets = buildCoordinateSheets({
                marchers: data.marchers,
                pages: data.pages,
                positions: marcherPageMapFromArray(data.marcherPages),
                fieldProperties,
                options: { ...optionSets[1]!, quarterPages: true },
                t,
            });
            const perMarcher = Math.ceil(data.pages.length / 28);
            expect(perMarcher).toBeGreaterThan(1);
            expect(sheets).toHaveLength(data.marchers.length * perMarcher);
        });
    });

    describe("timeline mode", () => {
        it.each(optionSets)(
            "renders sampled positions exactly as page rows with the same x and y (quarterPages: $quarterPages)",
            (options) => {
                const data = show(11);
                // Resolver samples carry only marcher, page, x and y, in page-major order
                const samples = [...data.pages]
                    .sort((a, b) => a.order - b.order)
                    .flatMap((page) =>
                        data.marchers.map((marcher) => {
                            const row = data.marcherPages.find(
                                (mp) =>
                                    mp.marcher_id === marcher.id &&
                                    mp.page_id === page.id,
                            )!;
                            return {
                                marcher_id: marcher.id,
                                page_id: page.id,
                                x: row.x,
                                y: row.y,
                            };
                        }),
                    );

                const fromSamples = buildCoordinateSheets({
                    marchers: data.marchers,
                    pages: data.pages,
                    positions: pagePositionMapFromRows(samples),
                    fieldProperties,
                    options,
                    t,
                });

                expect(fromSamples).toEqual(legacySheets({ ...data, options }));
            },
        );

        it("shows the sampled position, not a page row", () => {
            const data = show(5);
            const marcher = data.marchers[0]!;
            const page = [...data.pages].sort((a, b) => a.order - b.order)[1]!;
            const samples = data.marcherPages.map((mp) => ({
                marcher_id: mp.marcher_id,
                page_id: mp.page_id,
                x: mp.x,
                y: mp.y,
            }));
            const moved = samples.find(
                (s) => s.marcher_id === marcher.id && s.page_id === page.id,
            )!;
            const render = () =>
                buildCoordinateSheets({
                    marchers: [marcher],
                    pages: data.pages,
                    positions: pagePositionMapFromRows(samples),
                    fieldProperties,
                    options: { ...optionSets[0]!, useXY: true },
                    t,
                })[0]!.renderedPage;

            const before = render();
            moved.x += 8 * fieldProperties.pixelsPerStep;
            const after = render();

            expect(after).not.toEqual(before);
        });
    });
});
