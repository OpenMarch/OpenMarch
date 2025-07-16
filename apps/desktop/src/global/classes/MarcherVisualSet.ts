import CanvasMarcher from "@/global/classes/canvasObjects/CanvasMarcher";
import { Pathway } from "@/global/classes/canvasObjects/Pathway";
import { Midpoint } from "@/global/classes/canvasObjects/Midpoint";
import Endpoint from "@/global/classes/canvasObjects/Endpoint";

/**
 * MarcherVisualSet is a class that contains all the visual elements of a marcher.
 * It includes the pathways, midpoints, and endpoints associated with a marcher_id.
 */
export default class MarcherVisualSet {
    /** The ID of the marcher this visual is associated with */
    marcherId: number;

    /** The containing the visual elements of the marcher */
    canvasMarcher: CanvasMarcher;

    /** The visual elements of pathways */
    previousPathway: Pathway;
    nextPathway: Pathway;
    previousMidpoint: Midpoint;
    nextMidpoint: Midpoint;
    previousEndPoint: Endpoint;
    nextEndPoint: Endpoint;

    constructor(marcherId: number) {
        this.marcherId = marcherId;

        // TODO add all objects
    }
}
