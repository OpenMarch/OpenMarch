import { Marcher, ModifiedMarcherArgs } from "@/global/classes/Marcher";
import { useMarcherStore } from "@/stores/marcher/useMarcherStore";
import { useCallback } from "react";
import { Button } from "react-bootstrap";

export default function MarcherList() {
    const { marchers } = useMarcherStore();

    const namesToCase = useCallback((caseType: "upper" | "lower") => {
        const modifiedMarchers: ModifiedMarcherArgs[] = [];

        marchers.forEach((marcher) => {
            modifiedMarchers.push({
                id: marcher.id,
                name: caseType === "upper" ? marcher.name.toUpperCase() : marcher.name.toLowerCase(),
            });
        });

        Marcher.updateMarchers(modifiedMarchers);
    }, [marchers]);

    return (
        <>
            <ul>
                {marchers.filter((marcher) => marcher.section === "Tuba")
                    .map((marcher) => {
                        return (
                            <li key={marcher.id_for_html}>
                                {marcher.drill_number}, {marcher.name}, {marcher.section}
                            </li>
                        );
                    })}
            </ul>
            <Button variant="primary" onClick={() => namesToCase('upper')}>Uppercase</Button>
            <Button variant="primary" onClick={() => namesToCase('lower')}>Lowercase</Button>
        </>
    );
}
