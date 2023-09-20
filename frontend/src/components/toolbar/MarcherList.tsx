import { useEffect, useState } from "react";
import { getMarchers } from "../../api/api";
import { Marcher } from "../../types";
import { useSelectedMarcher } from "../../context/SelectedMarcherContext";
import { send } from "process";

export function MarcherList() {
    const [marchers, setMarchers] = useState<Marcher[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [headerRowAttributes, setHeaderRowAttributes] = useState<string[]>(["Name"]);
    const { selectedMarcher, setSelectedMarcher } = useSelectedMarcher()!;

    // TODO this is a duplicate of the one in the Page component. Find a way to combine?
    const handleMarcherClick = (marcher: Marcher) => {
        const curSelectedMarcher = selectedMarcher;
        if (curSelectedMarcher) {
            document.getElementById(curSelectedMarcher.custom_id)!.className = "";
        }
        setSelectedMarcher(marcher);
        document.getElementById(marcher.custom_id)!.className = "table-info";
    };

    useEffect(() => {
        getMarchers().then((marchersResponse: Marcher[]) => {
            setMarchers(marchersResponse);
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
                                marchers.length === 0 ? <p>No marchers found</p> :
                                    marchers.map((marcher) => (
                                        <tr key={marcher.custom_id} id={marcher.custom_id} onClick={() => handleMarcherClick(marcher)}>
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
