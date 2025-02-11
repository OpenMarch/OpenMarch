import { fabric } from "fabric";
import Marcher from "../Marcher";
import MarcherPage from "../MarcherPage";
import FieldProperties from "@/global/classes/FieldProperties";
import { ActiveObjectArgs } from "@/components/canvas/CanvasConstants";
import * as Selectable from "./interfaces/Selectable";
import { DEFAULT_FIELD_THEME, FieldTheme } from "../FieldTheme";

export const DEFAULT_DOT_RADIUS = 5;

/**
 * A CanvasMarcher is the object used on the canvas to represent a marcher.
 * It includes things such as the fabric objects and other canvas-specific properties.
 */
export default class CanvasMarcher
    extends fabric.Group
    implements Selectable.ISelectable
{
    // Styles
    static theme: FieldTheme = DEFAULT_FIELD_THEME;
    private static readonly dotRadius = DEFAULT_DOT_RADIUS;
    private static readonly gridOffset = FieldProperties.GRID_STROKE_WIDTH / 2; // used to center the grid line
    readonly classString = Selectable.SelectableClasses.MARCHER;
    backgroundRectangle: fabric.Rect;

    readonly objectToGloballySelect: Marcher;

    /** The id of the marcher in the database */
    id: number;
    /** The Marcher object the CanvasMarcher is representing */
    marcherObj: Marcher;
    /** The MarcherPage object that this canvasMarcher is associated with */
    marcherPage: MarcherPage;

    /**
     * @param marcher The marcher object to create the canvas object from
     * @param marcherPage The MarcherPage object to set the initial coordinates from
     * @param dotRadius The radius of the dot
     * @param color The color of the dot
     */
    constructor({
        marcher,
        marcherPage,
        dotRadius = CanvasMarcher.dotRadius,
        color = CanvasMarcher.theme.defaultMarcher.fill,
    }: {
        marcher: Marcher;
        marcherPage: MarcherPage;
        dotRadius?: number;
        color?: string;
    }) {
        super(
            [
                new fabric.Circle({
                    left: marcherPage.x,
                    top: marcherPage.y,
                    originX: "center",
                    originY: "center",
                    stroke: CanvasMarcher.theme.defaultMarcher.outline,
                    fill: color,
                    radius: dotRadius,
                }),
                new fabric.Text(marcher.drill_number, {
                    left: marcherPage.x,
                    top: marcherPage.y - CanvasMarcher.dotRadius * 2.2,
                    originX: "center",
                    originY: "center",
                    fontFamily: "courier new",
                    fill: CanvasMarcher.theme.defaultMarcher.label,
                    fontWeight: "bold",
                    fontSize: 14,
                }),
            ],
            {
                hasControls: false,
                hasBorders: true,
                originX: "center",
                originY: "center",
                lockRotation: true,
                hoverCursor: "pointer",
                ...ActiveObjectArgs,
            },
        );
        // add a rectangle for stroke and fill
        this.backgroundRectangle = new fabric.Rect({
            left: this.left,
            top: this.top,
            originX: this.originX,
            originY: this.originY,
            fill: "transparent",
            width: this.width,
            height: this.height,
        });
        this.addWithUpdate(this.backgroundRectangle);

        if (marcher.id !== marcherPage.marcher_id)
            console.error("MarcherPage and Marcher id's do not match");
        this.id = marcher.id;
        this.objectToGloballySelect = marcher;

        this.marcherPage = marcherPage;
        this.marcherObj = marcher;

        // Set the initial coordinates to the appropriate offset
        const newCoords = this.databaseCoordsToCanvasCoords(marcherPage, false);
        this.left = newCoords.x;
        this.top = newCoords.y;
    }

    /******* CANVAS ACCESSORS *******/
    /** The canvas object that should be accessed inside the class. Checks that the canvas exists */
    private getCanvas() {
        const canvas = this.canvas;
        if (!canvas)
            throw new Error(
                "Canvas does not exist - getCanvas: CanvasMarcher.ts",
            );
        return canvas;
    }

    /******* PRIVATE METHODS *******/
    /**
     * The offset that the center of the dot is from the fabric group coordinate.
     */
    private getDotOffset(): { x: number; y: number } {
        const dot = this._objects.find(
            (obj) => "radius" in obj,
        ) as fabric.Circle;

        if (dot.originX !== "center" || dot.originY !== "center")
            throw new Error(
                "Dot origin is not center, this will lead to incorrect coords - setCoords: CanvasMarcher.ts",
            );
        if (dot.left === undefined || dot.top === undefined)
            // 0 can lead to false negative, so need to check for undefined
            throw new Error(
                "Dot does not have left or top properties - setCoords: CanvasMarcher.ts",
            );

        return {
            x: dot.left,
            y: dot.top,
        };
    }

    /**
     * Get the offset of the group object when multiple marchers are selected.
     * This is used to adjust the coordinates of the marcher when multiple marchers are selected,
     * as the coordinates are relative to the center of the group.
     *
     * @returns {multipleSelected: boolean, thisIsSelected: boolean, groupOffset: {x: number, y: number}}
     */
    private getGroupOffset(): { x: number; y: number } {
        const canvas = this.getCanvas();

        // Check if multiple marchers are selected and if the current marcher is one of them
        let groupOffset = { x: 0, y: 0 };
        const activeObjects = canvas.getActiveObjects();
        const isActiveObject = activeObjects.includes(this);
        if (activeObjects.length > 1 && isActiveObject) {
            const groupObject = canvas.getActiveObject();

            // Get the center of the group (when multiple objects are selected, the coordinates are relative to the group's center)
            groupOffset = {
                x: (groupObject?.left || 0) + (groupObject?.width || 0) / 2,
                y: (groupObject?.top || 0) + (groupObject?.height || 0) / 2,
            };
        }
        return groupOffset;
    }

    /**
     * Converts the coordinates from the database to the canvas coordinates of the dot/label fabric group.
     *
     * @param databaseCoords The coordinates from the database where the actual dot should be. I.e. a marcherPage object
     * @param _adjustForGroup Whether to adjust the coordinates for when multiple marchers are selected. This should always be true, except when setting the initial coordinates in this class's constructor.
     * @returns {x: number, y: number}, The coordinates of the center of the dot/label fabric group on the canvas.
     */
    private databaseCoordsToCanvasCoords(
        databaseCoords: {
            x: number;
            y: number;
        },
        _adjustForGroup = true,
    ) {
        let groupOffset = { x: 0, y: 0 };
        if (_adjustForGroup) groupOffset = this.getGroupOffset();
        const dotOffset = this.getDotOffset();

        const newCanvasCoords = {
            x:
                databaseCoords.x -
                groupOffset.x -
                dotOffset.x +
                CanvasMarcher.gridOffset,
            y:
                databaseCoords.y -
                groupOffset.y -
                dotOffset.y +
                CanvasMarcher.gridOffset,
        };
        return newCanvasCoords;
    }

    /**
     * Converts the coordinates from the canvas to the coordinates of the center of the dot which should be stored in
     * the database.
     *
     * @param canvasCoords The coordinates of the dot/label fabric group on the canvas.
     * @returns {x: number, y: number}, coordinates of the center of the dot which, should be stored in the database.
     */
    private canvasCoordsToDatabaseCoords(canvasCoords: {
        x: number;
        y: number;
    }) {
        const groupOffset = this.getGroupOffset();
        const dotOffset = this.getDotOffset();

        const databaseCoords = {
            x:
                canvasCoords.x +
                groupOffset.x +
                dotOffset.x -
                CanvasMarcher.gridOffset,
            y:
                canvasCoords.y +
                groupOffset.y +
                dotOffset.y -
                CanvasMarcher.gridOffset,
        };
        return databaseCoords;
    }

    /******* PUBLIC METHODS *******/
    static isCanvasMarcher(object: fabric.Object): object is CanvasMarcher {
        return object instanceof CanvasMarcher;
    }
    /**
     * Sets the coordinates of the marcher on the canvas from a MarcherPage object.
     * This adjusts the position of the fabric group object to match the MarcherPage object.
     *
     * @param marcherPage The MarcherPage object to set the coordinates from.
     */
    setMarcherCoords(marcherPage: MarcherPage, updateMarcherPageObj = true) {
        // Offset the new canvas coordinates (center of the dot/label group) by the dot's position
        const newCanvasCoords = this.databaseCoordsToCanvasCoords(marcherPage);

        if (this.left === undefined || this.top === undefined)
            throw new Error(
                "Fabric group does not have left and/or top properties - getCoords: CanvasMarcher.ts",
            );
        if (updateMarcherPageObj) this.marcherPage = marcherPage;
        this.left = newCanvasCoords.x;
        this.top = newCanvasCoords.y;

        // This is needed for the canvas to register the change - http://fabricjs.com/fabric-gotchas
        this.getCanvas().bringToFront(this);
        this.setCoords();
    }

    /**
     * Get the coordinates of the marcher on the canvas that should be stored in the database.
     * This is the actual position of the center of the dot, not the position of the fabric group.
     *
     * @returns {x: number, y: number}
     */
    getMarcherCoords(): { x: number; y: number } {
        if (this.left === undefined || this.top === undefined)
            throw new Error(
                "Fabric group does not have left and/or top properties - getCoords: CanvasMarcher.ts",
            );
        const databaseCoords = this.canvasCoordsToDatabaseCoords({
            x: this.left,
            y: this.top,
        });
        return databaseCoords;
    }

    /**
     * @param marcherPage MarcherPage object to set the next animation to
     * @param durationMilliseconds The duration of the animation in milliseconds
     */
    setNextAnimation({
        marcherPage,
        durationMilliseconds,
    }: {
        marcherPage: MarcherPage;
        durationMilliseconds: number;
    }) {
        const newCanvasCoords = this.databaseCoordsToCanvasCoords(marcherPage);
        const callback = this.animate(
            {
                left: newCanvasCoords.x,
                top: newCanvasCoords.y,
            },
            {
                duration: durationMilliseconds,
                onChange: () => {
                    this.getCanvas().requestRenderAll();
                    // Set coords so that objects offscreen are still rendered
                    this.setCoords();
                },
                easing: linearEasing,
            },
        );

        this.setCoords();

        return callback;
    }

    /**
     * Sets the marcher to be selectable and have controls.
     */
    makeSelectable() {
        this.set({
            selectable: true,
            hoverCursor: "pointer",
            evented: true,
        } as Partial<this>);
    }

    /**
     * Sets the marcher to be unselectable and not have controls.
     */
    makeUnselectable() {
        this.set({
            selectable: false,
            hoverCursor: "default",
            evented: false,
        } as Partial<this>);
    }
}

/**
 * Gets the duration (in milliseconds) of a single beat at a given tempo (beats per minute)
 *
 * @param tempo The tempo to convert to duration in beats per minute
 * @returns The duration of a single beat in milliseconds
 */
export function tempoToDuration(tempo: number) {
    return (60 / tempo) * 1000;
}

const linearEasing = function (t: number, b: number, c: number, d: number) {
    return (c * t) / d + b;
};
