import { useEffect, useState } from "react";
import { getMarchers } from "../../api/api";

interface marcher {
    id: string;
    name: string;
    counts: number;
}

export function MarcherList() {
    const [marchers, setMarchers] = useState<marcher[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        getMarchers().then((marchersResponse: marcher[]) => {
            setMarchers(marchersResponse);
        }).finally(() => {
            setIsLoading(false)
        });
    }
        , []);

    return (
        <>
            <h2>Marchers</h2>
            <div className="marcher-list">
                <div className="conatiner text-left --bs-primary">
                    <div className="row">
                        <div className="col table-header">Drill Number</div>
                    </div>
                </div>
                <div className="scrollable">
                    <table className="table table-sm table-hover">
                        <tbody>
                            {isLoading ? (<p>Loading...</p>) : (
                                marchers.length === 0 ? <p>No marchers found</p> :
                                    marchers.map((marcher) => (
                                        <tr>
                                            <td key={marcher.id} scope="row">{marcher.name}</td>
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
