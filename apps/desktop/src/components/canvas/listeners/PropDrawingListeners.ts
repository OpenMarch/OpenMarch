import { fabric } from "fabric";
import CanvasListeners from "./CanvasListeners";
import OpenMarchCanvas from "../../../global/classes/canvasObjects/OpenMarchCanvas";
import CanvasMarcher from "../../../global/classes/canvasObjects/CanvasMarcher";
import CanvasProp from "../../../global/classes/canvasObjects/CanvasProp";
import { PropDrawingMode } from "@/stores/PropDrawingStore";
import { getRoundCoordinates2 } from "@/utilities/CoordinateActions";
import {
    PROP_SHAPES,
    type ShapeHandler,
    type PropGeometry,
} from "@/global/classes/canvasObjects/propShapes";

export type { PropGeometry };

const CURSOR_DOT_RADIUS = 4;
const CURSOR_DOT_FILL = "rgba(128, 0, 255, 0.9)";
const CURSOR_DOT_STROKE = "rgba(255, 255, 255, 0.9)";
const START_DOT_FILL = "rgba(200, 0, 255, 1)";

export default class PropDrawingListeners implements CanvasListeners {
    protected canvas: OpenMarchCanvas & fabric.Canvas;
    private drawingMode: PropDrawingMode;
    private isDrawing: boolean = false;
    private startPoint: { x: number; y: number } | null = null;
    private previewShape: fabric.Object | null = null;
    private cursorDot: fabric.Circle | null = null;
    private startDot: fabric.Circle | null = null;
    private points: { x: number; y: number }[] = [];

    // Callbacks
    onComplete?: (geometry: PropGeometry) => void;
    onCancel?: () => void;

    constructor({
        canvas,
        drawingMode,
    }: {
        canvas: OpenMarchCanvas;
        drawingMode: PropDrawingMode;
    }) {
        this.canvas = canvas as OpenMarchCanvas & fabric.Canvas;
        this.drawingMode = drawingMode;
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleDoubleClick = this.handleDoubleClick.bind(this);
    }

    /** The shape handler for the current drawing mode, or null when inactive. */
    private get handler(): ShapeHandler | null {
        return this.drawingMode ? PROP_SHAPES[this.drawingMode] : null;
    }

    /**
     * Snaps a coordinate to the grid based on current coordinate rounding settings
     */
    private snapToGrid(point: { x: number; y: number }): {
        x: number;
        y: number;
    } {
        const { uiSettings, fieldProperties } = this.canvas;
        if (!fieldProperties || !uiSettings?.coordinateRounding) {
            return point;
        }

        const snapped = getRoundCoordinates2({
            coordinate: { xPixels: point.x, yPixels: point.y },
            uiSettings,
            fieldProperties,
        });

        return { x: snapped.xPixels, y: snapped.yPixels };
    }

    initiateListeners = () => {
        this.canvas.selection = false;
        this.canvas.defaultCursor = "crosshair";
        this.canvas.hoverCursor = "crosshair";
        this.canvas.moveCursor = "crosshair";

        this.canvas.forEachObject((obj) => {
            obj.selectable = false;
            obj.evented = false;
        });

        // Create cursor dot to show snapped grid position
        this.cursorDot = new fabric.Circle({
            radius: CURSOR_DOT_RADIUS,
            fill: CURSOR_DOT_FILL,
            stroke: CURSOR_DOT_STROKE,
            strokeWidth: 1,
            originX: "center",
            originY: "center",
            selectable: false,
            evented: false,
            left: -100,
            top: -100,
        });
        this.canvas.add(this.cursorDot);

        this.canvas.on("mouse:down", this.handleMouseDown);
        this.canvas.on("mouse:move", this.handleMouseMove);
        this.canvas.on("mouse:up", this.handleMouseUp);
        this.canvas.on("mouse:dblclick", this.handleDoubleClick);
        document.addEventListener("keydown", this.handleKeyDown);
    };

    cleanupListeners = () => {
        this.canvas.selection = true;
        this.canvas.defaultCursor = "default";
        this.canvas.hoverCursor = "move";
        this.canvas.moveCursor = "move";

        // Only restore selectability for marchers and props, not background elements
        this.canvas.forEachObject((obj) => {
            if (
                CanvasMarcher.isCanvasMarcher(obj) ||
                CanvasProp.isCanvasProp(obj)
            ) {
                obj.selectable = true;
                obj.evented = true;
            }
        });

        if (this.previewShape) {
            this.canvas.remove(this.previewShape);
            this.previewShape = null;
        }

        if (this.cursorDot) {
            this.canvas.remove(this.cursorDot);
            this.cursorDot = null;
        }

        if (this.startDot) {
            this.canvas.remove(this.startDot);
            this.startDot = null;
        }

        this.canvas.off("mouse:down", this.handleMouseDown as any);
        this.canvas.off("mouse:move", this.handleMouseMove as any);
        this.canvas.off("mouse:up", this.handleMouseUp as any);
        this.canvas.off("mouse:dblclick", this.handleDoubleClick as any);
        document.removeEventListener("keydown", this.handleKeyDown);

        this.resetState();
    };

    private resetState() {
        this.isDrawing = false;
        this.startPoint = null;
        this.points = [];
        if (this.previewShape) {
            this.canvas.remove(this.previewShape);
            this.previewShape = null;
        }
        if (this.startDot) {
            this.canvas.remove(this.startDot);
            this.startDot = null;
        }
    }

    private handleKeyDown(e: KeyboardEvent) {
        if (e.key === "Escape") {
            this.resetState();
            this.onCancel?.();
        }
    }

    private createStartDot(point: { x: number; y: number }) {
        if (this.startDot) {
            this.canvas.remove(this.startDot);
        }
        this.startDot = new fabric.Circle({
            radius: CURSOR_DOT_RADIUS + 1,
            fill: START_DOT_FILL,
            stroke: CURSOR_DOT_STROKE,
            strokeWidth: 2,
            originX: "center",
            originY: "center",
            left: point.x,
            top: point.y,
            selectable: false,
            evented: false,
        });
        this.canvas.add(this.startDot);
        this.canvas.bringToFront(this.startDot);
    }

    private handleMouseDown(fabricEvent: fabric.IEvent<MouseEvent>) {
        const evt = fabricEvent.e;
        if (evt.button !== 0) return;

        const handler = this.handler;
        if (!handler) return;

        const rawPointer = this.canvas.getPointer(fabricEvent.e);
        const pointer = this.snapToGrid(rawPointer);

        switch (handler.interaction) {
            case "drag":
                this.isDrawing = true;
                this.startPoint = pointer;
                this.points = [pointer];
                this.createStartDot(pointer);
                break;
            case "freehand":
                // Don't snap freehand start - it would slow down drawing
                this.isDrawing = true;
                this.startPoint = rawPointer;
                this.points = [rawPointer];
                break;
            case "click":
                if (this.points.length === 0) {
                    this.createStartDot(pointer);
                }
                this.points.push(pointer);
                if (
                    handler.maxPoints &&
                    this.points.length === handler.maxPoints
                ) {
                    this.complete();
                } else {
                    this.updatePreview(pointer);
                }
                break;
        }

        evt.preventDefault();
        evt.stopPropagation();
    }

    private handleMouseMove(fabricEvent: fabric.IEvent<MouseEvent>) {
        const handler = this.handler;
        if (!handler) return;

        const rawPointer = this.canvas.getPointer(fabricEvent.e);
        const snappedPointer = this.snapToGrid(rawPointer);

        // Update cursor dot to show snapped position (except for freehand)
        if (this.cursorDot && handler.interaction !== "freehand") {
            this.cursorDot.set({
                left: snappedPointer.x,
                top: snappedPointer.y,
            });
            this.cursorDot.setCoords();
            this.canvas.bringToFront(this.cursorDot);
        }

        switch (handler.interaction) {
            case "drag":
                if (this.isDrawing && this.startPoint) {
                    this.updatePreview(snappedPointer);
                }
                break;
            case "freehand":
                if (this.isDrawing) {
                    // Don't snap freehand points - it would make the path jagged
                    this.points.push({ x: rawPointer.x, y: rawPointer.y });
                    this.updatePreview(rawPointer);
                }
                break;
            case "click":
                if (this.points.length > 0) {
                    this.updatePreview(snappedPointer);
                }
                break;
        }

        this.canvas.requestRenderAll();
    }

    private handleMouseUp(fabricEvent: fabric.IEvent<MouseEvent>) {
        const handler = this.handler;
        if (!handler) return;

        const rawPointer = this.canvas.getPointer(fabricEvent.e);

        switch (handler.interaction) {
            case "drag":
                if (this.isDrawing && this.startPoint) {
                    this.complete(this.snapToGrid(rawPointer));
                }
                break;
            case "freehand":
                if (this.isDrawing) {
                    this.complete();
                }
                break;
            case "click":
                // completes on double-click or final point
                break;
        }
    }

    private handleDoubleClick() {
        const handler = this.handler;
        if (!handler?.completeOnDoubleClick) return;
        if (this.points.length >= (handler.minPoints ?? 0)) {
            this.complete();
        }
    }

    private updatePreview(currentPoint: { x: number; y: number }) {
        const handler = this.handler;
        if (!handler) return;

        if (this.previewShape) {
            this.canvas.remove(this.previewShape);
        }

        this.previewShape = handler.createPreview({
            startPoint: this.startPoint,
            points: this.points,
            currentPoint,
        });

        if (this.previewShape) {
            this.previewShape.selectable = false;
            this.previewShape.evented = false;
            this.canvas.add(this.previewShape);
            this.canvas.requestRenderAll();
        }
    }

    /** Finalizes the current shape (if valid) and notifies via onComplete. */
    private complete(endPoint?: { x: number; y: number }) {
        const handler = this.handler;
        if (!handler) return;

        const geometry = handler.finalize({
            startPoint: this.startPoint,
            points: this.points,
            endPoint,
        });

        this.resetState();
        if (geometry) {
            this.onComplete?.(geometry);
        }
    }
}
