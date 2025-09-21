// @ts-ignore
import { fabric } from "fabric";
import CanvasListeners from "./CanvasListeners";
import OpenMarchCanvas from "../../../global/classes/canvasObjects/OpenMarchCanvas";
import CanvasMarcher from "../../../global/classes/canvasObjects/CanvasMarcher";
import { rgbaToString } from "@openmarch/core";
import { ModifiedMarcherPageArgs } from "@/db-functions";

export default class DefaultListeners implements CanvasListeners {
    protected canvas: OpenMarchCanvas & fabric.Canvas;
    private momentumX: number = 0;
    private momentumY: number = 0;
    private readonly MOMENTUM_DECAY: number = 0.95;
    private readonly MOMENTUM_THRESHOLD: number = 0.01;
    private isMiddleMouseDown: boolean = false;
    private lastMousePosition = { x: 0, y: 0 };
    private _scrollAnimationFrame: number | null = null;
    private _isZooming: boolean = false;

    // Lasso selection properties
    private isLassoDrawing: boolean = false;
    private lassoPath: fabric.Path | null = null;
    private lassoPathString: string = "";
    private lassoStartPoint: { x: number; y: number } | null = null;
    private lassoCurrentPath: { x: number; y: number }[] = [];
    private readonly LASSO_STROKE_WIDTH = 2;
    private readonly LASSO_DASH_ARRAY = [5, 5];
    private readonly LASSO_MIN_CLOSE_DISTANCE = 50;

    constructor({ canvas }: { canvas: OpenMarchCanvas }) {
        this.canvas = canvas as OpenMarchCanvas & fabric.Canvas;
        this.handleObjectModified = this.handleObjectModified.bind(this);
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.updateMomentum = this.updateMomentum.bind(this);
    }

    initiateListeners = () => {
        this.canvas.on("object:modified", this.handleObjectModified);
        this.canvas.on("mouse:down", this.handleMouseDown);
        this.canvas.on("mouse:move", this.handleMouseMove);
        this.canvas.on("mouse:up", this.handleMouseUp);

        // NOTE: Removed momentum animation loop for professional immediate response
        // Professional navigation should be instant and precise, not momentum-based
    };

    cleanupListeners = () => {
        this.canvas.off("object:modified", this.handleObjectModified as any);
        this.canvas.off("mouse:down", this.handleMouseDown as any);
        this.canvas.off("mouse:move", this.handleMouseMove as any);
        this.canvas.off("mouse:up", this.handleMouseUp as any);
    };

    /**
     * Update the marcher's position when it is moved
     */
    handleObjectModified(fabricEvent?: fabric.IEvent<MouseEvent>) {
        /*
            ---- Determine if the mouse was clicked or dragged ----
            If the mouse was clicked, likely the user does not want to move the marcher
            This prevents the marcher from moving a little bit when it's just trying to be selected
        */
        // Check if the timing threshold has past before checking the distance (saves compute)
        if (
            fabricEvent &&
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
                    page_id: activeCanvasMarcher.coordinate.page_id,
                    x: newCoords.x,
                    y: newCoords.y,
                });
            });
        this.canvas.updateMarcherPagesFunction?.(modifiedMarcherPages);
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

        // Check for Shift+click lasso selection (only if enabled in settings)
        if (
            evt.shiftKey &&
            evt.button === 0 &&
            this.isLassoSelectionEnabled()
        ) {
            this.startLassoSelection(fabricEvent);
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

        // Handle lasso drawing
        if (this.isLassoDrawing) {
            this.updateLassoPath(fabricEvent);
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

        // Handle lasso completion
        if (this.isLassoDrawing) {
            this.finishLassoSelection(fabricEvent);
            return;
        }

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

    // eslint-disable-next-line max-lines-per-function
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

    // Lasso selection methods
    private isLassoSelectionEnabled(): boolean {
        // Check if lasso selection is enabled in UI settings
        // For now, we'll assume it's always enabled, but this should check the UI settings
        return true;
    }

    private startLassoSelection(fabricEvent: fabric.IEvent<MouseEvent>) {
        const pointer = this.canvas.getPointer(fabricEvent.e);

        this.isLassoDrawing = true;
        this.lassoStartPoint = { x: pointer.x, y: pointer.y };
        this.lassoCurrentPath = [{ x: pointer.x, y: pointer.y }];
        this.lassoPathString = `M ${pointer.x} ${pointer.y}`;

        // Disable default selection behavior during lasso
        this.canvas.selection = false;
        this.canvas.defaultCursor = "crosshair";
        this.canvas.hoverCursor = "crosshair";

        // Disable object selection and movement
        this.canvas.forEachObject((obj) => {
            obj.selectable = false;
            obj.evented = false;
        });

        // Prevent default canvas behavior
        fabricEvent.e.preventDefault();
        fabricEvent.e.stopPropagation();
    }

    private updateLassoPath(fabricEvent: fabric.IEvent<MouseEvent>) {
        if (!this.isLassoDrawing || !this.lassoStartPoint) return;

        const pointer = this.canvas.getPointer(fabricEvent.e);

        // Add point to path
        this.lassoCurrentPath.push({ x: pointer.x, y: pointer.y });
        this.lassoPathString += ` L ${pointer.x} ${pointer.y}`;

        // Remove existing lasso path and create new one
        if (this.lassoPath) {
            this.canvas.remove(this.lassoPath);
        }

        // Check if we're close to the start point for visual feedback
        const distanceToStart = Math.sqrt(
            Math.pow(pointer.x - this.lassoStartPoint.x, 2) +
                Math.pow(pointer.y - this.lassoStartPoint.y, 2),
        );

        const isNearStart = distanceToStart < this.LASSO_MIN_CLOSE_DISTANCE;
        const strokeColor = isNearStart
            ? rgbaToString(this.canvas.fieldProperties.theme.nextPath) // Green when near start point
            : rgbaToString(this.canvas.fieldProperties.theme.primaryStroke); // Use OpenMarch theme color

        this.lassoPath = new fabric.Path(this.lassoPathString, {
            fill: "transparent",
            stroke: strokeColor,
            strokeWidth: this.LASSO_STROKE_WIDTH,
            strokeDashArray: this.LASSO_DASH_ARRAY,
            selectable: false,
            evented: false,
            excludeFromExport: true,
        });

        this.canvas.add(this.lassoPath);
        this.canvas.bringToFront(this.lassoPath);
        this.canvas.requestRenderAll();
    }

    private finishLassoSelection(fabricEvent: fabric.IEvent<MouseEvent>) {
        if (!this.isLassoDrawing || !this.lassoStartPoint) return;

        const pointer = this.canvas.getPointer(fabricEvent.e);

        // Check if we're close enough to the start point to close the lasso
        const distanceToStart = Math.sqrt(
            Math.pow(pointer.x - this.lassoStartPoint.x, 2) +
                Math.pow(pointer.y - this.lassoStartPoint.y, 2),
        );

        const shouldClose = distanceToStart < this.LASSO_MIN_CLOSE_DISTANCE;

        if (shouldClose && this.lassoCurrentPath.length > 3) {
            // Close the lasso and perform selection
            this.closeLassoAndSelect();
        } else {
            // Just clear the lasso if not closed properly
            this.resetLassoState();
        }

        this.canvas.requestRenderAll();
    }

    private closeLassoAndSelect() {
        if (!this.lassoCurrentPath.length || !this.lassoStartPoint) return;

        // Close the path by connecting back to start
        const closedPath = [...this.lassoCurrentPath, this.lassoStartPoint];

        // Find all marchers inside the lasso
        const marchersToSelect: CanvasMarcher[] = [];
        const canvasMarchers = this.canvas.getCanvasMarchers();

        for (const marcher of canvasMarchers) {
            const marcherCenter = marcher.getCenterPoint();
            if (this.isPointInPolygon(marcherCenter, closedPath)) {
                marchersToSelect.push(marcher);
            }
        }

        // Clean up the lasso visual
        this.resetLassoState();

        // Re-enable selection temporarily to select the marchers
        this.canvas.selection = true;
        this.canvas.defaultCursor = "default";
        this.canvas.hoverCursor = "move";

        this.canvas.forEachObject((obj) => {
            if (obj instanceof CanvasMarcher) {
                obj.selectable = true;
                obj.evented = true;
            }
        });

        // Select the marchers
        if (marchersToSelect.length === 1) {
            this.canvas.setActiveObject(marchersToSelect[0]);
        } else if (marchersToSelect.length > 1) {
            const activeSelection = new fabric.ActiveSelection(
                marchersToSelect,
                {
                    canvas: this.canvas,
                },
            );
            this.canvas.setActiveObject(activeSelection);
        } else {
            this.canvas.discardActiveObject();
        }

        this.canvas.requestRenderAll();
    }

    private resetLassoState() {
        this.isLassoDrawing = false;
        this.lassoPathString = "";
        this.lassoStartPoint = null;
        this.lassoCurrentPath = [];
        if (this.lassoPath) {
            this.canvas.remove(this.lassoPath);
            this.lassoPath = null;
        }

        // Re-enable default selection behavior
        this.canvas.selection = true;
        this.canvas.defaultCursor = "default";
        this.canvas.hoverCursor = "move";

        // Re-enable object selection and movement
        this.canvas.forEachObject((obj) => {
            if (obj instanceof CanvasMarcher) {
                obj.selectable = true;
                obj.evented = true;
            }
        });
    }

    /**
     * Ray casting algorithm to determine if a point is inside a polygon
     * @param point The point to test
     * @param polygon Array of points defining the polygon
     * @returns true if point is inside polygon
     */
    private isPointInPolygon(
        point: { x: number; y: number },
        polygon: { x: number; y: number }[],
    ): boolean {
        const x = point.x;
        const y = point.y;
        let inside = false;

        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x;
            const yi = polygon[i].y;
            const xj = polygon[j].x;
            const yj = polygon[j].y;

            if (
                yi > y !== yj > y &&
                x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
            ) {
                inside = !inside;
            }
        }

        return inside;
    }
}
