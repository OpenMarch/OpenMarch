import { useEffect, useState } from "react";
import { useMarcherStore } from "../../stores/Store";
import ListContainer from "./ListContainer";

function MarcherList() {
    const { marchers, fetchMarchers } = useMarcherStore();
    const [isLoading, setIsLoading] = useState(true);
    const [headerRowAttributes, setHeaderRowAttributes] = useState<string[]>(["drill_number"]);
    const rowAttributeText = {
        drill_number: "Drill Number"
    }

    useEffect(() => {
        fetchMarchers().finally(() => {
            setIsLoading(false)
        });
    }, [fetchMarchers]);

    return (
        <>
            <h2>Marchers</h2>
            <ListContainer
                isLoading={isLoading}
                attributes={headerRowAttributes}
                attributesText={rowAttributeText}
                content={marchers}
            />
        </>
    );
}

export default MarcherList;
