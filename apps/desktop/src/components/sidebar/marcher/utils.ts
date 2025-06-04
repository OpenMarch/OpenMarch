import { ReadableCoords } from "@/global/classes/ReadableCoords";
import { conToastError } from "@/utilities/utils";

export const handleCoordsSubmit = async ({
    xStepsDelta,
    yStepsDelta,
    marcher_id,
    page_id,
    oldReadableCoords,
    refreshFunction,
}: {
    xStepsDelta: number;
    yStepsDelta: number;
    marcher_id: number;
    page_id: number;
    oldReadableCoords: ReadableCoords;
    refreshFunction: () => Promise<void>;
}) => {
    const newReadableCoords = ReadableCoords.changeBySteps(
        oldReadableCoords,
        xStepsDelta,
        yStepsDelta,
    );

    if (!newReadableCoords) return;
    const response = await window.electron.updateMarcherPages([
        {
            marcher_id,
            page_id,
            x: newReadableCoords.originalX,
            y: newReadableCoords.originalY,
        },
    ]);

    if (response.success) {
        await refreshFunction();
    } else {
        conToastError(
            response.error?.message ?? "Error updating coordinate",
            response.error?.stack ?? "",
        );
    }
    return newReadableCoords;
};
