import { Container, Row, Col, Table } from "react-bootstrap";
import { bsconfig } from "../../styles/bootstrapClasses";
import { useSelectedPage } from "../../context/SelectedPageContext";
import { useSelectedMarcher } from "../../context/SelectedMarcherContext";
import { Marcher, Page } from "../../Interfaces";
import { Constants } from "../../Constants";
import { useEffect, useState } from "react";

interface ListContainerProps {
    isLoading: boolean;
    attributes: string[];
    content: any[];
}

function ListContainer({ isLoading, attributes, content }: ListContainerProps) {
    const { selectedPage, setSelectedPage } = useSelectedPage()!;
    const { selectedMarcher, setSelectedMarcher } = useSelectedMarcher()!;
    const [prevSelectedMarcher, setPrevSelectedMarcher] = useState<Marcher | null>(null);
    const [prevSelectedPage, setPrevSelectedPage] = useState<Page | null>(null);

    const handleRowClick = (selectedItem: Marcher | Page | any) => {
        const idArr = selectedItem.id_for_html.split("_");

        // Marcher
        if (idArr[0] === Constants.MarcherPrefix) {
            setPrevSelectedMarcher(selectedMarcher);
            // Deselect if already selected
            if (selectedMarcher?.id_for_html === selectedItem.id_for_html)
                setSelectedMarcher(null);
            else
                setSelectedMarcher(selectedItem);
        }
        // Page
        else if (idArr[0] === Constants.PagePrefix) {
            setPrevSelectedPage(selectedPage);
            // Deselect if already selected
            if (selectedPage?.id_for_html === selectedItem.id_for_html)
                setSelectedPage(null);
            else
                setSelectedPage(selectedItem);
        }
    };

    const updateSelection = (prevSelectedItem: any, selectedItem: any, setPrevSelectedItem: any) => {
        if (prevSelectedItem && document.getElementById(prevSelectedItem.id_for_html))
            document.getElementById(prevSelectedItem.id_for_html)!.className = "";

        if (selectedItem && document.getElementById(selectedItem.id_for_html))
            document.getElementById(selectedItem!.id_for_html)!.className = "table-info";

        // This is for the case where a new Item is added and the list is re-rendered.
        setPrevSelectedItem(selectedItem);
    };

    // Update Marcher selection visually.
    useEffect(() => {
        updateSelection(prevSelectedMarcher, selectedMarcher, setPrevSelectedMarcher);
    }, [selectedMarcher]);

    // Update Page selection visually.
    useEffect(() => {
        updateSelection(prevSelectedPage, selectedPage, setPrevSelectedPage);
    }, [selectedPage]);

    return (
        <div className="list-container bg-light">
            <Container className="text-left --bs-primary">
                <Row className={bsconfig.tableHeader}>
                    {attributes.map((attribute) => (
                        <Col className="table-header" key={"pageHeader-" + attribute}>
                            {attribute}
                        </Col>
                    ))}
                </Row>
            </Container>
            <div className="scrollable">
                <Table hover size="sm">
                    <tbody>
                        {isLoading ? (<tr><td>Loading...</td></tr>) : (
                            content.length === 0 ? <tr><td>No pages found</td></tr> :
                                content.map((page) => (
                                    <tr id={page.id_for_html} key={page.id_for_html}
                                        onClick={() => handleRowClick(page)}>
                                        <td scope="row">{page.name}</td>
                                        <td>{page.counts}</td>
                                    </tr>
                                ))
                        )}
                    </tbody>
                </Table>
            </div>
        </div >
    );
}

export default ListContainer;
