// @ts-ignore
import { fabric } from "fabric";
import CanvasListeners from "./CanvasListeners";
import OpenMarchCanvas from "../../../global/classes/canvasObjects/OpenMarchCanvas";
import CanvasMarcher from "../../../global/classes/canvasObjects/CanvasMarcher";
import { rgbaToString } from "@openmarch/core";

export default class LassoListeners implements CanvasListeners {
    protected canvas: OpenMarchCanvas & fabric.Canvas;
    private isDrawing: boolean = false;
    private lassoPath: fabric.Path | null = null;
    private pathString: string = "";
    private startPoint: { x: number; y: number } | null = null;
    private currentPath: { x: number; y: number }[] = [];
    private readonly LASSO_STROKE_WIDTH = 2;
    private readonly LASSO_DASH_ARRAY = [5, 5];
    private readonly MIN_CLOSE_DISTANCE = 50; // pixels - increased for less sensitivity

    constructor({ canvas }: { canvas: OpenMarchCanvas }) {
        this.canvas = canvas as OpenMarchCanvas & fabric.Canvas;
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
    }

    initiateListeners = () => {
        // Disable default selection behavior
        this.canvas.selection = false;
        this.canvas.defaultCursor = "crosshair";
        this.canvas.hoverCursor = "crosshair";
        this.canvas.moveCursor = "crosshair";

        // Disable object selection and movement
        this.canvas.forEachObject((obj) => {
            obj.selectable = false;
            obj.evented = false;
        });

        this.canvas.on("mouse:down", this.handleMouseDown);
        this.canvas.on("mouse:move", this.handleMouseMove);
        this.canvas.on("mouse:up", this.handleMouseUp);
    };

    cleanupListeners = () => {
        // Re-enable default selection behavior
        this.canvas.selection = true;
        this.canvas.defaultCursor = "default";
        this.canvas.hoverCursor = "move";
        this.canvas.moveCursor = "move";

        // Re-enable object selection and movement
        this.canvas.forEachObject((obj) => {
            if (obj instanceof CanvasMarcher) {
                obj.selectable = true;
                obj.evented = true;
            }
        });

        // Clean up any existing lasso path
        if (this.lassoPath) {
            this.canvas.remove(this.lassoPath);
            this.lassoPath = null;
        }

        this.canvas.off("mouse:down", this.handleMouseDown as any);
        this.canvas.off("mouse:move", this.handleMouseMove as any);
        this.canvas.off("mouse:up", this.handleMouseUp as any);

        this.resetLassoState();
    };

    private resetLassoState() {
        this.isDrawing = false;
        this.pathString = "";
        this.startPoint = null;
        this.currentPath = [];
        if (this.lassoPath) {
            this.canvas.remove(this.lassoPath);
            this.lassoPath = null;
        }
    }

    private handleMouseDown(fabricEvent: fabric.IEvent<MouseEvent>) {
        const evt = fabricEvent.e;

        // Only handle left mouse button
        if (evt.button !== 0) return;

        const pointer = this.canvas.getPointer(fabricEvent.e);

        this.isDrawing = true;
        this.startPoint = { x: pointer.x, y: pointer.y };
        this.currentPath = [{ x: pointer.x, y: pointer.y }];
        this.pathString = `M ${pointer.x} ${pointer.y}`;

        // Prevent default canvas behavior
        evt.preventDefault();
        evt.stopPropagation();
    }

    private handleMouseMove(fabricEvent: fabric.IEvent<MouseEvent>) {
        if (!this.isDrawing || !this.startPoint) return;

        const pointer = this.canvas.getPointer(fabricEvent.e);

        // Add point to path
        this.currentPath.push({ x: pointer.x, y: pointer.y });
        this.pathString += ` L ${pointer.x} ${pointer.y}`;

        // Remove existing lasso path and create new one
        if (this.lassoPath) {
            this.canvas.remove(this.lassoPath);
        }

        // Check if we're close to the start point for visual feedback
        const distanceToStart = Math.sqrt(
            Math.pow(pointer.x - this.startPoint.x, 2) +
                Math.pow(pointer.y - this.startPoint.y, 2),
        );

        const isNearStart = distanceToStart < this.MIN_CLOSE_DISTANCE;
        const strokeColor = isNearStart
            ? rgbaToString(this.canvas.fieldProperties.theme.nextPath) // Green when near start point
            : rgbaToString(this.canvas.fieldProperties.theme.primaryStroke); // Use OpenMarch theme color

        this.lassoPath = new fabric.Path(this.pathString, {
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

    private handleMouseUp(fabricEvent: fabric.IEvent<MouseEvent>) {
        if (!this.isDrawing || !this.startPoint) return;

        const pointer = this.canvas.getPointer(fabricEvent.e);

        // Check if we're close enough to the start point to close the lasso
        const distanceToStart = Math.sqrt(
            Math.pow(pointer.x - this.startPoint.x, 2) +
                Math.pow(pointer.y - this.startPoint.y, 2),
        );

        const shouldClose = distanceToStart < this.MIN_CLOSE_DISTANCE;

        if (shouldClose && this.currentPath.length > 3) {
            // Close the lasso and perform selection
            this.closeLassoAndSelect();
        } else {
            // Just clear the lasso if not closed properly
            this.resetLassoState();
        }

        this.canvas.requestRenderAll();
    }

    private closeLassoAndSelect() {
        if (!this.currentPath.length || !this.startPoint) return;

        // Close the path by connecting back to start
        const closedPath = [...this.currentPath, this.startPoint];

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

        // Disable selection again for lasso mode
        this.canvas.selection = false;
        this.canvas.forEachObject((obj) => {
            obj.selectable = false;
            obj.evented = false;
        });

        this.canvas.requestRenderAll();
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
