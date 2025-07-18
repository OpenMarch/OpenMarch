import { fabric } from "fabric";
import CanvasMarcher from "./CanvasMarcher";
import Endpoint from "./Endpoint";
import Pathway from "./Pathway";
import Midpoint from "./Midpoint";
import FieldProperties from "@/global/classes/FieldProperties";
import CanvasListeners from "../../../components/canvas/listeners/CanvasListeners";
import Marcher from "@/global/classes/Marcher";
import MarcherPage from "@/global/classes/MarcherPage";
import MarcherPageMap from "@/global/classes/MarcherPageIndex";
import { ActiveObjectArgs } from "@/components/canvas/CanvasConstants";
import * as CoordinateActions from "@/utilities/CoordinateActions";
import Page from "@/global/classes/Page";
import MarcherLine from "@/global/classes/canvasObjects/MarcherLine";
import * as Selectable from "./interfaces/Selectable";
import type { ShapePage } from "electron/database/tables/ShapePageTable";
import { MarcherShape } from "./MarcherShape";
import { rgbaToString } from "../FieldTheme";
import { UiSettings } from "@/stores/UiSettingsStore";
import {
    SectionAppearance,
    getSectionAppearance,
} from "@/global/classes/SectionAppearance";
import { resetMarcherRotation, setGroupAttributes } from "./GroupUtils";
import { MarcherVisualMap } from "@/stores/MarcherVisualStore";

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
    /** Variables for tracking pan position */
    lastPosX = 0;
    lastPosY = 0;
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

    /** Track touch points for pinch-to-zoom */
    private touchPoints: { [key: number]: { x: number; y: number } } = {};
    private lastPinchDistance: number = 0;

    /** CSS transform values for the canvas container */
    private transformValues = {
        translateX: 0,
        translateY: 0,
        scale: 1,
        originX: 0,
        originY: 0,
    };

    /** Track state for CSS-based panning */
    private isPanning = false;

    /** Track pinch gesture for zooming */
    private initialPinchDistance = 0;

    /** Reference to the canvas CSS wrapper element */
    private cssZoomWrapper: HTMLDivElement | null = null;

    /** Add a user preference toggle for trackpad mode in UI */
    private trackpadModeEnabled = false; // Will be set in constructor

    /** Flag to force trackpad pan mode when Alt key is pressed */
    private forceTrackpadPan = false;

    // Bound event handlers for proper cleanup
    private boundHandleAdvancedWheel: ((event: WheelEvent) => void) | null =
        null;
    private boundHandleTouchStart: ((event: TouchEvent) => void) | null = null;
    private boundHandleTouchMove: ((event: TouchEvent) => void) | null = null;
    private boundHandleTouchEnd: ((event: TouchEvent) => void) | null = null;
    private boundHandleAdvancedMouseDown: ((event: MouseEvent) => void) | null =
        null;
    private boundHandleAdvancedMouseMove: ((event: MouseEvent) => void) | null =
        null;
    private boundHandleAdvancedMouseUp: ((event: MouseEvent) => void) | null =
        null;
    private boundHandleKeyDown: ((event: KeyboardEvent) => void) | null = null;
    private boundHandleKeyUp: ((event: KeyboardEvent) => void) | null = null;

    /**
     * Constants for zoom limits
     */
    private readonly INTERNAL_BASE_ZOOM_SENSITIVITY = 0.5; // Base sensitivity for zoom operations

    // Sensitivity settings
    private panSensitivity = 0.5; // Reduced for smoother panning
    private zoomSensitivity = 0.03; // Reduced for gentler zooming
    private trackpadPanSensitivity = 0.5; // Reduced to be less jumpy
    private _activeGroup: fabric.Group | null = null;

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
            stopContextMenu: false, // Allow right click context menu for panning
            enableRetinaScaling: true, // Better display on retina screens
        });

        // CRITICAL: Completely disable Fabric's built-in mousewheel handler to avoid conflicts
        // @ts-ignore - Accessing private property to disable built-in handling
        this.off("mouse:wheel");

        // Init the DOM wrapper for the canvas if available
        if (canvasRef) {
            this.setupExternalPanZoomContainer(canvasRef);
        }

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

        this.on("selection:created", this.handleSelection);
        this.on("selection:updated", this.handleSelection);
        this.on("selection:cleared", this.handleSelection);
    }

    /******************* GROUP SELECTION HANDLING *******************/

    handleSelection(event: fabric.IEvent<MouseEvent>) {
        if (event.selected?.length && event.selected.length > 1) {
            const group = this.getActiveObject();
            if (group && group instanceof fabric.Group) {
                this._activeGroup = group;
                setGroupAttributes(this._activeGroup);
                console.log();
                resetMarcherRotation(group);
            }
        } else {
            this._activeGroup = null;

            // If a marcher was selected, reset the rotation
            if (
                event.selected &&
                event.selected.length &&
                event.selected[0] instanceof CanvasMarcher
            ) {
                console.debug("SELECTED MARCHER", event.selected[0]);
                event.selected[0].angle = 0;
            }
        }
        this.fire("group:selection", { group: this._activeGroup });
    }

    get activeGroup() {
        return this._activeGroup;
    }

    /******************* ADVANCED EVENT HANDLERS ******************/

    /**
     * Returns the coordinates of the center of the field in the canvas's coordinate system.
     * This does not account for zoom or pan; it's the raw center based on field properties.
     */
    public getFieldCenterInCanvasCoords(): { x: number; y: number } {
        if (
            !this._fieldProperties ||
            typeof this._fieldProperties.width !== "number" ||
            typeof this._fieldProperties.height !== "number"
        ) {
            console.warn(
                "getFieldCenterInCanvasCoords: fieldProperties or their dimensions are not fully initialized. Fallback will center HTML canvas (0,0) at viewport center, or no pan if fieldProperties are partially defined.",
            );
            // Fallback: If field dimensions are unknown, returning HTML canvas center results in a pan of (0,0),
            // aligning Fabric canvas (0,0) with HTML canvas (0,0).
            return {
                x: (this.width || 0) / 2,
                y: (this.height || 0) / 2,
            };
        }
        // This is the center of the actual field content as drawn on the Fabric canvas,
        // in Fabric canvas coordinates (before viewport transform).
        // The field content (grid, etc.) is typically drawn from (0,0) up to (fieldProperties.width, fieldProperties.height).
        return {
            x: this._fieldProperties.width / 2,
            y: this._fieldProperties.height / 2,
        };
    }

    /**
     * Handle advanced wheel events for CSS-based zooming and trackpad gestures
     */
    private handleAdvancedWheel(event: WheelEvent) {
        event.preventDefault();
        this.updateSensitivitySettings();

        const isPinchGesture = event.ctrlKey || event.metaKey;

        if (isPinchGesture) {
            this.handlePinchGestureZoom(event);
        } else if (!this.trackpadModeEnabled) {
            this.handleMouseWheelZoom(event);
        } else {
            this.handleTrackpadPan(event);
        }
    }

    private detectTrackpadGesture(event: WheelEvent): boolean {
        const absDeltaX = Math.abs(event.deltaX);
        const isPixelMode = event.deltaMode === 0;
        const hasDecimalDeltas =
            event.deltaX % 1 !== 0 || event.deltaY % 1 !== 0;

        if (event.ctrlKey || event.metaKey) {
            return false;
        }

        if (
            event.deltaMode === 1 ||
            (isPixelMode &&
                !hasDecimalDeltas &&
                event.deltaY !== 0 &&
                absDeltaX === 0) ||
            (isPixelMode &&
                !hasDecimalDeltas &&
                event.deltaY !== 0 &&
                absDeltaX < 0.1)
        ) {
            return false;
        }
        if (
            isPixelMode &&
            (hasDecimalDeltas ||
                absDeltaX > 0.5 ||
                (Math.abs(event.deltaY) > 5 && absDeltaX > 0.05))
        ) {
            return true;
        }
        return false;
    }

    private handleTrackpadZoom(event: WheelEvent) {
        const currentZoom = this.getZoom();
        const zoomDelta = -event.deltaY * 0.005;
        const newZoom = Math.max(0.2, Math.min(25, currentZoom + zoomDelta));

        if (Math.abs(newZoom - currentZoom) < 0.001) {
            return;
        }
        const rect = this.getSelectionElement().getBoundingClientRect();
        const pointer = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
        };
        this.zoomToPoint(pointer, newZoom);
        this.requestRenderAll();
    }

    private handleTrackpadPan(event: WheelEvent) {
        const vpt = this.viewportTransform;
        if (!vpt) return;

        const panX = -event.deltaX * this.trackpadPanSensitivity;
        const panY = -event.deltaY * this.trackpadPanSensitivity;

        vpt[4] += panX;
        vpt[5] += panY;

        this.requestRenderAll();
        this.checkCanvasBounds();
    }

    private handlePinchGestureZoom(event: WheelEvent) {
        this._applyZoom(event, 0.99);
    }

    private handleMouseWheelZoom(event: WheelEvent) {
        this._applyZoom(event, 0.997);
    }

    private _applyZoom(event: WheelEvent, zoomCalculationBase: number) {
        const delta = event.deltaY;
        const currentZoom = this.getZoom();

        if (!this.staticGridRef.objectCaching)
            this.staticGridRef.objectCaching = true;

        const effectiveSensitivity =
            this.INTERNAL_BASE_ZOOM_SENSITIVITY * this.zoomSensitivity;
        const zoomMultiplier = Math.pow(
            zoomCalculationBase,
            delta * effectiveSensitivity,
        );
        let newZoom = currentZoom * zoomMultiplier;

        newZoom = Math.max(0.2, Math.min(25, newZoom));

        if (Math.abs(newZoom - currentZoom) < 0.0001) {
            return;
        }

        const rect = this.getSelectionElement().getBoundingClientRect();
        const pointer = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
        };
        this.zoomToPoint(pointer, newZoom);
        this.checkCanvasBounds();

        // set objectCaching to false after 100ms to improve performance after zooming
        // This is why the grid is blurry but fast while zooming, and sharp while not.
        // If it was always sharp (object caching on), it would be horrendously slow
        clearTimeout(this._zoomTimeout);
        this._zoomTimeout = setTimeout(() => {
            if (this.staticGridRef.objectCaching) {
                this.staticGridRef.objectCaching = false;
                this.requestRenderAll();
            }
        }, 25);
    }

    private checkCanvasBounds() {
        if (!this.viewportTransform) return;

        const vpt = this.viewportTransform;
        const zoom = this.getZoom();
        const canvasWidth = this.width || 0;
        const canvasHeight = this.height || 0;

        let needsAdjustment = false;

        if (vpt[4] > canvasWidth * zoom) {
            vpt[4] = canvasWidth * zoom;
            needsAdjustment = true;
        } else if (vpt[4] < -canvasWidth * 1.25 * zoom) {
            vpt[4] = -canvasWidth * 1.25 * zoom;
            needsAdjustment = true;
        }

        if (vpt[5] > canvasHeight * zoom) {
            vpt[5] = canvasHeight * zoom;
            needsAdjustment = true;
        } else if (vpt[5] < -canvasHeight * zoom) {
            vpt[5] = -canvasHeight * zoom;
            needsAdjustment = true;
        }

        if (needsAdjustment) {
            this.requestRenderAll();
        }
    }

    private handleTouchStart(event: TouchEvent) {
        event.preventDefault();
        for (let i = 0; i < event.touches.length; i++) {
            const touch = event.touches[i];
            this.touchPoints[touch.identifier] = {
                x: touch.clientX,
                y: touch.clientY,
            };
        }
        if (event.touches.length === 2) {
            const touch1 = event.touches[0];
            const touch2 = event.touches[1];
            this.initialPinchDistance = Math.sqrt(
                Math.pow(touch2.clientX - touch1.clientX, 2) +
                    Math.pow(touch2.clientY - touch1.clientY, 2),
            );
        }
    }

    private handleTouchMove(event: TouchEvent) {
        event.preventDefault();
        if (event.touches.length === 1) {
            const touch = event.touches[0];
            const lastTouch = this.touchPoints[touch.identifier];

            if (lastTouch && this.viewportTransform) {
                const deltaX = touch.clientX - lastTouch.x;
                const deltaY = touch.clientY - lastTouch.y;
                this.viewportTransform[4] += deltaX * this.panSensitivity;
                this.viewportTransform[5] += deltaY * this.panSensitivity;
                this.requestRenderAll();
                this.checkCanvasBounds();
                this.touchPoints[touch.identifier] = {
                    x: touch.clientX,
                    y: touch.clientY,
                };
            }
        } else if (event.touches.length === 2) {
            const touch1 = event.touches[0];
            const touch2 = event.touches[1];
            const currentDistance = Math.sqrt(
                Math.pow(touch2.clientX - touch1.clientX, 2) +
                    Math.pow(touch2.clientY - touch1.clientY, 2),
            );
            if (this.initialPinchDistance > 0) {
                const scaleDelta =
                    (currentDistance - this.initialPinchDistance) * 0.01;
                const centerX = (touch1.clientX + touch2.clientX) / 2;
                const centerY = (touch1.clientY + touch2.clientY) / 2;
                const rect = this.getSelectionElement().getBoundingClientRect();
                const pointer = {
                    x: centerX - rect.left,
                    y: centerY - rect.top,
                };
                const currentZoom = this.getZoom();
                const newZoom = Math.max(
                    0.2,
                    Math.min(25, currentZoom + scaleDelta),
                );
                this.zoomToPoint(pointer, newZoom);
                this.requestRenderAll();
                this.initialPinchDistance = currentDistance;
            }
        }
    }

    private handleTouchEnd(event: TouchEvent) {
        for (let i = 0; i < event.changedTouches.length; i++) {
            const touch = event.changedTouches[i];
            delete this.touchPoints[touch.identifier];
        }
        if (event.touches.length < 2) {
            this.initialPinchDistance = 0;
        }
    }

    private handleAdvancedMouseDown(event: MouseEvent) {
        if (event.button === 2 || event.button === 1 || this.forceTrackpadPan) {
            event.preventDefault();
            this.isPanning = true;
            this.lastPosX = event.clientX;
            this.lastPosY = event.clientY;
            if (this.cssZoomWrapper) {
                this.cssZoomWrapper.style.cursor = "grabbing";
            }
        }
    }

    private handleAdvancedMouseMove(event: MouseEvent) {
        if (this.isPanning && this.viewportTransform) {
            event.preventDefault();
            const deltaX = event.clientX - this.lastPosX;
            const deltaY = event.clientY - this.lastPosY;
            this.viewportTransform[4] += deltaX * this.panSensitivity;
            this.viewportTransform[5] += deltaY * this.panSensitivity;
            this.requestRenderAll();
            this.checkCanvasBounds();
            this.lastPosX = event.clientX;
            this.lastPosY = event.clientY;
        }
    }

    private handleAdvancedMouseUp(event: MouseEvent) {
        if (this.isPanning) {
            this.isPanning = false;
            if (this.cssZoomWrapper) {
                this.cssZoomWrapper.style.cursor = "default";
            }
        }
    }

    private handleKeyDown(event: KeyboardEvent) {
        if (event.altKey) {
            this.forceTrackpadPan = true;
            if (this.cssZoomWrapper) {
                this.cssZoomWrapper.style.cursor = "grab";
            }
        }
    }

    private handleKeyUp(event: KeyboardEvent) {
        if (!event.altKey) {
            this.forceTrackpadPan = false;
            if (this.cssZoomWrapper && !this.isPanning) {
                this.cssZoomWrapper.style.cursor = "default";
            }
        }
    }

    public resetCSSTransform() {
        this.transformValues = {
            translateX: 0,
            translateY: 0,
            scale: 1,
            originX: 0,
            originY: 0,
        };
        this.applyCSSTransform();
    }

    public getCSSTransformValues() {
        return { ...this.transformValues };
    }

    public setCSSTransformValues(values: Partial<typeof this.transformValues>) {
        this.transformValues = { ...this.transformValues, ...values };
        this.applyCSSTransform();
    }

    private applyCSSTransform() {
        if (this.cssZoomWrapper) {
            const { translateX, translateY, scale, originX, originY } =
                this.transformValues;
            this.cssZoomWrapper.style.transformOrigin = `${originX}px ${originY}px`;
            this.cssZoomWrapper.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
            this.requestRenderAll();
        }
    }

    /******************* ADVANCED NAVIGATION METHODS ******************/

    /**
     * Detect if the current platform is macOS
     */
    private detectMacOS(): boolean {
        return navigator.platform.toUpperCase().indexOf("MAC") >= 0;
    }

    /**
     * Setup the external CSS wrapper for pan/zoom functionality
     * THIS IS THE VERSION WE WANT TO KEEP
     */
    private setupExternalPanZoomContainer(canvasElement: HTMLCanvasElement) {
        // Initialize trackpad mode based on platform
        this.trackpadModeEnabled = this.detectMacOS();

        // Update sensitivity settings from UI settings
        this.updateSensitivitySettings();

        // Create a wrapper div for CSS transforms if it doesn't exist
        const existingWrapper = canvasElement.parentElement;
        if (
            existingWrapper &&
            existingWrapper.classList.contains("canvas-zoom-wrapper")
        ) {
            this.cssZoomWrapper = existingWrapper as HTMLDivElement;
        } else {
            this.cssZoomWrapper = document.createElement("div");
            this.cssZoomWrapper.className = "canvas-zoom-wrapper";
            this.cssZoomWrapper.style.cssText = `
                position: relative;
                overflow: hidden;
                width: 100%;
                height: 100%;
                transform-origin: 0 0;
                will-change: transform;
            `;
            if (canvasElement.parentNode) {
                canvasElement.parentNode.insertBefore(
                    this.cssZoomWrapper,
                    canvasElement,
                );
                this.cssZoomWrapper.appendChild(canvasElement);
                const upperCanvas = (this as any)
                    .upperCanvasEl as HTMLCanvasElement | null;
                if (
                    upperCanvas &&
                    upperCanvas.parentNode !== this.cssZoomWrapper
                ) {
                    if (
                        upperCanvas.parentNode ===
                        this.cssZoomWrapper.parentNode
                    ) {
                        this.cssZoomWrapper.appendChild(upperCanvas);
                        // console.log(
                        //     "🔧 Moved upperCanvasEl into cssZoomWrapper.",
                        // );
                    } else {
                        console.warn(
                            "🔧 upperCanvasEl was not a sibling of cssZoomWrapper. Attempting to move it, but layout might be affected.",
                        );
                        this.cssZoomWrapper.appendChild(upperCanvas);
                    }
                } else if (!upperCanvas) {
                    console.warn(
                        "🔧 upperCanvasEl is null or undefined during setup. This might lead to event handling issues.",
                    );
                }
            }
        }
        this.setupAdvancedEventListeners();
    }

    private updateSensitivitySettings() {
        if (this._uiSettings?.mouseSettings) {
            this.zoomSensitivity =
                this._uiSettings.mouseSettings.zoomSensitivity;
            this.panSensitivity = this._uiSettings.mouseSettings.panSensitivity;
            this.trackpadPanSensitivity =
                this._uiSettings.mouseSettings.trackpadPanSensitivity;
            if (this._uiSettings.mouseSettings.trackpadMode !== undefined) {
                this.trackpadModeEnabled =
                    this._uiSettings.mouseSettings.trackpadMode;
            }
        }
    }

    private setupAdvancedEventListeners() {
        if (!this.cssZoomWrapper) {
            console.error(
                `🔧 ERROR: cssZoomWrapper is null, cannot setup advanced listeners`,
            );
            return;
        }

        this.removeAdvancedEventListeners();

        this.boundHandleAdvancedWheel = this.handleAdvancedWheel.bind(this);
        this.boundHandleTouchStart = this.handleTouchStart.bind(this);
        this.boundHandleTouchMove = this.handleTouchMove.bind(this);
        this.boundHandleTouchEnd = this.handleTouchEnd.bind(this);
        this.boundHandleAdvancedMouseDown =
            this.handleAdvancedMouseDown.bind(this);
        this.boundHandleAdvancedMouseMove =
            this.handleAdvancedMouseMove.bind(this);
        this.boundHandleAdvancedMouseUp = this.handleAdvancedMouseUp.bind(this);
        this.boundHandleKeyDown = this.handleKeyDown.bind(this);
        this.boundHandleKeyUp = this.handleKeyUp.bind(this);

        this.cssZoomWrapper.addEventListener(
            "wheel",
            this.boundHandleAdvancedWheel,
            { passive: false },
        );

        this.cssZoomWrapper.addEventListener(
            "touchstart",
            this.boundHandleTouchStart,
            { passive: false },
        );
        this.cssZoomWrapper.addEventListener(
            "touchmove",
            this.boundHandleTouchMove,
            { passive: false },
        );
        this.cssZoomWrapper.addEventListener(
            "touchend",
            this.boundHandleTouchEnd,
            { passive: false },
        );
        this.cssZoomWrapper.addEventListener(
            "mousedown",
            this.boundHandleAdvancedMouseDown,
        );
        this.cssZoomWrapper.addEventListener(
            "mousemove",
            this.boundHandleAdvancedMouseMove,
        );
        this.cssZoomWrapper.addEventListener(
            "mouseup",
            this.boundHandleAdvancedMouseUp,
        );
        this.cssZoomWrapper.addEventListener(
            "mouseleave",
            this.boundHandleAdvancedMouseUp,
        );
        document.addEventListener("keydown", this.boundHandleKeyDown);
        document.addEventListener("keyup", this.boundHandleKeyUp);
        console.log(`🔧 ✅ All advanced event listeners attached successfully`);
    }

    private removeAdvancedEventListeners() {
        if (!this.cssZoomWrapper) return;

        if (this.boundHandleAdvancedWheel) {
            this.cssZoomWrapper.removeEventListener(
                "wheel",
                this.boundHandleAdvancedWheel,
            );
        }
        if (this.boundHandleTouchStart) {
            this.cssZoomWrapper.removeEventListener(
                "touchstart",
                this.boundHandleTouchStart,
            );
        }
        if (this.boundHandleTouchMove) {
            this.cssZoomWrapper.removeEventListener(
                "touchmove",
                this.boundHandleTouchMove,
            );
        }
        if (this.boundHandleTouchEnd) {
            this.cssZoomWrapper.removeEventListener(
                "touchend",
                this.boundHandleTouchEnd,
            );
        }
        if (this.boundHandleAdvancedMouseDown) {
            this.cssZoomWrapper.removeEventListener(
                "mousedown",
                this.boundHandleAdvancedMouseDown,
            );
        }
        if (this.boundHandleAdvancedMouseMove) {
            this.cssZoomWrapper.removeEventListener(
                "mousemove",
                this.boundHandleAdvancedMouseMove,
            );
        }
        if (this.boundHandleAdvancedMouseUp) {
            this.cssZoomWrapper.removeEventListener(
                "mouseup",
                this.boundHandleAdvancedMouseUp,
            );
            this.cssZoomWrapper.removeEventListener(
                "mouseleave",
                this.boundHandleAdvancedMouseUp,
            );
        }
        if (this.boundHandleKeyDown) {
            document.removeEventListener("keydown", this.boundHandleKeyDown);
        }
        if (this.boundHandleKeyUp) {
            document.removeEventListener("keyup", this.boundHandleKeyUp);
        }
    }

    /******************* INSTANCE METHODS ******************/
    refreshCanvasSize() {
        this.setWidth(window.innerWidth);
        this.setHeight(window.innerHeight);
    }

    get listeners() {
        return this._listeners;
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

    bringAllControlPointsTooFront() {
        for (const marcherShape of this.marcherShapes) {
            marcherShape.controlPoints.forEach((controlPoint) => {
                controlPoint.bringToFront();
            });
        }
    }

    renderMarcherShapes({ shapePages }: { shapePages: ShapePage[] }) {
        const existingMarcherShapeMap = new Map(
            this.marcherShapes.map((mp) => [mp.shapePage.shape_id, mp]),
        );
        const newShapeIds = new Set(shapePages.map((sp) => sp.shape_id));
        const removedShapeIds = new Set();
        for (const existingMarcherShape of existingMarcherShapeMap) {
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

    // CHANGED
    /**
     * Render the given marcherPages on the canvas
     *
     * @param marcherVisuals The map of marcher visuals
     * @param marcherPages All of the marcher pages
     * @param pageId The id of the page to render marchers for
     */
    renderMarchers = async ({
        marcherVisuals,
        marcherPages,
        pageId,
    }: {
        marcherVisuals: MarcherVisualMap;
        marcherPages: MarcherPageMap;
        pageId: number;
    }) => {
        CanvasMarcher.theme = this.fieldProperties.theme;

        // update coordinate for every canvas marcher
        const marchers = MarcherPage.getByPageId(marcherPages, pageId);
        marchers.forEach((marcherPage) => {
            marcherVisuals[marcherPage.marcher_id]
                .getCanvasMarcher()
                .setMarcherCoords(marcherPage);
        });

        if (this._listeners && this._listeners.refreshMarchers)
            this._listeners?.refreshMarchers();
        this.bringAllControlPointsTooFront();
        this.requestRenderAll();
    };

    // CHANGEME
    refreshMarchers = () => {
        const canvasMarchers = this.getCanvasMarchers();
        canvasMarchers.forEach((canvasMarcher) => {
            canvasMarcher.setMarcherCoords(canvasMarcher.coordinate);
        });
        if (this._listeners && this._listeners.refreshMarchers)
            this._listeners?.refreshMarchers();
        this.requestRenderAll();
    };

    /**
     * Set the coordinates of objects without updating them in the database.
     *
     * @param objects The objects to set the local coordinates of
     */
    setLocalCoordinates = (objects: { x: number; y: number; id: number }[]) => {
        const canvasMarchers = this.getCanvasMarchersByIds(
            objects.map((o) => o.id),
        );
        // Sort the objects and canvasMarchers by id to ensure matching order
        const sortedObjects = [...objects].sort((a, b) => a.id - b.id);
        const sortedCanvasMarchers = [...canvasMarchers].sort(
            (a, b) => a.marcherObj.id - b.marcherObj.id,
        );
        if (sortedObjects.length !== sortedCanvasMarchers.length) {
            console.warn(
                "Number of objects and canvasMarchers do not match - setLocalCoordinates: Canvas.tsx",
                objects,
                canvasMarchers,
            );
        }

        sortedCanvasMarchers.forEach((canvasMarcher, index) => {
            canvasMarcher.set({
                top: sortedObjects[index].x,
                left: sortedObjects[index].y,
            });
            canvasMarcher.setCoords();
        });
        this.requestRenderAll();
    };

    // CHANGEME
    /**
     * Brings all of the canvasMarchers to the front of the canvas
     */
    sendCanvasMarchersToFront = () => {
        const curCanvasMarchers: CanvasMarcher[] = this.getCanvasMarchers();
        curCanvasMarchers.forEach((canvasMarcher) => {
            this.bringToFront(canvasMarcher);
        });
        this.bringAllControlPointsTooFront();
    };

    // CHANGEME
    /**
     * Brings the specified canvasMarcher to the front of the canvas
     */
    sendCanvasMarcherToFront = (canvasMarcher: CanvasMarcher) => {
        this.bringToFront(canvasMarcher);
        this.bringAllControlPointsTooFront();
    };

    // CHANGEME
    /**
     * Render static marchers for the given pages
     *
     * @param marcherVisuals The marcher visual map
     * @param marcherPages All of the marcher pages
     * @param prevPageId The id of the page to render marchers for
     * @param nextPageId The id of the next page to render marchers for
     */
    renderEndpoints = async ({
        marcherVisuals,
        marcherPages,
        prevPageId,
        nextPageId,
    }: {
        marcherVisuals: MarcherVisualMap;
        marcherPages: MarcherPageMap;
        prevPageId: number | null;
        nextPageId: number | null;
    }) => {
        // show previous endpoint and update its coordinates, hide if no previous page
        if (prevPageId !== null) {
            const marchers = MarcherPage.getByPageId(marcherPages, prevPageId);
            marchers.forEach((marcherPage) => {
                marcherVisuals[marcherPage.marcher_id]
                    .getPreviousEndpoint()
                    .show();
                marcherVisuals[marcherPage.marcher_id]
                    .getPreviousEndpoint()
                    .updateCoords(marcherPage);
            });
        } else {
            Object.values(marcherVisuals).forEach((marcherVisual) => {
                marcherVisual.getPreviousEndpoint().hide();
            });
        }

        // show next endpoint and update its coordinates, hide if no next page
        if (nextPageId !== null) {
            const marchers = MarcherPage.getByPageId(marcherPages, nextPageId);
            marchers.forEach((marcherPage) => {
                marcherVisuals[marcherPage.marcher_id].getNextEndpoint().show();
                marcherVisuals[marcherPage.marcher_id]
                    .getNextEndpoint()
                    .updateCoords(marcherPage);
            });
        } else {
            Object.values(marcherVisuals).forEach((marcherVisual) => {
                marcherVisual.getNextEndpoint().hide();
            });
        }
    };

    // CHANGEME
    /**
     * Render static marchers for the given page
     *
     * @param color The color of the static marchers (use rgba for transparency, e.g. "rgba(255, 255, 255, 1)")
     * @param intendedMarcherPages The marcher pages to render (must be filtered by the given page)
     * @param allMarchers All marchers in the drill
     * @returns The Endpoint objects created
     */
    renderIndividualStaticMarchers = ({
        color,
        intendedMarcherPages,
        allMarchers,
    }: {
        color: string;
        intendedMarcherPages: MarcherPage[];
        allMarchers: Marcher[];
    }) => {
        const createdStaticMarchers: Endpoint[] = [];
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

            const staticMarcher = new Endpoint({
                coordinate: marcherPage,
                color: color,
            });

            this.add(staticMarcher);
            createdStaticMarchers.push(staticMarcher);
        });
        this.requestRenderAll();

        return createdStaticMarchers;
    };

    // CHANGEME
    /**
     * Remove endpoints from the canvas
     */
    removeEndpoints = () => {
        const curEndpoints = this.getEndpoints();

        curEndpoints.forEach((canvasMarcher) => {
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

    // CHANGEME
    /**
     * Render pathways from any object containing an XY coordinate
     * to another object containing an XY coordinate, including MarcherPage(s).
     *
     * @param start The starting point of the pathway
     * @param end The ending point of the pathway
     * @param marcherId The ID of the marcher this pathway belongs to
     * @param color The color of the pathways
     * @param strokeWidth The width of the pathways
     * @param dashed Whether the pathways should be dashed
     */
    renderIndividualPathwayAndMidpoint = ({
        start,
        end,
        marcherId,
        color,
        strokeWidth,
        dashed = false,
    }: {
        start: { x: number; y: number; [key: string]: any };
        end: { x: number; y: number; [key: string]: any };
        marcherId: number;
        color: string;
        strokeWidth?: number;
        dashed?: boolean;
    }) => {
        const pathway = new Pathway({
            start: start,
            end: end,
            color,
            strokeWidth,
            dashed,
            marcherId,
        });
        const midpoint = new Midpoint({
            start: start,
            end: end,
            innerColor: "white",
            outerColor: color,
            marcherId,
        });

        this.add(pathway);
        this.add(midpoint);
        this.requestRenderAll();

        return [pathway, midpoint];
    };

    // CHANGEME
    /**
     * Renders pathways, midpoints, and endpoints for the given pages.
     * If any page is null, the pathway/midpoint/endpoint will be hidden.
     *
     * @param marcherVisuals The marcher visual map
     * @param marcherPages All of the marcher pages
     * @param prevPageId The id of the page to render paths for
     * @param currPageId The id of the current page to render paths for
     * @param nextPageId The id of the next page to render paths for
     */
    renderPathVisuals = async ({
        marcherVisuals,
        marcherPages,
        prevPageId,
        currPageId,
        nextPageId,
    }: {
        marcherVisuals: MarcherVisualMap;
        marcherPages: MarcherPageMap;
        prevPageId: number | null;
        currPageId: number;
        nextPageId: number | null;
    }) => {
        // hide/show objects
        if (prevPageId == null) {
            Object.values(marcherVisuals).forEach((marcherVisual) => {
                marcherVisual.getPreviousPathway().hide();
                marcherVisual.getPreviousMidpoint().hide();
                marcherVisual.getPreviousEndpoint().hide();
            });
        }
        if (nextPageId == null) {
            Object.values(marcherVisuals).forEach((marcherVisual) => {
                marcherVisual.getNextPathway().hide();
                marcherVisual.getNextMidpoint().hide();
                marcherVisual.getNextEndpoint().hide();
            });
        }

        if (prevPageId !== null) {
            const prevMarchers = MarcherPage.getByPageId(
                marcherPages,
                prevPageId,
            );
            prevMarchers.forEach((marcherPage) => {
                const marcherVisual = marcherVisuals[marcherPage.marcher_id];
                if (marcherVisual) {
                    const previousPathway = marcherVisual.getPreviousPathway();
                    const previousMidpoint =
                        marcherVisual.getPreviousMidpoint();
                    const previousEndpoint =
                        marcherVisual.getPreviousEndpoint();

                    previousPathway.show();
                    previousMidpoint.show();
                    previousEndpoint.show();

                    previousPathway.updateEndCoords(marcherPage);
                    previousMidpoint.updateCoords(marcherPage);
                    previousEndpoint.updateCoords(marcherPage);
                }
            });
        }

        if (nextPageId !== null) {
            const nextMarchers = MarcherPage.getByPageId(
                marcherPages,
                nextPageId,
            );
            nextMarchers.forEach((marcherPage) => {
                const marcherVisual = marcherVisuals[marcherPage.marcher_id];
                if (marcherVisual) {
                    const nextPathway = marcherVisual.getNextPathway();
                    const nextMidpoint = marcherVisual.getNextMidpoint();
                    const nextEndpoint = marcherVisual.getNextEndpoint();

                    nextPathway.show();
                    nextMidpoint.show();
                    nextEndpoint.show();

                    nextPathway.updateStartCoords(marcherPage);
                    nextMidpoint.updateCoords(marcherPage);
                    nextEndpoint.updateCoords(marcherPage);
                }
            });
        }
    };

    /*
    renderPathwaysAndMidpoints = ({
        marcherPages,
        startPageId,
        endPageId,
        color,
        strokeWidth,
        dashed = false,
    }: {
        marcherPages: MarcherPageMap;
        startPageId: number;
        endPageId: number;
        color: string;
        strokeWidth?: number;
        dashed?: boolean;
    }) => {
        const createdPathways: Pathway[] = [];
        const createdMidpoints: Midpoint[] = [];

        // Get MarcherPages for the start and end pages
        const endPageMarcherPages = MarcherPage.getByPageId(
            marcherPages,
            endPageId,
        );
        const startPageMarcherPages =
            marcherPages.marcherPagesByPage[startPageId];

        endPageMarcherPages.forEach((previousMarcherPage) => {
            const currentMarcherPage =
                startPageMarcherPages[previousMarcherPage.marcher_id];

            // If the marcher does not exist on the selected page, return
            if (!currentMarcherPage) {
                console.error(
                    "Selected marcher page not found - renderPathways: Canvas.tsx",
                    previousMarcherPage,
                );
                return;
            }

            // Add pathways
            const pathway = new Pathway({
                start: previousMarcherPage,
                end: currentMarcherPage,
                color,
                strokeWidth,
                dashed,
                marcherId: previousMarcherPage.marcher_id,
            });
            createdPathways.push(pathway);
            this.add(pathway);

            // Add midpoints if the marcher moves
            if (
                previousMarcherPage.x !== currentMarcherPage.x ||
                previousMarcherPage.y !== currentMarcherPage.y
            ) {
                const midpoint = new Midpoint({
                    start: previousMarcherPage,
                    end: currentMarcherPage,
                    innerColor: "white",
                    outerColor: color,
                    marcherId: previousMarcherPage.marcher_id,
                });

                createdMidpoints.push(midpoint);
                this.add(midpoint);
            }
        });
        this.requestRenderAll();
        return [createdPathways, createdMidpoints];
    };*/

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
     * Professional zoom handler - crisp rendering, no blurriness
     */
    private handleMouseWheel = (fabricEvent: fabric.IEvent<WheelEvent>) => {
        const delta = fabricEvent.e.deltaY;
        const currentZoom = this.getZoom();

        // set objectCaching to true to improve performance while zooming
        if (!this.staticGridRef.objectCaching)
            this.staticGridRef.objectCaching = true;

        // Professional zoom calculation - smooth and precise
        const zoomFactor = 0.999 ** (delta * 0.5); // Reduced sensitivity for precision
        let newZoom = currentZoom * zoomFactor;

        // Apply professional zoom limits
        newZoom = Math.max(0.2, Math.min(25, newZoom));

        // Apply zoom immediately with crisp rendering
        this.zoomToPoint(
            { x: fabricEvent.e.offsetX, y: fabricEvent.e.offsetY },
            newZoom,
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

        // Coordinate dots (cannot implement right now because the canvas gets really slow)
        // const coordinateDots = this.getCoordinateDots();
        // fieldArray.push(...coordinateDots);

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

    private getCoordinateDots(): fabric.Circle[] {
        const fieldWidth = this.fieldProperties.width;
        const fieldHeight = this.fieldProperties.height;
        const pixelsPerStep = this.fieldProperties.pixelsPerStep;
        const centerFrontPoint = this.fieldProperties.centerFrontPoint;

        const output: fabric.Circle[] = [];

        const coordinateDotProps: fabric.ICircleOptions = {
            fill: rgbaToString(this.fieldProperties.theme.tertiaryStroke),
            radius: 2,
            selectable: false,
            originX: "center",
            originY: "center",
            strokeWidth: 0,
        };
        const xDelta =
            Math.abs(this.uiSettings?.coordinateRounding?.nearestXSteps ?? 0) *
            pixelsPerStep;
        const yDelta =
            Math.abs(this.uiSettings?.coordinateRounding?.nearestYSteps ?? 0) *
            pixelsPerStep;

        // If both X and Y delta are set, create a grid of dots
        if (xDelta > 0 && yDelta > 0) {
            for (
                let currentX = 0;
                currentX < fieldWidth / 2;
                currentX += xDelta
            ) {
                for (
                    let currentY = 0;
                    currentY < fieldHeight;
                    currentY += yDelta
                ) {
                    output.push(
                        new fabric.Circle({
                            left: centerFrontPoint.xPixels + currentX + 0.5,
                            top: centerFrontPoint.yPixels - currentY + 0.5,
                            ...coordinateDotProps,
                        }),
                    );
                    // If the dot is not at the center, add a dot at the negative coordinates
                    if (currentX !== 0 && currentY !== 0) {
                        output.push(
                            new fabric.Circle({
                                left: centerFrontPoint.xPixels - currentX + 0.5,
                                top: centerFrontPoint.yPixels - currentY + 0.5,
                                ...coordinateDotProps,
                            }),
                        );
                    }
                }
            }
        }
        return output;
    }

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
     * @returns A list of all Endpoint objects in the canvas
     */
    getEndpoints({ active = false }: { active?: boolean } = {}): Endpoint[] {
        return active
            ? this.getActiveObjectsByType(Endpoint)
            : this.getObjectsByType(Endpoint);
    }

    /**
     * @param active true if you only want to return active (selected) objects. By default, false
     * @returns A list of all Midpoint objects in the canvas
     */
    getMidpoints({ active = false }: { active?: boolean } = {}): Midpoint[] {
        return active
            ? this.getActiveObjectsByType(Midpoint)
            : this.getObjectsByType(Midpoint);
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
