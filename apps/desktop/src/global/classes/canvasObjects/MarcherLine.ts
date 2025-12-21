import { fabric } from "fabric";
import * as CanvasConstants from "@/components/canvas/CanvasConstants";
import OpenMarchCanvas from "./OpenMarchCanvas";
import { CoordinateLike } from "@/utilities/CoordinateActions";
import {
    DEFAULT_FIELD_THEME,
    FieldProperties,
    rgbaToString,
} from "@openmarch/core";

/**
 * A MarcherLine is drawn by a user and marchers are evenly spaced along it.
 */
export default class MarcherLine extends fabric.Line {
    canvas?: OpenMarchCanvas;
    /** The ID of the group that this MarcherLine belongs to */
    groupId?: number;
    /** The ID of the MarcherLine in the database. If the ID is -1, that means the line is not in the database */
    id: number;
    /** The notes for the MarcherLine */
    notes: string = "";
    /** The refresh method is used to update the store with the new items from the database. */
    static refresh: () => void = () => {
        console.error(
            "MarcherLine refresh method not set. The store will not update properly.",
        );
    };

    readonly objectToGloballySelect = this;

    readonly gridOffset: number;
    protected coordsAreOffset = false;

    constructor({
        id = -1,
        x1,
        y1,
        x2,
        y2,
        groupId,
        color = rgbaToString(DEFAULT_FIELD_THEME.shape),
        startPageId,
        endPageId,
        notes = "",
    }: {
        id?: number;
        x1: number;
        y1: number;
        x2: number;
        y2: number;
        color?: string;
        groupId?: number;
        startPageId: number;
        endPageId: number;
        notes?: string;
    }) {
        super([x1, y1, x2, y2], {
            ...CanvasConstants.HasControls,
            strokeWidth: 3,
            fill: color,
            stroke: color,
            originX: "center",
            originY: "center",
            hoverCursor: "default",
        });
        this.id = id;
        this.groupId = groupId;
        this.gridOffset = FieldProperties.GRID_STROKE_WIDTH / 2;
        this.notes = notes;
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
            x1: this.x1 - this.gridOffset,
            y1: this.y1 - this.gridOffset,
            x2: this.x2 - this.gridOffset,
            y2: this.y2 - this.gridOffset,
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
        return this;
    };

    /**
     * Evenly distributes coordinates along the line from start to finish. Distributes in the order of the coordinates array.
     *
     * @param coordinates The coordinates to distribute
     * @returns The coordinates distributed along the line from start to finish
     */
    distributeMarchers = <T extends CoordinateLike>(coordinates: T[]): T[] => {
        if (
            this.x1 === undefined ||
            this.y1 === undefined ||
            this.x2 === undefined ||
            this.y2 === undefined
        ) {
            console.error(
                "Line coordinates not set. Cannot distribute marchers",
            );
            return coordinates;
        }
        const xDistance = (this.x2 - this.x1) / (coordinates.length - 1);
        const yDistance = (this.y2 - this.y1) / (coordinates.length - 1);

        const x1 = this.x1;
        const y1 = this.y1;

        return coordinates.map((coordinate, index) => ({
            ...coordinate,
            x: x1 + xDistance * index,
            y: y1 + yDistance * index,
        })) as T[];
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
                "Canvas object not defined in Line object. Cannot round coordinates",
            );
            return;
        }

        const newCoords: { x1?: number; y1?: number; x2?: number; y2?: number } =
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

    /**
     * Sets whether the line is editable or not.
     */
    set editable(value: boolean) {
        if (value) this.set(CanvasConstants.HasControls as Partial<this>);
        else this.set(CanvasConstants.NoControls as Partial<this>);
    }

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
