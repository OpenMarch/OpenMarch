import { fabric } from "fabric";
import { Marcher } from "./Marcher";
import { MarcherPage } from "./MarcherPage";

/**
 * A CanvasMarcher is the object used on the canvas to represent a marcher.
 * It includes things such as the fabric objects and other canvas-specific properties.
 */
export class CanvasMarcher extends fabric.Group {
    // Styles
    private static readonly dotRadius = 5;
    private static readonly gridOffset = .5; // Stroke width is 1, so this is needed to center the dot on the grid
    private static readonly color = "red";
    static readonly fabricType = "CanvasMarcher";

    /** The Marcher object the CanvasMarcher is representing */
    marcherObj: Marcher;
    /** The MarcherPage object that this canvasMarcher is associated with */
    marcherPage: MarcherPage;

    /**
     * @param marcher The marcher object to create the canvas object from
     * @param marcherPage The MarcherPage object to set the initial coordinates from
     * @param canvas The canvas object to add the marcher to
     */
    constructor({ marcher, marcherPage, canvas }:
        { marcher: Marcher; marcherPage: MarcherPage; canvas: fabric.Canvas }) {
        super([
            new fabric.Circle({
                left: marcherPage.x,
                top: marcherPage.y,
                originX: "center",
                originY: "center",
                fill: CanvasMarcher.color,
                radius: CanvasMarcher.dotRadius,
            }),
            new fabric.Text(marcher.drill_number, {
                left: marcherPage.x,
                top: marcherPage.y - CanvasMarcher.dotRadius * 2.2,
                originX: "center",
                originY: "center",
                fontFamily: "courier new",
                fontWeight: "bold",
                fontSize: 14,
            })
        ],
            {
                type: CanvasMarcher.fabricType,
                hasControls: false,
                hasBorders: true,
                originX: "center",
                originY: "center",
                lockRotation: true,
                hoverCursor: "pointer",
            });

        if (marcher.id !== marcherPage.marcher_id)
            console.error("MarcherPage and Marcher id's do not match");

        this.marcherPage = marcherPage;
        this.marcherObj = marcher;
    }

    /******* CANVAS ACCESSORS *******/
    /** The canvas object that should be accessed inside the class. Checks that the canvas exists */
    private getCanvas() {
        const canvas = this.canvas;
        if (!canvas)
            throw new Error("Canvas does not exist - getCanvas: CanvasMarcher.ts");
        return canvas;
    }

    /******* PRIVATE METHODS *******/
    /**
     * The offset that the center of the dot is from the fabric group coordinate.
     */
    private getDotOffset(): { x: number, y: number } {
        const dot = this._objects.find(obj => 'radius' in obj) as fabric.Circle;

        if (dot.originX !== "center" || dot.originY !== "center")
            throw new Error("Dot origin is not center, this will lead to incorrect coords - setCoords: CanvasMarcher.ts");
        if (dot.left === undefined || dot.top === undefined) // 0 can lead to false negative, so need to check for undefined
            throw new Error("Dot does not have left or top properties - setCoords: CanvasMarcher.ts");

        return {
            x: dot.left,
            y: dot.top
        };
    }

    /**
     * Get the offset of the group object when multiple marchers are selected.
     * This is used to adjust the coordinates of the marcher when multiple marchers are selected,
     * as the coordinates are relative to the center of the group.
     *
     * @returns {multipleSelected: boolean, thisIsSelected: boolean, groupOffset: {x: number, y: number}}
     */
    private getGroupOffset(): { x: number, y: number } {
        const canvas = this.getCanvas();

        // Check if multiple marchers are selected and if the current marcher is one of them
        let groupOffset = { x: 0, y: 0 };
        const activeObjects = canvas.getActiveObjects();
        const isActiveObject = activeObjects.includes(this);
        if (activeObjects.length > 1 && isActiveObject) {
            const groupObject = canvas.getActiveObject();

            // Get the center of the group (when multiple objects are selected, the coordinates are relative to the group's center)
            groupOffset = {
                x: (groupObject?.left || 0) + ((groupObject?.width || 0) / 2),
                y: (groupObject?.top || 0) + ((groupObject?.height || 0) / 2)
            };
        }
        return groupOffset;
    }

    /**
     * Converts the coordinates from the database to the canvas coordinates of the dot/label fabric group.
     *
     * @param databaseCoords The coordinates from the database where the actual dot should be. I.e. a marcherPage object
     * @returns {x: number, y: number}, The coordinates of the center of the dot/label fabric group on the canvas.
     */
    private databaseCoordsToCanvasCoords(databaseCoords: { x: number, y: number }) {
        const groupOffset = this.getGroupOffset();
        const dotOffset = this.getDotOffset();

        const newCanvasCoords = {
            x: databaseCoords.x - groupOffset.x - dotOffset.x + CanvasMarcher.gridOffset,
            y: databaseCoords.y - groupOffset.y - dotOffset.y + CanvasMarcher.gridOffset
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
    private canvasCoordsToDatabaseCoords(canvasCoords: { x: number, y: number }) {
        const groupOffset = this.getGroupOffset();
        const dotOffset = this.getDotOffset();

        const databaseCoords = {
            x: canvasCoords.x + groupOffset.x + dotOffset.x - CanvasMarcher.gridOffset,
            y: canvasCoords.y + groupOffset.y + dotOffset.y - CanvasMarcher.gridOffset
        };
        return databaseCoords;
    }

    /******* PUBLIC METHODS *******/
    static isCanvasMarcher(object: fabric.Object): object is CanvasMarcher {
        return true;
    }
    /**
     * Sets the coordinates of the marcher on the canvas from a MarcherPage object.
     * This adjusts the position of the fabric group object to match the MarcherPage object.
     *
     * @param marcherPage The MarcherPage object to set the coordinates from.
     */
    setMarcherCoords(marcherPage: MarcherPage) {
        // Offset the new canvas coordinates (center of the dot/label group) by the dot's position
        const newCanvasCoords = this.databaseCoordsToCanvasCoords(marcherPage);

        if (!(this.left && this.top))
            throw new Error("Fabric group does not have left, top, width, or height properties - setCoords: CanvasMarcher.ts");
        this.marcherPage = marcherPage;
        this.left = newCanvasCoords.x;
        this.top = newCanvasCoords.y;

        // This is needed for the canvas to register the change - http://fabricjs.com/fabric-gotchas
        this.setCoords();
    }

    /**
     * Get the coordinates of the marcher on the canvas that should be stored in the database.
     * This is the actual position of the center of the dot, not the position of the fabric group.
     *
     * @returns {x: number, y: number}
     */
    getMarcherCoords(): { x: number, y: number } {
        if (!(this.left && this.top))
            throw new Error("Fabric group does not have left, top, width, or height properties - getCoords: CanvasMarcher.ts");
        const databaseCoords = this.canvasCoordsToDatabaseCoords({
            x: this.left,
            y: this.top
        })
        return databaseCoords;
    }

    /**
     *
     * @param marcherPage MarcherPage object to set the next animation to
     * @param tempo The tempo of the animation
     */
    setNextAnimation({ marcherPage, tempo }: { marcherPage: MarcherPage; tempo: number; }) {
        const duration = tempoToDuration(tempo);
        const groupOffset = this.getGroupOffset();
        const dotOffset = this.getDotOffset();

        const newCanvasCoords = {
            x: marcherPage.x - groupOffset.x - dotOffset.x + CanvasMarcher.gridOffset,
            y: marcherPage.y - groupOffset.y - dotOffset.y + CanvasMarcher.gridOffset
        };

        this.animate({
            left: newCanvasCoords.x,
            top: newCanvasCoords.y
        }, {
            duration: duration,
            onChange: this.getCanvas().renderAll.bind(this.getCanvas()),
            easing: linearEasing
        });
    }
}

export function tempoToDuration(tempo: number) {
    return 60 / tempo * 1000;
}

const linearEasing = function (t: number, b: number, c: number, d: number) {
    return c * t / d + b;
};
