import { useEffect, useState } from "react";
import { useSelectedMarcher } from "../../../context/SelectedMarcherContext";
import { useSelectedPage } from "../../../context/SelectedPageContext";
import { bsconfig } from "../../../styles/bootstrapClasses";
import { useMarcherStore, usePageStore } from "../../../stores/Store";
import { MarcherPage } from "../../../Interfaces";
import { getMarcherPages } from "../../../api/api";

export function MarcherPageList() {
    const [isLoading, setIsLoading] = useState(true);
    const selectedPage = useSelectedPage()?.selectedPage || null;
    const selectedMarcher = useSelectedMarcher()?.selectedMarcher || null;
    const marchers = useMarcherStore(state => state.marchers);
    const pages = usePageStore(state => state.pages);
    const [marcherPages, setMarcherPages] = useState<MarcherPage[]>([]);

    // Load marcherPage(s) from selected marcher/page
    useEffect(() => {
        setMarcherPages([]);
        setIsLoading(true);
        // If both a marcher and page is selected return a single marcherPage
        if (selectedPage || selectedMarcher) {
            const idToUse = selectedPage?.id_for_html || selectedMarcher!.id_for_html;
            getMarcherPages(idToUse).then((marcherPagesResponse: MarcherPage[]) => {
                setMarcherPages(marcherPagesResponse);
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
                            marcherPages.length === 0 ? <tr><td>No marchers found</td></tr> :
                                marcherPages.map((marcherPage) => (
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
    );
}
