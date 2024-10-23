import { useFieldProperties } from "@/context/fieldPropertiesContext";
import React, { useEffect, useState } from "react";
import { useMarcherPageStore } from "@/stores/MarcherPageStore";
import { usePageStore } from "@/stores/PageStore";
import { Marcher } from "@/global/classes/Marcher";
import Page from "@/global/classes/Page";
import MarcherPage from "@/global/classes/MarcherPage";
import FieldProperties from "@/global/classes/FieldProperties";
import { ReadableCoords } from "@/global/classes/ReadableCoords";
// import "./MarcherCoordinateSheet.css";

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

export default function MarcherCoordinateSheet({
    marcher,
    includeMeasures = true,
    roundingDenominator = 4,
    example = false,
    terse = false,
    useXY = false,
}: MarcherCoordinateSheetProps) {
    const { marcherPages } = useMarcherPageStore()!;
    const { pages } = usePageStore()!;
    const { fieldProperties } = useFieldProperties()!;
    const [marcherToUse, setMarcherToUse] = useState<Marcher>();
    const [pagesToUse, setPagesToUse] = useState<Page[]>([]);
    const [marcherPagesToUse, setMarcherPagesToUse] = useState<MarcherPage[]>(
        [],
    );

    useEffect(() => {
        if (!fieldProperties) {
            console.error(
                "Field properties not found in context - MarcherCoordinateSheet.tsx",
            );
            return;
        }
        const pixelsPerStep = fieldProperties
            ? FieldProperties.PIXELS_PER_STEP
            : 0;
        if (example && fieldProperties) {
            setMarcherToUse({
                id: 1,
                name: "Example Marcher",
                drill_number: "B1",
                section: "Baritone",
                id_for_html: "example-marcher",
                drill_prefix: "B",
                drill_order: 1,
            });
            setPagesToUse([
                new Page({
                    id: 1,
                    name: "1",
                    counts: 8,
                    order: 1,
                    id_for_html: "example-page-1",
                }),
                new Page({
                    id: 2,
                    name: "2",
                    counts: 16,
                    order: 2,
                    id_for_html: "example-page-2",
                }),
                new Page({
                    id: 3,
                    name: "2A",
                    counts: 5,
                    order: 3,
                    id_for_html: "example-page-3",
                }),
            ]);
            setMarcherPagesToUse([
                {
                    id: 1,
                    marcher_id: 1,
                    page_id: 1,
                    id_for_html: "example-marcher-page-1",
                    x: fieldProperties.centerFrontPoint.xPixels,
                    y: fieldProperties.centerFrontPoint.yPixels,
                },
                {
                    id: 2,
                    marcher_id: 1,
                    page_id: 2,
                    id_for_html: "example-marcher-page-2",
                    x:
                        fieldProperties.centerFrontPoint.xPixels +
                        2.1 * pixelsPerStep,
                    y:
                        fieldProperties.centerFrontPoint.yPixels +
                        2 * pixelsPerStep,
                },
                {
                    id: 3,
                    marcher_id: 1,
                    page_id: 3,
                    id_for_html: "example-marcher-page-3",
                    x:
                        fieldProperties.centerFrontPoint.xPixels -
                        5.21 * pixelsPerStep,
                    y:
                        fieldProperties.centerFrontPoint.yPixels +
                        (fieldProperties.yCheckpoints[0].stepsFromCenterFront *
                            pixelsPerStep -
                            2.32 * pixelsPerStep),
                },
            ]);
        } else {
            setMarcherToUse(marcher);
            setPagesToUse(pages);
            setMarcherPagesToUse(marcherPages);
        }
    }, [marcher, marcherPages, pages, example, fieldProperties]);

    return (
        <StaticMarcherCoordinateSheet
            marcher={marcherToUse!}
            pages={pagesToUse}
            marcherPages={marcherPagesToUse}
            fieldProperties={fieldProperties!}
            includeMeasures={includeMeasures}
            roundingDenominator={roundingDenominator}
            terse={terse}
            useXY={useXY}
        />
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

// STYLES
// These styles are here rather than in a separate CSS file because I don't want to deal with importing an external CSS file in electron.
const h4Style: React.CSSProperties = {
    margin: 0,
    padding: 0,
    fontSize: "1.2rem",
};

const thTdStyle: React.CSSProperties = {
    border: "1px solid #888",
    padding: "0.25rem 0.5rem",
    textAlign: "center",
};

const leftBorderStyle: React.CSSProperties = {
    borderLeft: "1px dotted #888",
};

const headingContainerStyle: React.CSSProperties = {
    backgroundColor: "#ddd",
    paddingLeft: "1rem",
    padding: "1rem",
    width: "max-content",
    justifySelf: "baseline",
};

export function StaticMarcherCoordinateSheet({
    marcher,
    fieldProperties,
    marcherPages,
    pages,
    includeMeasures = true,
    roundingDenominator = 4,
    terse = false,
    useXY = false,
}: StaticCoordinateSheetProps) {
    const [marcherState, setMarcherState] = useState<Marcher>(marcher);
    const [fieldPropertiesState, setFieldPropertiesState] =
        useState<FieldProperties>(fieldProperties);
    const [marcherPagesState, setMarcherPagesState] =
        useState<MarcherPage[]>(marcherPages);
    const [pagesState, setPagesState] = useState<Page[]>(pages);
    const [includeMeasuresState, setIncludeMeasures] =
        useState<boolean>(includeMeasures);
    const [roundingDenominatorState, setRoundingDenominator] =
        useState<number>(roundingDenominator);
    const [terseState, setTerse] = useState<boolean>(terse);
    const [useXYState, setUseXY] = useState<boolean>(useXY);

    useEffect(() => {
        setMarcherState(marcher);
        setFieldPropertiesState(fieldProperties);
        setMarcherPagesState(marcherPages);
        setPagesState(pages);
        setIncludeMeasures(includeMeasures);
        setRoundingDenominator(roundingDenominator);
        setTerse(terse);
        setUseXY(useXY);
    }, [
        marcher,
        fieldProperties,
        marcherPages,
        pages,
        includeMeasures,
        roundingDenominator,
        terse,
        useXY,
    ]);

    const sortMarcherPages = (a: MarcherPage, b: MarcherPage) => {
        const pageA = pagesState.find((page) => page.id === a.page_id);
        const pageB = pagesState.find((page) => page.id === b.page_id);
        return pageA && pageB ? pageA.order - pageB.order : 0;
    };

    // Ensure ReadableCoords has the field properties
    if (!ReadableCoords.getFieldProperties())
        ReadableCoords.setFieldProperties(fieldPropertiesState!);

    return (
        <div
            title="Marcher Coordinate Sheet Container"
            style={{
                fontFamily:
                    'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
            }}
        >
            {!fieldPropertiesState ||
            !marcherState ||
            pagesState.length === 0 ||
            marcherPagesState.length === 0 ? (
                <>
                    <h5>Error exporting coordinate sheet</h5>
                    {!fieldPropertiesState && (
                        <p>No field properties provided</p>
                    )}
                    {!marcherState && <p>No marcher provided</p>}
                    {pagesState.length === 0 && <p>No pages provided</p>}
                    {marcherPagesState.length === 0 && (
                        <p>No marcher pages provided</p>
                    )}
                </>
            ) : (
                <>
                    <div
                        title="header container"
                        aria-label="marcher header"
                        className="sheetHeader"
                        style={{
                            backgroundColor: "#ddd",
                            display: "flex",
                        }}
                    >
                        <div
                            title="drill number header"
                            style={headingContainerStyle}
                        >
                            <h4
                                aria-label="marcher drill number"
                                style={h4Style}
                            >
                                {marcherState.drill_number}
                            </h4>
                        </div>
                        <div
                            title="marcher name header"
                            style={{
                                flexGrow: 1,
                                ...leftBorderStyle,
                                ...headingContainerStyle,
                            }}
                        >
                            <h4 aria-label="marcher name" style={h4Style}>
                                {marcherState.name}
                            </h4>
                        </div>
                        <div
                            title="section header"
                            style={{
                                ...leftBorderStyle,
                                ...headingContainerStyle,
                            }}
                        >
                            <h4 aria-label="marcher section" style={h4Style}>
                                {marcherState.section}
                            </h4>
                        </div>
                    </div>
                    <table
                        aria-label="individual marcher coordinates table"
                        style={{
                            tableLayout: "fixed",
                            width: "100%",
                            borderCollapse: "collapse",
                            display: "block",
                        }}
                    >
                        <thead style={{ width: "100%" }}>
                            <tr aria-label="coordinates header row">
                                <th
                                    className="text-center"
                                    aria-label="page header"
                                    style={{ ...thTdStyle, fontWeight: "bold" }}
                                >
                                    Pg
                                </th>
                                <th
                                    className="text-center"
                                    aria-label="counts header"
                                    style={thTdStyle}
                                >
                                    Counts
                                </th>
                                {includeMeasuresState && (
                                    <th
                                        className="text-center"
                                        aria-label="measure header"
                                        style={thTdStyle}
                                    >
                                        Measure
                                    </th>
                                )}
                                <th aria-label="x header" style={thTdStyle}>
                                    {useXYState ? "X" : "Side to Side"}
                                </th>
                                <th aria-label="y header" style={thTdStyle}>
                                    {useXYState ? "Y" : "Front to Back"}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {marcherPagesState
                                .filter(
                                    (marcherPage) =>
                                        marcherPage.marcher_id ===
                                        marcherState.id,
                                )
                                .sort(sortMarcherPages)
                                .map((marcherPage: MarcherPage) => {
                                    if (!fieldPropertiesState) return null;

                                    const page = pagesState.find(
                                        (page) =>
                                            page.id === marcherPage.page_id,
                                    );
                                    const rCoords = new ReadableCoords({
                                        x: marcherPage.x,
                                        y: marcherPage.y,
                                        roundingDenominator:
                                            roundingDenominatorState,
                                    });

                                    if (!page || !rCoords) return null;

                                    return (
                                        <tr key={marcherPage.id_for_html}>
                                            <td
                                                className="text-center"
                                                aria-label="page name"
                                                style={{
                                                    ...thTdStyle,
                                                    width: "10%",
                                                }}
                                            >
                                                {page.name}
                                            </td>
                                            <td
                                                className="text-center"
                                                aria-label="page counts"
                                                style={{
                                                    ...thTdStyle,
                                                    width: "10%",
                                                }}
                                            >
                                                {page.counts}
                                            </td>
                                            {includeMeasuresState && (
                                                <td
                                                    className="text-center"
                                                    aria-label="page measures"
                                                    style={{
                                                        ...thTdStyle,
                                                        width: "10%",
                                                    }}
                                                >
                                                    N/A
                                                </td>
                                            )}
                                            <td
                                                aria-label="x coordinate"
                                                style={{
                                                    ...thTdStyle,
                                                    textAlign: "left",
                                                    width: "35%",
                                                }}
                                            >
                                                {terseState
                                                    ? rCoords.toTerseStringX()
                                                    : rCoords.toVerboseStringX()}
                                            </td>
                                            <td
                                                aria-label="y coordinate"
                                                style={{
                                                    ...thTdStyle,
                                                    textAlign: "left",
                                                    width: "100%",
                                                }}
                                            >
                                                {terseState
                                                    ? rCoords.toTerseStringY()
                                                    : rCoords.toVerboseStringY()}
                                            </td>
                                        </tr>
                                    );
                                })}
                        </tbody>
                    </table>
                </>
            )}
        </div>
    );
}
