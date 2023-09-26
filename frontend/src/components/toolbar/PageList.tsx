import { useState, useEffect } from "react";
import { Page } from "../../Interfaces";
import { useSelectedPage } from "../../context/SelectedPageContext";
import { bsconfig } from "../../styles/bootstrapClasses";
import { usePageStore } from "../../stores/Store";

export function PageList() {
    const { pages, fetchPages } = usePageStore();
    const { selectedPage, setSelectedPage } = useSelectedPage()!;
    const [headerRowAttributes, setHeaderRowAttributes] = useState<string[]>(["#", "Counts"]);
    const [isLoading, setIsLoading] = useState(true);

    // TODO this is a duplicate of the one in the Marcher component. Find a way to combine?
    const handlePageClick = (page: Page) => {
        const curSelectedPage = selectedPage;
        if (curSelectedPage) {
            document.getElementById(curSelectedPage.id_for_html)!.className = "";
        }

        // Deselect if already selected
        if (curSelectedPage?.id_for_html === page.id_for_html) {
            setSelectedPage(null);
        } else {
            setSelectedPage(page);
            document.getElementById(page.id_for_html)!.className = "table-info";
        }
    };

    useEffect(() => {
        fetchPages().finally(() => {
            setIsLoading(false)
        });
    }, [fetchPages]);


    return (
        <>
            <h2>Marchers</h2>
            <div className="list-container">
                <div className="conatiner text-left --bs-primary">
                    <div className={bsconfig.tableHeader}>
                        {headerRowAttributes.map((attribute) => (
                            <div className="col table-header"
                                key={"pageHeader-" + attribute}>{attribute}</div>
                        ))}
                    </div>
                </div>
                <div className="scrollable">
                    <table className={bsconfig.table}>
                        <tbody>
                            {isLoading ? (<tr><td>Loading...</td></tr>) : (
                                pages.length === 0 ? <tr><td>No pages found</td></tr> :
                                    pages.map((page) => (
                                        <tr id={page.id_for_html} key={page.id_for_html}
                                            onClick={() => handlePageClick(page)}>
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
