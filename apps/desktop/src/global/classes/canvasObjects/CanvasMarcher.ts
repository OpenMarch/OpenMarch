import { fabric } from "fabric";
import Marcher from "../Marcher";
import MarcherPage from "../MarcherPage";
import FieldProperties from "@/global/classes/FieldProperties";
import { ActiveObjectArgs } from "@/components/canvas/CanvasConstants";
import * as Selectable from "./interfaces/Selectable";
import { DEFAULT_FIELD_THEME, FieldTheme, rgbaToString } from "../FieldTheme";
import { SectionAppearance } from "../SectionAppearance";
import { UiSettings } from "@/stores/UiSettingsStore";
import OpenMarchCanvas from "./OpenMarchCanvas";
import { getRoundCoordinates2 } from "@/utilities/CoordinateActions";

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
        sectionAppearance,
        color,
    }: {
        marcher: Marcher;
        marcherPage: MarcherPage;
        dotRadius?: number;
        color?: string;
        sectionAppearance?: SectionAppearance;
    }) {
        // Use section-specific colors if available
        const fillColor =
            color ||
            rgbaToString(
                sectionAppearance?.fill_color ||
                    CanvasMarcher.theme.defaultMarcher.fill,
            );
        const outlineColor = rgbaToString(
            sectionAppearance?.outline_color ||
                CanvasMarcher.theme.defaultMarcher.outline,
        );

        // Determine shape type from section appearance
        const shapeType = sectionAppearance?.shape_type || "circle";

        // Create the appropriate shape based on shapeType
        let markerShape: fabric.Object;

        const commonShapeProps = {
            left: marcherPage.x,
            top: marcherPage.y,
            originX: "center",
            originY: "center",
            stroke: outlineColor,
            fill: fillColor,
        };

        if (shapeType === "square") {
            const sideLength = dotRadius * Math.sqrt(Math.PI);
            markerShape = new fabric.Rect({
                ...commonShapeProps,
                width: sideLength * 1.2,
                height: sideLength * 1.2,
            });
        } else if (shapeType === "triangle") {
            // Create an equilateral triangle
            const triangleRadius = dotRadius * 1.2; // Slightly larger to maintain visual weight
            markerShape = new fabric.Triangle({
                ...commonShapeProps,
                width: triangleRadius * 2,
                height: triangleRadius * Math.sqrt(3), // Height of equilateral triangle
            });
        } else if (shapeType === "x") {
            // Create an X shape using two crossing lines
            const xSize = dotRadius * 1.2;
            const line1 = new fabric.Line([-xSize, -xSize, xSize, xSize], {
                stroke: outlineColor,
                strokeWidth: 2,
            });
            const line2 = new fabric.Line([-xSize, xSize, xSize, -xSize], {
                stroke: outlineColor,
                strokeWidth: 2,
            });
            markerShape = new fabric.Group([line1, line2], {
                ...commonShapeProps,
            });
        } else {
            // Default to circle
            markerShape = new fabric.Circle({
                ...commonShapeProps,
                radius: dotRadius,
            });
        }

        super(
            [
                markerShape,
                new fabric.Text(marcher.drill_number, {
                    left: marcherPage.x,
                    top: marcherPage.y - CanvasMarcher.dotRadius * 2.2,
                    originX: "center",
                    originY: "center",
                    fontFamily: "courier new",
                    fill: rgbaToString(
                        CanvasMarcher.theme.defaultMarcher.label,
                    ),
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

        // Add moving event listener for real-time coordinate snapping
        this.on("moving", this.handleMoving.bind(this));
    }

    /**
     * Handles the moving event to apply coordinate rounding in real-time
     * @param event The fabric event object
     */
    private handleMoving(event: fabric.IEvent<MouseEvent>) {
        const canvas = this.getCanvas() as OpenMarchCanvas;
        if (!canvas.uiSettings?.coordinateRounding) return;

        // Get current canvas coordinates
        const currentCanvasCoords = {
            x: this.left || 0,
            y: this.top || 0,
        };

        // Convert to database coordinates
        const databaseCoords =
            this.canvasCoordsToDatabaseCoords(currentCanvasCoords);

        // Apply rounding if shift is not held
        const roundedDatabaseCoords = event.e.shiftKey
            ? databaseCoords
            : this.roundCoordinates(databaseCoords, canvas.uiSettings);

        // Convert back to canvas coordinates
        const roundedCanvasCoords = this.databaseCoordsToCanvasCoords(
            roundedDatabaseCoords,
        );

        // Update position with proper typing
        this.set({
            left: roundedCanvasCoords.x,
            top: roundedCanvasCoords.y,
        } as Partial<this>);
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
        // Get the first object, which should be the marker shape (circle, square, or triangle)
        const shape = this._objects[0] as fabric.Object;

        if (!shape) {
            throw new Error(
                "Marker shape not found - getDotOffset: CanvasMarcher.ts",
            );
        }

        if (shape.originX !== "center" || shape.originY !== "center")
            throw new Error(
                "Shape origin is not center, this will lead to incorrect coords - getDotOffset: CanvasMarcher.ts",
            );

        if (shape.left === undefined || shape.top === undefined)
            // 0 can lead to false negative, so need to check for undefined
            throw new Error(
                "Shape does not have left or top properties - getDotOffset: CanvasMarcher.ts",
            );

        return {
            x: shape.left,
            y: shape.top,
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

    /**
     * Rounds coordinates based on UI settings if rounding is enabled
     * @param coords The coordinates to round
     * @param uiSettings The UI settings containing rounding configuration
     * @returns The rounded coordinates
     */
    private roundCoordinates(
        coords: { x: number; y: number },
        uiSettings: UiSettings,
    ): { x: number; y: number } {
        const output = getRoundCoordinates2({
            coordinate: { xPixels: coords.x, yPixels: coords.y },
            fieldProperties: (this.getCanvas() as OpenMarchCanvas)
                .fieldProperties,
            uiSettings,
        });
        return { x: output.xPixels, y: output.yPixels };
    }

    /******* PUBLIC METHODS *******/
    static isCanvasMarcher(object: fabric.Object): object is CanvasMarcher {
        return object instanceof CanvasMarcher;
    }

    static getCanvasMarcherForMarcher(
        canvas: fabric.Canvas,
        marcher: Marcher,
    ): CanvasMarcher | undefined {
        return canvas
            .getObjects()
            .find(
                (obj): obj is CanvasMarcher =>
                    CanvasMarcher.isCanvasMarcher(obj) && obj.id === marcher.id,
            );
    }

    /**
     * Sets the coordinates of the marcher on the canvas from a MarcherPage object.
     * This adjusts the position of the fabric group object to match the MarcherPage object.
     *
     * @param marcherPage The MarcherPage object to set the coordinates from.
     * @param uiSettings Optional UI settings for coordinate rounding
     */
    setMarcherCoords(
        marcherPage: MarcherPage,
        updateMarcherPageObj = true,
        uiSettings?: UiSettings,
    ) {
        // Apply coordinate rounding if UI settings are provided
        const coordsToUse = uiSettings
            ? this.roundCoordinates(marcherPage, uiSettings)
            : marcherPage;

        // Offset the new canvas coordinates (center of the dot/label group) by the dot's position
        const newCanvasCoords = this.databaseCoordsToCanvasCoords(coordsToUse);

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
    getMarcherCoords(uiSettings?: UiSettings): { x: number; y: number } {
        if (this.left === undefined || this.top === undefined)
            throw new Error(
                "Fabric group does not have left and/or top properties - getCoords: CanvasMarcher.ts",
            );
        const databaseCoords = this.canvasCoordsToDatabaseCoords({
            x: this.left,
            y: this.top,
        });

        // Apply coordinate rounding if UI settings are provided
        if (uiSettings) {
            return this.roundCoordinates(databaseCoords, uiSettings);
        }

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
