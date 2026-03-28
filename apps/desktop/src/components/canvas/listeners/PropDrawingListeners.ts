import { fabric } from "fabric";
import CanvasListeners from "./CanvasListeners";
import OpenMarchCanvas from "../../../global/classes/canvasObjects/OpenMarchCanvas";
import CanvasMarcher from "../../../global/classes/canvasObjects/CanvasMarcher";
import CanvasProp from "../../../global/classes/canvasObjects/CanvasProp";
import { PropDrawingMode } from "@/stores/PropDrawingStore";
import { getRoundCoordinates2 } from "@/utilities/CoordinateActions";

const PREVIEW_FILL = "rgba(64, 64, 64, 0.5)";
const PREVIEW_STROKE = "rgba(0, 0, 0, 0.8)";
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

        const rawPointer = this.canvas.getPointer(fabricEvent.e);
        const pointer = this.snapToGrid(rawPointer);

        switch (this.drawingMode) {
            case "rectangle":
            case "circle":
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
            case "polygon":
                if (this.points.length === 0) {
                    this.createStartDot(pointer);
                }
                this.points.push(pointer);
                this.updatePreview(pointer);
                break;
            case "arc":
                if (this.points.length === 0) {
                    this.createStartDot(pointer);
                }
                this.points.push(pointer);
                if (this.points.length === 3) {
                    this.completeArc();
                } else {
                    this.updatePreview(pointer);
                }
                break;
        }

        evt.preventDefault();
        evt.stopPropagation();
    }

    private handleMouseMove(fabricEvent: fabric.IEvent<MouseEvent>) {
        const rawPointer = this.canvas.getPointer(fabricEvent.e);
        const snappedPointer = this.snapToGrid(rawPointer);

        // Update cursor dot to show snapped position (except for freehand)
        if (this.cursorDot && this.drawingMode !== "freehand") {
            this.cursorDot.set({
                left: snappedPointer.x,
                top: snappedPointer.y,
            });
            this.cursorDot.setCoords();
            this.canvas.bringToFront(this.cursorDot);
        }

        switch (this.drawingMode) {
            case "rectangle":
            case "circle": {
                if (this.isDrawing && this.startPoint) {
                    this.updatePreview(snappedPointer);
                }
                break;
            }
            case "freehand":
                if (this.isDrawing) {
                    // Don't snap freehand points - it would make the path jagged
                    this.points.push({ x: rawPointer.x, y: rawPointer.y });
                    this.updatePreview(rawPointer);
                }
                break;
            case "polygon":
            case "arc": {
                if (this.points.length > 0) {
                    this.updatePreview(snappedPointer);
                }
                break;
            }
        }

        this.canvas.requestRenderAll();
    }

    private handleMouseUp(fabricEvent: fabric.IEvent<MouseEvent>) {
        const rawPointer = this.canvas.getPointer(fabricEvent.e);

        switch (this.drawingMode) {
            case "rectangle": {
                if (this.isDrawing && this.startPoint) {
                    const snappedPointer = this.snapToGrid(rawPointer);
                    this.completeRectangle(snappedPointer);
                }
                break;
            }
            case "circle": {
                if (this.isDrawing && this.startPoint) {
                    const snappedPointer = this.snapToGrid(rawPointer);
                    this.completeCircle(snappedPointer);
                }
                break;
            }
            case "freehand":
                if (this.isDrawing) {
                    this.completeFreehand();
                }
                break;
            // polygon and arc complete on double-click or final point
        }
    }

    private handleDoubleClick(fabricEvent: fabric.IEvent<MouseEvent>) {
        switch (this.drawingMode) {
            case "polygon":
                if (this.points.length >= 3) {
                    this.completePolygon();
                }
                break;
            case "arc":
                // Arc completes automatically after 3 points
                break;
        }
    }

    private updatePreview(currentPoint: { x: number; y: number }) {
        if (this.previewShape) {
            this.canvas.remove(this.previewShape);
        }

        switch (this.drawingMode) {
            case "rectangle":
                this.previewShape = this.createRectPreview(currentPoint);
                break;
            case "circle":
                this.previewShape = this.createCirclePreview(currentPoint);
                break;
            case "polygon":
                this.previewShape = this.createPolygonPreview(currentPoint);
                break;
            case "arc":
                this.previewShape = this.createArcPreview(currentPoint);
                break;
            case "freehand":
                this.previewShape = this.createFreehandPreview();
                break;
        }

        if (this.previewShape) {
            this.previewShape.selectable = false;
            this.previewShape.evented = false;
            this.canvas.add(this.previewShape);
            this.canvas.requestRenderAll();
        }
    }

    private createRectPreview(currentPoint: {
        x: number;
        y: number;
    }): fabric.Rect | null {
        if (!this.startPoint) return null;

        const left = Math.min(this.startPoint.x, currentPoint.x);
        const top = Math.min(this.startPoint.y, currentPoint.y);
        const width = Math.abs(currentPoint.x - this.startPoint.x);
        const height = Math.abs(currentPoint.y - this.startPoint.y);

        return new fabric.Rect({
            left,
            top,
            width,
            height,
            fill: PREVIEW_FILL,
            stroke: PREVIEW_STROKE,
            strokeWidth: 2,
        });
    }

    private createCirclePreview(currentPoint: {
        x: number;
        y: number;
    }): fabric.Circle | null {
        if (!this.startPoint) return null;

        // Calculate radius as distance from center (startPoint) to current point
        const dx = currentPoint.x - this.startPoint.x;
        const dy = currentPoint.y - this.startPoint.y;
        const radius = Math.sqrt(dx * dx + dy * dy);

        return new fabric.Circle({
            left: this.startPoint.x,
            top: this.startPoint.y,
            radius,
            originX: "center",
            originY: "center",
            fill: PREVIEW_FILL,
            stroke: PREVIEW_STROKE,
            strokeWidth: 2,
        });
    }

    private createPolygonPreview(currentPoint: {
        x: number;
        y: number;
    }): fabric.Polygon | null {
        if (this.points.length === 0) return null;

        const allPoints = [...this.points, currentPoint];
        return new fabric.Polygon(allPoints, {
            fill: PREVIEW_FILL,
            stroke: PREVIEW_STROKE,
            strokeWidth: 2,
        });
    }

    private createArcPreview(currentPoint: {
        x: number;
        y: number;
    }): fabric.Path | null {
        if (this.points.length === 0) return null;

        if (this.points.length === 1) {
            // Line from first endpoint to current (second endpoint)
            const pathData = `M ${this.points[0].x} ${this.points[0].y} L ${currentPoint.x} ${currentPoint.y}`;
            return new fabric.Path(pathData, {
                fill: "transparent",
                stroke: PREVIEW_STROKE,
                strokeWidth: 2,
            });
        } else if (this.points.length === 2) {
            // Both endpoints set; cursor is the control point (arc radius)
            const pathData = this.calculateArcPath(
                this.points[0],
                currentPoint,
                this.points[1],
            );
            return new fabric.Path(pathData, {
                fill: PREVIEW_FILL,
                stroke: PREVIEW_STROKE,
                strokeWidth: 2,
            });
        }

        return null;
    }

    private createFreehandPreview(): fabric.Path | null {
        if (this.points.length < 2) return null;

        let pathData = `M ${this.points[0].x} ${this.points[0].y}`;
        for (let i = 1; i < this.points.length; i++) {
            pathData += ` L ${this.points[i].x} ${this.points[i].y}`;
        }

        return new fabric.Path(pathData, {
            fill: "transparent",
            stroke: PREVIEW_STROKE,
            strokeWidth: 2,
        });
    }

    private calculateArcPath(
        p1: { x: number; y: number },
        p2: { x: number; y: number },
        p3: { x: number; y: number },
    ): string {
        // Calculate quadratic bezier curve through 3 points
        const cx = p2.x;
        const cy = p2.y;
        return `M ${p1.x} ${p1.y} Q ${cx} ${cy} ${p3.x} ${p3.y}`;
    }

    private completeRectangle(endPoint: { x: number; y: number }) {
        if (!this.startPoint) return;

        const left = Math.min(this.startPoint.x, endPoint.x);
        const top = Math.min(this.startPoint.y, endPoint.y);
        const width = Math.abs(endPoint.x - this.startPoint.x);
        const height = Math.abs(endPoint.y - this.startPoint.y);

        if (width < 10 || height < 10) {
            this.resetState();
            return;
        }

        const geometry: PropGeometry = {
            shapeType: "rectangle",
            centerX: left + width / 2,
            centerY: top + height / 2,
            widthPixels: width,
            heightPixels: height,
        };

        this.resetState();
        this.onComplete?.(geometry);
    }

    private completeCircle(endPoint: { x: number; y: number }) {
        if (!this.startPoint) return;

        // Calculate radius as distance from center to endpoint
        const dx = endPoint.x - this.startPoint.x;
        const dy = endPoint.y - this.startPoint.y;
        const radius = Math.sqrt(dx * dx + dy * dy);
        const diameter = radius * 2;

        if (radius < 10) {
            this.resetState();
            return;
        }

        const geometry: PropGeometry = {
            shapeType: "circle",
            centerX: this.startPoint.x,
            centerY: this.startPoint.y,
            widthPixels: diameter,
            heightPixels: diameter,
            radiusX: radius,
            radiusY: radius,
        };

        this.resetState();
        this.onComplete?.(geometry);
    }

    private completePolygon() {
        if (this.points.length < 3) {
            this.resetState();
            return;
        }

        // Calculate bounding box
        const xs = this.points.map((p) => p.x);
        const ys = this.points.map((p) => p.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        const geometry: PropGeometry = {
            shapeType: "polygon",
            centerX: (minX + maxX) / 2,
            centerY: (minY + maxY) / 2,
            widthPixels: maxX - minX,
            heightPixels: maxY - minY,
            points: this.points.map((p) => ({ x: p.x, y: p.y })),
        };

        this.resetState();
        this.onComplete?.(geometry);
    }

    private completeArc() {
        if (this.points.length !== 3) {
            this.resetState();
            return;
        }

        // Click order: endpoint1, endpoint2, control point
        const [p1, p3, p2] = this.points;

        // Calculate bounding box
        const xs = [p1.x, p2.x, p3.x];
        const ys = [p1.y, p2.y, p3.y];
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        const geometry: PropGeometry = {
            shapeType: "arc",
            centerX: (minX + maxX) / 2,
            centerY: (minY + maxY) / 2,
            widthPixels: maxX - minX,
            heightPixels: maxY - minY,
            points: [p1, p2, p3],
        };

        this.resetState();
        this.onComplete?.(geometry);
    }

    private completeFreehand() {
        if (this.points.length < 3) {
            this.resetState();
            return;
        }

        // Simplify the path (reduce number of points)
        const simplifiedPoints = this.simplifyPath(this.points, 5);

        // Calculate bounding box
        const xs = simplifiedPoints.map((p) => p.x);
        const ys = simplifiedPoints.map((p) => p.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        const geometry: PropGeometry = {
            shapeType: "freehand",
            centerX: (minX + maxX) / 2,
            centerY: (minY + maxY) / 2,
            widthPixels: maxX - minX,
            heightPixels: maxY - minY,
            points: simplifiedPoints,
        };

        this.resetState();
        this.onComplete?.(geometry);
    }

    // Ramer-Douglas-Peucker algorithm for path simplification
    private simplifyPath(
        points: { x: number; y: number }[],
        epsilon: number,
    ): { x: number; y: number }[] {
        if (points.length < 3) return points;

        let maxDist = 0;
        let maxIndex = 0;

        const first = points[0];
        const last = points[points.length - 1];

        for (let i = 1; i < points.length - 1; i++) {
            const dist = this.perpendicularDistance(points[i], first, last);
            if (dist > maxDist) {
                maxDist = dist;
                maxIndex = i;
            }
        }

        if (maxDist > epsilon) {
            const left = this.simplifyPath(
                points.slice(0, maxIndex + 1),
                epsilon,
            );
            const right = this.simplifyPath(points.slice(maxIndex), epsilon);
            return [...left.slice(0, -1), ...right];
        } else {
            return [first, last];
        }
    }

    private perpendicularDistance(
        point: { x: number; y: number },
        lineStart: { x: number; y: number },
        lineEnd: { x: number; y: number },
    ): number {
        const dx = lineEnd.x - lineStart.x;
        const dy = lineEnd.y - lineStart.y;

        if (dx === 0 && dy === 0) {
            return Math.sqrt(
                (point.x - lineStart.x) ** 2 + (point.y - lineStart.y) ** 2,
            );
        }

        const t =
            ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) /
            (dx * dx + dy * dy);
        const nearestX = lineStart.x + t * dx;
        const nearestY = lineStart.y + t * dy;

        return Math.sqrt((point.x - nearestX) ** 2 + (point.y - nearestY) ** 2);
    }
}

export interface PropGeometry {
    shapeType: "rectangle" | "circle" | "arc" | "polygon" | "freehand";
    centerX: number;
    centerY: number;
    widthPixels: number;
    heightPixels: number;
    radiusX?: number;
    radiusY?: number;
    points?: { x: number; y: number }[];
}
