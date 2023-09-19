import { useState, useEffect } from "react";
import { getPages } from "../../api/api";
import { Page } from "../../types";
import { useSelectedPage } from "../../context/SelectedPageContext";

export function PageList() {
    const [pages, setPages] = useState<Page[]>([]);
    const { selectedPage, setSelectedPage } = useSelectedPage()!;
    const [isLoading, setIsLoading] = useState(true);

    // TODO this is a duplicate of the one in the Marcher component. Find a way to combine?
    const handlePageClick = (page: Page) => {
        const curSelectedPage = selectedPage;
        if (curSelectedPage) {
            document.getElementById(curSelectedPage.custom_id)!.className = "";
        }
        setSelectedPage(page);
        document.getElementById(page.custom_id)!.className = "table-info";
    };

    useEffect(() => {
        getPages().then((pagesResponse: Page[]) => {
            setPages(pagesResponse);
        }).finally(() => {
            setIsLoading(false)
        });
    }
        , []);


    return (
        <>
            {isLoading ? (<p>Loading...</p>) : (
                pages.length === 0 ? <p>No pages found</p> :
                    pages.map((page) => (
                        <tr id={page.custom_id} key={page.custom_id} onClick={() => handlePageClick(page)}>
                            <td scope="row">{page.name}</td>
                            <td>{page.counts}</td>
                        </tr>
                    ))
            )}
        </>
    );
}
