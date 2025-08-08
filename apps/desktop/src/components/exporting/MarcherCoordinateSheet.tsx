import { useFieldProperties } from "@/context/fieldPropertiesContext";
import React, { useEffect, useState } from "react";
import { useMarcherPageStore } from "@/stores/MarcherPageStore";
import { Marcher } from "@/global/classes/Marcher";
import Page, { measureRangeString } from "@/global/classes/Page";
import MarcherPage from "@/global/classes/MarcherPage";
import { FieldProperties } from "@openmarch/core";
import { ReadableCoords } from "@/global/classes/ReadableCoords";
import Measure from "@/global/classes/Measure";
import { useTimingObjectsStore } from "@/stores/TimingObjectsStore";
import Beat from "@/global/classes/Beat";
import { T } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";

const FullPageSheetColumnWidths = {
    pageNumber: "10%",
    counts: "12%",
    measures: "15%",
    x: "31.5%",
    y: "31.5%",
};

const QuarterSheetColumnWidths = {
    pageNumber: "15%",
    counts: "10%",
    measures: "20%",
    x: "27.5%",
    y: "27.5%",
};

interface MarcherCoordinateSheetProps {
    marcher?: Marcher;
    includeMeasures?: boolean;
    roundingDenominator?: number;
    example?: boolean;
    terse?: boolean;
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
    const { pages } = useTimingObjectsStore()!;
    const { fieldProperties } = useFieldProperties()!;
    const [marcherToUse, setMarcherToUse] = useState<Marcher>();
    const [pagesToUse, setPagesToUse] = useState<Page[]>([]);
    const [marcherPagesToUse, setMarcherPagesToUse] = useState<MarcherPage[]>(
        [],
    );

    const t = tolgee.t;

    useEffect(() => {
        if (!fieldProperties) {
            console.error(
                "Field properties not found in context - MarcherCoordinateSheet.tsx",
            );
            return;
        }
        const pixelsPerStep = fieldProperties
            ? fieldProperties.pixelsPerStep
            : 0;
        const measures = Array.from({ length: 12 }, (_, i) => {
            return {
                id: i + 1,
                startBeat: {
                    id: i + 1,
                    position: 0 + i * 4,
                    duration: 4,
                    includeInMeasure: true,
                    notes: null,
                    index: i,
                    timestamp: i * 4,
                } satisfies Beat,
                number: i + 1,
                rehearsalMark: null,
                notes: null,
                duration: 16,
                counts: 8,
                beats: [],
                timestamp: i * 4,
            } satisfies Measure;
        });
        if (example && fieldProperties) {
            setMarcherToUse(
                new Marcher({
                    id: 1,
                    name: t("exportCoordinates.exampleMarcherName"),
                    section: t("exportCoordinates.exampleMarcherSection"),
                    drill_prefix: "B",
                    drill_order: 1,
                }),
            );
            const pages = [
                {
                    id: 1,
                    name: "1",
                    counts: 16,
                    order: 1,
                    nextPageId: 2,
                    previousPageId: null,
                    isSubset: false,
                    duration: 16,
                    beats: [],
                    measureBeatToStartOn: 1,
                    measureBeatToEndOn: 5,
                    notes: null,
                    timestamp: 0,
                    measures: [
                        measures[0],
                        measures[1],
                        measures[2],
                        measures[3],
                    ],
                } satisfies Page,
                {
                    id: 2,
                    name: "2",
                    counts: 15,
                    order: 2,
                    nextPageId: 3,
                    previousPageId: 1,
                    isSubset: false,
                    duration: 16,
                    beats: [],
                    measureBeatToStartOn: 1,
                    measureBeatToEndOn: 3,
                    notes: null,
                    timestamp: 16,
                    measures: [
                        measures[4],
                        measures[5],
                        measures[6],
                        measures[7],
                    ],
                } satisfies Page,
                {
                    id: 3,
                    name: "2A",
                    counts: 13,
                    order: 3,
                    nextPageId: null,
                    previousPageId: 2,
                    isSubset: false,
                    duration: 16,
                    beats: [],
                    measureBeatToStartOn: 4,
                    measureBeatToEndOn: 5,
                    notes: null,
                    timestamp: 32,
                    measures: [
                        measures[7],
                        measures[8],
                        measures[9],
                        measures[10],
                    ],
                } satisfies Page,
            ];
            setPagesToUse(pages);
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
            setMarcherPagesToUse(
                MarcherPage.getByMarcherId(marcherPages, marcher?.id || -1),
            );
        }
    }, [marcher, marcherPages, pages, example, fieldProperties, t]);
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

    const t = tolgee.t;

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

    // Ensure ReadableCoords has the field properties
    if (!ReadableCoords.getFieldProperties())
        ReadableCoords.setFieldProperties(fieldPropertiesState!);

    return (
        <div
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
                    <h5>
                        <T keyName="exportCoordinates.errorTitle" />
                    </h5>
                    {!fieldPropertiesState && (
                        <p>
                            <T keyName="exportCoordinates.noFieldProperties" />
                        </p>
                    )}
                    {!marcherState && (
                        <p>
                            <T keyName="exportCoordinates.noMarcher" />
                        </p>
                    )}
                    {pagesState.length === 0 && (
                        <p>
                            <T keyName="exportCoordinates.noPages" />
                        </p>
                    )}
                    {marcherPagesState.length === 0 && (
                        <p>
                            <T keyName="exportCoordinates.noMarcherPages" />
                        </p>
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
                        {marcherState.name && marcherState.name.trim() && (
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
                        )}
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
                        }}
                    >
                        <colgroup>
                            <col
                                style={{
                                    width: FullPageSheetColumnWidths.pageNumber,
                                }}
                            />
                            <col
                                style={{
                                    width: FullPageSheetColumnWidths.counts,
                                }}
                            />
                            {includeMeasuresState && (
                                <col
                                    style={{
                                        width: FullPageSheetColumnWidths.measures,
                                    }}
                                />
                            )}
                            <col
                                style={{ width: FullPageSheetColumnWidths.x }}
                            />
                            <col
                                style={{ width: FullPageSheetColumnWidths.y }}
                            />
                        </colgroup>
                        <thead /* style={{ width: "100%" }} */>
                            <tr aria-label="coordinates header row">
                                <th
                                    className="text-center"
                                    aria-label="page header"
                                    style={{
                                        ...thTdStyle,
                                        fontWeight: "bold",
                                    }}
                                >
                                    Pg
                                </th>
                                <th
                                    className="text-center"
                                    aria-label="counts header"
                                    style={{
                                        ...thTdStyle,
                                        fontWeight: "bold",
                                    }}
                                >
                                    Ct
                                </th>
                                {includeMeasuresState && (
                                    <th
                                        className="text-center"
                                        aria-label="measure header"
                                        style={{
                                            ...thTdStyle,
                                            fontWeight: "bold",
                                        }}
                                    >
                                        {t("exportCoordinates.measuresHeader")}
                                    </th>
                                )}
                                <th
                                    aria-label="x header"
                                    style={{
                                        ...thTdStyle,
                                        fontWeight: "bold",
                                    }}
                                >
                                    {useXYState
                                        ? "X"
                                        : t(
                                              "exportCoordinates.sideToSideHeader",
                                          )}
                                </th>
                                <th
                                    aria-label="y header"
                                    style={{
                                        ...thTdStyle,
                                        fontWeight: "bold",
                                    }}
                                >
                                    {useXYState
                                        ? "Y"
                                        : t(
                                              "exportCoordinates.frontToBackHeader",
                                          )}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {marcherPagesState.map(
                                (marcherPage: MarcherPage) => {
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
                                                }}
                                            >
                                                {page.name}
                                            </td>
                                            <td
                                                className="text-center"
                                                aria-label="page counts"
                                                style={{
                                                    ...thTdStyle,
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
                                                    }}
                                                >
                                                    {measureRangeString(page)}
                                                </td>
                                            )}
                                            <td
                                                aria-label="x coordinate"
                                                style={{
                                                    ...thTdStyle,
                                                    textAlign: "left",
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
                                                }}
                                            >
                                                {terseState
                                                    ? rCoords.toTerseStringY()
                                                    : rCoords.toVerboseStringY()}
                                            </td>
                                        </tr>
                                    );
                                },
                            )}
                        </tbody>
                    </table>
                </>
            )}
        </div>
    );
}

/**
 * Compact version of marcher coordinate sheet.
 * Format: Pg. | S to S | F to B | Ct. | Ms.
 */
interface StaticCompactMarcherSheetProps {
    marcher: Marcher;
    pages: Page[];
    marcherPages: MarcherPage[];
    fieldProperties: FieldProperties;
    roundingDenominator?: number;
    terse?: boolean;
    quarterPageNumber: number;
}

/**
 * Format measure as X-X (e.g. 12A-14), max 11 chars.
 * Discards count of the measure.
 * Accepts strings like "12A(9) → 14(16)" or "12(9)".
 */
function compactMeasureFormat(measureStr: string): string {
    const match = measureStr.match(
        /([A-Za-z0-9]+)\(\d+\)\s*[→\-]\s*([A-Za-z0-9]+)\(\d+\)/,
    );
    if (match) {
        return `${match[1]}-${match[2]}`.slice(0, 11);
    }
    const match2 = measureStr.match(/([A-Za-z0-9]+)\(\d+\)/);
    if (match2) {
        return match2[1];
    }

    return measureStr;
}

export function StaticCompactMarcherSheet({
    marcher,
    fieldProperties,
    marcherPages,
    pages,
    roundingDenominator = 4,
    terse = false,
    quarterPageNumber,
}: StaticCompactMarcherSheetProps) {
    const [marcherState, setMarcherState] = useState<Marcher>(marcher);
    const [fieldPropertiesState, setFieldPropertiesState] =
        useState<FieldProperties>(fieldProperties);
    const [marcherPagesState, setMarcherPagesState] =
        useState<MarcherPage[]>(marcherPages);
    const [pagesState, setPagesState] = useState<Page[]>(pages);
    const t = tolgee.t;

    useEffect(() => {
        setMarcherState(marcher);
        setFieldPropertiesState(fieldProperties);
        setMarcherPagesState(marcherPages);
        setPagesState(pages);
    }, [marcher, fieldProperties, marcherPages, pages]);

    // Ensure ReadableCoords has the field properties
    if (!ReadableCoords.getFieldProperties())
        ReadableCoords.setFieldProperties(fieldPropertiesState!);

    return (
        <div
            title="Marcher Coordinate Sheet Container"
            style={{
                fontFamily: "ui-sans-serif, system-ui, sans-serif",
            }}
        >
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
                    style={{
                        backgroundColor: "#ddd",
                        padding: "0.5rem",
                        width: "max-content",
                        justifySelf: "baseline",
                    }}
                >
                    <h4
                        aria-label="marcher drill number"
                        style={{
                            margin: 0,
                            padding: 0,
                            fontSize: "1rem",
                        }}
                    >
                        {marcherState.drill_number}
                    </h4>
                </div>
                {marcherState.name && marcherState.name.trim() && (
                    <div
                        title="marcher name header"
                        style={{
                            flexGrow: 1,
                            borderLeft: "1px dotted #888",
                            backgroundColor: "#ddd",
                            padding: "0.5rem",
                            width: "max-content",
                            justifySelf: "baseline",
                        }}
                    >
                        <h4
                            aria-label="marcher name"
                            style={{
                                margin: 0,
                                padding: 0,
                                fontSize: "1rem",
                            }}
                        >
                            {marcherState.name}
                        </h4>
                    </div>
                )}
                <div
                    title="quarter-page number header"
                    style={{
                        borderLeft: "1px dotted #888",
                        backgroundColor: "#ddd",
                        padding: "0.5rem",
                        width: "max-content",
                        justifySelf: "baseline",
                    }}
                >
                    <h4
                        aria-label="quarter page number"
                        style={{
                            margin: 0,
                            padding: 0,
                            fontSize: "1rem",
                        }}
                    >
                        Page {quarterPageNumber}
                    </h4>
                </div>
            </div>
            <table
                aria-label="individual marcher coordinates table"
                style={{
                    tableLayout: "fixed",
                    width: "100%",
                    borderCollapse: "collapse",
                }}
            >
                <colgroup>
                    <col
                        style={{ width: QuarterSheetColumnWidths.pageNumber }}
                    />
                    <col style={{ width: QuarterSheetColumnWidths.counts }} />
                    <col style={{ width: QuarterSheetColumnWidths.measures }} />
                    <col style={{ width: QuarterSheetColumnWidths.x }} />
                    <col style={{ width: QuarterSheetColumnWidths.y }} />
                </colgroup>
                <thead /* style={{ width: "100%" }} */>
                    <tr aria-label="coordinates header row">
                        <th
                            aria-label="page header"
                            style={{
                                border: "1px solid #888",
                                padding: "2px 4px",
                                textAlign: "center",
                                width: "10%",
                                fontWeight: "bold",
                                fontSize: 10,
                                lineHeight: 1.1,
                            }}
                        >
                            Pg.
                        </th>
                        <th
                            aria-label="counts header"
                            style={{
                                border: "1px solid #888",
                                padding: "2px 4px",
                                textAlign: "center",
                                width: "10%",
                                fontWeight: "bold",
                                fontSize: 10,
                                lineHeight: 1.1,
                            }}
                        >
                            Ct
                        </th>
                        <th
                            aria-label="measure header"
                            style={{
                                border: "1px solid #888",
                                padding: "2px 4px",
                                textAlign: "center",
                                width: "15%",
                                fontWeight: "bold",
                                fontSize: 10,
                                lineHeight: 1.1,
                            }}
                        >
                            {t("exportCoordinates.measuresHeader")}
                        </th>
                        <th
                            aria-label="side to side header"
                            style={{
                                border: "1px solid #888",
                                padding: "2px 4px",
                                width: "32.5%",
                                fontWeight: "bold",
                                fontSize: 10,
                                lineHeight: 1.1,
                            }}
                        >
                            {t("exportCoordinates.sideToSideHeader")}
                        </th>
                        <th
                            aria-label="front to back header"
                            style={{
                                border: "1px solid #888",
                                padding: "2px 4px",
                                width: "32.5%",
                                fontWeight: "bold",
                                fontSize: 10,
                                lineHeight: 1.1,
                            }}
                        >
                            {t("exportCoordinates.frontToBackHeader")}
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {marcherPagesState.map(
                        (marcherPage: MarcherPage, index) => {
                            if (!fieldPropertiesState) return null;
                            const page = pagesState.find(
                                (p) => p.id === marcherPage.page_id,
                            );
                            const rCoords = new ReadableCoords({
                                x: marcherPage.x,
                                y: marcherPage.y,
                                roundingDenominator,
                            });

                            if (!page || !rCoords) return null;

                            // S to S and F to B
                            const sToS = terse
                                ? rCoords.toTerseStringX()
                                : rCoords.toVerboseStringX();
                            const fToB = terse
                                ? rCoords.toTerseStringY()
                                : rCoords.toVerboseStringY();

                            // Counts
                            const counts = page.counts;

                            // Measure (format as X-X)
                            const origMeasure = measureRangeString(page);
                            const msValue = compactMeasureFormat(origMeasure);

                            const isEven = index % 2 === 0;

                            return (
                                <tr
                                    key={marcherPage.id_for_html}
                                    style={{
                                        backgroundColor: isEven
                                            ? "#f0f0f0"
                                            : "#ffffff",
                                    }}
                                >
                                    <td
                                        style={{
                                            border: "1px solid #888",
                                            padding: "1px 3px",
                                            textAlign: "center",
                                            fontFamily:
                                                "ui-sans-serif, system-ui, sans-serif",
                                            fontSize: 10,
                                            lineHeight: 1.1,
                                        }}
                                    >
                                        {page.name}
                                    </td>
                                    <td
                                        style={{
                                            border: "1px solid #888",
                                            padding: "1px 3px",
                                            textAlign: "center",
                                            fontFamily:
                                                "ui-sans-serif, system-ui, sans-serif",
                                            fontSize: 10,
                                            lineHeight: 1.1,
                                        }}
                                    >
                                        {counts}
                                    </td>
                                    <td
                                        style={{
                                            border: "1px solid #888",
                                            padding: "1px 3px",
                                            textAlign: "center",
                                            fontFamily:
                                                "ui-sans-serif, system-ui, sans-serif",
                                            fontSize: 10,
                                            lineHeight: 1.1,
                                        }}
                                    >
                                        {msValue}
                                    </td>
                                    <td
                                        style={{
                                            border: "1px solid #888",
                                            padding: "1px 3px",
                                            fontFamily:
                                                "ui-sans-serif, system-ui, sans-serif",
                                            textAlign: "left",
                                            fontSize: 10,
                                            lineHeight: 1.1,
                                        }}
                                    >
                                        {sToS}
                                    </td>
                                    <td
                                        style={{
                                            border: "1px solid #888",
                                            padding: "1px 3px",
                                            fontFamily:
                                                "ui-sans-serif, system-ui, sans-serif",
                                            textAlign: "left",
                                            fontSize: 10,
                                            lineHeight: 1.1,
                                        }}
                                    >
                                        {fToB}
                                    </td>
                                </tr>
                            );
                        },
                    )}
                </tbody>
            </table>
        </div>
    );
}
