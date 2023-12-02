import { useState } from "react";
import { useMarcherStore } from "../../stores/Store";
import ListContainer from "../ListContainer";

function MarcherList() {
    const { marchers, marchersAreLoading } = useMarcherStore();
    // eslint-disable-next-line
    const [headerRowAttributes, setHeaderRowAttributes] = useState<string[]>(["drill_number"]);
    const rowAttributeText = {
        drill_number: "Drill Number"
    }

    return (
        <>
            <ListContainer
                isLoading={marchersAreLoading}
                attributes={headerRowAttributes}
                attributesText={rowAttributeText}
                content={marchers}
            />
        </>
    );
}

export default MarcherList;
