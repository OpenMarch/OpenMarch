import { useSelectedMarcher } from "../../context/SelectedMarcherContext";
import { useSelectedPage } from "../../context/SelectedPageContext";
import { getMarcherPage, getMarcherPages } from "../../api/api";
import { MarcherPage } from "../../Interfaces";
import { useEffect, useState } from "react";
import { bsconfig } from "../../styles/bootstrapClasses";
import { useMarcherStore, usePageStore } from "../../stores/Store";
// import { useMarcherPageStore } from "../../stores/Store";

export function PageDetails() {
    const [isLoading, setIsLoading] = useState(true);
    const selectedPage = useSelectedPage()?.selectedPage || null;
    const selectedMarcher = useSelectedMarcher()?.selectedMarcher || null;
    const [marcherPageList, setMarcherPageList] = useState<MarcherPage[]>([]);
    const [singleMarcherPage, setSingleMarcherPage] = useState<MarcherPage | null>(null);
    const marchers = useMarcherStore(state => state.marchers);
    const pages = usePageStore(state => state.pages);
    // const { marcherPages, fetchMarcherPages } = useMarcherPageStore();

    // Load marcherPage(s) from selected marcher/page
    useEffect(() => {
        setSingleMarcherPage(null);
        setMarcherPageList([]);
        setIsLoading(true);
        // If both a marcher and page is selected return a single marcherPage
        if (selectedPage && selectedMarcher) {
            // This is an array access because the response is an array of length 1
            getMarcherPage(selectedMarcher.id, selectedPage.id).then((marcherPageResponse: MarcherPage[]) => {
                setSingleMarcherPage(marcherPageResponse[0]);
            }).finally(() => {
                setIsLoading(false)
            });
        }
        // If only a marcher or a page is selected, return all marcherPages for that marcher or page
        else if (selectedPage || selectedMarcher) {
            const idToUse = selectedPage?.id_for_html || selectedMarcher!.id_for_html;
            getMarcherPages(idToUse).then((marcherPagesResponse: MarcherPage[]) => {
                setMarcherPageList(marcherPagesResponse);
            }).finally(() => {
                setIsLoading(false)
            });
        }
        setIsLoading(false);
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
            <h2>Details</h2>
            <div className="list-container">
                {isLoading ? <p>Loading...</p> :
                    // Load a single marcherPage when both a marcher and page are selected
                    selectedMarcher && selectedPage ?
                        <>
                            <div className={bsconfig.tableHeader}>
                                <div className="col table-header">Pg {selectedPage?.name || "nil"}</div>
                                <div className="col table-header">{selectedMarcher.drill_number?.toString() || "nil"}</div>
                            </div>
                            <table className="table pageDetails-table">
                                <tbody>
                                    <tr>
                                        <th scope="row" className="text-start">X</th>
                                        <td>{singleMarcherPage?.x || "nil"}</td>
                                    </tr>
                                    <tr>
                                        <th scope="row" className="text-start">Y</th>
                                        <td>{singleMarcherPage?.y || "nil"}</td>
                                    </tr>
                                    {/* The following is not yet implemented */}
                                    <tr>
                                        <th scope="row" className="text-start">Step size</th>
                                        {/* <td>{singleMarcherPage?.y}</td> */}
                                    </tr>
                                    <tr>
                                        <th scope="row" className="text-start">Counts</th>
                                        {/* <td>{singleMarcherPage?.y}</td> */}
                                    </tr>
                                </tbody>
                            </table>
                        </>
                        // Load a list of marcherPages when only a marcher or page is selected
                        : selectedMarcher || selectedPage ?
                            <>
                                <div className="conatiner text-left --bs-primary">
                                    <div className={bsconfig.tableHeader}>
                                        <div className="col table-header">{selectedPage ? "Marcher" : "Page"}</div>
                                        <div className="col table-header">X</div>
                                        <div className="col table-header">Y</div>
                                    </div>
                                </div>
                                <div className="scrollable">
                                    <table className={bsconfig.table}>
                                        <tbody>
                                            {isLoading ? (<tr><td>Loading...</td></tr>) : (
                                                marcherPageList.length === 0 ? <tr><td>No marchers found</td></tr> :
                                                    marcherPageList.map((marcherPage) => (
                                                        <tr key={marcherPage.id_for_html} id={marcherPage.id_for_html}>
                                                            <th scope="row" className="text-start">{selectedPage ?
                                                                getMarcherNumber(marcherPage.marcher_id) :
                                                                getPageName(marcherPage.page_id)}
                                                            </th>
                                                            <td>{marcherPage?.x || "nil"}</td>
                                                            <td>{marcherPage?.y || "nil"}</td>
                                                            {/* <td>{marcher.}</td> */}
                                                        </tr>
                                                    ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                            : <p>no page or marcher selected</p>}
            </div>

        </>
    );
}
