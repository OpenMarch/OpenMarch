import { useState, useEffect } from "react";
import { getPages } from "../../api/api";
import { Page } from "../../types";
import { useSelectedPage } from "../../context/SelectedPageContext";

export function PageList() {
    const [pages, setPages] = useState<Page[]>([]);
    const { selectedPage, setSelectedPage } = useSelectedPage()!;
    const [headerRowAttributes, setHeaderRowAttributes] = useState<string[]>(["#", "Counts"]);
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
            <h2>Marchers</h2>
            <div className="list-container">
                <div className="conatiner text-left --bs-primary">
                    <div className="row">
                        {headerRowAttributes.map((attribute) => (
                            <div className="col table-header">{attribute}</div>
                        ))}
                    </div>
                </div>
                <div className="scrollable">
                    <table className="table table-sm table-hover">
                        <tbody>
                            {isLoading ? (<p>Loading...</p>) : (
                                pages.length === 0 ? <p>No pages found</p> :
                                    pages.map((page) => (
                                        <tr id={page.custom_id} key={page.custom_id} onClick={() => handlePageClick(page)}>
                                            <td scope="row">{page.name}</td>
                                            <td>{page.counts}</td>
                                        </tr>
                                    ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div >
        </>
    );
}
