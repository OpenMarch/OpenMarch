import { useEffect, useState } from "react";
import { MarcherPage } from "../../../Interfaces";
import { useSelectedMarcher } from "../../../context/SelectedMarcherContext";
import { useSelectedPage } from "../../../context/SelectedPageContext";
import { bsconfig } from "../../../styles/bootstrapClasses";
import { useMarcherPageStore } from "../../../stores/Store";

export function MarcherPageDetails() {
    const selectedPage = useSelectedPage()?.selectedPage || null;
    const selectedMarcher = useSelectedMarcher()?.selectedMarcher || null;
    const [marcherPage, setMarcherPage] = useState<MarcherPage | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const { marcherPages, fetchMarcherPages } = useMarcherPageStore()!;

    // Load marcherPage(s) from selected marcher/page
    useEffect(() => {
        setMarcherPage(null);
        // setIsLoading(true);
        // If both a marcher and page is selected return a single marcherPage
        if (selectedPage && selectedMarcher) {
            setMarcherPage(marcherPages.find(marcherPage => marcherPage.marcher_id === selectedMarcher.id &&
                marcherPage.page_id === selectedPage.id) || null);
        }
    }
        , [selectedPage, selectedMarcher, marcherPages]);

    useEffect(() => {
        fetchMarcherPages().finally(() => {
            setIsLoading(false)
        });
    }, [fetchMarcherPages]);

    return (
        <>
            {isLoading ? <p>Loading...</p> : <>
                <div className={bsconfig.tableHeader}>
                    <div className="col table-header">Pg {selectedPage?.name || "nil"}</div>
                    <div className="col table-header">{selectedMarcher?.drill_number?.toString() || "nil"}</div>
                </div>
                <table className="table pageDetails-table">
                    <tbody>
                        <tr>
                            <th scope="row" className="text-start">X</th>
                            <td>{marcherPage?.x || "nil"}</td>
                        </tr>
                        <tr>
                            <th scope="row" className="text-start">Y</th>
                            <td>{marcherPage?.y || "nil"}</td>
                        </tr>
                        {/* The following is not yet implemented */}
                        <tr>
                            <th scope="row" className="text-start">Step size</th>
                            {/* <td>{singleMarcherPage?.y}</td> */}
                        </tr>
                        <tr>
                            <th scope="row" className="text-start">Counts</th>
                            <td>{selectedPage?.counts}</td>
                        </tr>
                    </tbody>
                </table></>
            }</>
    )
}
