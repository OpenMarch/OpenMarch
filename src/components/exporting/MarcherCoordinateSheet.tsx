import * as Interfaces from "@/global/Interfaces";
import { Col, Row, Table } from "react-bootstrap";
import { useFieldProperties } from "@/context/fieldPropertiesContext";
import { useEffect, useState } from "react";
import { useMarcherPageStore } from "@/stores/marcherPage/useMarcherPageStore";
import { usePageStore } from "@/stores/page/usePageStore";
import { Marcher } from "@/global/classes/Marcher";
import { Page } from "@/global/classes/Page";
import { MarcherPage } from "@/global/classes/MarcherPage";

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

export default function MacherCoordinateSheet(
    { marcher, includeMeasures = true, roundingDenominator = 4,
        example = false, terse = false, useXY = false }: MarcherCoordinateSheetProps) {
    const { marcherPages } = useMarcherPageStore()!;
    const { pages } = usePageStore()!;
    const { fieldProperties } = useFieldProperties()!;
    const [marcherToUse, setMarcherToUse] = useState<Marcher>();
    const [pagesToUse, setPagesToUse] = useState<Page[]>([]);
    const [marcherPagesToUse, setMarcherPagesToUse] = useState<MarcherPage[]>([]);

    useEffect(() => {
        if (example && fieldProperties) {
            setMarcherToUse({
                id: 1, name: "Example Marcher", drill_number: "B1", section: "Baritone",
                id_for_html: "example-marcher", drill_prefix: "B", drill_order: 1
            });
            setPagesToUse([
                { id: 1, name: "1", counts: 8, order: 1, id_for_html: "example-page-1", tempo: 120, time_signature: "4/4" },
                { id: 2, name: "2", counts: 16, order: 2, id_for_html: "example-page-2", tempo: 120, time_signature: "4/4" },
                { id: 3, name: "2A", counts: 5, order: 3, id_for_html: "example-page-3", tempo: 120, time_signature: "4/4" },
            ]);
            setMarcherPagesToUse([
                {
                    id: 1, marcher_id: 1, page_id: 1, id_for_html: "example-marcher-page-1",
                    x: fieldProperties.originX, y: fieldProperties.originY,
                },
                {
                    id: 2, marcher_id: 1, page_id: 2, id_for_html: "example-marcher-page-2",
                    x: fieldProperties.originX + (2.1 * fieldProperties.pixelsPerStep),
                    y: fieldProperties.originY + (2 * fieldProperties.pixelsPerStep),
                },
                {
                    id: 3, marcher_id: 1, page_id: 3, id_for_html: "example-marcher-page-3",
                    x: fieldProperties.originX - (5.21 * fieldProperties.pixelsPerStep),
                    y: fieldProperties.originY + ((fieldProperties.frontSideline * fieldProperties.pixelsPerStep) - (2.32 * fieldProperties.pixelsPerStep))
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
    fieldProperties: Interfaces.FieldProperties;
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
    return (
        <div className="m-3">
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
                    <Row style={{ backgroundColor: '#ddd' }}>
                        <Col sm={2} style={headingStyle}>
                            <h2>{marcher.drill_number}</h2>
                        </Col>
                        <Col sm={5} style={{ ...headingStyle, borderLeft: "1px solid #888", }}>
                            <h4>{marcher.name}</h4>
                        </Col>
                        <Col sm={5} style={{ ...headingStyle, borderLeft: "1px solid #888", }}>
                            <h4>{marcher.section}</h4>
                        </Col>
                    </Row>
                    <Row>
                        <Table striped bordered size="sm">
                            <thead>
                                <tr >
                                    <th className="text-center">Page</th>
                                    <th className="text-center">Counts</th>
                                    {includeMeasures && <th className="text-center">Measure</th>}
                                    <th>{useXY ? "X" : "Side to Side"}</th>
                                    <th>{useXY ? "Y" : "Front to Back"}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {marcherPages.filter((marcherPage) => marcherPage.marcher_id === marcher.id).sort(sortMarcherPages)
                                    .map((marcherPage) => {
                                        if (!fieldProperties) return null;

                                        const page = pages.find((page) => page.id === marcherPage.page_id);
                                        const rCoords = CoordsUtils.canvasCoordsToCollegeRCords(marcherPage.x, marcherPage.y, fieldProperties);

                                        if (!page || !rCoords) return null;

                                        rCoords.xSteps = Math.round(rCoords.xSteps * roundingDenominator) / roundingDenominator;
                                        rCoords.ySteps = Math.round(rCoords.ySteps * roundingDenominator) / roundingDenominator;

                                        return (
                                            <tr key={marcherPage.id_for_html}>
                                                <td className="text-center">{page.name}</td>
                                                <td className="text-center">{page.counts}</td>
                                                {includeMeasures && <td className="text-center">N/A</td>}
                                                <td>{terse ? CoordsUtils.getTerseStringX(rCoords) : CoordsUtils.getVerboseStringX(rCoords)}</td>
                                                <td>{terse ? CoordsUtils.getTerseStringY(rCoords) : CoordsUtils.getVerboseStringY(rCoords)}</td>
                                            </tr>
                                        );
                                    })}
                            </tbody>
                        </Table>
                    </Row>
                </>}
        </div>
    );
}
