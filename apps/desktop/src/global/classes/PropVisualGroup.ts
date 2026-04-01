import Pathway from "@/global/classes/canvasObjects/Pathway";
import Midpoint from "@/global/classes/canvasObjects/Midpoint";
import Endpoint from "@/global/classes/canvasObjects/Endpoint";

/**
 * PropVisualGroup contains the visual path elements for a prop.
 * Similar to MarcherVisualGroup but without the CanvasMarcher (props render separately).
 */
export default class PropVisualGroup {
    /** The ID of the prop's marcher this visual is associated with */
    marcherId: number;

    /** Unselectable visual elements of pathways */
    previousPathway: Pathway;
    nextPathway: Pathway;
    previousMidpoint: Midpoint;
    nextMidpoint: Midpoint;
    previousEndPoint: Endpoint;
    nextEndPoint: Endpoint;

    constructor({ marcherId }: { marcherId: number }) {
        this.marcherId = marcherId;

        this.previousPathway = new Pathway({
            marcherId: this.marcherId,
            start: { x: 0, y: 0 },
            end: { x: 0, y: 0 },
            color: "black",
            strokeWidth: 2,
        });
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

export type PropVisualMap = Record<number, PropVisualGroup>;
