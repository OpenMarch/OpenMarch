import { useEffect, useState } from "react";
import { MarcherPage, ReadableCoords } from "../../../Interfaces";
import { useSelectedMarcher } from "../../../context/SelectedMarcherContext";
import { useSelectedPage } from "../../../context/SelectedPageContext";
import { bsconfig } from "../../../styles/bootstrapClasses";
import { useMarcherPageStore } from "../../../stores/Store";
import { V1_COLLEGE_PROPERTIES, coordsToCollege, xToTerseString, yToTerseString } from "../../../utilities/CoordsUtils";

export function MarcherPageDetails() {
    const selectedPage = useSelectedPage()?.selectedPage || null;
    const selectedMarcher = useSelectedMarcher()?.selectedMarcher || null;
    // eslint-disable-next-line
    const [marcherPage, setMarcherPage] = useState<MarcherPage | null>(null);
    const [readableCoords, setReadableCoords] = useState<ReadableCoords>();
    const { marcherPages, marcherPagesAreLoading } = useMarcherPageStore()!;

    // Load marcherPage(s) from selected marcher/page
    useEffect(() => {
        setMarcherPage(null);
        // setIsLoading(true);
        // If both a marcher and page is selected return a single marcherPage
        if (selectedPage && selectedMarcher) {
            const newMarcherPage: MarcherPage | null = marcherPages.find(marcherPage => marcherPage.marcher_id === selectedMarcher.id &&
                marcherPage.page_id === selectedPage.id) || null;
            if (newMarcherPage) {
                setMarcherPage(newMarcherPage);
                setReadableCoords(coordsToCollege(newMarcherPage.x, newMarcherPage.y, V1_COLLEGE_PROPERTIES));
            }
        }
    }
        , [selectedPage, selectedMarcher, marcherPages]);

    return (
        <>
            {marcherPagesAreLoading ? <p>Loading...</p> : <>
                <div className={bsconfig.tableHeader}>
                    <div className="col table-header">Pg {selectedPage?.name || "nil"}</div>
                    <div className="col table-header">{selectedMarcher?.drill_number?.toString() || "nil"}</div>
                </div>
                <table className="table pageDetails-table">
                    <tbody>
                        <tr>
                            <th scope="row" className="text-left">{readableCoords?.xSteps}</th>
                            <td>{xToTerseString(readableCoords!, false)}</td>
                        </tr>
                        <tr>
                            <th scope="row" className="text-left">{readableCoords?.ySteps}</th>
                            <td>{yToTerseString(readableCoords!, false)}</td>

                        </tr>
                        {/* The following is not yet implemented */}
                        {/* <tr>
                            <th scope="row" className="text-start">Step size</th>
                        </tr>
                        <tr>
                            <th scope="row" className="text-start">Counts</th>
                            <td>{selectedPage?.counts}</td>
                        </tr> */}
                    </tbody>
                </table></>
            }</>
    )
}
