import React from "react";
import { Marcher } from "@/global/classes/Marcher";
import Page, { measureRangeString } from "@/global/classes/Page";
import MarcherPage from "@/global/classes/MarcherPage";
import FieldProperties from "@/global/classes/FieldProperties";
import { ReadableCoords } from "@/global/classes/ReadableCoords";

// Common props for all coordinate sheet templates
interface CoordinateSheetProps {
    marcher: Marcher;
    pages: Page[];
    marcherPages: MarcherPage[];
    fieldProperties: FieldProperties;
    roundingDenominator?: number;
    terse?: boolean;
    includeMeasures?: boolean;
    useXY?: boolean;
}

// Full-page coordinate sheet
export function FullPageCoordinateSheet({
    marcher,
    pages,
    marcherPages,
    fieldProperties,
    roundingDenominator = 4,
    terse = false,
    includeMeasures = true,
    useXY = false,
}: CoordinateSheetProps) {
    if (!marcher || !fieldProperties) return null;

    ReadableCoords.setFieldProperties(fieldProperties);

    const sortMarcherPages = (a: MarcherPage, b: MarcherPage) => {
        const pageA = pages.find((p) => p.id === a.page_id);
        const pageB = pages.find((p) => p.id === b.page_id);
        if (!pageA) return 1;
        if (!pageB) return -1;
        return pageA.order - pageB.order;
    };

    const sortedMarcherPages = marcherPages
        .filter((mp) => mp.marcher_id === marcher.id)
        .sort(sortMarcherPages);

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
    const headingContainerStyle: React.CSSProperties = {
        backgroundColor: "#ddd",
        padding: "1rem",
    };
    const leftBorderStyle: React.CSSProperties = {
        borderLeft: "1px dotted #888",
    };

    return (
        <div style={{ fontFamily: "sans-serif", fontSize: "0.9rem" }}>
            <div
                className="sheetHeader"
                style={{ backgroundColor: "#ddd", display: "flex" }}
            >
                <div style={headingContainerStyle}>
                    <h4 style={h4Style}>{marcher.drill_number}</h4>
                </div>
                {marcher.name && marcher.name.trim() && (
                    <div
                        style={{
                            flexGrow: 1,
                            ...leftBorderStyle,
                            ...headingContainerStyle,
                        }}
                    >
                        <h4 style={h4Style}>{marcher.name}</h4>
                    </div>
                )}
                <div style={{ ...leftBorderStyle, ...headingContainerStyle }}>
                    <h4 style={h4Style}>{marcher.section}</h4>
                </div>
            </div>
            <table
                style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    tableLayout: "fixed",
                }}
            >
                <thead>
                    <tr>
                        <th style={{ ...thTdStyle, width: "10%" }}>Set</th>
                        <th style={{ ...thTdStyle, width: "10%" }}>Counts</th>
                        {includeMeasures && (
                            <th style={{ ...thTdStyle, width: "15%" }}>
                                Measures
                            </th>
                        )}
                        <th style={thTdStyle}>
                            {useXY ? "X" : "Side to Side"}
                        </th>
                        <th style={thTdStyle}>
                            {useXY ? "Y" : "Front to Back"}
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {sortedMarcherPages.map((marcherPage) => {
                        const page = pages.find(
                            (p) => p.id === marcherPage.page_id,
                        )!;
                        if (!page) return null;

                        const readableCoords = new ReadableCoords({
                            x: marcherPage.x,
                            y: marcherPage.y,
                            roundingDenominator,
                        });

                        return (
                            <tr key={marcherPage.id_for_html}>
                                <td style={thTdStyle}>{page.name}</td>
                                <td style={thTdStyle}>{page.counts}</td>
                                {includeMeasures && (
                                    <td style={thTdStyle}>
                                        {measureRangeString(page)}
                                    </td>
                                )}
                                <td style={{ ...thTdStyle, textAlign: "left" }}>
                                    {terse
                                        ? readableCoords.toTerseStringX()
                                        : readableCoords.toVerboseStringX()}
                                </td>
                                <td style={{ ...thTdStyle, textAlign: "left" }}>
                                    {terse
                                        ? readableCoords.toTerseStringY()
                                        : readableCoords.toVerboseStringY()}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

// Compact, quarter-page coordinate sheet
interface CompactSheetProps extends CoordinateSheetProps {
    quarterPageNumber: number;
}

export function QuarterPageCoordinateSheet({
    marcher,
    pages,
    marcherPages,
    fieldProperties,
    roundingDenominator = 4,
    terse = false,
    quarterPageNumber,
}: CompactSheetProps) {
    if (!marcher || !fieldProperties) return null;

    ReadableCoords.setFieldProperties(fieldProperties);

    const sortMarcherPages = (a: MarcherPage, b: MarcherPage) => {
        const pageA = pages.find((p) => p.id === a.page_id);
        const pageB = pages.find((p) => p.id === b.page_id);
        if (!pageA) return 1;
        if (!pageB) return -1;
        return pageA.order - pageB.order;
    };

    const sortedMarcherPages = marcherPages
        .filter((mp) => mp.marcher_id === marcher.id)
        .sort(sortMarcherPages);

    const thTdStyle: React.CSSProperties = {
        border: "1px solid #888",
        padding: "1px 3px",
        textAlign: "center",
        fontSize: 10,
        lineHeight: 1.1,
    };

    const h4Style: React.CSSProperties = {
        margin: 0,
        padding: 0,
        fontSize: "1.2rem",
    };

    const headingContainerStyle: React.CSSProperties = {
        backgroundColor: "#ddd",
        padding: "1rem",
    };

    const leftBorderStyle: React.CSSProperties = {
        borderLeft: "1px dotted #888",
    };

    const compactMeasureFormat = (measureStr: string): string => {
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
    };

    return (
        <div style={{ fontFamily: "sans-serif" }}>
            <div
                className="sheetHeader"
                style={{ backgroundColor: "#ddd", display: "flex" }}
            >
                <div style={headingContainerStyle}>
                    <h4 style={h4Style}>{marcher.drill_number}</h4>
                </div>
                {marcher.name && marcher.name.trim() && (
                    <div
                        style={{
                            flexGrow: 1,
                            ...leftBorderStyle,
                            ...headingContainerStyle,
                        }}
                    >
                        <h4 style={h4Style}>{marcher.name}</h4>
                    </div>
                )}
                <div style={{ ...leftBorderStyle, ...headingContainerStyle }}>
                    <h4 style={h4Style}>Page {quarterPageNumber}</h4>
                </div>
            </div>
            <table
                style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    tableLayout: "fixed",
                }}
            >
                <thead>
                    <tr>
                        <th style={{ ...thTdStyle, width: "4ch" }}>Pg.</th>
                        <th style={{ ...thTdStyle, width: "auto" }}>
                            S. to S.
                        </th>
                        <th style={{ ...thTdStyle, width: "auto" }}>
                            F. to B.
                        </th>
                        <th style={{ ...thTdStyle, width: "3ch" }}>Ct.</th>
                        <th style={{ ...thTdStyle, width: "11ch" }}>Ms.</th>
                    </tr>
                </thead>
                <tbody>
                    {sortedMarcherPages.map((marcherPage) => {
                        const page = pages.find(
                            (p) => p.id === marcherPage.page_id,
                        )!;
                        if (!page) return null;

                        const readableCoords = new ReadableCoords({
                            x: marcherPage.x,
                            y: marcherPage.y,
                            roundingDenominator,
                        });

                        const sToS = terse
                            ? readableCoords.toTerseStringX()
                            : readableCoords.toVerboseStringX();
                        const fToB = terse
                            ? readableCoords.toTerseStringY()
                            : readableCoords.toVerboseStringY();
                        const counts = page.counts;
                        const msValue = compactMeasureFormat(
                            measureRangeString(page),
                        );

                        return (
                            <tr key={marcherPage.id_for_html}>
                                <td style={thTdStyle}>{page.name}</td>
                                <td style={{ ...thTdStyle, textAlign: "left" }}>
                                    {sToS}
                                </td>
                                <td style={{ ...thTdStyle, textAlign: "left" }}>
                                    {fToB}
                                </td>
                                <td style={thTdStyle}>{counts}</td>
                                <td style={thTdStyle}>{msValue}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
