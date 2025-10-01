import CanvasMarcher from "@/global/classes/canvasObjects/CanvasMarcher";
import Pathway from "@/global/classes/canvasObjects/Pathway";
import Midpoint from "@/global/classes/canvasObjects/Midpoint";
import Endpoint from "@/global/classes/canvasObjects/Endpoint";
import Marcher from "@/global/classes/Marcher";
import {
    getSectionAppearance,
    SectionAppearance,
} from "@/global/classes/SectionAppearance";
// import EditablePath from "./canvasObjects/EditablePath";
import { FieldTheme } from "@openmarch/core";

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
    nextPathway: Pathway; // TODO: Change back to EditablePath when it's fully implemented
    previousMidpoint: Midpoint;
    nextMidpoint: Midpoint;
    previousEndPoint: Endpoint;
    nextEndPoint: Endpoint;

    /**
     * Creates a new MarcherVisualGroup instance.
     * @param marcher the marcher this visual group is associated with
     * @param sectionAppearance section appearances to apply to the visuals
     */
    constructor({
        marcher,
        sectionAppearance,
        fieldTheme,
    }: {
        marcher: Marcher;
        sectionAppearance?: SectionAppearance;
        fieldTheme: FieldTheme;
    }) {
        this.marcherId = marcher.id;

        this.canvasMarcher = new CanvasMarcher({
            marcher: marcher,
            coordinate: { x: 0, y: 0 },
            sectionAppearance: sectionAppearance,
        });

        this.previousPathway = new Pathway({
            marcherId: this.marcherId,
            start: { x: 0, y: 0 },
            end: { x: 0, y: 0 },
            color: "black",
            strokeWidth: 2,
        });
        // TODO: Change back to EditablePath when it's fully implemented
        this.nextPathway = new Pathway({
            marcherId: this.marcherId,
            start: { x: 0, y: 0 },
            end: { x: 0, y: 0 },
            color: "green",
            strokeWidth: 2,
        });

        this.previousMidpoint = new Midpoint({
            marcherId: this.marcherId,
            start: { x: 0, y: 0 },
            end: { x: 0, y: 0 },
            innerColor: "black",
            outerColor: "black",
        });
        this.nextMidpoint = new Midpoint({
            marcherId: this.marcherId,
            start: { x: 0, y: 0 },
            end: { x: 0, y: 0 },
            innerColor: "black",
            outerColor: "black",
        });

        this.previousEndPoint = new Endpoint({
            coordinate: { x: 0, y: 0 },
            marcherId: this.marcherId,
            dotRadius: 3,
            color: "black",
        });
        this.nextEndPoint = new Endpoint({
            coordinate: { x: 0, y: 0 },
            marcherId: this.marcherId,
            dotRadius: 3,
            color: "black",
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
 * Creates a MarcherVisualGroup for each marcher in the receivedMarchers array.
 * Updates existing visuals or creates new ones as needed.
 */
export function marcherVisualsFromMarchers({
    receivedMarchers,
    sectionAppearances,
    fieldTheme,
}: {
    receivedMarchers: Marcher[];
    sectionAppearances?: SectionAppearance[];
    fieldTheme: FieldTheme;
}): Record<number, MarcherVisualGroup> {
    const newVisuals: Record<number, MarcherVisualGroup> = {};
    for (const marcher of receivedMarchers) {
        const appearance = sectionAppearances
            ? getSectionAppearance(marcher.section, sectionAppearances)
            : undefined;
        newVisuals[marcher.id] = new MarcherVisualGroup({
            marcher,
            sectionAppearance: appearance,
            fieldTheme,
        });
    }
    return newVisuals;
}
