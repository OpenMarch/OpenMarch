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
import {
    CoordinateLike,
    getRoundCoordinates2,
} from "@/utilities/CoordinateActions";

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
    textLabel: fabric.Text;

    /** The object that represents the dot on the canvas */
    readonly dotObject: fabric.Object;

    readonly objectToGloballySelect: Marcher;

    /** The id of the marcher in the database */
    id: number;
    /** The Marcher object the CanvasMarcher is representing */
    marcherObj: Marcher;
    /** The coordinate object that this canvasMarcher is associated with */
    coordinate: CoordinateLike;

    /**
     * @param marcher The marcher object to create the canvas object from
     * @param marcherPage The MarcherPage object to set the initial coordinates from
     * @param dotRadius The radius of the dot
     * @param color The color of the dot
     */
    constructor({
        marcher,
        coordinate,
        dotRadius = CanvasMarcher.dotRadius,
        sectionAppearance,
        color,
    }: {
        marcher: Marcher;
        coordinate: CoordinateLike;
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
            left: coordinate.x,
            top: coordinate.y,
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

        super([markerShape], {
            hasControls: false,
            hasBorders: true,
            originX: "center",
            originY: "center",
            // lockRotation: true,
            hoverCursor: "pointer",
            ...ActiveObjectArgs,
        });
        this.dotObject = markerShape;

        this.textLabel = new fabric.Text(marcher.drill_number, {
            left: coordinate.x,
            top: coordinate.y - CanvasMarcher.dotRadius * 2.2,
            originX: "center",
            originY: "center",
            fontFamily: "courier new",
            fill: rgbaToString(CanvasMarcher.theme.defaultMarcher.label),
            fontWeight: "bold",
            fontSize: 14,
            selectable: false,
            hasControls: false,
            hasBorders: false,
        });

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

        this.id = marcher.id;
        this.objectToGloballySelect = marcher;

        this.coordinate = coordinate;
        this.marcherObj = marcher;

        // Set the initial coordinates to the appropriate offset
        const newCoords = this.databaseCoordsToCanvasCoords(coordinate);
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
        const currentCanvasCoords = this.getAbsoluteCoords();

        // Apply rounding if shift is not held
        const roundedDatabaseCoords = event.e.shiftKey
            ? currentCanvasCoords
            : this.roundCoordinates(currentCanvasCoords, canvas.uiSettings);

        // Convert back to canvas coordinates
        const roundedCanvasCoords = this.databaseCoordsToCanvasCoords(
            roundedDatabaseCoords,
        );

        // Update position with proper typing
        this.set({
            left: roundedCanvasCoords.x,
            top: roundedCanvasCoords.y,
        } as Partial<this>);
        this.updateTextLabelPosition();
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
        const shape = this.dotObject;

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

        let yOffset = 0;
        // if (this.group) {
        //     const groupTransform = this.group.calcTransformMatrix();
        //     const scaleY = groupTransform[3];
        //     console.log("shape.top", shape.top! - shape.height!);
        //     yOffset =
        //         scaleY *
        //         (shape.height! - shape.getBoundingRect(false, false).top!);
        //     console.log("yOffset", yOffset);
        // }

        return {
            x: shape.left,
            y: shape.top + yOffset,
        };
    }

    /**
     * Converts the coordinates from the database to the canvas coordinates of the dot/label fabric group.
     *
     * @param databaseCoords The coordinates from the database where the actual dot should be. I.e. a marcherPage object
     * @returns {x: number, y: number}, The coordinates of the center of the dot/label fabric group on the canvas.
     */
    private databaseCoordsToCanvasCoords(databaseCoords: {
        x: number;
        y: number;
    }) {
        const dotOffset = this.getDotOffset();

        // The absolute position of the dot on the canvas
        const absoluteDotPosition = {
            x: databaseCoords.x + CanvasMarcher.gridOffset,
            y: databaseCoords.y + CanvasMarcher.gridOffset,
        };

        // If the object is in a group, we need to calculate the position relative to the group
        if (this.group) {
            // Get the inverse transform of the group
            const groupTransform = this.group.calcTransformMatrix();
            const invertedGroupTransform =
                fabric.util.invertTransform(groupTransform);

            // Transform the absolute dot position to be relative to the group
            const relativeDotPosition = fabric.util.transformPoint(
                new fabric.Point(absoluteDotPosition.x, absoluteDotPosition.y),
                invertedGroupTransform,
            );

            // The group's position will be set to the relative dot position, offset by the dot's position within the group
            const groupAngle = this.group.angle || 0;
            let rotatedDotOffset = dotOffset;
            // if (groupAngle !== 0) {
            const angleRad = fabric.util.degreesToRadians(groupAngle);
            const cos = Math.cos(angleRad);
            const sin = Math.sin(angleRad);

            // Rotate the dot offset by the group's angle
            rotatedDotOffset = {
                x: dotOffset.x * cos - dotOffset.y * sin,
                y: dotOffset.x * sin - dotOffset.y * cos,
            };

            return {
                x: relativeDotPosition.x + rotatedDotOffset.x,
                y: relativeDotPosition.y + rotatedDotOffset.y,
            };
        }

        // If not in a group, the group's position is the absolute dot position, offset by the dot's position within the group
        return {
            x: absoluteDotPosition.x - dotOffset.x,
            y: absoluteDotPosition.y - dotOffset.y,
        };
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
     * @param coordinate The MarcherPage object to set the coordinates from.
     * @param uiSettings Optional UI settings for coordinate rounding
     */
    setMarcherCoords(
        coordinate: CoordinateLike,
        updateMarcherPageObj = true,
        uiSettings?: UiSettings,
    ) {
        // Apply coordinate rounding if UI settings are provided
        const coordsToUse = uiSettings
            ? this.roundCoordinates(coordinate, uiSettings)
            : coordinate;

        // Offset the new canvas coordinates (center of the dot/label group) by the dot's position
        const newCanvasCoords = this.databaseCoordsToCanvasCoords(coordsToUse);

        if (this.left === undefined || this.top === undefined)
            throw new Error(
                "Fabric group does not have left and/or top properties - getCoords: CanvasMarcher.ts",
            );
        if (updateMarcherPageObj) this.coordinate = coordinate;
        this.left = newCanvasCoords.x;
        this.top = newCanvasCoords.y;

        // This is needed for the canvas to register the change - http://fabricjs.com/fabric-gotchas
        this.getCanvas().bringToFront(this);
        this.setCoords();
    }

    /**
     * Get the absolute coordinates of the dotObject (the marcher marker)
     * @returns {x: number, y: number}
     */
    getAbsoluteCoords() {
        // Get the center point of the dotObject (the marcher marker)
        const transformMatrix = this.dotObject.calcTransformMatrix();
        const x = transformMatrix[4];
        const y = transformMatrix[5];

        return { x, y };
    }

    /**
     * Updates the position of the text label to follow the dot.
     */
    updateTextLabelPosition() {
        const absoluteCoords = this.getAbsoluteCoords();
        this.textLabel.set({
            left: absoluteCoords.x,
            top: absoluteCoords.y - CanvasMarcher.dotRadius * 2.2,
        });
        this.textLabel.setCoords();
    }

    /**
     * Overrides the default setCoords to update the text label position.
     * @returns {this}
     */
    setCoords() {
        super.setCoords();
        if (this.textLabel) {
            this.updateTextLabelPosition();
        }
        return this;
    }

    /**
     * Get the coordinates of the marcher on the canvas that should be stored in the database.
     * This is the actual position of the center of the dot, not the position of the fabric group.
     *
     * @returns {x: number, y: number}
     */
    getMarcherCoords(uiSettings?: UiSettings): { x: number; y: number } {
        const databaseCoords = this.getAbsoluteCoords();

        // Apply coordinate rounding if UI settings are provided
        if (uiSettings) {
            return this.roundCoordinates(databaseCoords, uiSettings);
        }

        return {
            x: databaseCoords.x - CanvasMarcher.gridOffset,
            y: databaseCoords.y - CanvasMarcher.gridOffset,
        };
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

    /**
     * Overrides the scale method to prevent scaling of CanvasMarcher objects.
     * Calling this method will have no effect.
     */
    scale(_value: number): this {
        // Prevent scaling
        return this;
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
