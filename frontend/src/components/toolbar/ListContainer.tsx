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
    attributesText?: any;
    content: any[];
}

function ListContainer({ isLoading, attributes, attributesText, content }: ListContainerProps) {
    const { selectedPage, setSelectedPage } = useSelectedPage()!;
    const { selectedMarcher, setSelectedMarcher } = useSelectedMarcher()!;
    const [prevSelectedMarcher, setPrevSelectedMarcher] = useState<Marcher | null>(null);
    const [prevSelectedPage, setPrevSelectedPage] = useState<Page | null>(null);

    const handleRowClick = (selectedItem: Marcher | Page | any) => {
        if (selectedItem) {
            // Splits id like "marcher_1" into ["marcher", "1"]
            const idSplit = selectedItem?.id_for_html.split("_");

            // Marcher
            if (idSplit[0] === Constants.MarcherPrefix) {
                setPrevSelectedMarcher(selectedMarcher);
                // Deselect if already selected
                if (selectedMarcher?.id_for_html === selectedItem.id_for_html)
                    setSelectedMarcher(null);
                else
                    setSelectedMarcher(selectedItem);
            }
            // Page
            else if (idSplit[0] === Constants.PagePrefix) {
                setPrevSelectedPage(selectedPage);
                // Deselect if already selected
                // if (selectedPage?.id_for_html === selectedItem.id_for_html)
                //     setSelectedPage(null);
                // else
                setSelectedPage(selectedItem);
            }
        }
    };

    const updateSelection = (prevSelectedItem: any, selectedItem: any, setPrevSelectedItem: any) => {
        if (prevSelectedItem) {
            // Splits id like "marcher_1" into ["marcher", "1"]
            const idSplit = prevSelectedItem.id_for_html.split("_");

            // Visually deselect the previous item. Deselects the current item if clicked again.
            // Total deselection is not implemented for page because you always need a page selected.
            if ((idSplit[0] === Constants.MarcherPrefix || // item is a marcher
                (idSplit[0] === Constants.PagePrefix && selectedItem)) && // item is a page and a new page is selected
                prevSelectedItem && document.getElementById(prevSelectedItem.id_for_html)
            ) {
                document.getElementById(prevSelectedItem.id_for_html)!.className = "";
            }
        }

        if (selectedItem && document.getElementById(selectedItem.id_for_html))
            document.getElementById(selectedItem!.id_for_html)!.className = "table-info";

        // This is for the case where a new Item is added and the list is re-rendered.
        setPrevSelectedItem(selectedItem);
    };

    // Update Marcher selection visually.
    useEffect(() => {
        updateSelection(prevSelectedMarcher, selectedMarcher, setPrevSelectedMarcher);
    }, [selectedMarcher, prevSelectedMarcher, setSelectedMarcher]);

    // Update Page selection visually.
    useEffect(() => {
        updateSelection(prevSelectedPage, selectedPage, setPrevSelectedPage);
    }, [selectedPage, prevSelectedPage, setSelectedPage]);

    return (
        <div className="list-container bg-light">
            <Container className="text-left --bs-primary">
                <Row className={bsconfig.tableHeader}>
                    {attributes.map((attribute) => (
                        <Col className="table-header" key={"pageHeader-" + attribute}>
                            {/* I know this looks weird. Checks if the array exists and if the item exists. */}
                            {!attributesText ? attribute :
                                attributesText[attribute] ?
                                    attributesText[attribute] : attribute}
                        </Col>
                    ))}
                </Row>
            </Container>
            <div className="scrollable">
                <Table hover size="sm">
                    <tbody>
                        {isLoading ? (<tr><td>Loading...</td></tr>) : (
                            content.length === 0 ? <tr><td>Nothing found</td></tr> :
                                content.map((item) => (
                                    <tr id={item.id_for_html} key={item.id_for_html}
                                        onClick={() => handleRowClick(item)}
                                    >
                                        {attributes.map((attribute) => (
                                            <td key={item.id_for_html + "-" + attribute}>
                                                {item[attribute]}
                                            </td>
                                        ))}
                                        {/* <td scope="row">{item.name}</td>
                                        <td>{item.counts}</td> */}
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
