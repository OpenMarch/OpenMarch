import { Button, Col, Form, Row } from "react-bootstrap";
import ModalLauncher from "../toolbar/ModalLauncher";
import { useCallback, useState } from "react";
import { topBarComponentProps } from "@/global/Interfaces";
import MarcherCoordinateSheet, { StaticMarcherCoordinateSheet } from "./MarcherCoordinateSheet";
import { useMarcherPageStore, useMarcherStore, usePageStore } from "@/global/Store";
import ReactDOMServer from 'react-dom/server';
import { useFieldProperties } from "@/context/fieldPropertiesContext";

function ExportModalContents() {
    const [isTerse, setIsTerse] = useState(false);
    const [includeMeasures, setIncludeMeasures] = useState(true);
    const [useXY, setUseXY] = useState(false);
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
            coordinateSheets.push(ReactDOMServer.renderToString
                (<StaticMarcherCoordinateSheet marcher={marcher} pages={pages} marcherPages={marcherPages}
                    includeMeasures={includeMeasures} terse={isTerse} useXY={useXY} fieldProperties={fieldProperties}
                />)
            );
            console.log("coordinateSheets", coordinateSheets[0]);
        });
        setIsLoading(true);
        window.electron.sendExportIndividualCoordinateSheets(coordinateSheets).then(
            () => setIsLoading(false)
        );
    }, [marchers, isTerse, includeMeasures, useXY, fieldProperties]);

    return (
        <div>
            <h5>Settings</h5>
            <Row className={rowClassname}>
                <Col>
                    <Form>
                        <Form.Group>
                            <Form.Check type="checkbox" label="Include measures" checked={includeMeasures}
                                onChange={(e) => setIncludeMeasures(e.target.checked)}
                            />
                            <Form.Check type="checkbox" label="Abbreviate coordinate descriptions" checked={isTerse}
                                onChange={(e) => setIsTerse(e.target.checked)}
                            />
                            <Form.Check type="checkbox" label="Use X/Y headers" checked={useXY}
                                onChange={(e) => setUseXY(e.target.checked)} />
                            {/* <Form.Check type="checkbox" label="Print 4 sheets per page"
                                onChange={(e) => fourSheets.current = e.target.checked} /> */}
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
