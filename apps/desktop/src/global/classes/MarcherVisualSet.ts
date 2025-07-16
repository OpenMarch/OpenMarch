import CanvasMarcher from "@/global/classes/canvasObjects/CanvasMarcher";
import Pathway from "@/global/classes/canvasObjects/Pathway";
import Midpoint from "@/global/classes/canvasObjects/Midpoint";
import Endpoint from "@/global/classes/canvasObjects/Endpoint";
import { useMarcherStore } from "@/stores/MarcherStore";
import { useMarcherVisualStore } from "@/stores/MarcherVisualStore";
import { useEffect } from "react";

/**
 * MarcherVisualSet is a class that contains all the visual elements of a marcher.
 * It includes the pathways, midpoints, and endpoints associated with a marcher_id.
 */
export default class MarcherVisualSet {
    /** The ID of the marcher this visual is associated with */
    marcherId: number;

    /** Group of selectable visual elements of the marcher */
    canvasMarcher: CanvasMarcher;

    /** Unselectable visual elements of pathways */
    previousPathway: Pathway;
    nextPathway: Pathway;
    previousMidpoint: Midpoint;
    nextMidpoint: Midpoint;
    previousEndPoint: Endpoint;
    nextEndPoint: Endpoint;

    constructor(marcherId: number) {
        this.marcherId = marcherId;
        //this.canvasMarcher = new CanvasMarcher(marcherId); TODO
    }
}

/**
 * Fetches marchers and their associated visuals from the store.
 */
export async function fetchMarchersAndVisuals() {
    await useMarcherStore.getState().fetchMarchers();
    const marchers = useMarcherStore.getState().marchers;
    await useMarcherVisualStore.getState().updateMarcherVisuals(marchers);
}

/**
 * Combined store fetch to retrieve marchers and their associated visuals.
 */
export function useMarchersWithVisuals() {
    const marchers = useMarcherStore((state) => state.marchers);
    const marcherVisuals = useMarcherVisualStore(
        (state) => state.marcherVisuals,
    );
    const updateMarcherVisuals = useMarcherVisualStore(
        (state) => state.updateMarcherVisuals,
    );

    useEffect(() => {
        if (marchers && marchers.length) {
            updateMarcherVisuals(marchers);
        }
    }, [marchers, updateMarcherVisuals]);

    return { marchers, marcherVisuals };
}
