import { useEffect, useState } from "react";
import { useSelectedMarcher } from "../../../context/SelectedMarcherContext";
import { useSelectedPage } from "../../../context/SelectedPageContext";
import { bsconfig } from "../../../styles/bootstrapClasses";
import { useMarcherPageStore, useMarcherStore, usePageStore } from "../../../stores/Store";
import { MarcherPage } from "../../../Interfaces";
import { Container, Row, Col, Table } from "react-bootstrap";

export function MarcherPageList() {
    // const [isLoading, setIsLoading] = useState(true);
    const selectedPage = useSelectedPage()?.selectedPage || null;
    const selectedMarcher = useSelectedMarcher()?.selectedMarcher || null;
    const marchers = useMarcherStore(state => state.marchers);
    const pages = usePageStore(state => state.pages);
    const [marcherPagesState, setMarcherPagesState] = useState<MarcherPage[]>([]);
    const { marcherPages } = useMarcherPageStore()!;
    const [headers, setHeaders] = useState<string[]>
        ([selectedMarcher?.drill_number || "Pg " + selectedPage?.name || "Name", "X", "Y"]);

    // Load marcherPage(s) from selected marcher/page
    useEffect(() => {
        setMarcherPagesState([]);

        // Load either a list of marcherPages relating to a marcher or a page
        if (selectedPage)
            setMarcherPagesState(marcherPages.filter(marcherPage => marcherPage.page_id === selectedPage!.id));
        else if (selectedMarcher)
            setMarcherPagesState(marcherPages.filter(marcherPage => marcherPage.marcher_id === selectedMarcher!.id));

        const newHeaders = headers;
        newHeaders[0] = selectedMarcher?.drill_number || selectedPage?.name || "Name";
        if (selectedPage)
            newHeaders[0] = "Pg " + newHeaders[0];
        setHeaders(newHeaders);
    }
        , [selectedPage, selectedMarcher]);

    // Accessor functions for marchers and pages
    const getMarcher = (marcher_id: number) => {
        return marchers.find(marcher => marcher.id === marcher_id);
    }
    const getMarcherNumber = (marcher_id: number) => {
        return (getMarcher(marcher_id)?.drill_number) || "-";
    }

    const getPage = (page_id: number) => {
        return pages.find(page => page.id === page_id);
    }
    const getPageName = (page_id: number) => {
        return (getPage(page_id)?.name) || "-";
    }
    return (
        <>
            <Container className="text-left --bs-primary">
                <Row className={bsconfig.tableHeader}>
                    {headers.map((attribute) => (
                        <Col className="table-header" key={"pageHeader-" + attribute}>
                            {attribute}
                        </Col>
                    ))}
                </Row>
            </Container>
            <div className="scrollable">
                <Table className="user-select-none">
                    <tbody>
                        {/* {isLoading ? (<tr><td>Loading...</td></tr>) : ( */}
                        {marcherPagesState.length === 0 ? <tr><td>No marcherPages found</td></tr> :
                            marcherPagesState.map((marcherPage) => (
                                <tr key={marcherPage.id_for_html} id={marcherPage.id_for_html}>
                                    <th scope="row" className="text-start">{selectedPage ?
                                        getMarcherNumber(marcherPage.marcher_id) :
                                        getPageName(marcherPage.page_id)}
                                    </th>
                                    <td>{marcherPage?.x || "nil"}</td>
                                    <td>{marcherPage?.y || "nil"}</td>
                                    {/* <td>{marcher.}</td> */}
                                </tr>
                            ))}
                        {/* )} */}
                    </tbody>
                </Table>
            </div>
        </>
    );
}
