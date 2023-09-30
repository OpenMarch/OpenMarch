import { useState, useEffect } from "react";
import { usePageStore } from "../../stores/Store";
import ListContainer from "./ListContainer";

function PageList() {
    const { pages, fetchPages } = usePageStore();
    const [headerRowAttributes, setHeaderRowAttributes] = useState<string[]>(["#", "Counts"]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchPages().finally(() => {
            setIsLoading(false)
        });
    }, [fetchPages]);


    return (
        <>
            <h2>Pages</h2>
            <ListContainer isLoading={isLoading} attributes={headerRowAttributes} content={pages} />
        </>
    );
}

export default PageList;
