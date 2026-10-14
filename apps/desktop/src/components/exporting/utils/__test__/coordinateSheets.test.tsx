/* eslint-disable no-control-regex */
import ReactDOMServer from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import {
    generateMarchers,
    generateTimingObjects,
} from "@/__mocks__/generators";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import type Marcher from "@/global/classes/Marcher";
import tolgee from "@/global/singletons/Tolgee";
import {
    StaticMarcherCoordinateSheet,
    StaticQuarterMarcherSheet,
} from "../../MarcherCoordinateSheet";
import {
    buildCoordinateSheets,
    type CoordinateSheetOptions,
} from "../coordinateSheets";
import {
    pagePositionMapFromRows,
    type PagePosition,
} from "../exportPagePositions";
import { generatePagePositions } from "../../__test__/pagePositions";

/**
 * docs/timeline/phases/07-page-parity.md P7.7. The guard compares `buildCoordinateSheets` with
 * the sheet rendering that `ExportCoordinatesModal` did inline before P7.7 (copied below as
 * `legacySheets`), so the sheets render as they always did.
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
    const positions = generatePagePositions({
        marchers,
        pages,
        fieldProperties,
        seed,
    });
    return { marchers, pages, positions };
};

/** The pre-P7.7 inline rendering from `ExportCoordinatesModal`'s sheet export. */
function legacySheets({
    marchers,
    pages,
    positions,
    options,
}: ReturnType<typeof show> & { options: CoordinateSheetOptions }) {
    const map = pagePositionMapFromRows(positions);
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
            const chunks: PagePosition[][] = [];
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
        const rows = Object.values(
            map.marcherPagesByMarcher[marcher.id] ?? {},
        ).sort((a, b) => {
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

    describe("renders as before P7.7", () => {
        it.each(optionSets)(
            "matches the pre-P7.7 rendering (quarterPages: $quarterPages)",
            (options) => {
                const data = show(7);
                const expected = legacySheets({ ...data, options });

                const actual = buildCoordinateSheets({
                    marchers: data.marchers,
                    pages: data.pages,
                    positions: pagePositionMapFromRows(data.positions),
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
                positions: pagePositionMapFromRows(data.positions),
                fieldProperties,
                options: { ...optionSets[1]!, quarterPages: true },
                t,
            });
            const perMarcher = Math.ceil(data.pages.length / 28);
            expect(perMarcher).toBeGreaterThan(1);
            expect(sheets).toHaveLength(data.marchers.length * perMarcher);
        });
    });

    describe("positions", () => {
        it("shows the sampled position", () => {
            const data = show(5);
            const marcher = data.marchers[0]!;
            const page = [...data.pages].sort((a, b) => a.order - b.order)[1]!;
            const samples = data.positions.map((mp) => ({
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
