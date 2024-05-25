import { Button, Col, Form, Row } from "react-bootstrap";
import ModalLauncher from "../toolbar/ModalLauncher";
import { useCallback, useState } from "react";
import { topBarComponentProps } from "@/global/Interfaces";
import MarcherCoordinateSheet, { StaticMarcherCoordinateSheet } from "./MarcherCoordinateSheet";
import ReactDOMServer from 'react-dom/server';
import { useFieldProperties } from "@/context/fieldPropertiesContext";
import { useMarcherStore } from "@/stores/marcher/useMarcherStore";
import { usePageStore } from "@/stores/page/usePageStore";
import { useMarcherPageStore } from "@/stores/marcherPage/useMarcherPageStore";

function ExportModalContents() {
    const [isTerse, setIsTerse] = useState(false);
    const [includeMeasures, setIncludeMeasures] = useState(true);
    const [useXY, setUseXY] = useState(false);
    const [roundingDenominator, setRoundingDenominator] = useState(4);
    const [fontSize, setFontSize] = useState(18);
    const { marchers } = useMarcherStore()!;
    const { pages } = usePageStore()!;
    const { marcherPages } = useMarcherPageStore()!;
    const { fieldProperties } = useFieldProperties()!;
    const [isLoading, setIsLoading] = useState(false);
    const rowClassname = "mx-2";
    // const fourSheets = useRef(false);

    const handleExport = useCallback(() => {
        if (!fieldProperties) throw new Error("Field properties not found in context");

        const coordinateSheets: string[] = [];
        marchers.forEach((marcher) => {
            console.log("marcher", marcher);
            coordinateSheets.push(ReactDOMServer.renderToString(
                <StaticMarcherCoordinateSheet marcher={marcher} pages={pages} marcherPages={marcherPages}
                    includeMeasures={includeMeasures} terse={isTerse} useXY={useXY} fieldProperties={fieldProperties}
                    roundingDenominator={roundingDenominator} fontSize={fontSize}
                />)
            );
        });
        setIsLoading(true);
        window.electron.sendExportIndividualCoordinateSheets(coordinateSheets).then(
            () => setIsLoading(false)
        );
    }, [fieldProperties, marchers, pages, marcherPages, includeMeasures, isTerse, useXY, roundingDenominator, fontSize]);

    return (
        <div>
            <h5>Settings</h5>
            <Row className={rowClassname}>
                <Col>
                    <Form>
                        <Form.Group>
                            <Row>
                                <Col>
                                    <Form.Check type="checkbox" label="Include measures" checked={includeMeasures}
                                        onChange={(e) => setIncludeMeasures(e.target.checked)}
                                    />
                                    <Form.Check type="checkbox" label="Abbreviate coordinate descriptions" checked={isTerse}
                                        onChange={(e) => setIsTerse(e.target.checked)}
                                    />
                                    <Form.Check type="checkbox" label="Use X/Y headers" checked={useXY}
                                        onChange={(e) => setUseXY(e.target.checked)} />
                                </Col>
                                <Col>
                                    <Form.Label>Rounding denominator:</Form.Label>
                                    <Col sm={3}>
                                        <Form.Control type="number" defaultValue={roundingDenominator} step={1} min={1}
                                            onChange={(e) => setRoundingDenominator(parseInt(e.target.value) || 4)} />
                                    </Col>
                                    <Form.Text className="text-muted">
                                        {'4 -> 1/4 = nearest quarter step'}<br />{'10 -> 1/10 = nearest tenth step'}<br />
                                    </Form.Text>
                                    <Form.Label>Font Size:</Form.Label>
                                    <Col sm={3}>
                                        <Form.Control type="number" defaultValue={fontSize} step={1} min={8} max={40}
                                            onChange={(e) => setFontSize(parseInt(e.target.value) || 18)} />
                                    </Col>
                                </Col>
                            </Row>
                        </Form.Group>
                    </Form>
                </Col>
            </Row>
            <br />
            <h5>Preview</h5>
            <Row className={rowClassname} >
                <Col className="mx-2" style={{ border: "2px solid #aaa" }}>
                    <MarcherCoordinateSheet example={true} terse={isTerse}
                        includeMeasures={includeMeasures} useXY={useXY}
                        roundingDenominator={roundingDenominator || 4}
                        fontSize={fontSize || 18}
                    />
                </Col>
            </Row>
            <br />
            <Row className="mx-2">
                <Button variant="primary" onClick={handleExport} disabled={isLoading}>
                    {isLoading ? "Exporting... Please wait" : "Export Individual Coordinate Sheets"}
                </Button>
            </Row>
        </div >
    );
}

export default function ExportCoordinatesModal({ className }: topBarComponentProps) {
    return (
        <ModalLauncher
            components={[ExportModalContents()]} launchButton="Export"
            header="Export Individual Coordinate Sheets" modalClassName="modal-lg"
            buttonClassName={className}
        />
    );
}
