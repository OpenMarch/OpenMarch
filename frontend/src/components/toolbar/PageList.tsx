import { useState, useEffect } from "react";
import { usePageStore } from "../../stores/Store";
import ListContainer from "./ListContainer";
import { Page } from "../../Interfaces";
import { useSelectedPage } from "../../context/SelectedPageContext";
import { Constants } from "../../Constants";
import { Button } from "react-bootstrap";
import { FaPlus } from "react-icons/fa";

function PageList() {
    const { pages, fetchPages } = usePageStore();
    const { selectedPage, setSelectedPage } = useSelectedPage()!;
    const [headerRowAttributes, setHeaderRowAttributes] = useState<string[]>(["name", "counts"]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const rowAttributeText = {
        counts: "Counts",
        name: "#"
    }

    useEffect(() => {
        fetchPages().finally(() => {
            setIsLoading(false)
        });
    }, [fetchPages]);

    const handleAddPage = () => {
        const tempPage: Page = {
            id_for_html: Constants.NewPageId,
            name: pages[pages.length - 1].name,
            counts: pages[pages.length - 1].counts,
            id: -1,
            order: -1,
            tableName: "pages",
            prefix: "page"
        };

        tempPage.name = (parseInt(tempPage.name) + 1).toString();
        setSelectedPage(tempPage);
    };

    // Checks if the selected page is a new one.
    useEffect(() => {
        setIsAdding(selectedPage?.id_for_html === Constants.NewPageId);
    }, [selectedPage]);

    return (
        <>
            <h2>Pages</h2>
            <ListContainer
                isLoading={isLoading}
                attributes={headerRowAttributes}
                attributesText={rowAttributeText}
                content={pages}
            />
            <Button disabled={isAdding} onClick={() => handleAddPage()}>
                {selectedPage?.id_for_html === Constants.NewPageId ?
                    <>Adding...</>
                    :
                    <><FaPlus /> Add Page</>
                }
            </Button>
        </>
    );
}

export default PageList;

