import { fabric } from "fabric";
import CanvasMarcher from "./CanvasMarcher";
import StaticCanvasMarcher from "./StaticCanvasMarcher";
import { Pathway } from "./Pathway";
import {
    FieldProperties,
    getYardNumberCoordinates,
} from "@/global/classes/FieldProperties";
import CanvasListeners from "./listeners/CanvasListeners";
import Marcher from "@/global/classes/Marcher";
import { UiSettings } from "@/global/Interfaces";
import MarcherPage from "@/global/classes/MarcherPage";
import { ActiveObjectArgs } from "./CanvasConstants";
import * as CoordinateActions from "@/utilities/CoordinateActions";
import Page from "@/global/classes/Page";

/**
 * A custom class to extend the fabric.js canvas for OpenMarch.
 */
export default class OpenMarchCanvas extends fabric.Canvas {
    /** The drag start time is used to determine if the mouse was clicked or dragged */
    readonly DRAG_TIMER_MILLISECONDS = 300;
    /** The distance threshold is used to determine if the mouse was clicked or dragged */
    readonly DISTANCE_THRESHOLD = 20;

    /**
     * This lock prevents infinite loops when selecting marchers.
     * Set it to true when changing selection, and check that this is false before handling selection.
     * Set it to false after making selection
     */
    handleSelectLock = false;
    /** Denotes whether the Canvas itself is being dragged by the user to pan the view */
    isDragging = false;
    /** The point where the user's mouse was when they started dragging the canvas. This is used to adjust the viewport transform. */
    panDragStartPos: { x: number; y: number } = { x: 0, y: 0 };
    /** The time and the position of the user's mouse when selecting a fabric object */
    selectDragStart: { x: number; y: number; time: number } = {
        x: 0,
        y: 0,
        time: 0,
    };
    /** All of the marchers that are selected in the selectedMarcher Context  */
    globalSelectedMarchers: Marcher[] = [];
    /** The timeout for when object caching should be re-enabled */
    private _zoomTimeout: NodeJS.Timeout | undefined;
    private _uiSettings: UiSettings;

    // TODO - not sure what either of these are for. I had them on the Canvas in commit 4023b18
    perfLimitSizeTotal = 225000000;
    maxCacheSideLimit = 11000;

    /** The FieldProperties this OpenMarchCanvas has been built on */
    fieldProperties: FieldProperties;
    /** The current page this canvas is on */
    currentPage: Page;

    /**
     * Intended to set the selected marchers in the useSelectedMarchers context.
     * This must be set and updated in a React component in a useEffect hook
     */
    setGlobalsSelectedMarchers: (marchers: Marcher[]) => void = (
        marchers: any
    ) => {
        console.error(
            "setGlobalsSelectedMarchers function not set. The canvas will not work as expected"
        );
    };

    /**
     * The reference to the grid (the lines on the field) object to use for caching
     * This is needed to disable object caching while zooming, which greatly improves responsiveness.
     */
    staticGridRef: fabric.Group;

    constructor({
        canvasRef,
        fieldProperties,
        uiSettings,
        currentPage,
        listeners,
    }: {
        canvasRef: HTMLCanvasElement | null;
        fieldProperties: FieldProperties;
        uiSettings: UiSettings;
        currentPage: Page;
        listeners?: CanvasListeners;
    }) {
        super(canvasRef, {
            // TODO - why are these here from 4023b18
            // selectionColor: "white",
            // selectionLineWidth: 8,
            selectionColor: "rgba(0, 0, 255, 0.2)",
            selectionBorderColor: "rgba(0, 0, 255, 1)",
            selectionLineWidth: 2,
            fireRightClick: true, // Allow right click events
            stopContextMenu: true, // Prevent right click context menu
        });

        this.currentPage = currentPage;

        // Set canvas size
        this.refreshCanvasSize();
        // Update canvas size on window resize
        window.addEventListener("resize", (evt) => {
            this.refreshCanvasSize();
        });

        this.fieldProperties = fieldProperties;

        // create the grid
        this.staticGridRef = this.createFieldGrid({});
        // Object caching is set to true to make the grid sharper
        this.staticGridRef.objectCaching = true;
        // add the grid to the canvas
        this.add(this.staticGridRef);

        // The mouse wheel event should never be changed
        this.on("mouse:wheel", this.handleMouseWheel);

        // Set the UI settings
        this._uiSettings = uiSettings;

        if (listeners) this.setListeners(listeners);

        this.renderAll();
    }

    /******************* INSTANCE METHODS ******************/
    /**
     * Refreshes the size of the canvas to fit the window.
     */
    refreshCanvasSize() {
        this.setWidth(window.innerWidth);
        this.setHeight(window.innerHeight);
    }

    /** Set this function when setting the listeners, then call it before switching to other listeners */
    cleanupListener?: () => void;

    /**
     * Set the listeners on the canvas. This should be changed based on the cursor mode.
     *
     * @param listeners The listeners to set on the canvas
     * @param clearListeners Whether or not to clear the listeners before setting the new ones. Default is true
     */
    setListeners(listeners: CanvasListeners, clearListeners = true) {
        clearListeners && this.clearListeners();

        this.cleanupListener = listeners.cleanupListener;
        this.on("object:modified", listeners.handleObjectModified);
        this.on("selection:updated", listeners.handleSelect);
        this.on("selection:created", listeners.handleSelect);
        this.on("selection:cleared", listeners.handleDeselect);

        this.on("mouse:down", listeners.handleMouseDown);
        this.on("mouse:move", listeners.handleMouseMove);
        this.on("mouse:up", listeners.handleMouseUp);
    }

    /**
     * Clear all listeners on the canvas
     */
    clearListeners() {
        this.cleanupListener && this.cleanupListener();
        this.cleanupListener = undefined;
        this.off("object:modified");
        this.off("selection:updated");
        this.off("selection:created");
        this.off("selection:cleared");

        this.off("mouse:down");
        this.off("mouse:move");
        this.off("mouse:up");
    }

    /**
     * Set the given CanvasMarchers as the selected marchers both in the app and on the Canvas
     *
     * @param newSelectedCanvasMarchers The new selected CanvasMarchers
     * @param globalSelectedMarchers The current selected marchers in the app
     */
    setSelectedCanvasMarchers = (
        newSelectedCanvasMarchers: CanvasMarcher[]
    ) => {
        if (this.handleSelectLock) return;
        this.handleSelectLock = true;

        // Check if all the marchers are already selected. If they are, return
        // This is to prevent infinite loops with react state
        const newMarcherObjs: Marcher[] = newSelectedCanvasMarchers.map(
            (canvasMarcher) => canvasMarcher.marcherObj
        );
        if (
            !this.marchersAreAllSelected({
                marchersToLookFor: newMarcherObjs,
            })
        ) {
            // Not all marchers are selected, so update the selected marchers

            if (newSelectedCanvasMarchers.length > 1) {
                // The current active object needs to be discarded before creating a new active selection
                // This is due to buggy behavior in Fabric.js
                this.discardActiveObject();

                const activeSelection = new fabric.ActiveSelection(
                    newSelectedCanvasMarchers,
                    {
                        canvas: this,
                        ...ActiveObjectArgs,
                    }
                );

                this.setActiveObject(activeSelection);
                this.requestRenderAll();
            }

            const newSelectedMarchers = newSelectedCanvasMarchers.map(
                (newSelectedCanvasMarcher) =>
                    newSelectedCanvasMarcher.marcherObj
            );
            this.setGlobalsSelectedMarchers(newSelectedMarchers);
        }

        // is this safe? Could there be a point when this is set to false before the handler has a chance to run?
        this.handleSelectLock = false;
    };

    /**
     * Sets given object as the only active object on canvas
     * This is an overload of the fabric.Canvas method to set the lockMovementX and lockMovementY properties
     *
     * @param object — Object to set as an active one
     * @param e — Event (passed along when firing "object:selected")
     * @return — thisArg
     */
    setActiveObject(object: fabric.Object, e?: Event): fabric.Canvas {
        object.lockMovementX = this.uiSettings.lockX;
        object.lockMovementY = this.uiSettings.lockY;
        return super.setActiveObject(object, e);
    }

    resetCursorsToDefault = () => {
        this.setCursor("default");
        this.defaultCursor = "default";
        this.moveCursor = "move";
        this.notAllowedCursor = "not-allowed";
        this.freeDrawingCursor = "crosshair";
    };

    /******* Marcher Functions *******/
    /**
     * Render the marchers for the current page
     *
     * @param selectedMarcherPages The marcher pages to render (must be filtered by the selected page)
     * @param allMarchers All marchers in the drill
     */
    renderMarchers = ({
        selectedMarcherPages,
        allMarchers,
    }: {
        selectedMarcherPages: MarcherPage[];
        allMarchers: Marcher[];
    }) => {
        // Get the canvas marchers on the canvas
        const curCanvasMarchers: CanvasMarcher[] = this.getCanvasMarchers();

        selectedMarcherPages.forEach((marcherPage) => {
            const curCanvasMarcher = curCanvasMarchers.find(
                (canvasMarcher) =>
                    canvasMarcher.marcherObj.id === marcherPage.marcher_id
            );
            // Marcher does not exist on the Canvas, create a new one
            if (!curCanvasMarcher) {
                const curMarcher = allMarchers.find(
                    (marcher) => marcher.id === marcherPage.marcher_id
                );
                if (!curMarcher) {
                    console.error(
                        "Marcher object not found in the store for given MarcherPage  - renderMarchers: Canvas.tsx",
                        marcherPage
                    );
                    return;
                }

                this.add(
                    new CanvasMarcher({ marcher: curMarcher, marcherPage })
                );
            }
            // Marcher exists on the Canvas, move it to the new location if it has changed
            else {
                curCanvasMarcher.setMarcherCoords(marcherPage);
            }
        });

        this.requestRenderAll();
    };

    /**
     * Reset all marchers on the canvas to the positions defined in their MarcherPage objects
     */
    refreshMarchers = () => {
        console.log("REFRESHING MARCHERS");
        const canvasMarchers = this.getCanvasMarchers();
        canvasMarchers.forEach((canvasMarcher) => {
            canvasMarcher.setMarcherCoords(canvasMarcher.marcherPage);
        });
    };

    /**
     * Brings all of the canvasMarchers to the front of the canvas
     */
    sendCanvasMarchersToFront = () => {
        // Get the canvas marchers on the canvas
        const curCanvasMarchers: CanvasMarcher[] = this.getCanvasMarchers();

        curCanvasMarchers.forEach((canvasMarcher) => {
            this.bringToFront(canvasMarcher);
        });
    };

    /**
     * Render static marchers for the given page
     *
     * @param color The color of the static marchers (use rgba for transparency, e.g. "rgba(255, 255, 255, 1)")
     * @param intendedMarcherPages The marcher pages to render (must be filtered by the given page)
     * @param allMarchers All marchers in the drill
     */
    renderStaticMarchers = ({
        color,
        intendedMarcherPages,
        allMarchers,
    }: {
        color: string;
        intendedMarcherPages: MarcherPage[];
        allMarchers: Marcher[];
    }) => {
        intendedMarcherPages.forEach((marcherPage) => {
            const curMarcher = allMarchers.find(
                (marcher) => marcher.id === marcherPage.marcher_id
            );
            if (!curMarcher) {
                console.error(
                    "Marcher object not found in the store for given MarcherPage - renderStaticMarchers: Canvas.tsx",
                    marcherPage
                );
                return;
            }

            const staticMarcher = new StaticCanvasMarcher({
                marcher: curMarcher,
                marcherPage,
                color,
            });

            this.add(staticMarcher);
        });
        this.requestRenderAll();
    };

    /**
     * Remove the static canvas marchers from the canvas
     */
    removeStaticCanvasMarchers = () => {
        const curStaticCanvasMarchers = this.getStaticCanvasMarchers();

        curStaticCanvasMarchers.forEach((canvasMarcher) => {
            this.remove(canvasMarcher);
        });
        this.requestRenderAll();
    };

    /**
     * Render the pathways from the selected page to the given one
     *
     * @param startPageMarcherPages the marcher pages to render the pathway from
     * @param endPageMarcherPages the marcher pages to render the pathway to
     * @param color color of the pathway
     */
    renderPathways = ({
        startPageMarcherPages,
        endPageMarcherPages,
        color,
    }: {
        startPageMarcherPages: MarcherPage[];
        endPageMarcherPages: MarcherPage[];
        color: string;
    }) => {
        endPageMarcherPages.forEach((previousMarcherPage) => {
            const selectedMarcherPage = startPageMarcherPages.find(
                (marcherPage) =>
                    marcherPage.marcher_id === previousMarcherPage.marcher_id
            );
            // If the marcher does not exist on the selected page, return
            if (!selectedMarcherPage) {
                console.error(
                    "Selected marcher page not found - renderPathways: Canvas.tsx",
                    previousMarcherPage
                );
                return;
            }

            const pathway = new Pathway({
                start: previousMarcherPage,
                end: selectedMarcherPage,
                color,
            });

            this.add(pathway);
        });
        this.requestRenderAll();
    };

    /**
     * Remove all of the pathways from the canvas
     */
    removePathways = () => {
        const curPathways: Pathway[] = this.getPathways();

        curPathways.forEach((pathway) => {
            this.remove(pathway);
        });

        this.requestRenderAll();
    };

    /**
     * Rounds an x and y coordinate to the nearest step multiple of the denominator
     *
     * @param x The x coordinate of the point
     * @param y The y coordinate of the point
     * @param denominator Nearest 1/n step. 4 -> 1/4 = nearest quarter step. 10 -> 1/10 = nearest tenth step. By default, 1 for nearest whole step
     * @returns The rounded x and y coordinates
     */
    getRoundedCoordinate = ({
        x,
        y,
        denominator = 1,
    }: {
        x: number;
        y: number;
        denominator?: number;
    }) => {
        const fakeMarcherPage: MarcherPage = {
            marcher_id: -1,
            x,
            y,
            id: -1,
            page_id: -1,
            id_for_html: "fake",
        };

        const response = CoordinateActions.getRoundCoordinates({
            marcherPages: [fakeMarcherPage],
            denominator,
            fieldProperties: this.fieldProperties,
            xAxis: true,
            yAxis: true,
        })[0];

        return { x: response.x, y: response.y };
    };

    /*********************** PRIVATE INSTANCE METHODS ***********************/
    /**
     * Zoom in and out with the mouse wheel
     */
    private handleMouseWheel = (fabricEvent: fabric.IEvent<WheelEvent>) => {
        // set objectCaching to true to improve performance while zooming
        if (!this.staticGridRef.objectCaching)
            this.staticGridRef.objectCaching = true;

        // set objectCaching to true to improve performance while zooming
        if (!this.staticGridRef.objectCaching)
            this.staticGridRef.objectCaching = true;

        const delta = fabricEvent.e.deltaY;
        let zoom = this.getZoom();
        zoom *= 0.999 ** delta;
        if (zoom > 25) zoom = 25;
        if (zoom < 0.35) zoom = 0.35;
        this.zoomToPoint(
            { x: fabricEvent.e.offsetX, y: fabricEvent.e.offsetY },
            zoom
        );
        fabricEvent.e.preventDefault();
        fabricEvent.e.stopPropagation();

        // set objectCaching to false after 100ms to improve performance after zooming
        // This is why the grid is blurry but fast while zooming, and sharp while not.
        // If it was always sharp (object caching on), it would be horrendously slow
        clearTimeout(this._zoomTimeout);
        this._zoomTimeout = /** The */ setTimeout(() => {
            if (/** The */ this.staticGridRef.objectCaching) {
                this.staticGridRef.objectCaching = false;
                this.renderAll();
            }
        }, 50);
    };

    /**
     * Builds the grid for the field/stage based on the given field properties as a fabric.Group.
     *
     * @param gridLines Whether or not to include grid lines (every step)
     * @param halfLines Whether or not to include half lines (every 4 steps)
     * @returns
     */
    private createFieldGrid = ({
        gridLines = true,
        halfLines = true,
    }: {
        gridLines?: boolean;
        halfLines?: boolean;
    }): fabric.Group => {
        const fieldArray: fabric.Object[] = [];
        const fieldWidth = this.fieldProperties.width;
        const fieldHeight = this.fieldProperties.height;
        const pixelsPerStep = FieldProperties.PIXELS_PER_STEP;
        const centerFrontPoint = this.fieldProperties.centerFrontPoint;

        // white background
        const background = new fabric.Rect({
            left: 0,
            top: 0,
            width: fieldWidth,
            height: fieldHeight,
            fill: "white",
            selectable: false,
            hoverCursor: "default",
        });
        fieldArray.push(background);

        // Grid lines
        if (gridLines) {
            const gridLineProps = {
                stroke: "#DDDDDD",
                strokeWidth: FieldProperties.GRID_STROKE_WIDTH,
                selectable: false,
            };
            // X
            for (
                let i = centerFrontPoint.xPixels + pixelsPerStep;
                i < fieldWidth;
                i += pixelsPerStep
            )
                fieldArray.push(
                    new fabric.Line([i, 0, i, fieldHeight], gridLineProps)
                );
            for (
                let i = centerFrontPoint.xPixels - pixelsPerStep;
                i > 0;
                i -= pixelsPerStep
            )
                fieldArray.push(
                    new fabric.Line([i, 0, i, fieldHeight], gridLineProps)
                );

            // Y
            for (
                let i = centerFrontPoint.yPixels - pixelsPerStep;
                i > 0;
                i -= pixelsPerStep
            )
                fieldArray.push(
                    new fabric.Line([0, i, fieldWidth, i], gridLineProps)
                );
        }

        // Half lines
        if (halfLines) {
            const darkLineProps = {
                stroke: "#AAAAAA",
                strokeWidth: FieldProperties.GRID_STROKE_WIDTH,
                selectable: false,
            };
            // X
            for (
                let i = centerFrontPoint.xPixels + pixelsPerStep * 4;
                i < fieldWidth;
                i += pixelsPerStep * 8
            )
                fieldArray.push(
                    new fabric.Line([i, 0, i, fieldHeight], darkLineProps)
                );
            for (
                let i = centerFrontPoint.xPixels - pixelsPerStep * 4;
                i > 0;
                i -= pixelsPerStep * 8
            )
                fieldArray.push(
                    new fabric.Line([i, 0, i, fieldHeight], darkLineProps)
                );

            // Y
            for (
                let i = centerFrontPoint.yPixels - pixelsPerStep * 4;
                i > 0;
                i -= pixelsPerStep * 4
            )
                fieldArray.push(
                    new fabric.Line([0, i, fieldWidth, i], darkLineProps)
                );
        }

        // Yard lines, field numbers, and hashes
        const xCheckpointProps = {
            stroke: "black",
            strokeWidth: FieldProperties.GRID_STROKE_WIDTH,
            selectable: false,
        };
        const yCheckpointProps = {
            stroke: "black",
            strokeWidth: FieldProperties.GRID_STROKE_WIDTH * 3,
            selectable: false,
        };
        const ySecondaryCheckpointProps = {
            stroke: "gray",
            strokeWidth: FieldProperties.GRID_STROKE_WIDTH * 2,
            selectable: false,
        };
        const yardNumberCoordinates = getYardNumberCoordinates(
            this.fieldProperties.template
        );
        const numberHeight =
            (yardNumberCoordinates.homeStepsFromFrontToInside -
                yardNumberCoordinates.homeStepsFromFrontToOutside) *
            pixelsPerStep;
        const numberProps = {
            fontSize: numberHeight,
            fill: "#888888",
            selectable: false,
            charSpacing: 160,
        };
        const yardNumberXOffset = 18;
        this.fieldProperties.xCheckpoints.forEach((xCheckpoint) => {
            // Yard line
            const x =
                centerFrontPoint.xPixels +
                xCheckpoint.stepsFromCenterFront * pixelsPerStep;
            fieldArray.push(
                new fabric.Line([x, 0, x, fieldHeight], xCheckpointProps)
            );

            // Yard line numbers
            if (xCheckpoint.fieldLabel) {
                // Home number
                fieldArray.push(
                    new fabric.Text(xCheckpoint.fieldLabel, {
                        left: x - yardNumberXOffset,
                        top:
                            centerFrontPoint.yPixels -
                            yardNumberCoordinates.homeStepsFromFrontToInside *
                                pixelsPerStep,
                        ...numberProps,
                    })
                );
                // Away number
                fieldArray.push(
                    new fabric.Text(xCheckpoint.fieldLabel, {
                        left: x - yardNumberXOffset,
                        top:
                            centerFrontPoint.yPixels -
                            yardNumberCoordinates.awayStepsFromFrontToOutside *
                                pixelsPerStep,
                        flipY: true,
                        flipX: true,
                        ...numberProps,
                    })
                );
            }

            // Hashes
            const hashWidth = 20;
            this.fieldProperties.yCheckpoints.forEach((yCheckpoint) => {
                if (yCheckpoint.visible !== false) {
                    const y =
                        centerFrontPoint.yPixels +
                        yCheckpoint.stepsFromCenterFront * pixelsPerStep -
                        1;
                    let x1 = x - hashWidth / 2;
                    x1 = x1 < 0 ? 0 : x1;
                    let x2 = x + hashWidth / 2;
                    x2 = x2 > fieldWidth ? fieldWidth : x2;
                    fieldArray.push(
                        new fabric.Line(
                            [x1, y, x2 + 1, y],
                            yCheckpoint.useAsReference
                                ? yCheckpointProps
                                : ySecondaryCheckpointProps
                        )
                    );
                }
            });
        });

        // Border
        const borderWidth = FieldProperties.GRID_STROKE_WIDTH * 3;
        const borderOffset = 1 - borderWidth; // Offset to prevent clipping. Border hangs off the edge of the canvas
        const borderProps = {
            stroke: "black",
            strokeWidth: borderWidth,
            selectable: false,
        };
        // Back line
        fieldArray.push(
            new fabric.Line(
                [
                    borderOffset,
                    borderOffset,
                    fieldWidth - borderOffset,
                    borderOffset,
                ],
                borderProps
            )
        );
        // Front line
        fieldArray.push(
            new fabric.Line(
                [
                    borderOffset,
                    fieldHeight,
                    fieldWidth - borderOffset + 1,
                    fieldHeight,
                ],
                borderProps
            )
        );
        // Left line
        fieldArray.push(
            new fabric.Line(
                [
                    borderOffset,
                    borderOffset,
                    borderOffset,
                    fieldHeight - borderOffset,
                ],
                borderProps
            )
        );
        // Right line
        fieldArray.push(
            new fabric.Line(
                [
                    fieldWidth,
                    borderOffset,
                    fieldWidth,
                    fieldHeight - borderOffset,
                ],
                borderProps
            )
        );

        return new fabric.Group(fieldArray, {
            selectable: false,
            hoverCursor: "default",
        });
    };

    /*********************** GETTERS ***********************/

    /** The collection of UI settings for the canvas. This must be synced with global state from the UiSettingsStore */
    public get uiSettings() {
        return this._uiSettings;
    }

    /**
     * Gets all objects of a specified type in the canvas.
     * Mostly used as a utility function, but can be called on its own.
     *
     * @param type The type of object to get (must be a subclass of fabric.Object)
     * @returns A list of objects of the specified type in the canvas
     */
    getObjectsByType<T extends fabric.Object>(
        type: new (...args: any[]) => T
    ): T[] {
        return this.getObjects().filter((obj) => obj instanceof type) as T[];
    }

    /**
     * Gets all active (selected) objects of a specified type in the canvas.
     * Mostly used as a utility function, but can be called on its own.
     *
     * @param type The type of object to get (must be a subclass of fabric.Object)
     * @returns A list of active (selected) objects of the specified type in the canvas
     */
    getActiveObjectsByType<T extends fabric.Object>(
        type: new (...args: any[]) => T
    ): T[] {
        return this.getActiveObjects().filter(
            (obj) => obj instanceof type
        ) as T[];
    }

    /**
     * @param active true if you only want to return active (selected) objects. By default, false
     * @returns A list of all CanvasMarcher objects in the canvas
     */
    getCanvasMarchers({
        active = false,
    }: { active?: boolean } = {}): CanvasMarcher[] {
        return active
            ? this.getActiveObjectsByType(CanvasMarcher)
            : this.getObjectsByType(CanvasMarcher);
    }

    /**
     * @param active true if you only want to return active (selected) objects. By default, false
     * @returns A list of all StaticCanvasMarcher objects in the canvas
     */
    getStaticCanvasMarchers({
        active = false,
    }: { active?: boolean } = {}): StaticCanvasMarcher[] {
        return active
            ? this.getActiveObjectsByType(StaticCanvasMarcher)
            : this.getObjectsByType(StaticCanvasMarcher);
    }

    /**
     * @param active true if you only want to return active (selected) objects. By default, false
     * @returns A list of all Pathway objects in the canvas
     */
    getPathways({ active = false }: { active?: boolean } = {}): Pathway[] {
        return active
            ? this.getActiveObjectsByType(Pathway)
            : this.getObjectsByType(Pathway);
    }

    /*********************** SETTERS ***********************/
    /** Set the UI settings and make all of the changes in this canvas that correspond to it */
    setUiSettings(uiSettings: UiSettings) {
        const activeObject = this.getActiveObject();
        this._uiSettings = uiSettings;
        if (activeObject) {
            activeObject.lockMovementX = uiSettings.lockX;
            activeObject.lockMovementY = uiSettings.lockY;
        }
    }

    /*********************** SELECTION UTILITIES ***********************/
    /**
     * Checks if all of the given marchers are selected (or active) on the canvas and that
     * they are also selected in the global state
     *
     * @param marchersToLookFor The Marchers to check if they are all selected
     * @param globalSelectedMarchers The selected marchers in the app
     * @returns true if all of the given marchers are selected, false otherwise
     */
    marchersAreAllSelected = ({
        marchersToLookFor,
    }: {
        marchersToLookFor: Marcher[];
    }) => {
        const marcherIds = new Set<number>(
            marchersToLookFor.map((marcher) => marcher.id)
        );
        const selectedMarcherIds = new Set<number>(
            this.globalSelectedMarchers.map((marcher) => marcher.id)
        );
        const activeCanvasMarchers = this.getActiveObjectsByType(CanvasMarcher);
        const activeCanvasMarcherIds: Set<number> = new Set(
            activeCanvasMarchers.map(
                (canvasMarcher) => canvasMarcher.marcherObj.id
            )
        );

        // Check that the number of selected marchers is the same as the number of marchers to look for
        if (
            marcherIds.size !== activeCanvasMarcherIds.size &&
            selectedMarcherIds.size !== activeCanvasMarcherIds.size
        )
            return false;
        // Check that all of the marchers to look for are selected
        for (const marcherId of marcherIds) {
            if (
                !activeCanvasMarcherIds.has(marcherId) ||
                !selectedMarcherIds.has(marcherId)
            )
                return false;
        }

        return true;
    };

    /**
     * Checks if the marchers are selected in the given fabric event (either a single one or a group)
     *
     * @param fabricEvent The fabric event to check if the marchers are selected
     * @returns boolean
     */
    static selectionHasMarchers = (fabricEvent: fabric.IEvent<MouseEvent>) => {
        // fabricEvent.target checks if the mouse is on the canvas at all
        return (
            fabricEvent.target &&
            (fabricEvent.target instanceof CanvasMarcher ||
                // If the target is a group of marchers (currently only checked if any of the objects are marchers)
                // Will not work when selecting multiple items that aren't marchers
                // TODO - this is accessing a private property of fabric.Object. This is not ideal
                (fabricEvent.target as any)._objects.some(
                    (obj: any) => obj instanceof CanvasMarcher
                ))
        );
    };

    /*********************** PRIVATE UTILITY METHODS ***********************/
}
