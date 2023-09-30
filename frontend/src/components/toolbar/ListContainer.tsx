import { Container, Row, Col, Table } from "react-bootstrap";
import { bsconfig } from "../../styles/bootstrapClasses";
import { useSelectedPage } from "../../context/SelectedPageContext";
import { useSelectedMarcher } from "../../context/SelectedMarcherContext";
import { InterfaceConst, Marcher, Page } from "../../Interfaces";
import { useEffect } from "react";

interface ListContainerProps {
    isLoading: boolean;
    attributes: string[];
    content: any[];
}

function ListContainer({ isLoading, attributes, content }: ListContainerProps) {
    const { selectedPage, setSelectedPage } = useSelectedPage()!;
    const { selectedMarcher, setSelectedMarcher } = useSelectedMarcher()!;
    var isSameItem = false;

    const handlePageClick = (selectedItem: Marcher | Page | any) => {
        const idArr = selectedItem.id_for_html.split("_");

        if (idArr[0] === InterfaceConst.MarcherPrefix) {
            if (selectedMarcher) {
                console.log("selectedMarcher: ", selectedMarcher);
                document.getElementById(selectedMarcher.id_for_html)!.className = "";
            }

            // Deselect if already selected
            if (selectedMarcher?.id_for_html === selectedItem.id_for_html) {
                setSelectedMarcher(null);
                isSameItem = true;
            }
            else
                setSelectedMarcher(selectedItem);
        }
        else if (idArr[0] === InterfaceConst.PagePrefix) {
            if (selectedPage) {
                document.getElementById(selectedPage.id_for_html)!.className = "";
            }

            // Deselect if already selected
            if (selectedPage?.id_for_html === selectedItem.id_for_html) {
                setSelectedPage(null);
                isSameItem = true;
            }
            else
                setSelectedPage(selectedItem);
        }

        if (!isSameItem)
            document.getElementById(selectedItem.id_for_html)!.className = "table-info";
    };

    return (
        <div className="list-container">
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
                                        onClick={() => handlePageClick(page)}>
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
