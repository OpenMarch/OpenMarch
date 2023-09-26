import { useEffect, useState } from "react";
import { Marcher } from "../../Interfaces";
import { useSelectedMarcher } from "../../context/SelectedMarcherContext";
import { bsconfig } from "../../styles/bootstrapClasses";
import { useMarcherStore } from "../../stores/Store";

export function MarcherList() {
    const { marchers, fetchMarchers } = useMarcherStore();
    const [isLoading, setIsLoading] = useState(true);
    const [headerRowAttributes, setHeaderRowAttributes] = useState<string[]>(["Name"]);
    const { selectedMarcher, setSelectedMarcher } = useSelectedMarcher()!;

    // TODO this is a duplicate of the one in the Page component. Find a way to combine?
    const handleMarcherClick = (marcher: Marcher) => {
        const curSelectedMarcher = selectedMarcher;
        if (curSelectedMarcher) {
            document.getElementById(curSelectedMarcher.id_for_html)!.className = "";
        }

        // Deselect if already selected
        if (curSelectedMarcher?.id_for_html === marcher.id_for_html) {
            setSelectedMarcher(null);
        } else {
            setSelectedMarcher(marcher);
            document.getElementById(marcher.id_for_html)!.className = "table-info";
        }
    };

    useEffect(() => {
        fetchMarchers().finally(() => {
            setIsLoading(false)
        });
    }, [fetchMarchers]);

    return (
        <>
            <h2>Marchers</h2>
            <div className="list-container">
                <div className="conatiner text-left --bs-primary">
                    <div className={bsconfig.tableHeader}>
                        {headerRowAttributes.map((attribute) => (
                            <div className="col table-header"
                                key={"marcherHeader-" + attribute}>{attribute}</div>
                        ))}
                    </div>
                </div>
                <div className="scrollable">
                    <table className={bsconfig.table}>
                        <tbody>
                            {isLoading ? (<tr><td>Loading...</td></tr>) : (
                                marchers.length === 0 ? <p>No marchers found</p> :
                                    marchers.map((marcher) => (
                                        <tr key={marcher.id_for_html} id={marcher.id_for_html}
                                            onClick={() => handleMarcherClick(marcher)}>
                                            <td scope="row">{marcher.name}</td>
                                            {/* <td>{marcher.}</td> */}
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
