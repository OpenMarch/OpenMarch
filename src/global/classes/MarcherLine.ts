import { fabric } from "fabric";
import * as CanvasConstants from "../../components/canvas/CanvasConstants";
import MarcherPage from "@/global/classes/MarcherPage";
import OpenMarchCanvas from "../../components/canvas/OpenMarchCanvas";
import { FieldProperties } from "./FieldProperties";

/**
 * A MarcherLine is drawn by a user and marchers are evenly spaced along it.
 */
export default class MarcherLine extends fabric.Line {
    canvas?: OpenMarchCanvas;
    /** The ID of the group that this MarcherLine belongs to */
    groupId?: number;
    /** The ID of the start page */
    startPageId: number;
    /** The ID of the end page (inclusive) */
    endPageId: number;

    protected gridOffset: number;
    protected coordsAreOffset = false;

    constructor({
        x1,
        y1,
        x2,
        y2,
        groupId,
        startPageId,
        endPageId,
    }: {
        x1: number;
        y1: number;
        x2: number;
        y2: number;
        groupId?: number;
        startPageId: number;
        endPageId: number;
    }) {
        super([x1, y1, x2, y2], {
            ...CanvasConstants.NoControls,
            strokeWidth: 2,
            fill: "red",
            stroke: "red",
            originX: "center",
            originY: "center",
            hoverCursor: "default",
        });
        this.groupId = groupId;
        this.startPageId = startPageId;
        this.endPageId = endPageId;
        this.gridOffset =
            Math.abs(FieldProperties.GRID_STROKE_WIDTH - this.strokeWidth!) / 2;
    }

    /**
     * Gets the coordinates of the line.
     * These are the true coordinates of the line without the grid offset applied.
     *
     * @returns The coordinates of the line
     */
    getCoordinates = (): {
        x1: number;
        y1: number;
        x2: number;
        y2: number;
    } => {
        if (!this.x1 || !this.x2 || !this.y1 || !this.y2) {
            console.error("Line coordinates not set. Cannot get coordinates");
            return {
                x1: 0,
                y1: 0,
                x2: 0,
                y2: 0,
            };
        }
        // Remove the grid offset to get the actual coordinates
        // This is the only time where it is ok to get the coordinates directly
        return {
            x1: this.x1! - this.gridOffset,
            y1: this.y1! - this.gridOffset,
            x2: this.x2! - this.gridOffset,
            y2: this.y2! - this.gridOffset,
        };
    };

    /**
     * Sets the coordinates of the line to the new coordinates.
     * The coordinates are offset by the gridOffset to make the line appear center the line on the grid.
     *
     * @param {x1, y1, x2, y2} The new coordinates to set the line to
     * @returns The updated MarcherLine object
     */
    setCoordinates = ({
        x1,
        y1,
        x2,
        y2,
    }: {
        x1?: number;
        y1?: number;
        x2?: number;
        y2?: number;
    }) => {
        // Apply the grid offset to center the line on the grid
        // This is the only time where it is ok to set the coordinates directly
        const newCoords: {
            x1?: number;
            y1?: number;
            x2?: number;
            y2?: number;
        } = {};
        if (x1) newCoords.x1 = x1 + this.gridOffset;
        if (y1) newCoords.y1 = y1 + this.gridOffset;
        if (x2) newCoords.x2 = x2 + this.gridOffset;
        if (y2) newCoords.y2 = y2 + this.gridOffset;
        this.set(newCoords as Partial<this>);
        console.log("getCoords", this.getCoordinates());
        console.log("real coords", this.x1, this.y1, this.x2, this.y2);
        return this;
    };

    /**
     * Evenly distributes marcherPages along the line from start to finish. Distributes in the order of the marcherPages array.
     *
     * @param marcherPages The marcherPages to distribute
     * @returns The marcherPages distributed along the line from start to finish
     */
    distributeMarchers = (marcherPages: MarcherPage[]): MarcherPage[] => {
        if (!this.x1 || !this.x2 || !this.y1 || !this.y2) {
            console.error(
                "Line coordinates not set. Cannot distribute marchers"
            );
            return marcherPages;
        }
        const xDistance = (this.x2 - this.x1) / (marcherPages.length + 1);
        const yDistance = (this.y2 - this.y1) / (marcherPages.length + 1);

        const x1 = this.x1;
        const y1 = this.y1;

        const distributedMarcherPages = marcherPages.map(
            (marcherPage, index) => {
                return new MarcherPage({
                    ...marcherPage,
                    x: x1 + xDistance * index,
                    y: y1 + yDistance * index,
                });
            }
        );

        return distributedMarcherPages;
    };

    /**
     *
     * @param pointOne The first point in the line {x1, y1}. If not provided, it will not be modified/rounded
     * @param pointTwo The second point in the line {x2, y2}. If not provided, it will not be modified/rounded
     * @param denominator nearest 1/x step. 1 for nearest whole, 2 for nearest half etc. By default, 1. 0 to not round at all
     */
    setToNearestStep = ({
        pointOne,
        pointTwo,
        denominator = 1,
    }: {
        pointOne?: { x: number; y: number };
        pointTwo?: { x: number; y: number };
        denominator?: number;
    }) => {
        if (!this.canvas) {
            console.error(
                "Canvas object not defined in Line object. Cannot round coordinates"
            );
            return;
        }

        let newCoords: { x1?: number; y1?: number; x2?: number; y2?: number } =
            {};

        const roundPoint = (point: {
            x: number;
            y: number;
        }): { x: number; y: number } => {
            if (denominator > 0 && this.canvas) {
                const roundedPoint = this.canvas.getRoundedCoordinate({
                    x: point.x,
                    y: point.y,
                    denominator,
                });
                return { x: roundedPoint.x, y: roundedPoint.y };
            } else {
                return { x: point.x, y: point.y };
            }
        };

        if (pointOne) {
            const roundedPoint = roundPoint(pointOne);
            newCoords.x1 = roundedPoint.x;
            newCoords.y1 = roundedPoint.y;
        }
        if (pointTwo) {
            const roundedPoint = roundPoint(pointTwo);
            newCoords.x2 = roundedPoint.x;
            newCoords.y2 = roundedPoint.y;
        }
        this.coordsAreOffset = false;
        this.setCoordinates(newCoords);
    };

    /******************** DATABASE METHODS ********************/
    /**
     * Converts a single DatabaseLine object to a MarcherLine
     *
     * @param line The DatabaseLine object to convert to a MarcherLine
     * @returns The new MarcherLine object
     */
    static fromDatabaseLine = (line: DatabaseLine): MarcherLine => {
        return new MarcherLine({
            x1: line.x1,
            y1: line.y1,
            x2: line.x2,
            y2: line.y2,
            groupId: line.group_id,
            startPageId: line.start_page_id,
            endPageId: line.end_page_id,
        });
    };

    /**
     * Converts an array of DatabaseLines to an array of MarcherLines
     *
     * @param lines The array of DatabaseLines to convert to MarcherLines
     * @returns The array of new MarcherLines
     */
    static fromDatabaseLines = (lines: DatabaseLine[]): MarcherLine[] => {
        return lines.map((line) => MarcherLine.fromDatabaseLine(line));
    };

    /******************** COORDINATE GETTER AND SETTER OVERLOADS ********************/
    /**
     * DO NOT USE THIS PROPERTY
     *
     * For getting, use getCoordinates() instead. There is an offset that is applied to the line to make it appear centered on the grid.
     * Only the getCoordinates() method will return the correct coordinates.
     */
    get x1(): number | undefined {
        return super.x1;
    }

    /**
     *
     * For setting, use setCoordinates() instead. There is an offset that must be applied to the line to make it appear centered on the grid.
     * Only the setCoordinates() method will set the correct coordinates.
     */
    set x1(x1: number) {
        super.x1 = x1;
    }

    /**
     * DO NOT USE THIS PROPERTY
     *
     * For getting, use getCoordinates() instead. There is an offset that is applied to the line to make it appear centered on the grid.
     * Only the getCoordinates() method will return the correct coordinates.
     */
    get y1(): number | undefined {
        return super.y1;
    }

    /**
     *
     * For setting, use setCoordinates() instead. There is an offset that must be applied to the line to make it appear centered on the grid.
     * Only the setCoordinates() method will set the correct coordinates.
     */
    set y1(y1: number) {
        super.y1 = y1;
    }

    /**
     * DO NOT USE THIS PROPERTY
     *
     * For getting, use getCoordinates() instead. There is an offset that is applied to the line to make it appear centered on the grid.
     * Only the getCoordinates() method will return the correct coordinates.
     */
    get x2(): number | undefined {
        return super.x2;
    }

    /**
     *
     * For setting, use setCoordinates() instead. There is an offset that must be applied to the line to make it appear centered on the grid.
     * Only the setCoordinates() method will set the correct coordinates.
     */
    set x2(x2: number) {
        super.x2 = x2;
    }

    /**
     * DO NOT USE THIS PROPERTY
     *
     * For getting, use getCoordinates() instead. There is an offset that is applied to the line to make it appear centered on the grid.
     * Only the getCoordinates() method will return the correct coordinates.
     */
    get y2(): number | undefined {
        return super.y2;
    }

    /**
     *
     * For setting, use setCoordinates() instead. There is an offset that must be applied to the line to make it appear centered on the grid.
     * Only the setCoordinates() method will set the correct coordinates.
     */
    set y2(y2: number) {
        super.y2 = y2;
    }
}

/**
 * A type representing a MarcherLine in the database.
 *
 * This is the object that is stored in the database and is used to create a MarcherLine object.
 */
export type DatabaseLine = {
    id: number;
    notes: string;
    start_page_id: number;
    end_page_id: number;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    group_id: number;
    created_at: string;
    updated_at: string;
};

/**
 * A type representing the arguments needed to create a new MarcherLine in the database.
 */
export type NewLineArgs = {
    notes: string;
    start_page_id: number;
    end_page_id: number;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    group_id: number;
};

/**
 * A type representing the arguments needed to modify a MarcherLine in the database.
 */
export type ModifiedLineArgs = {
    /** The ID is not editable, this is how the line is found */
    id: number;
    notes?: string;
    start_page_id?: number;
    end_page_id?: number;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
    group_id?: number;
};
