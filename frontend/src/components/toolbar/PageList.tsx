import { useState, useEffect } from "react";
import { usePageStore } from "../../stores/Store";
import ListContainer from "./ListContainer";
import { Page } from "../../Interfaces";
import { useSelectedPage } from "../../context/SelectedPageContext";
import { Constants } from "../../Constants";
import { type } from "@testing-library/user-event/dist/type";
import { Button } from "react-bootstrap";
import { FaPlus } from "react-icons/fa";

function PageList() {
    const { pages, fetchPages } = usePageStore();
    const { selectedPage, setSelectedPage } = useSelectedPage()!;
    const [headerRowAttributes, setHeaderRowAttributes] = useState<string[]>(["#", "Counts"]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);

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
        console.log("ADDING A PAGE");
    };

    useEffect(() => {
        setIsAdding(selectedPage?.id_for_html === Constants.NewPageId);
    }, [selectedPage]);

    return (
        <>
            <h2>Pages</h2>
            <ListContainer
                isLoading={isLoading}
                attributes={headerRowAttributes}
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
function setSelectedPage(tempPage: Page) {
    throw new Error("Function not implemented.");
}

