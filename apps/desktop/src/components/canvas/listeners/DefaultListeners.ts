// @ts-ignore
import { fabric } from "fabric";
import CanvasListeners from "./CanvasListeners";
import OpenMarchCanvas from "../../../global/classes/canvasObjects/OpenMarchCanvas";
import CanvasMarcher from "../../../global/classes/canvasObjects/CanvasMarcher";
import CanvasProp from "../../../global/classes/canvasObjects/CanvasProp";
import { rgbaToString } from "@openmarch/core";
import { ModifiedMarcherPageArgs } from "@/db-functions";
import { getRoundCoordinates2 } from "@/utilities/CoordinateActions";
import { getPixelsPerFoot } from "@/global/classes/Prop";

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
    private _isUpdatingDatabase: boolean = false; // Prevent concurrent database updates

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
        this.handleBeforeTransform = this.handleBeforeTransform.bind(this);
        this.handleScaling = this.handleScaling.bind(this);
        this.handleMoving = this.handleMoving.bind(this);
    }

    initiateListeners = () => {
        this.canvas.on("object:modified", this.handleObjectModified);
        this.canvas.on("mouse:down", this.handleMouseDown);
        this.canvas.on("mouse:move", this.handleMouseMove);
        this.canvas.on("mouse:up", this.handleMouseUp);
        this.canvas.on("before:transform", this.handleBeforeTransform);
        this.canvas.on("object:scaling", this.handleScaling);
        this.canvas.on("object:moving", this.handleMoving);
    };

    cleanupListeners = () => {
        this.canvas.off("object:modified", this.handleObjectModified as any);
        this.canvas.off("mouse:down", this.handleMouseDown as any);
        this.canvas.off("mouse:move", this.handleMouseMove as any);
        this.canvas.off("mouse:up", this.handleMouseUp as any);
        this.canvas.off("before:transform", this.handleBeforeTransform as any);
        this.canvas.off("object:scaling", this.handleScaling as any);
        this.canvas.off("object:moving", this.handleMoving as any);
    };

    /**
     * Intercept transforms before they start.
     * Block Shift+scaling on middle handles for multi-selection.
     * Uses only public Fabric.js API: event.e, event.transform.corner, discardActiveObject, and setActiveObject
     */
    handleBeforeTransform(
        e: fabric.IEvent<MouseEvent> & {
            transform?: { corner?: string; target?: fabric.Object };
        },
    ) {
        const transform = e.transform;
        if (!transform) return;

        const corner = transform.corner;
        const target = transform.target;
        const evt = e.e;

        // Block Shift+click on middle scale handles (ml, mr, mt, mb) for ActiveSelection
        // This prevents cross-axis scaling which causes unexpected behavior
        if (
            evt?.shiftKey &&
            corner &&
            ["ml", "mr", "mt", "mb"].includes(corner) &&
            target?.type === "activeSelection"
        ) {
            // Prevent the DOM event from propagating
            evt.preventDefault();
            evt.stopPropagation();

            // Cancel the transform by resetting the selection using public API
            // Get the objects from the active selection before discarding
            const activeSelection = target as fabric.ActiveSelection;
            const selectedObjects = activeSelection.getObjects();

            // Discard and immediately re-create the selection to reset transform state
            this.canvas.discardActiveObject();

            if (selectedObjects.length > 0) {
                const newSelection = new fabric.ActiveSelection(
                    selectedObjects,
                    {
                        canvas: this.canvas,
                    },
                );
                this.canvas.setActiveObject(newSelection);
            }

            this.canvas.requestRenderAll();
        }
    }

    /**
     * Update the marcher's position when it is moved
     */
    async handleObjectModified(fabricEvent?: fabric.IEvent<MouseEvent>) {
        // Prevent concurrent database updates
        if (this._isUpdatingDatabase) return;

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

        // Collect all marcher page updates in a single array to avoid nested transactions
        const modifiedMarcherPages: ModifiedMarcherPageArgs[] = [];
        const modifiedGeometries: {
            id: number;
            width?: number;
            height?: number;
            rotation?: number;
        }[] = [];

        // Handle all marcher/prop movement in a single loop
        // Since CanvasProp extends CanvasMarcher, getActiveObjectsByType(CanvasMarcher) returns both
        const fp = this.canvas.fieldProperties;
        const pixelsPerFoot = fp ? getPixelsPerFoot(fp) : 6;
        const pageId = this.canvas.currentPage?.id;

        this.canvas
            .getActiveObjectsByType(CanvasMarcher)
            .forEach((activeObject: CanvasMarcher) => {
                const isProp = activeObject instanceof CanvasProp;

                // getMarcherCoords converts canvas coords back to DB coords (subtracts gridOffset)
                const newCoords = activeObject.getMarcherCoords();

                // Props don't store page_id on their coordinate, so use canvas.currentPage
                const objPageId = isProp
                    ? pageId
                    : activeObject.coordinate.page_id;
                if (objPageId == null) return;

                modifiedMarcherPages.push({
                    marcher_id: activeObject.marcherObj.id,
                    page_id: objPageId,
                    x: newCoords.x,
                    y: newCoords.y,
                });

                // Handle prop-specific geometry updates (scaling/rotation only)
                if (isProp) {
                    const prop = activeObject as CanvasProp;
                    const currentRotation = prop.angle || 0;
                    const sx = prop.scaleX || 1;
                    const sy = prop.scaleY || 1;

                    // Only update geometry if the prop was actually scaled or rotated
                    const wasScaled =
                        Math.abs(sx - 1) > 0.001 || Math.abs(sy - 1) > 0.001;
                    const wasRotated =
                        Math.abs(
                            currentRotation - (prop.geometry.rotation || 0),
                        ) > 0.01;

                    if (wasScaled || wasRotated) {
                        const dimensions = prop.getDimensions(pixelsPerFoot);
                        modifiedGeometries.push({
                            id: prop.geometry.id,
                            width: dimensions.width,
                            height: dimensions.height,
                            rotation: currentRotation,
                        });
                    }
                }
            });

        // Atomic update: both marcher pages and prop geometry in one transaction
        this._isUpdatingDatabase = true;
        try {
            if (
                modifiedMarcherPages.length > 0 ||
                modifiedGeometries.length > 0
            ) {
                await this.canvas.updateMarcherPagesAndGeometryFunction?.({
                    modifiedMarcherPages,
                    modifiedGeometries,
                });
            }
        } finally {
            this._isUpdatingDatabase = false;
        }
    }

    /** Snap prop edges to grid during scaling */
    handleScaling(fabricEvent: fabric.IEvent<MouseEvent>) {
        const target = fabricEvent.target;
        if (!target || !CanvasProp.isCanvasProp(target)) return;

        const { uiSettings, fieldProperties } = this.canvas;
        if (!fieldProperties || !uiSettings?.coordinateRounding) return;

        const corner = (this.canvas as any)?._currentTransform?.corner;
        if (!corner) return;

        const edges = target.getEdges();
        const snap = (x: number, y: number) =>
            getRoundCoordinates2({
                coordinate: { xPixels: x, yPixels: y },
                uiSettings,
                fieldProperties,
            });

        target.setEdges({
            l: corner.includes("l") ? snap(edges.l, 0).xPixels : edges.l,
            r: corner.includes("r") ? snap(edges.r, 0).xPixels : edges.r,
            t: corner.includes("t") ? snap(0, edges.t).yPixels : edges.t,
            b: corner.includes("b") ? snap(0, edges.b).yPixels : edges.b,
        });
    }

    /**
     * Snap prop movement to grid based on coordinate rounding settings.
     */
    handleMoving(fabricEvent: fabric.IEvent<MouseEvent>) {
        const target = fabricEvent.target;
        if (!target || !CanvasProp.isCanvasProp(target)) return;

        const { uiSettings, fieldProperties } = this.canvas;
        if (!fieldProperties || !uiSettings?.coordinateRounding) return;

        const prop = target as CanvasProp;
        const left = prop.left || 0;
        const top = prop.top || 0;

        // Snap center position to grid
        const snapped = getRoundCoordinates2({
            coordinate: { xPixels: left, yPixels: top },
            uiSettings,
            fieldProperties,
        });

        prop.set({ left: snapped.xPixels, top: snapped.yPixels });
        prop.setCoords();
    }

    /**
     * Set the canvas to dragging mode on mousedown.
     */
    handleMouseDown(fabricEvent: fabric.IEvent<MouseEvent>) {
        const evt = fabricEvent.e;

        // Alt+drag panning is owned by OpenMarchCanvas (forceTrackpadPan); skip here.
        if (evt.altKey) {
            evt.preventDefault();
            this.canvas.selection = false;
            this.canvas.isDragging = false;
            return;
        }

        // Handle middle mouse button or right click for panning
        if (evt.button === 1 || evt.button === 2) {
            evt.preventDefault();
            this.isMiddleMouseDown = true;
            this.lastMousePosition = { x: evt.clientX, y: evt.clientY };
            this.canvas.selection = false;
            return;
        }

        // Check for Shift+click lasso selection (only if enabled in settings)
        // But NOT if we're clicking on a control handle of an active selection
        const activeObject = this.canvas.getActiveObject();
        let isClickingOnControl = false;

        if (activeObject && activeObject.hasControls) {
            // Fabric v5 doesn't expose findControl; use internal _findTargetCorner (v5.5.2)
            // If upgrading to Fabric v6+, switch back to public findControl.
            const pointer = this.canvas.getPointer(evt, true);
            const controlInfo = (activeObject as any)._findTargetCorner?.(
                pointer,
                true,
            );
            isClickingOnControl = !!controlInfo;
        }

        // Note: Shift+click blocking on middle scale handles (ml, mr, mt, mb) for multi-selection
        // is handled in handleBeforeTransform using the public before:transform event

        if (
            evt.shiftKey &&
            evt.button === 0 &&
            this.isLassoSelectionEnabled() &&
            !isClickingOnControl
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

        // If we clicked on empty space (not on an object and not near a marcher)
        // AND we are not holding shift (adding to selection)
        // AND we are not dragging to create a selection box (which is handled by fabric's default behavior)
        if (!evt.shiftKey) {
            // If we have an active selection and we click outside it, clear it
            if (this.canvas.getActiveObject()) {
                // If we are starting a drag selection, fabric will handle clearing the old selection
                // But if we just click, we want to ensure it clears
                // We let fabric handle the "discard on click" naturally, but ensure we don't interfere
            }
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

            // Exact 1:1 panning - canvas moves exactly the same number of pixels as mouse
            vpt[4] += deltaX;
            vpt[5] += deltaY;

            this.lastMousePosition = { x: e.clientX, y: e.clientY };
            this.canvas.requestRenderAll();
            return;
        }
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

    // Delegate to canvas' authoritative bounds logic
    private checkCanvasBounds() {
        if (this._isZooming) return;
        // The canvas handles accurate content-aware clamping
        this.canvas.checkCanvasBounds();
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
