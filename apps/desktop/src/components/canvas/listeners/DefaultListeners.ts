// @ts-ignore
import { fabric } from "fabric";
import CanvasListeners from "./CanvasListeners";
import OpenMarchCanvas from "../../../global/classes/canvasObjects/OpenMarchCanvas";
import CanvasMarcher from "../../../global/classes/canvasObjects/CanvasMarcher";
import MarcherPage, {
    ModifiedMarcherPageArgs,
} from "@/global/classes/MarcherPage";

export default class DefaultListeners implements CanvasListeners {
    protected canvas: OpenMarchCanvas & fabric.Canvas;
    private lastPinchDistance: number = 0;
    private isGesturing: boolean = false;
    private momentumX: number = 0;
    private momentumY: number = 0;
    private lastGestureTime: number = 0;
    private readonly ZOOM_SENSITIVITY: number = 0.008;
    private readonly MOUSE_WHEEL_ZOOM_SENSITIVITY: number = 0.002;
    private readonly MOMENTUM_DECAY: number = 0.95;
    private readonly MOMENTUM_THRESHOLD: number = 0.01;
    private readonly SCROLL_SENSITIVITY: number = 0.8;
    private readonly TOUCHPAD_SCROLL_SENSITIVITY: number = 0.4;
    private readonly HORIZONTAL_SCROLL_SENSITIVITY: number = 0.2;
    private readonly MIN_ZOOM: number = 0.3;
    private readonly MAX_ZOOM: number = 10;
    private isMiddleMouseDown: boolean = false;
    private lastMousePosition = { x: 0, y: 0 };
    private lastWheelTime: number = 0;
    private readonly WHEEL_TIMEOUT = 50;
    private lastDeltaX: number = 0;
    private lastDeltaY: number = 0;
    private readonly SMOOTH_FACTOR: number = 0.15;
    private scale: number = 1;
    private isTouchPadGesture: boolean = false;
    private lastTouchpadPinchScale: number = 1;
    private _zoomTimeout: NodeJS.Timeout | undefined;
    private _scrollAnimationFrame: number | null = null;
    private _isZooming: boolean = false;
    private _originalInteractive: boolean | undefined;

    constructor({ canvas }: { canvas: OpenMarchCanvas }) {
        this.canvas = canvas as OpenMarchCanvas & fabric.Canvas;
        this.handleObjectModified = this.handleObjectModified.bind(this);
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleMouseWheel = this.handleMouseWheel.bind(this);
        this.updateMomentum = this.updateMomentum.bind(this);
    }

    initiateListeners = () => {
        this.canvas.on("object:modified", this.handleObjectModified);
        this.canvas.on("mouse:down", this.handleMouseDown);
        this.canvas.on("mouse:move", this.handleMouseMove);
        this.canvas.on("mouse:up", this.handleMouseUp);

        // Only register mouse:wheel if advanced navigation (trackpad mode) is not enabled
        // This prevents conflicts with the advanced wheel handler in OpenMarchCanvas
        if (!this.isAdvancedNavigationEnabled()) {
            console.log(
                `🔧 DefaultListeners: Registering wheel handler (trackpad mode disabled)`,
            );
            this.canvas.on("mouse:wheel", this.handleMouseWheel);
        } else {
            console.log(
                `🔧 DefaultListeners: Skipping wheel handler (trackpad mode enabled - using advanced handler)`,
            );
        }

        // NOTE: Removed momentum animation loop for professional immediate response
        // Professional navigation should be instant and precise, not momentum-based
    };

    cleanupListeners = () => {
        this.canvas.off("object:modified", this.handleObjectModified as any);
        this.canvas.off("mouse:down", this.handleMouseDown as any);
        this.canvas.off("mouse:move", this.handleMouseMove as any);
        this.canvas.off("mouse:up", this.handleMouseUp as any);

        // Only remove mouse:wheel if it was registered (i.e., advanced navigation was disabled)
        if (!this.isAdvancedNavigationEnabled()) {
            this.canvas.off("mouse:wheel", this.handleMouseWheel as any);
        }
    };

    /**
     * Update the marcher's position when it is moved
     */
    handleObjectModified(fabricEvent: fabric.IEvent<MouseEvent>) {
        /*
            ---- Determine if the mouse was clicked or dragged ----
            If the mouse was clicked, likely the user does not want to move the marcher
            This prevents the marcher from moving a little bit when it's just trying to be selected
        */
        // Check if the timing threshold has past before checking the distance (saves compute)
        if (
            Date.now() - this.canvas.selectDragStart.time <
            this.canvas.DRAG_TIMER_MILLISECONDS
        ) {
            const mouseDistance = Math.sqrt(
                (fabricEvent.e.clientX - this.canvas.selectDragStart.x) ** 2 +
                    (fabricEvent.e.clientY - this.canvas.selectDragStart.y) **
                        2,
            );
            // Check if the mouse has moved more than the threshold
            if (mouseDistance < this.canvas.DISTANCE_THRESHOLD) {
                // If the mouse was clicked and not dragged, return and don't update the marcher
                this.canvas.refreshMarchers();
                return;
            }
        }

        const modifiedMarcherPages: ModifiedMarcherPageArgs[] = [];
        this.canvas
            .getActiveObjectsByType(CanvasMarcher)
            .forEach((activeCanvasMarcher: CanvasMarcher) => {
                // If the active object is not a marcher, return
                if (!(activeCanvasMarcher instanceof CanvasMarcher)) return;

                const newCoords = activeCanvasMarcher.getMarcherCoords();
                modifiedMarcherPages.push({
                    marcher_id: activeCanvasMarcher.marcherObj.id,
                    page_id: activeCanvasMarcher.marcherPage.page_id,
                    x: newCoords.x,
                    y: newCoords.y,
                });
            });

        MarcherPage.updateMarcherPages(modifiedMarcherPages);
    }

    /**
     * Set the canvas to dragging mode on mousedown.
     */
    handleMouseDown(fabricEvent: fabric.IEvent<MouseEvent>) {
        const evt = fabricEvent.e;

        // Handle middle mouse button or right click for panning
        if (evt.button === 1 || evt.button === 2 || evt.altKey) {
            // Middle mouse button, right click, or Alt key
            evt.preventDefault();
            this.isMiddleMouseDown = true;
            this.lastMousePosition = { x: evt.clientX, y: evt.clientY };
            this.canvas.selection = false;
            return;
        }

        // For left-click, always enable selection mode
        // This ensures multi-select (Shift+drag) always works
        this.canvas.selection = true;
        this.canvas.isDragging = false;

        // First check if clicking directly on a marcher
        if (OpenMarchCanvas.selectionHasObjects(fabricEvent)) {
            this.canvas.selectDragStart = {
                x: evt.clientX,
                y: evt.clientY,
                time: Date.now(),
            };
            return;
        }

        // If not directly on a marcher, check if near one (proximity check)
        if (this.isNearMarcher(fabricEvent)) {
            // Near a marcher but not on one - keep selection mode enabled
            // This allows for easy selection without interfering with multi-select
            return;
        }

        // If not near any marcher, still keep selection enabled
        // This allows for multi-select box creation anywhere on canvas
    }

    /**
     * Check if the click is near any marcher, with proximity threshold scaled by zoom level
     */
    private isNearMarcher(fabricEvent: fabric.IEvent<MouseEvent>): boolean {
        // Get current pointer position
        const pointer = this.canvas.getPointer(fabricEvent.e);

        // Get current zoom level to adjust proximity threshold
        const zoom = this.canvas.getZoom();

        // Base proximity threshold in pixels (screen distance)
        // Higher threshold means you need to click further away from marchers
        const baseProximity = 30;

        // Adjust proximity based on zoom - smaller when zoomed in, larger when zoomed out
        // This makes it easier to pan when zoomed in close to marchers
        const adjustedProximity = baseProximity / Math.sqrt(zoom);

        // Get all marcher objects on canvas
        const marchers = this.canvas
            .getObjects()
            .filter((obj) => obj instanceof CanvasMarcher);

        // Check if any marcher is within proximity
        for (const marcherObj of marchers) {
            const marcher = marcherObj as CanvasMarcher;

            // Get marcher center point
            const marcherCenter = marcher.getCenterPoint();

            // Calculate distance to marcher
            const dx = pointer.x - marcherCenter.x;
            const dy = pointer.y - marcherCenter.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // If within adjusted proximity, consider it "near"
            if (distance <= adjustedProximity) {
                return true;
            }
        }

        // No nearby marchers found
        return false;
    }

    /**
     * Move the canvas on mouse:move when in dragging mode
     */
    handleMouseMove(fabricEvent: fabric.IEvent<MouseEvent>) {
        const e = fabricEvent.e;
        const vpt = this.canvas.viewportTransform;

        if (!vpt) {
            console.error(
                "Viewport transform is not set. This will cause issues with panning around the canvas.",
            );
            return;
        }

        // Enhanced middle mouse or Alt+drag panning (right-click, middle-click, Alt+click)
        if (this.isMiddleMouseDown) {
            const deltaX = e.clientX - this.lastMousePosition.x;
            const deltaY = e.clientY - this.lastMousePosition.y;

            // Adjust panning speed based on zoom level for more precise control
            const zoomFactor = this.canvas.getZoom();
            const panSpeed = Math.min(1, 1 / Math.max(0.5, zoomFactor));

            // Apply the pan with adjusted speed
            vpt[4] += deltaX * panSpeed;
            vpt[5] += deltaY * panSpeed;

            this.lastMousePosition = { x: e.clientX, y: e.clientY };
            this.canvas.requestRenderAll();
            return;
        }

        // Note: Removed left-click canvas dragging logic
        // Left-click is now exclusively for selection and multi-select
    }

    /**
     * Handler for the mouse up event
     */
    handleMouseUp(fabricEvent: fabric.IEvent<MouseEvent>) {
        const evt = fabricEvent.e;

        // Reset middle mouse state
        if (evt.button === 1 || this.isMiddleMouseDown) {
            this.isMiddleMouseDown = false;
        }

        if (!this.canvas.viewportTransform) {
            console.error(
                "Viewport transform is not set. This will cause issues with panning around the canvas.",
            );
            return;
        }

        // on mouse up we want to recalculate new interaction
        // for all objects, so we call setViewportTransform
        this.canvas.setViewportTransform(this.canvas.viewportTransform);
        this.canvas.isDragging = false;
        this.canvas.selection = true;
    }

    private handleMouseWheel = (opt: fabric.IEvent<WheelEvent>) => {
        const e = opt.e;

        console.log(
            `🔍 DEFAULT WHEEL called: deltaX=${e.deltaX.toFixed(2)}, deltaY=${e.deltaY.toFixed(2)}`,
        );

        // Check if zoom on scroll is disabled
        if (!this.canvas.uiSettings.mouseSettings.zoomOnScroll) {
            console.log(`🔍 DEFAULT WHEEL: zoom disabled, skipping`);
            return;
        }

        // Always prevent default to ensure smooth scrolling
        e.preventDefault();

        // Skip if canvas not initialized
        if (!this.canvas.viewportTransform) return;

        console.log(`🔍 DEFAULT WHEEL: proceeding with professional zoom`);
        // Professional zoom implementation - no blurriness, no momentum
        this.handleProfessionalZoom(e);
    };

    /**
     * Professional-grade zoom handler with crisp rendering and no momentum
     */
    private handleProfessionalZoom(e: WheelEvent) {
        // Rate limiting for smooth performance (60fps target)
        const now = Date.now();
        if (now - this.lastWheelTime < 16) {
            // ~60fps
            return;
        }
        this.lastWheelTime = now;

        // Check if this is horizontal scroll (shift+wheel or native horizontal)
        const isHorizontalScroll =
            Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey;

        if (isHorizontalScroll && !e.ctrlKey && !e.metaKey) {
            // Handle horizontal pan with immediate crisp rendering
            this.handleProfessionalPan(e);
            return;
        }

        // Handle vertical zoom with immediate crisp rendering
        const currentZoom = this.canvas.getZoom();

        // Professional zoom factor - more responsive than original
        const zoomStep = 0.1; // 10% per step for precise control
        const zoomDirection = e.deltaY > 0 ? -1 : 1; // Inverted for natural feel
        const newZoom = currentZoom + zoomDirection * zoomStep;

        // Apply zoom constraints
        const limitedZoom = Math.min(
            Math.max(newZoom, this.MIN_ZOOM),
            this.MAX_ZOOM,
        );

        // Skip if no significant change
        if (Math.abs(limitedZoom - currentZoom) < 0.001) {
            return;
        }

        // Get precise cursor position
        const pointer = this.canvas.getPointer(e);

        // Apply zoom with crisp rendering - NO object caching
        this.canvas.zoomToPoint(pointer, limitedZoom);

        // Immediate high-quality render - no delays, no blurriness
        this.canvas.requestRenderAll();

        // Ensure bounds are maintained
        this.checkCanvasBounds();
    }

    /**
     * Professional-grade pan handler with crisp rendering
     */
    private handleProfessionalPan(e: WheelEvent) {
        const vpt = this.canvas.viewportTransform;
        if (!vpt) return;

        const zoom = this.canvas.getZoom();

        // Use deltaX for native horizontal scroll or deltaY for shift+wheel
        const horizontalDelta =
            Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;

        // Professional pan sensitivity - zoom-adjusted for precision
        const panSensitivity = Math.min(1.5, 1 / Math.max(0.3, zoom));
        const panAmount = horizontalDelta * panSensitivity;

        // Apply horizontal pan
        vpt[4] -= panAmount;

        // Immediate crisp render
        this.canvas.requestRenderAll();

        // Ensure bounds
        this.checkCanvasBounds();
    }

    private updateMomentum = () => {
        if (
            Math.abs(this.momentumX) > this.MOMENTUM_THRESHOLD ||
            Math.abs(this.momentumY) > this.MOMENTUM_THRESHOLD
        ) {
            if (!this._scrollAnimationFrame) {
                this._scrollAnimationFrame = requestAnimationFrame(() => {
                    if (this.canvas.viewportTransform) {
                        const vpt = this.canvas.viewportTransform;
                        const zoom = this.canvas.getZoom();

                        // Calculate canvas bounds
                        const canvasWidth = this.canvas.width || 0;
                        const canvasHeight = this.canvas.height || 0;
                        const maxX = canvasWidth * zoom;
                        const maxY = canvasHeight * zoom;

                        // Calculate new position with improved smoothing
                        const zoomFactor = Math.max(0.5, Math.min(1.5, zoom));
                        let newX = vpt[4] - this.momentumX / zoomFactor;
                        let newY = vpt[5] - this.momentumY / zoomFactor;

                        // Calculate safety margin to ensure canvas is always visible
                        const safetyMarginX = canvasWidth * 0.2; // 20% of canvas width
                        const safetyMarginY = canvasHeight * 0.2; // 20% of canvas height

                        // Hard constraints to ensure at least part of canvas is visible
                        if (newX < -maxX + safetyMarginX) {
                            newX = -maxX + safetyMarginX;
                            this.momentumX = 0;
                        } else if (newX > canvasWidth - safetyMarginX) {
                            newX = canvasWidth - safetyMarginX;
                            this.momentumX = 0;
                        }

                        if (newY < -maxY + safetyMarginY) {
                            newY = -maxY + safetyMarginY;
                            this.momentumY = 0;
                        } else if (newY > canvasHeight - safetyMarginY) {
                            newY = canvasHeight - safetyMarginY;
                            this.momentumY = 0;
                        }

                        // Apply elastic bounds for smoother edge behavior
                        const elasticity = 0.3;
                        if (newX > canvasWidth * 0.5) {
                            const overshoot = newX - canvasWidth * 0.5;
                            newX = canvasWidth * 0.5 + overshoot * elasticity;
                            this.momentumX *= 0.7; // Reduce momentum near bounds
                        } else if (newX < -maxX + canvasWidth * 0.5) {
                            const overshoot =
                                newX - (-maxX + canvasWidth * 0.5);
                            newX =
                                -maxX +
                                canvasWidth * 0.5 +
                                overshoot * elasticity;
                            this.momentumX *= 0.7;
                        }

                        if (newY > canvasHeight * 0.5) {
                            const overshoot = newY - canvasHeight * 0.5;
                            newY = canvasHeight * 0.5 + overshoot * elasticity;
                            this.momentumY *= 0.7;
                        } else if (newY < -maxY + canvasHeight * 0.5) {
                            const overshoot =
                                newY - (-maxY + canvasHeight * 0.5);
                            newY =
                                -maxY +
                                canvasHeight * 0.5 +
                                overshoot * elasticity;
                            this.momentumY *= 0.7;
                        }

                        // Apply position with smooth decay
                        vpt[4] = newX;
                        vpt[5] = newY;

                        // Apply momentum decay with improved smoothing
                        this.momentumX *= this.MOMENTUM_DECAY;
                        this.momentumY *= this.MOMENTUM_DECAY;

                        // Faster decay at higher speeds for better control
                        if (Math.abs(this.momentumX) > 5)
                            this.momentumX *= 0.95;
                        if (Math.abs(this.momentumY) > 5)
                            this.momentumY *= 0.95;

                        // Stop momentum if below threshold
                        if (Math.abs(this.momentumX) < this.MOMENTUM_THRESHOLD)
                            this.momentumX = 0;
                        if (Math.abs(this.momentumY) < this.MOMENTUM_THRESHOLD)
                            this.momentumY = 0;

                        // Only render if there's actual movement
                        if (
                            Math.abs(this.momentumX) > 0.001 ||
                            Math.abs(this.momentumY) > 0.001
                        ) {
                            this.canvas.requestRenderAll();
                        }

                        this._scrollAnimationFrame = null;
                    }
                });
            }
        }

        // Continue animation loop only if there's momentum
        if (
            Math.abs(this.momentumX) > this.MOMENTUM_THRESHOLD ||
            Math.abs(this.momentumY) > this.MOMENTUM_THRESHOLD
        ) {
            requestAnimationFrame(this.updateMomentum);
        } else {
            // If we've stopped, make sure we're within bounds
            this.checkCanvasBounds();
        }
    };

    // Simplified and optimized boundary check for better performance
    private checkCanvasBounds() {
        // Skip if canvas is not initialized or during active zoom
        if (!this.canvas.viewportTransform || this._isZooming) return;

        const vpt = this.canvas.viewportTransform;
        const zoom = this.canvas.getZoom();
        const canvasWidth = this.canvas.width || 0;
        const canvasHeight = this.canvas.height || 0;

        // Fast boundary check with minimal calculations
        // These are more forgiving boundaries to avoid frequent adjustments
        let needsAdjustment = false;

        // Check horizontal position
        if (vpt[4] > canvasWidth * 0.5) {
            vpt[4] = canvasWidth * 0.5;
            needsAdjustment = true;
        } else if (vpt[4] < -canvasWidth * (zoom - 0.5)) {
            vpt[4] = -canvasWidth * (zoom - 0.5);
            needsAdjustment = true;
        }

        // Check vertical position
        if (vpt[5] > canvasHeight * 0.5) {
            vpt[5] = canvasHeight * 0.5;
            needsAdjustment = true;
        } else if (vpt[5] < -canvasHeight * (zoom - 0.5)) {
            vpt[5] = -canvasHeight * (zoom - 0.5);
            needsAdjustment = true;
        }

        // Only re-render if needed
        if (needsAdjustment) {
            this.canvas.requestRenderAll();
        }
    }

    /**
     * Check if advanced navigation (trackpad mode) is enabled
     */
    private isAdvancedNavigationEnabled(): boolean {
        // Check if trackpad mode is enabled in UI settings
        const trackpadModeEnabled =
            this.canvas.uiSettings?.mouseSettings?.trackpadMode;

        // On macOS, trackpad mode is enabled by default even if UI setting is undefined
        const isMacOS = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
        const defaultTrackpadMode = isMacOS;

        const result =
            trackpadModeEnabled !== undefined
                ? trackpadModeEnabled
                : defaultTrackpadMode;
        console.log(
            `🔧 DefaultListeners.isAdvancedNavigationEnabled(): trackpadModeEnabled=${trackpadModeEnabled}, isMacOS=${isMacOS}, defaultTrackpadMode=${defaultTrackpadMode}, result=${result}`,
        );

        return result;
    }
}
