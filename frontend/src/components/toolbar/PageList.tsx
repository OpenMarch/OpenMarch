import { useState, useEffect } from "react";
import { getPages } from "../../api/api";

interface Page {
    id: string;
    name: string;
    counts: number;
}

export function PageList() {
    const [pages, setPages] = useState<Page[]>([]);
    const [isLoading, setIsLoading] = useState(true);

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
            <h2>Pages</h2>
            <div className="page-list">
                <div className="conatiner text-left --bs-primary">
                    <div className="row">
                        <div className="col table-header">#</div>
                        <div className="col table-header">Counts</div>
                    </div>
                </div>
                <div className="scrollable">
                    <table className="table table-sm table-hover">
                        <tbody>
                            {isLoading ? (<p>Loading...</p>) : (
                                pages.length === 0 ? <p>No pages found</p> :
                                    pages.map((page) => (
                                        <tr>
                                            <td key={page.id} scope="row">{page.name}</td>
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
