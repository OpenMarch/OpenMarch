import { useEffect } from "react";
import CanvasMarcher from "@/global/classes/canvasObjects/CanvasMarcher";
import Pathway from "@/global/classes/canvasObjects/Pathway";
import Midpoint from "@/global/classes/canvasObjects/Midpoint";
import Endpoint from "@/global/classes/canvasObjects/Endpoint";
import { useMarcherStore } from "@/stores/MarcherStore";
import { useMarcherVisualStore } from "@/stores/MarcherVisualStore";
import Marcher from "@/global/classes/Marcher";

/**
 * MarcherVisualGroup is a class that contains all the visual elements of a marcher.
 * It includes the pathways, midpoints, and endpoints associated with a marcher_id.
 */
export default class MarcherVisualGroup {
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

    /**
     * Creates a new MarcherVisualGroup instance.
     * @param marcher
     */
    constructor(marcher: Marcher) {
        this.marcherId = marcher.id;

        this.canvasMarcher = new CanvasMarcher({
            marcher: marcher,
            coordinate: { x: 0, y: 0 },
        });

        this.previousPathway = new Pathway({
            marcherId: this.marcherId,
            start: { x: 0, y: 0 },
            end: { x: 0, y: 0 },
            color: "red", //rgbaToString(fieldProperties.theme.previousPath), TODO
            strokeWidth: 2,
        });
        this.nextPathway = new Pathway({
            marcherId: this.marcherId,
            start: { x: 0, y: 0 },
            end: { x: 0, y: 0 },
            color: "green", //rgbaToString(fieldProperties.theme.nextPath),
            strokeWidth: 2,
        });

        this.previousMidpoint = new Midpoint({
            marcherId: this.marcherId,
            start: { x: 0, y: 0 },
            end: { x: 0, y: 0 },
            innerColor: "white",
            outerColor: "red", //rgbaToString(fieldProperties.theme.previousPath),
        });
        this.nextMidpoint = new Midpoint({
            marcherId: this.marcherId,
            start: { x: 0, y: 0 },
            end: { x: 0, y: 0 },
            innerColor: "white",
            outerColor: "green", //rgbaToString(fieldProperties.theme.nextPath),
        });

        this.previousEndPoint = new Endpoint({
            coordinate: { x: 0, y: 0 },
            dotRadius: 3,
            color: "red", //rgbaToString(fieldProperties.theme.previousPath),
        });
        this.nextEndPoint = new Endpoint({
            coordinate: { x: 0, y: 0 },
            dotRadius: 3,
            color: "green", //rgbaToString(fieldProperties.theme.nextPath),
        });
    }

    // Getters
    getCanvasMarcher() {
        return this.canvasMarcher;
    }
    getPreviousPathway() {
        return this.previousPathway;
    }
    getNextPathway() {
        return this.nextPathway;
    }
    getPreviousMidpoint() {
        return this.previousMidpoint;
    }
    getNextMidpoint() {
        return this.nextMidpoint;
    }
    getPreviousEndpoint() {
        return this.previousEndPoint;
    }
    getNextEndpoint() {
        return this.nextEndPoint;
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
        if (marchers) {
            updateMarcherVisuals(marchers);
        }
    }, [marchers, updateMarcherVisuals]);

    return { marchers, marcherVisuals };
}
