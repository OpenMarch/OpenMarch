import { fabric } from "fabric";
import Marcher from "../Marcher";
import MarcherPage from "../MarcherPage";
import { FieldProperties } from "@openmarch/core";
import { ActiveObjectArgs } from "@/components/canvas/CanvasConstants";
import * as Selectable from "./interfaces/Selectable";
import { DEFAULT_FIELD_THEME, FieldTheme, rgbaToString } from "@openmarch/core";
import { UiSettings } from "@/stores/UiSettingsStore";
import OpenMarchCanvas from "./OpenMarchCanvas";
import {
    CoordinateLike,
    getRoundCoordinates2,
} from "@/utilities/CoordinateActions";
import {
    AppearanceModel,
    AppearanceModelOptional,
} from "electron/database/migrations/schema";

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
    dotObject: fabric.Object;
    private _locked: boolean = false;
    private _lockedReason: string = "";

    readonly objectToGloballySelect: Marcher;

    /** The id of the marcher in the database */
    id: number;
    /** The Marcher object the CanvasMarcher is representing */
    marcherObj: Marcher;
    /** The coordinate object that this canvasMarcher is associated with */
    coordinate: CoordinateLike;

    /** The appearances that are applied to the marcher in order of priority (highest priority first) */
    appearances: AppearanceModelOptional[] = [];
    /**
     * The current values of the appearance that are applied to the marcher.
     * This was derived from the appearances array ordered by priority.
     *
     * If null, the default theme values from the canvas are used.
     */
    currentAppearanceValues: AppearanceModelOptional = {
        visible: true,
        label_visible: true,
    };

    /**
     * Creates a marker shape based on the given parameters.
     * This is used by both the constructor and setAppearance for shape creation/updates.
     */
    private static createMarkerShape({
        shapeType,
        fillColor,
        outlineColor,
        outlineColorValue,
        coordinate,
        dotRadius,
    }: {
        shapeType: string;
        fillColor: string;
        outlineColor: string;
        outlineColorValue: { a: number } | null;
        coordinate: { x: number; y: number };
        dotRadius: number;
    }): fabric.Object {
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
            return new fabric.Rect({
                ...commonShapeProps,
                width: sideLength * 1.2,
                height: sideLength * 1.2,
            });
        } else if (shapeType === "triangle") {
            // Create an equilateral triangle
            const triangleRadius = dotRadius * 1.2; // Slightly larger to maintain visual weight
            return new fabric.Triangle({
                ...commonShapeProps,
                width: triangleRadius * 2,
                height: triangleRadius * Math.sqrt(3), // Height of equilateral triangle
            });
        } else if (shapeType === "x") {
            // Create an X shape using two crossing lines
            const xSize = dotRadius * 1.2;
            // Use fillColor for X stroke to ensure visibility, since X has no fill area
            // and outline color might be transparent
            const xStrokeColor =
                outlineColorValue && outlineColorValue.a > 0.1
                    ? outlineColor
                    : fillColor;
            const line1 = new fabric.Line([-xSize, -xSize, xSize, xSize], {
                stroke: xStrokeColor,
                strokeWidth: 2,
            });
            const line2 = new fabric.Line([-xSize, xSize, xSize, -xSize], {
                stroke: xStrokeColor,
                strokeWidth: 2,
            });
            return new fabric.Group([line1, line2], {
                ...commonShapeProps,
            });
        } else {
            // Default to circle
            return new fabric.Circle({
                ...commonShapeProps,
                radius: dotRadius,
            });
        }
    }

    /**
     * @param marcher The marcher object to create the canvas object from
     * @param marcherPage The MarcherPage object to set the initial coordinates from
     * @param dotRadius The radius of the dot
     * @param appearances The appearances to apply to the marcher in priority order
     */
    // eslint-disable-next-line max-lines-per-function
    constructor({
        marcher,
        coordinate,
        dotRadius = CanvasMarcher.dotRadius,
        appearances: appearancesInput,
    }: {
        marcher: Marcher;
        coordinate: CoordinateLike;
        dotRadius?: number;
        /** A single appearance or array of appearances in priority order (highest priority first) */
        appearances?: AppearanceModelOptional | AppearanceModelOptional[];
    }) {
        // Normalize to array
        const appearances = appearancesInput
            ? Array.isArray(appearancesInput)
                ? appearancesInput
                : [appearancesInput]
            : [];

        // Get first non-null values from appearances
        const fillColorValue =
            appearances.find((a) => a.fill_color != null)?.fill_color ?? null;
        const outlineColorValue =
            appearances.find((a) => a.outline_color != null)?.outline_color ??
            null;
        const shapeType =
            appearances.find((a) => a.shape_type != null)?.shape_type ??
            "circle";

        const fillColor = rgbaToString(
            fillColorValue || CanvasMarcher.theme.defaultMarcher.fill,
        );
        const outlineColor = rgbaToString(
            outlineColorValue || CanvasMarcher.theme.defaultMarcher.outline,
        );

        const markerShape = CanvasMarcher.createMarkerShape({
            shapeType,
            fillColor,
            outlineColor,
            outlineColorValue,
            coordinate,
            dotRadius,
        });

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
        this.appearances = appearances ?? [];

        // Get visibility values from appearances
        const visible = appearances.length > 0 ? appearances[0].visible : true;
        const labelVisible =
            appearances.length > 0 ? appearances[0].label_visible : true;
        const equipmentName =
            appearances.find((a) => a.equipment_name != null)?.equipment_name ??
            null;
        const equipmentState =
            appearances.find((a) => a.equipment_state != null)
                ?.equipment_state ?? null;

        // Initialize currentAppearanceValues with the values used in construction
        this.currentAppearanceValues = {
            fill_color: fillColorValue,
            outline_color: outlineColorValue,
            shape_type: shapeType,
            visible,
            label_visible: labelVisible,
            equipment_name: equipmentName,
            equipment_state: equipmentState,
        };

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
            visible: labelVisible === true,
        });

        // Apply visibility to the marcher
        const isVisible = visible === true;
        this.set({ visible: isVisible } as Partial<this>);
        this.dotObject.set({ visible: isVisible });

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

        this.refreshLockedStatus();
    }

    /**
     * Sets the appearance of the marcher by cascading through a list of appearances in priority order.
     * For each attribute, the first non-null value is used, falling back to the canvas default theme.
     *
     * @param appearancesInput A single appearance or array of appearances in priority order (highest priority first)
     */
    setAppearance(appearancesInput: AppearanceModel | AppearanceModel[]) {
        // Normalize to array
        const appearances = Array.isArray(appearancesInput)
            ? appearancesInput
            : [appearancesInput];

        // Helper to get first non-null/non-undefined value from appearances for a given key
        const getFirstValue = <K extends keyof AppearanceModel>(
            key: K,
        ): AppearanceModel[K] | null => {
            for (const appearance of appearances) {
                if (appearance[key] != null) {
                    return appearance[key];
                }
            }
            return null;
        };

        // Cascade through appearances to get first non-null value for each attribute
        const fillColorValue = getFirstValue("fill_color");
        const outlineColorValue = getFirstValue("outline_color");
        const shapeType = getFirstValue("shape_type") ?? "circle";
        const equipmentName = getFirstValue("equipment_name");
        const equipmentState = getFirstValue("equipment_state");

        // Visibility is always defined
        const visible = appearances.length > 0 ? appearances[0].visible : true;
        const labelVisible =
            appearances.length > 0 ? appearances[0].label_visible : true;

        // Store the appearances list
        this.appearances = appearances;

        // Apply fill and outline colors with theme fallback
        const fillColor = rgbaToString(
            fillColorValue || CanvasMarcher.theme.defaultMarcher.fill,
        );
        const outlineColor = rgbaToString(
            outlineColorValue || CanvasMarcher.theme.defaultMarcher.outline,
        );

        // Check if shape type has changed and needs to be recreated
        const currentShapeType =
            this.currentAppearanceValues.shape_type ?? "circle";
        if (shapeType !== currentShapeType) {
            // Remove the old shape from the group
            this.remove(this.dotObject);

            // Create the new shape at the current position
            const absoluteCoords = this.getAbsoluteCoords();
            const newShape = CanvasMarcher.createMarkerShape({
                shapeType,
                fillColor,
                outlineColor,
                outlineColorValue,
                coordinate: absoluteCoords,
                dotRadius: CanvasMarcher.dotRadius,
            });

            // Add the new shape and update the reference
            this.add(newShape);
            this.dotObject = newShape;

            // Re-add background rectangle to ensure proper layering
            this.remove(this.backgroundRectangle);
            this.add(this.backgroundRectangle);
        } else {
            // Just update colors on the existing shape
            // Handle X shape specially since it's a group with lines
            if (shapeType === "x" && this.dotObject instanceof fabric.Group) {
                const xStrokeColor =
                    outlineColorValue && outlineColorValue.a > 0.1
                        ? outlineColor
                        : fillColor;
                this.dotObject.getObjects().forEach((line) => {
                    line.set({ stroke: xStrokeColor });
                });
            } else {
                this.dotObject.set({
                    fill: fillColor,
                    stroke: outlineColor,
                });
            }
        }

        // Update visibility of the marcher marker
        const isVisible = visible === true;
        this.set({ visible: isVisible } as Partial<this>);
        this.dotObject.set({ visible: isVisible });

        // Update label visibility
        const isLabelVisible = labelVisible === true;
        this.textLabel.set({ visible: isLabelVisible });

        this.currentAppearanceValues = {
            fill_color: fillColorValue,
            outline_color: outlineColorValue,
            shape_type: shapeType,
            visible,
            label_visible: labelVisible,
            equipment_name: equipmentName,
            equipment_state: equipmentState,
        };

        // Request canvas re-render if canvas exists
        if (this.canvas) {
            this.canvas.requestRenderAll();
        }
    }

    refreshLockedStatus() {
        if (this.coordinate.page_id == null || this.marcherObj.id == null) {
            return;
        }
        this._locked = this.coordinate.isLocked ?? false;
        this._lockedReason = this.coordinate.lockedReason ?? "";
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
            left: canvas.uiSettings.lockX
                ? currentCanvasCoords.x
                : roundedCanvasCoords.x,
            top: canvas.uiSettings.lockY
                ? currentCanvasCoords.y
                : roundedCanvasCoords.y,
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
        marcher: Pick<Marcher, "id">,
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
        if (!this.canvas) return;

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
        this.refreshLockedStatus();
    }

    /**
     * Get the absolute coordinates of the dotObject (the marcher marker)
     * Note, this does not include the grid offset or coordinate rounding. Use getMarcherCoords instead.
     *
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
     * Get the coordinates of the marcher on the database that should be stored in the database.
     * This is the actual position of the center of the dot, not the position of the fabric group.
     *
     * Clone of getMarcherCoords
     *
     * @returns {x: number, y: number}
     */
    getDatabaseCoords(uiSettings?: UiSettings): { x: number; y: number } {
        return this.getMarcherCoords(uiSettings);
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
     * A lightweight method to update the marcher's position on the canvas during live animation.
     * This method avoids the overhead of `setMarcherCoords` and is intended for use within an animation loop.
     *
     * @param coords The new coordinates (in database terms) to set the marcher to.
     */
    setLiveCoordinates(coords: { x: number; y: number }) {
        const newCanvasCoords = this.databaseCoordsToCanvasCoords(coords);

        this.left = newCanvasCoords.x;
        this.top = newCanvasCoords.y;

        this.updateTextLabelPosition();
        this.setCoords();
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

    get locked() {
        return this._locked;
    }

    get lockedReason() {
        return this._lockedReason;
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
