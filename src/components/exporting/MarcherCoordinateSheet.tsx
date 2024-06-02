import { useFieldProperties } from "@/context/fieldPropertiesContext";
import { useEffect, useState } from "react";
import { useMarcherPageStore } from "@/stores/marcherPage/useMarcherPageStore";
import { usePageStore } from "@/stores/page/usePageStore";
import { Marcher } from "@/global/classes/Marcher";
import Page from "@/global/classes/Page";
import { MarcherPage } from "@/global/classes/MarcherPage";
import { FieldProperties } from "@/global/classes/FieldProperties";
import { ReadableCoords } from "@/global/classes/ReadableCoords";

// TODO, this is broken right now, fix this
interface MarcherCoordinateSheetProps {
    marcher?: Marcher;
    includeMeasures?: boolean;
    /**
     * The denominator to round to. 4 -> 1/4 = nearest quarter step. 10 -> 1/10 = nearest tenth step.
     */
    roundingDenominator?: number;
    /**
     * Whether this is a printing preview or an example for the user to see.
     */
    example?: boolean;
    /**
     * True if the coordinate strings should be terse. False if they should be verbose.
     * Default is false.
     *
     * X: "S1: 2 out 45" vs "S1: 2 steps outside 45 yard line."
     *
     * Y: "5 BFSL" vs "5 steps behind front sideline.
     */
    terse?: boolean;
    /**
     * Whether to use X/Y as header rather than "Side to Side" and "Front to Back".
     */
    useXY?: boolean;
}

export default function MarcherCoordinateSheet(
    { marcher, includeMeasures = true, roundingDenominator = 4,
        example = false, terse = false, useXY = false }: MarcherCoordinateSheetProps) {
    const { marcherPages } = useMarcherPageStore()!;
    const { pages } = usePageStore()!;
    const { fieldProperties } = useFieldProperties()!;
    const [marcherToUse, setMarcherToUse] = useState<Marcher>();
    const [pagesToUse, setPagesToUse] = useState<Page[]>([]);
    const [marcherPagesToUse, setMarcherPagesToUse] = useState<MarcherPage[]>([]);

    useEffect(() => {
        if (!fieldProperties) {
            console.error("Field properties not found in context - MarcherCoordinateSheet.tsx");
            return;
        }
        const pixelsPerStep = fieldProperties ? FieldProperties.PIXELS_PER_STEP : 0;
        if (example && fieldProperties) {
            setMarcherToUse({
                id: 1, name: "Example Marcher", drill_number: "B1", section: "Baritone",
                id_for_html: "example-marcher", drill_prefix: "B", drill_order: 1
            });
            setPagesToUse([
                new Page({
                    id: 1, name: "1", counts: 8, order: 1, id_for_html: "example-page-1",
                }),
                new Page({
                    id: 2, name: "2", counts: 16, order: 2, id_for_html: "example-page-2",
                }),
                new Page({
                    id: 3, name: "2A", counts: 5, order: 3, id_for_html: "example-page-3",
                }),
            ]);
            setMarcherPagesToUse([
                {
                    id: 1, marcher_id: 1, page_id: 1, id_for_html: "example-marcher-page-1",
                    x: fieldProperties.centerFrontPoint.xPixels, y: fieldProperties.centerFrontPoint.yPixels,
                },
                {
                    id: 2, marcher_id: 1, page_id: 2, id_for_html: "example-marcher-page-2",
                    x: fieldProperties.centerFrontPoint.xPixels + (2.1 * pixelsPerStep),
                    y: fieldProperties.centerFrontPoint.yPixels + (2 * pixelsPerStep),
                },
                {
                    id: 3, marcher_id: 1, page_id: 3, id_for_html: "example-marcher-page-3",
                    x: fieldProperties.centerFrontPoint.xPixels - (5.21 * pixelsPerStep),
                    y: fieldProperties.centerFrontPoint.yPixels + ((fieldProperties.yCheckpoints[0].stepsFromCenterFront * pixelsPerStep) - (2.32 * pixelsPerStep))
                },
            ]);
        } else {
            setMarcherToUse(marcher);
            setPagesToUse(pages);
            setMarcherPagesToUse(marcherPages);
        }
    }, [marcher, marcherPages, pages, example, fieldProperties]);

    return (
        <StaticMarcherCoordinateSheet marcher={marcherToUse!} pages={pagesToUse} marcherPages={marcherPagesToUse}
            fieldProperties={fieldProperties!} includeMeasures={includeMeasures} roundingDenominator={roundingDenominator}
            terse={terse} useXY={useXY} />
    );
}

interface StaticCoordinateSheetProps {
    marcher: Marcher;
    pages: Page[];
    marcherPages: MarcherPage[];
    fieldProperties: FieldProperties;
    includeMeasures?: boolean;
    /**
     * The denominator to round to. 4 -> 1/4 = nearest quarter step. 10 -> 1/10 = nearest tenth step.
     */
    roundingDenominator?: number;
    /**
     * True if the coordinate strings should be terse. False if they should be verbose.
     * Default is false.
     *
     * X: "S1: 2 out 45" vs "S1: 2 steps outside 45 yard line."
     *
     * Y: "5 BFSL" vs "5 steps behind front sideline.
     */
    terse?: boolean;
    /**
     * Whether to use X/Y as header rather than "Side to Side" and "Front to Back".
     */
    useXY?: boolean;
}

export function StaticMarcherCoordinateSheet({
    marcher, fieldProperties, marcherPages, pages, includeMeasures = true, roundingDenominator = 4,
    terse = false, useXY = false }: StaticCoordinateSheetProps) {

    const sortMarcherPages = (a: MarcherPage, b: MarcherPage) => {
        const pageA = pages.find((page) => page.id === a.page_id);
        const pageB = pages.find((page) => page.id === b.page_id);
        return pageA && pageB ? pageA.order - pageB.order : 0;
    }

    const headingStyle = { backgroundColor: "#ddd", display: "flex", alignItems: "center" };

    // Ensure ReadableCoords has the field properties
    if (!ReadableCoords.getFieldProperties())
        ReadableCoords.setFieldProperties(fieldProperties!);

    return (
        <div className="">
            {!fieldProperties || !marcher || pages.length === 0 || marcherPages.length === 0 ?
                <>
                    <h5>Error exporting coordinate sheet</h5>
                    {!fieldProperties && <p>No field properties provided</p>}
                    {!marcher && <p>No marcher provided</p>}
                    {pages.length === 0 && <p>No pages provided</p>}
                    {marcherPages.length === 0 && <p>No marcher pages provided</p>}
                </>
                :
                <>
                    <div className="grid grid-cols-12 px-2 m-0" style={{ backgroundColor: '#ddd' }} aria-label="marcher header">
                        <div className="col-span-2" style={headingStyle}>
                            <h2 aria-label='marcher drill number'>{marcher.drill_number}</h2>
                        </div>
                        <div className="col-span-5 pl-2" style={{ ...headingStyle, borderLeft: "1px solid #888", }}>
                            <h4 aria-label='marcher name'>{marcher.name}</h4>
                        </div>
                        <div className="col-span-5 pl-2" style={{ ...headingStyle, borderLeft: "1px solid #888", }}>
                            <h4 aria-label='marcher section'>{marcher.section}</h4>
                        </div>
                    </div>
                    <table>
                        <thead>
                            <tr aria-label='coordinates header row'>
                                <th className="text-center" aria-label='page header'>
                                    Page
                                </th>
                                <th className="text-center" aria-label='counts header'>
                                    Counts
                                </th>
                                {includeMeasures && <th className="text-center" aria-label='measure header'>
                                    Measure
                                </th>}
                                <th aria-label='x header'>
                                    {useXY ? "X" : "Side to Side"}
                                </th>
                                <th aria-label='y header'>
                                    {useXY ? "Y" : "Front to Back"}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {marcherPages.filter((marcherPage) => marcherPage.marcher_id === marcher.id).sort(sortMarcherPages)
                                .map((marcherPage: MarcherPage) => {
                                    if (!fieldProperties) return null;

                                    const page = pages.find((page) => page.id === marcherPage.page_id);
                                    const rCoords = new ReadableCoords({ x: marcherPage.x, y: marcherPage.y, roundingDenominator });

                                    if (!page || !rCoords) return null;

                                    return (
                                        <tr key={marcherPage.id_for_html}>
                                            <td className="text-center" aria-label='page name'>
                                                {page.name}
                                            </td>
                                            <td className="text-center" aria-label='page counts'>
                                                {page.counts}
                                            </td>
                                            {includeMeasures && <td className="text-center" aria-label='page measures'
                                            >N/A
                                            </td>}
                                            <td aria-label='x coordinate'>
                                                {terse ? rCoords.toTerseStringX() : rCoords.toVerboseStringX()}
                                            </td>
                                            <td aria-label='y coordinate'>
                                                {terse ? rCoords.toTerseStringY() : rCoords.toVerboseStringY()}
                                            </td>
                                        </tr>
                                    );
                                })}
                        </tbody>
                    </table>
                </>}
        </div>
    );
}
