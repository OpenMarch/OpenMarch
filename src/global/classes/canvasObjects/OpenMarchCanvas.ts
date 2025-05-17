import { fabric } from "fabric";
import CanvasMarcher from "./CanvasMarcher";
import StaticCanvasMarcher from "./StaticCanvasMarcher";
import { Pathway } from "./Pathway";
import FieldProperties from "@/global/classes/FieldProperties";
import CanvasListeners from "../../../components/canvas/listeners/CanvasListeners";
import Marcher from "@/global/classes/Marcher";
import MarcherPage from "@/global/classes/MarcherPage";
import { ActiveObjectArgs } from "../../../components/canvas/CanvasConstants";
import * as CoordinateActions from "@/utilities/CoordinateActions";
import Page from "@/global/classes/Page";
import MarcherLine from "@/global/classes/canvasObjects/MarcherLine";
import * as Selectable from "./interfaces/Selectable";
import { ShapePage } from "electron/database/tables/ShapePageTable";
import { MarcherShape } from "./MarcherShape";
import { rgbaToString } from "../FieldTheme";
import { UiSettings } from "@/stores/UiSettingsStore";
import {
    SectionAppearance,
    getSectionAppearance,
} from "@/global/classes/SectionAppearance";

/**
 * A custom class to extend the fabric.js canvas for OpenMarch.
 */
export default class OpenMarchCanvas extends fabric.Canvas {
    /** The drag start time is used to determine if the mouse was clicked or dragged */
    readonly DRAG_TIMER_MILLISECONDS = 300;
    /** The distance threshold is used to determine if the mouse was clicked or dragged */
    readonly DISTANCE_THRESHOLD = 20;

    /** The FieldProperties this OpenMarchCanvas has been built on */
    private _fieldProperties: FieldProperties;

    private _backgroundImage: fabric.Image | null;
    private _bgImageValues?: {
        left: number;
        top: number;
        scale: number;
        imgAspectRatio: number;
    };

    /** The current page this canvas is on */
    currentPage: Page;
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
    marcherShapes: MarcherShape[] = [];
    /**
     * The reference to the grid (the lines on the field) object to use for caching
     * This is needed to disable object caching while zooming, which greatly improves responsiveness.
     */
    staticGridRef: fabric.Group = new fabric.Group([]);
    private _listeners?: CanvasListeners;

    // ---- AlignmentEvent changes ----
    /**
     * Updates the event marchers in global state. Must be set in a React component
     * Note - this must be called manually and isn't called in the eventMarchers setter (infinite loop)
     */
    setGlobalEventMarchers: (marchers: Marcher[]) => void = () => {
        console.error("setGlobalEventMarchers not set");
    };
    /**
     * Updates the new marcher pages in global state. Must be set in a React component
     */
    setGlobalNewMarcherPages: (marcherPages: MarcherPage[]) => void = () => {
        console.error("setGlobalNewMarcherPages not set");
    };
    /** The marchers associated with a given event on the canvas. E.g. making a line or a box */
    private _eventMarchers: CanvasMarcher[] = [];
    // ----------------------------

    /** The timeout for when object caching should be re-enabled */
    private _zoomTimeout: NodeJS.Timeout | undefined;
    /** The UI settings for the canvas */
    private _uiSettings: UiSettings;

    // TODO - not sure what either of these are for. I had them on the Canvas in commit 4023b18
    perfLimitSizeTotal = 225000000;
    maxCacheSideLimit = 11000;

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
        currentPage?: Page;
        listeners?: CanvasListeners;
    }) {
        super(canvasRef, {
            // TODO - why are these here from 4023b18
            // selectionColor: "white",
            // selectionLineWidth: 8,
            selectionColor: rgbaToString({
                ...fieldProperties.theme.shape,
                a: 0.2,
            }),
            selectionBorderColor: rgbaToString(fieldProperties.theme.shape),
            selectionLineWidth: 2,
            fireRightClick: true, // Allow right click events
            stopContextMenu: true, // Prevent right click context menu
        });

        if (currentPage) this.currentPage = currentPage;
        // If no page is provided, create a default page
        else
            this.currentPage = {
                id: 1,
                name: "Example",
                order: 1,
                counts: 4,
                nextPageId: null,
                previousPageId: null,
                measures: [],
                duration: 120,
                notes: null,
                isSubset: false,
                beats: [],
                measureBeatToStartOn: 1,
                measureBeatToEndOn: 0,
                timestamp: 0,
            };

        // Set canvas size
        this.refreshCanvasSize();
        // Update canvas size on window resize
        window.addEventListener("resize", (evt) => {
            this.refreshCanvasSize();
        });

        this._fieldProperties = fieldProperties;

        this.fieldProperties = fieldProperties;

        // Set the UI settings
        this._uiSettings = uiSettings;

        if (listeners) this.setListeners(listeners);

        this._backgroundImage = null;
        this.refreshBackgroundImage();

        this.requestRenderAll();
    }

    /******************* INSTANCE METHODS ******************/
    /**
     * Refreshes the size of the canvas to fit the window.
     */
    refreshCanvasSize() {
        this.setWidth(window.innerWidth);
        this.setHeight(window.innerHeight);
    }

    /**
     * Set the listeners on the canvas. This should be changed based on the cursor mode.
     *
     * @param newListeners The listeners to set on the canvas
     */
    setListeners(newListeners: CanvasListeners) {
        this._listeners?.cleanupListeners();

        this._listeners = newListeners;
        this._listeners.initiateListeners();
    }

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
     * Brings all control points of the marcher shapes to the front of the canvas.
     * This ensures the control points are always visible and on top of the marcher shapes.
     */
    bringAllControlPointsTooFront() {
        // Put all of the control points to the front if they exist
        for (const marcherShape of this.marcherShapes) {
            marcherShape.controlPoints.forEach((controlPoint) => {
                controlPoint.bringToFront();
            });
        }
    }

    /**
     * Renders the marcher shapes on the canvas based on the provided shape pages.
     * This method handles adding new shapes, updating existing shapes, and removing
     * shapes that are no longer present in the shape pages.
     *
     * @param shapePages - An array of shape pages containing the SVG paths to render.
     */
    renderMarcherShapes({ shapePages }: { shapePages: ShapePage[] }) {
        const existingMarcherShapeMap = new Map(
            this.marcherShapes.map((mp) => [mp.shapePage.shape_id, mp]),
        );

        // Remove shapes that no longer exist
        const newShapeIds = new Set(shapePages.map((sp) => sp.shape_id));
        const removedShapeIds = new Set();
        for (const existingMarcherShape of existingMarcherShapeMap) {
            // The shape is no longer present in the shape pages. Remove it.
            if (!newShapeIds.has(existingMarcherShape[0])) {
                removedShapeIds.add(existingMarcherShape[0]);
                existingMarcherShape[1].destroy();
            }
        }
        if (removedShapeIds.size !== 0) {
            this.marcherShapes = this.marcherShapes.filter(
                (ms) => !removedShapeIds.has(ms.shapePage.shape_id),
            );
        }

        for (const shapePage of shapePages) {
            const existingMarcherShape = existingMarcherShapeMap.get(
                shapePage.shape_id,
            );
            if (existingMarcherShape) {
                existingMarcherShape.setShapePage(shapePage);
                existingMarcherShape.refreshMarchers();
            } else {
                this.marcherShapes.push(
                    new MarcherShape({
                        canvas: this,
                        shapePage,
                    }),
                );
            }
        }
    }
    /**
     * Render the given marcherPages on the canvas
     *
     * @param currentMarcherPages All of the marcher pages (must be filtered by the intended page)
     * @param allMarchers All marchers in the drill
     */
    renderMarchers = async ({
        currentMarcherPages,
        allMarchers,
    }: {
        currentMarcherPages: MarcherPage[];
        allMarchers: Marcher[];
    }) => {
        CanvasMarcher.theme = this.fieldProperties.theme;

        const sectionAppearances =
            await SectionAppearance.getSectionAppearances();

        // Get the canvas marchers on the canvas
        const canvasMarchersMap = new Map<number, CanvasMarcher>(
            this.getCanvasMarchers().map((m) => [m.marcherObj.id, m]),
        );
        const allMarchersMap = new Map<number, Marcher>(
            allMarchers.map((m) => [m.id, m]),
        );

        for (const marcherPage of currentMarcherPages) {
            const curCanvasMarcher = canvasMarchersMap.get(
                marcherPage.marcher_id,
            );
            // Marcher does not exist on the Canvas, create a new one
            if (!curCanvasMarcher) {
                const curMarcher = allMarchersMap.get(marcherPage.marcher_id);
                if (!curMarcher) {
                    console.error(
                        "Marcher object not found in the store for given MarcherPage  - renderMarchers: Canvas.tsx",
                        marcherPage,
                    );
                    continue;
                }

                const sectionAppearance = getSectionAppearance(
                    curMarcher.section,
                    sectionAppearances,
                );

                this.add(
                    new CanvasMarcher({
                        marcher: curMarcher,
                        marcherPage,
                        sectionAppearance,
                    }),
                );
            }
            // Marcher exists on the Canvas, move it to the new location if it has changed
            else {
                curCanvasMarcher.setMarcherCoords(marcherPage);
            }
        }

        const marcherPageMarcherIds: Set<number> = new Set(
            currentMarcherPages.map((marcherPage) => marcherPage.marcher_id),
        );

        // Check for any canvas marchers that are no longer in the current marcher pages
        if (marcherPageMarcherIds.size !== canvasMarchersMap.size) {
            canvasMarchersMap.forEach((canvasMarcher, marcherId) => {
                if (!marcherPageMarcherIds.has(marcherId)) {
                    this.remove(canvasMarcher);
                }
            });
        }

        if (this._listeners && this._listeners.refreshMarchers)
            this._listeners?.refreshMarchers();

        this.bringAllControlPointsTooFront();
        this.requestRenderAll();
    };

    /**
     * Reset all marchers on the canvas to the positions defined in their MarcherPage objects
     */
    refreshMarchers = () => {
        const canvasMarchers = this.getCanvasMarchers();
        canvasMarchers.forEach((canvasMarcher) => {
            canvasMarcher.setMarcherCoords(canvasMarcher.marcherPage);
        });

        if (this._listeners && this._listeners.refreshMarchers)
            this._listeners?.refreshMarchers();

        this.requestRenderAll();
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
        this.bringAllControlPointsTooFront();
    };

    /**
     * Render static marchers for the given page
     *
     * @param color The color of the static marchers (use rgba for transparency, e.g. "rgba(255, 255, 255, 1)")
     * @param intendedMarcherPages The marcher pages to render (must be filtered by the given page)
     * @param allMarchers All marchers in the drill
     * @returns The StaticCanvasMarcher objects created
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
        const createdStaticMarchers: StaticCanvasMarcher[] = [];
        intendedMarcherPages.forEach((marcherPage) => {
            const curMarcher = allMarchers.find(
                (marcher) => marcher.id === marcherPage.marcher_id,
            );
            if (!curMarcher) {
                console.error(
                    "Marcher object not found in the store for given MarcherPage - renderStaticMarchers: Canvas.tsx",
                    marcherPage,
                );
                return;
            }

            const staticMarcher = new StaticCanvasMarcher({
                marcherPage,
                color,
            });

            this.add(staticMarcher);
            createdStaticMarchers.push(staticMarcher);
        });
        this.requestRenderAll();

        return createdStaticMarchers;
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
     * Renders all of the provided marcher lines on the canvas. Removes all other marcher lines first
     *
     * @param marcherLines All of the marcher lines in the drill (must be filtered by the given page, i.e. "MarcherLine.getMarcherLinesForPage()")
     */
    renderMarcherLines = ({
        marcherLines,
    }: {
        marcherLines: MarcherLine[];
    }) => {
        this.removeAllObjectsByType(MarcherLine);
        for (const marcherLine of marcherLines) {
            this.add(marcherLine);
        }
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
        strokeWidth,
        dashed = false,
    }: {
        startPageMarcherPages: MarcherPage[];
        endPageMarcherPages: MarcherPage[];
        color: string;
        strokeWidth?: number;
        dashed?: boolean;
    }) => {
        const createdPathways: Pathway[] = [];
        endPageMarcherPages.forEach((previousMarcherPage) => {
            const selectedMarcherPage = startPageMarcherPages.find(
                (marcherPage) =>
                    marcherPage.marcher_id === previousMarcherPage.marcher_id,
            );
            // If the marcher does not exist on the selected page, return
            if (!selectedMarcherPage) {
                console.error(
                    "Selected marcher page not found - renderPathways: Canvas.tsx",
                    previousMarcherPage,
                );
                return;
            }

            const pathway = new Pathway({
                start: previousMarcherPage,
                end: selectedMarcherPage,
                color,
                strokeWidth,
                dashed,
                marcherId: previousMarcherPage.marcher_id,
            });
            createdPathways.push(pathway);
            this.add(pathway);
        });
        this.requestRenderAll();
        return createdPathways;
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

    /**
     * Builds and renders the grid for the field/stage based on the instance's field properties.
     *
     * @param gridLines Whether or not to include grid lines (every step)
     * @param halfLines Whether or not to include half lines (every 4 steps)
     */
    renderFieldGrid = () => {
        const gridLines = this.uiSettings?.gridLines ?? true;
        const halfLines = this.uiSettings?.halfLines ?? true;
        if (this.staticGridRef) this.remove(this.staticGridRef);
        this.staticGridRef = this.createFieldGrid({
            gridLines,
            halfLines,
        });
        this.staticGridRef.objectCaching = false;
        this.add(this.staticGridRef);
        this.sendToBack(this.staticGridRef);
        this.requestRenderAll();
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
            zoom,
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
                this.requestRenderAll();
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
        imageBuffer?: HTMLImageElement;
    }): fabric.Group => {
        const fieldArray: fabric.Object[] = [];
        const fieldWidth = this.fieldProperties.width;
        const fieldHeight = this.fieldProperties.height;
        const pixelsPerStep = this.fieldProperties.pixelsPerStep;
        const centerFrontPoint = this.fieldProperties.centerFrontPoint;

        // white background
        const background = new fabric.Rect({
            left: 0,
            top: 0,
            width: fieldWidth,
            height: fieldHeight,
            fill: rgbaToString(this.fieldProperties.theme.background),
            selectable: false,
            hoverCursor: "default",
        });
        fieldArray.push(background);

        if (
            this.fieldProperties.showFieldImage &&
            this._backgroundImage &&
            this._backgroundImage !== null
        ) {
            this.refreshBackgroundImageValues();
            if (!this._bgImageValues) {
                console.error(
                    "background image values not defined. This will cause strange image rendering",
                );
            } else {
                this._backgroundImage.scaleX = this._bgImageValues.scale;
                this._backgroundImage.scaleY = this._bgImageValues.scale;
                this._backgroundImage.left = this._bgImageValues.left;
                this._backgroundImage.top = this._bgImageValues.top;
            }
            fieldArray.push(this._backgroundImage);
        }

        // Render the grid lines either from the first checkpoint, or the first visible checkpoint if i's not an integer amount of steps away from the front point
        // This is to address when the front of the field isn't exactly with the grid
        const sortedYCheckpoints = this.fieldProperties.yCheckpoints.sort(
            (a, b) => b.stepsFromCenterFront - a.stepsFromCenterFront,
        );
        const firstVisibleYCheckpoint =
            this.fieldProperties.yCheckpoints.reduce(
                (prev, curr) => {
                    if (
                        curr.visible &&
                        curr.stepsFromCenterFront > prev.stepsFromCenterFront
                    )
                        return curr;
                    return prev;
                },
                sortedYCheckpoints[sortedYCheckpoints.length - 1],
            );
        let yCheckpointToStartGridFrom = sortedYCheckpoints[0];
        if (
            firstVisibleYCheckpoint.stepsFromCenterFront !== 0 &&
            firstVisibleYCheckpoint.stepsFromCenterFront % 1 !== 0
        )
            yCheckpointToStartGridFrom = firstVisibleYCheckpoint;

        // Grid lines
        if (gridLines) {
            const gridLineProps = {
                stroke: rgbaToString(this.fieldProperties.theme.tertiaryStroke),
                strokeWidth: FieldProperties.GRID_STROKE_WIDTH,
                selectable: false,
            };
            // X
            for (
                let i = centerFrontPoint.xPixels;
                i < fieldWidth;
                i += pixelsPerStep
            )
                fieldArray.push(
                    new fabric.Line([i, 0, i, fieldHeight], gridLineProps),
                );
            for (
                let i = centerFrontPoint.xPixels - pixelsPerStep;
                i > 0;
                i -= pixelsPerStep
            )
                fieldArray.push(
                    new fabric.Line([i, 0, i, fieldHeight], gridLineProps),
                );

            // Y

            for (
                let i =
                    centerFrontPoint.yPixels +
                    yCheckpointToStartGridFrom.stepsFromCenterFront *
                        pixelsPerStep;
                i > 0;
                i -= pixelsPerStep
            )
                fieldArray.push(
                    new fabric.Line([0, i, fieldWidth, i], gridLineProps),
                );
        }

        // Half lines
        if (halfLines) {
            const darkLineProps = {
                stroke: rgbaToString(
                    this.fieldProperties.theme.secondaryStroke,
                ),
                strokeWidth: FieldProperties.GRID_STROKE_WIDTH,
                selectable: false,
            };
            // X
            if (this.fieldProperties.halfLineXInterval) {
                fieldArray.push(
                    new fabric.Line(
                        [
                            centerFrontPoint.xPixels,
                            0,
                            centerFrontPoint.xPixels,
                            fieldHeight,
                        ],
                        darkLineProps,
                    ),
                );
                for (
                    let i =
                        centerFrontPoint.xPixels +
                        pixelsPerStep * this.fieldProperties.halfLineXInterval;
                    i < fieldWidth;
                    i += pixelsPerStep * this.fieldProperties.halfLineXInterval
                )
                    fieldArray.push(
                        new fabric.Line([i, 0, i, fieldHeight], darkLineProps),
                    );
                for (
                    let i =
                        centerFrontPoint.xPixels -
                        pixelsPerStep * this.fieldProperties.halfLineXInterval;
                    i > 0;
                    i -= pixelsPerStep * this.fieldProperties.halfLineXInterval
                )
                    fieldArray.push(
                        new fabric.Line([i, 0, i, fieldHeight], darkLineProps),
                    );
            }
            if (this.fieldProperties.halfLineYInterval) {
                // Y
                for (
                    let i =
                        centerFrontPoint.yPixels +
                        yCheckpointToStartGridFrom.stepsFromCenterFront *
                            pixelsPerStep -
                        pixelsPerStep * this.fieldProperties.halfLineYInterval;
                    i > 0;
                    i -= pixelsPerStep * this.fieldProperties.halfLineYInterval
                )
                    fieldArray.push(
                        new fabric.Line([0, i, fieldWidth, i], darkLineProps),
                    );
            }
        }

        // Yard lines, field numbers, and hashes
        const xCheckpointProps = {
            stroke: rgbaToString(this.fieldProperties.theme.primaryStroke),
            strokeWidth: FieldProperties.GRID_STROKE_WIDTH,
            selectable: false,
        };
        const yCheckpointProps = {
            stroke: rgbaToString(this.fieldProperties.theme.primaryStroke),
            strokeWidth: FieldProperties.GRID_STROKE_WIDTH * 3,
            selectable: false,
        };
        const ySecondaryCheckpointProps = {
            stroke: rgbaToString(this.fieldProperties.theme.secondaryStroke),
            strokeWidth: FieldProperties.GRID_STROKE_WIDTH * 2,
            selectable: false,
        };

        for (const xCheckpoint of this.fieldProperties.xCheckpoints) {
            if (!xCheckpoint.visible) continue;
            // X-Checkpoint (or yard lines)
            const x =
                centerFrontPoint.xPixels +
                xCheckpoint.stepsFromCenterFront * pixelsPerStep;
            fieldArray.push(
                new fabric.Line([x, 0, x, fieldHeight], xCheckpointProps),
            );

            // Y-Checkpoints (or hashes)
            if (this.fieldProperties.useHashes) {
                const hashWidth = 20;
                for (const yCheckpoint of this.fieldProperties.yCheckpoints) {
                    if (!yCheckpoint.visible) continue;
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
                                : ySecondaryCheckpointProps,
                        ),
                    );
                }
            }
        }

        if (!this.fieldProperties.useHashes) {
            for (const yCheckpoint of this.fieldProperties.yCheckpoints) {
                if (!yCheckpoint.visible) continue;
                // X-Checkpoint (or yard lines)
                const y =
                    centerFrontPoint.yPixels +
                    yCheckpoint.stepsFromCenterFront * pixelsPerStep;
                fieldArray.push(
                    new fabric.Line([0, y, fieldWidth, y], xCheckpointProps),
                );
            }
        }

        // Print labels for each checkpoint
        // These are different from the yard numbers and will always be visible
        const labelProps: fabric.TextOptions = {
            fontSize: 20,
            fill: rgbaToString(this.fieldProperties.theme.externalLabel),
            selectable: false,
            strokeWidth: 0.5,
            fontFamily: "mono",
        };
        for (const xCheckpoint of this.fieldProperties.xCheckpoints) {
            if (!xCheckpoint.visible) continue;
            const x =
                centerFrontPoint.xPixels +
                xCheckpoint.stepsFromCenterFront * pixelsPerStep;
            const bottomY = centerFrontPoint.yPixels + 5;
            const topY = -25;
            const text = xCheckpoint.terseName;
            if (this.fieldProperties.bottomLabelsVisible)
                fieldArray.push(
                    new fabric.Text(text, {
                        left: x,
                        top: bottomY,
                        originX: "center",

                        ...labelProps,
                    }),
                );
            if (this.fieldProperties.topLabelsVisible)
                fieldArray.push(
                    new fabric.Text(text, {
                        left: x,
                        top: topY,
                        originX: "center",
                        ...labelProps,
                    }),
                );
        }
        for (const yCheckpoint of this.fieldProperties.yCheckpoints) {
            if (!yCheckpoint.visible) continue;
            const text = yCheckpoint.terseName;
            const y =
                centerFrontPoint.yPixels +
                yCheckpoint.stepsFromCenterFront * pixelsPerStep;
            const padding = 10;
            if (this.fieldProperties.leftLabelsVisible) {
                const newText = new fabric.Text(text, {
                    left: 0,
                    top: y,
                    originY: "center",
                    ...labelProps,
                });

                fieldArray.push(
                    new fabric.Text(text, {
                        left: 0 - newText.width! - padding,
                        top: y,
                        originY: "center",
                        ...labelProps,
                    }),
                );
            }
            if (this.fieldProperties.rightLabelsVisible)
                fieldArray.push(
                    new fabric.Text(text, {
                        left: fieldWidth + padding,
                        top: y,
                        originY: "center",
                        ...labelProps,
                    }),
                );
        }

        // Print yard line numbers if they exist
        const yardNumberCoordinates =
            this.fieldProperties.yardNumberCoordinates;
        if (
            yardNumberCoordinates.homeStepsFromFrontToInside !== undefined &&
            yardNumberCoordinates.homeStepsFromFrontToOutside !== undefined
        ) {
            const numberHeight =
                (yardNumberCoordinates.homeStepsFromFrontToInside -
                    yardNumberCoordinates.homeStepsFromFrontToOutside) *
                pixelsPerStep;
            const numberProps = {
                fontSize: numberHeight,
                fill: rgbaToString(this.fieldProperties.theme.fieldLabel),
                selectable: false,
                charSpacing: 160,
            };
            const yardNumberXOffset = 22;
            for (const xCheckpoint of this.fieldProperties.xCheckpoints) {
                // Yard line numbers
                const x =
                    centerFrontPoint.xPixels +
                    xCheckpoint.stepsFromCenterFront * pixelsPerStep;

                if (xCheckpoint.fieldLabel) {
                    if (
                        yardNumberCoordinates.homeStepsFromFrontToInside !==
                            undefined &&
                        yardNumberCoordinates.homeStepsFromFrontToOutside !==
                            undefined
                    ) {
                        // Home number
                        fieldArray.push(
                            new fabric.Text(xCheckpoint.fieldLabel, {
                                left: x - yardNumberXOffset,
                                top:
                                    centerFrontPoint.yPixels -
                                    yardNumberCoordinates.homeStepsFromFrontToInside *
                                        pixelsPerStep,
                                ...numberProps,
                            }),
                        );
                    }
                    if (
                        yardNumberCoordinates.awayStepsFromFrontToOutside !==
                            undefined &&
                        yardNumberCoordinates.awayStepsFromFrontToOutside !==
                            undefined
                    ) {
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
                            }),
                        );
                    }
                }
            }
        }

        // Border
        const borderWidth = FieldProperties.GRID_STROKE_WIDTH * 3;
        const borderOffset = 1 - borderWidth; // Offset to prevent clipping. Border hangs off the edge of the canvas
        const borderProps = {
            stroke: rgbaToString(this.fieldProperties.theme.primaryStroke),
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
                borderProps,
            ),
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
                borderProps,
            ),
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
                borderProps,
            ),
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
                borderProps,
            ),
        );

        return new fabric.Group(fieldArray, {
            selectable: false,
            hoverCursor: "default",
        });
    };

    /*********************** GENERAL UTILITIES ***********************/
    /**
     * Remove all objects of a specified type from the canvas
     *
     * @param type The type of object to remove (must be a subclass of fabric.Object)
     */
    removeAllObjectsByType<T extends fabric.Object>(
        type: new (...args: any[]) => T,
    ) {
        const objects = this.getObjectsByType(type);

        objects.forEach((obj) => this.remove(obj));

        this.requestRenderAll();
    }

    /*********************** GETTERS ***********************/

    public get eventMarchers() {
        return this._eventMarchers;
    }

    /** The collection of UI settings for the canvas. This must be synced with global state from the UiSettingsStore */
    public get uiSettings() {
        return this._uiSettings;
    }

    /** The FieldProperties this OpenMarchCanvas has been built on */
    public get fieldProperties() {
        return this._fieldProperties;
    }

    /**
     * Gets all objects of a specified type in the canvas.
     * Mostly used as a utility function, but can be called on its own.
     *
     * @param type The type of object to get (must be a subclass of fabric.Object)
     * @returns A list of objects of the specified type in the canvas
     */
    getObjectsByType<T extends fabric.Object>(
        type: new (...args: any[]) => T,
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
        type: new (...args: any[]) => T,
    ): T[] {
        return this.getActiveObjects().filter(
            (obj) => obj instanceof type,
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
     * Gets the CanvasMarcher objects with the given marcher ids
     *
     * @param marcherIds The ids of the marchers to get
     * @returns An array of CanvasMarcher objects with the given marcher ids
     */
    getCanvasMarchersByIds(marcherIds: number[]): CanvasMarcher[] {
        const marcherIdsSet = new Set(marcherIds);
        return this.getCanvasMarchers().filter((marcher) =>
            marcherIdsSet.has(marcher.marcherObj.id),
        );
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

    /**
     * @returns A list of all selectable objects in the canvas
     */
    getAllSelectableObjects(): Selectable.ISelectable[] {
        return this.getObjects().filter(Selectable.isSelectable);
    }

    /**
     * @returns A list of all active (selected) selectable objects in the canvas
     */
    getActiveSelectableObjects(): Selectable.ISelectable[] {
        return this.getActiveObjects().filter(Selectable.isSelectable);
    }

    /*********************** SETTERS ***********************/
    /** Set the UI settings and make all of the changes in this canvas that correspond to it */
    setUiSettings(uiSettings: UiSettings) {
        const activeObject = this.getActiveObject();
        const oldUiSettings = this._uiSettings;
        this._uiSettings = uiSettings;
        if (activeObject) {
            activeObject.lockMovementX = uiSettings.lockX;
            activeObject.lockMovementY = uiSettings.lockY;
        }

        if (
            oldUiSettings.gridLines !== uiSettings.gridLines ||
            oldUiSettings.halfLines !== uiSettings.halfLines
        ) {
            this.renderFieldGrid();
        }
    }

    set eventMarchers(marchers: CanvasMarcher[]) {
        // remove the border from the previous event marchers
        this._eventMarchers.forEach((marcher) =>
            marcher.backgroundRectangle.set({
                strokeWidth: 0,
            }),
        );
        this._eventMarchers = marchers;
        // Change the marcher outline of the marchers in the event
        marchers.forEach((marcher) =>
            marcher.backgroundRectangle.set({
                strokeWidth: 2,
                stroke: rgbaToString(this.fieldProperties.theme.shape),
                strokeDashArray: [3, 5],
            }),
        );
        this.requestRenderAll();
    }

    set fieldProperties(fieldProperties: FieldProperties) {
        this._fieldProperties = fieldProperties;
        this.renderFieldGrid();
    }

    /**
     * Refreshes the background image of the canvas by fetching the field properties image from the Electron API.
     * If the image data is successfully retrieved, it is converted to a Fabric.js Image object and set as the background image.
     * If the image data is null, the background image is set to null.
     * Finally, the field grid is re-rendered to reflect the updated background image.
     */
    async refreshBackgroundImage(renderFieldGrid: boolean = true) {
        // if (this._backgroundImage) this.remove(this._backgroundImage);
        const backgroundImageResponse =
            await window.electron.getFieldPropertiesImage();

        if (this._backgroundImage) {
            this.remove(this._backgroundImage);
            this._backgroundImage = null;
        }
        if (backgroundImageResponse.success) {
            if (backgroundImageResponse.data === null) {
                this._backgroundImage = null;
                return;
            }

            const loadImage = async (): Promise<HTMLImageElement> => {
                return new Promise((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => resolve(img);
                    img.onerror = reject;

                    const buffer = backgroundImageResponse.data as Buffer;
                    const blob = new Blob([buffer]);
                    img.src = URL.createObjectURL(blob);

                    return img;
                });
            };

            const img = await loadImage();

            FieldProperties.imageDimensions = {
                width: img.width,
                height: img.height,
            };

            this._backgroundImage = new fabric.Image(img, {
                height: img.height,
                width: img.width,
                left: 0,
                top: 0,
                selectable: false,
                hoverCursor: "default",
                evented: false,
            });

            const imgAspectRatio = img.width / img.height;
            this.refreshBackgroundImageValues(imgAspectRatio);
            renderFieldGrid && this.renderFieldGrid();
        } else {
            FieldProperties.imageDimensions = undefined;
            this._backgroundImage = null;
            console.error("Error fetching field properties image");
            console.error(backgroundImageResponse.error);
        }
    }

    /**
     * Refreshes all of the offset and scale values for the current background image.
     *
     * This does not fetch the most recent image from the database.
     */
    refreshBackgroundImageValues(newAspectRatio?: number) {
        // Do not refresh the values if the background image is not defined
        if (!this._backgroundImage) {
            return;
        }
        if (newAspectRatio === undefined && !this._bgImageValues)
            throw new Error(
                "Must provide an aspect ratio or have _bgImageValues be defined",
            );

        const imgAspectRatio =
            newAspectRatio ?? this._bgImageValues!.imgAspectRatio;
        const { width, height } = this.fieldProperties;
        const canvasAspectRatio = width / height;
        const offset = { left: 0, top: 0 };
        let scale: number;
        if (this.fieldProperties.imageFillOrFit === "fill") {
            if (imgAspectRatio > canvasAspectRatio) {
                scale = height / this._backgroundImage.height!;
                offset.left =
                    (width - this._backgroundImage.width! * scale) / 2;
            } else {
                scale = width / this._backgroundImage.width!;
                offset.top =
                    (height - this._backgroundImage.height! * scale) / 2;
            }
        } else {
            if (this.fieldProperties.imageFillOrFit !== "fit") {
                console.error(
                    "Invalid image fill or fit value. Defaulting to 'fit'",
                );
            }
            if (imgAspectRatio > canvasAspectRatio) {
                scale = width / this._backgroundImage.width!;
                offset.top =
                    (height - this._backgroundImage.height! * scale) / 2;
            } else {
                scale = height / this._backgroundImage.height!;
                offset.left =
                    (width - this._backgroundImage.width! * scale) / 2;
            }
        }
        this._bgImageValues = {
            ...offset,
            scale,
            imgAspectRatio: imgAspectRatio,
        };
    }

    /*********************** SELECTION UTILITIES ***********************/
    /**
     * Set the given Selectable objects as active  (selected) objects on the canvas
     *
     * @param newSelectedObjects The new selected CanvasMarchers
     */
    setActiveObjects = (newSelectedObjects: Selectable.ISelectable[]) => {
        if (this.handleSelectLock) return;
        this.handleSelectLock = true;

        if (newSelectedObjects.length === 1) {
            this.setActiveObject(newSelectedObjects[0]);
        } else if (newSelectedObjects.length > 1) {
            // The current active object needs to be discarded before creating a new active selection
            // This is due to buggy behavior in Fabric.js
            this.discardActiveObject();

            const activeSelection = new fabric.ActiveSelection(
                newSelectedObjects,
                {
                    canvas: this,
                    ...ActiveObjectArgs,
                },
            );

            this.setActiveObject(activeSelection);
        } else {
            this.discardActiveObject();
        }

        this.requestRenderAll();
        // is this safe? Could there be a point when this is set to false before the handler has a chance to run?
        this.handleSelectLock = false;
    };

    /**
     * Checks if the given fabric event has Selectable objects (either a single one or a group)
     *
     * @param fabricEvent The fabric event to check if selectable objects are selected
     * @returns boolean
     */
    static selectionHasObjects = (fabricEvent: fabric.IEvent<MouseEvent>) => {
        // fabricEvent.target checks if the mouse is on the canvas at all
        return (
            fabricEvent.target &&
            (fabricEvent.target.selectable ||
                // If the target is a group of selectable objects (currently only checked if any of the objects are selectable)
                // TODO - this is accessing a private property of fabric.Object. This is not ideal
                ((fabricEvent.target as any)._objects !== undefined &&
                    (fabricEvent.target as any)._objects.some(
                        (obj: any) => obj.selectable,
                    )))
        );
    };
}
