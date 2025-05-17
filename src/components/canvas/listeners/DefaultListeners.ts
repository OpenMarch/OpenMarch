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
        this.canvas.on("mouse:wheel", this.handleMouseWheel);

        // Start momentum animation loop
        this.updateMomentum();
    };

    cleanupListeners = () => {
        this.canvas.off("object:modified", this.handleObjectModified as any);
        this.canvas.off("mouse:down", this.handleMouseDown as any);
        this.canvas.off("mouse:move", this.handleMouseMove as any);
        this.canvas.off("mouse:up", this.handleMouseUp as any);
        this.canvas.off("mouse:wheel", this.handleMouseWheel as any);
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

        // Handle middle mouse button for panning
        if (evt.button === 1 || evt.altKey) {
            // Middle mouse button or Alt key
            evt.preventDefault();
            this.isMiddleMouseDown = true;
            this.lastMousePosition = { x: evt.clientX, y: evt.clientY };
            this.canvas.selection = false;
            return;
        }

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
            // Near a marcher but not on one - enable selection mode but don't drag canvas
            this.canvas.selection = true;
            this.canvas.isDragging = false;
            return;
        }

        // If not near any marcher and shift key is not pressed, enable canvas dragging
        if (!evt.shiftKey) {
            this.canvas.isDragging = true;
            this.canvas.selection = false;
            this.canvas.panDragStartPos = { x: evt.clientX, y: evt.clientY };
        }
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
                "Viewport transform not set - handleMouseMove: Canvas.tsx",
            );
            return;
        }

        // Enhanced middle mouse or Alt+drag panning
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

        // Handle regular dragging
        if (this.canvas.isDragging) {
            vpt[4] += e.clientX - this.canvas.panDragStartPos.x;
            vpt[5] += e.clientY - this.canvas.panDragStartPos.y;
            this.canvas.requestRenderAll();
            this.canvas.panDragStartPos = { x: e.clientX, y: e.clientY };
        }
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
        // Always prevent default behavior
        e.preventDefault();
        e.stopPropagation();

        // Skip if canvas not initialized
        if (!this.canvas.viewportTransform) return;

        // Skip all wheel events during active rendering
        if (this._scrollAnimationFrame !== null) {
            return;
        }

        // Use a more aggressive rate limit for better performance
        const now = Date.now();
        if (now - this.lastWheelTime < 12) {
            // ~83fps max
            return; // Skip processing if events come too fast
        }
        this.lastWheelTime = now;

        // Check if this is a horizontal scroll event (shift+wheel or native horizontal scroll)
        const isHorizontalScroll =
            Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey;

        // Handle horizontal scrolling if available
        if (isHorizontalScroll && !e.ctrlKey && !e.metaKey) {
            // Get current zoom for sensitivity adjustment
            const zoom = this.canvas.getZoom();
            const vpt = this.canvas.viewportTransform;

            // Use deltaX for native horizontal scroll or deltaY for shift+wheel
            const horizontalDelta =
                Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;

            // Apply horizontal scroll - adjust sensitivity with zoom
            const sensitivity = Math.min(1, 0.5 / Math.max(0.5, zoom)) * 2;
            const panAmount = horizontalDelta * sensitivity;

            // Pan horizontally
            vpt[4] -= panAmount;

            // Apply immediately
            this.canvas.renderAll();

            // Check bounds after short delay
            clearTimeout(this._zoomTimeout);
            this._zoomTimeout = setTimeout(() => {
                this.checkCanvasBounds();
            }, 100);

            return;
        }

        // For simplicity, always treat standard mouse wheel as zoom
        // Positive deltaY = zoom out, negative deltaY = zoom in
        const delta = e.deltaY;

        // Get current zoom level
        const currentZoom = this.canvas.getZoom();

        // Use a more aggressive zoom factor for responsiveness
        const baseZoomFactor = 1.25; // 25% change per step - even more responsive

        // Calculate new zoom level based on delta magnitude for smoother zooming
        // This makes the zoom more responsive to aggressive wheel movements
        const deltaFactor = Math.min(3, Math.max(1, Math.abs(delta / 50)));
        const adjustedZoomFactor = 1 + (baseZoomFactor - 1) * deltaFactor;

        const newZoom =
            delta < 0
                ? currentZoom * adjustedZoomFactor // zoom in
                : currentZoom / adjustedZoomFactor; // zoom out

        // Apply zoom constraints
        const limitedZoom = Math.min(
            Math.max(newZoom, this.MIN_ZOOM),
            this.MAX_ZOOM,
        );

        // Skip zooming if not changing significantly
        if (Math.abs(limitedZoom - currentZoom) < 0.001) {
            return;
        }

        // Get mouse position relative to canvas
        // This is in screen coordinates
        const mouse = {
            x: e.offsetX,
            y: e.offsetY,
        };

        // Enable ultra-performance mode during zooming
        if (!this._isZooming) {
            this._isZooming = true;

            // Apply performance optimizations but keep content visible
            if (this.canvas.staticGridRef) {
                // Keep grid visible but use performance rendering
                this.canvas.staticGridRef.objectCaching = true;
            }

            // Disable active selection but keep objects visible
            this.canvas.discardActiveObject();
            this.canvas.renderOnAddRemove = false;

            // Disable interactive mode
            this._originalInteractive = this.canvas.interactive;
            this.canvas.interactive = false;
        }

        // Direct zoom implementation for maximum performance
        // Get viewport transform
        const vpt = this.canvas.viewportTransform;

        // Apply zoom transformation directly
        vpt[0] = limitedZoom;
        vpt[3] = limitedZoom;

        // Calculate the point position in canvas coordinates before zoom change
        const canvasX = (mouse.x - vpt[4]) / currentZoom;
        const canvasY = (mouse.y - vpt[5]) / currentZoom;

        // Update translation to keep the point under cursor
        vpt[4] = -canvasX * limitedZoom + mouse.x;
        vpt[5] = -canvasY * limitedZoom + mouse.y;

        // Use direct rendering without requestAnimationFrame
        this.canvas.renderAll();

        // Cancel any previous timeout to avoid stacking
        clearTimeout(this._zoomTimeout);

        // Reset state after zooming
        this._zoomTimeout = setTimeout(() => {
            // Restore all performance optimizations
            this._isZooming = false;

            if (this.canvas.staticGridRef) {
                // Return to high quality rendering
                this.canvas.staticGridRef.objectCaching = false;
            }

            // Re-enable interaction
            this.canvas.interactive = this._originalInteractive || true;
            this.canvas.renderOnAddRemove = true;

            // Final high-quality render and boundary check
            this.canvas.requestRenderAll();
            this.checkCanvasBounds();
        }, 150);
    };

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
}
