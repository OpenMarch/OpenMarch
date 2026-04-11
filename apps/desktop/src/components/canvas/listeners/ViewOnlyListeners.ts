// @ts-ignore
import { fabric } from "fabric";
import CanvasListeners from "./CanvasListeners";
import OpenMarchCanvas from "../../../global/classes/canvasObjects/OpenMarchCanvas";
import CanvasMarcher from "../../../global/classes/canvasObjects/CanvasMarcher";

/**
 * Pan/zoom only: no marcher selection, drag, lasso, or object transforms.
 * Used for Light Designer workspace mode.
 */
export default class ViewOnlyListeners implements CanvasListeners {
    protected canvas: OpenMarchCanvas & fabric.Canvas;
    private isMiddleMouseDown: boolean = false;
    private lastMousePosition = { x: 0, y: 0 };

    constructor({ canvas }: { canvas: OpenMarchCanvas }) {
        this.canvas = canvas as OpenMarchCanvas & fabric.Canvas;
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
    }

    initiateListeners = () => {
        this.canvas.selection = false;
        this.canvas.discardActiveObject();
        this.canvas.forEachObject((obj) => {
            if (obj instanceof CanvasMarcher) {
                obj.selectable = false;
                obj.evented = false;
            }
        });

        this.canvas.on("mouse:down", this.handleMouseDown);
        this.canvas.on("mouse:move", this.handleMouseMove);
        this.canvas.on("mouse:up", this.handleMouseUp);
    };

    cleanupListeners = () => {
        this.canvas.off("mouse:down", this.handleMouseDown as any);
        this.canvas.off("mouse:move", this.handleMouseMove as any);
        this.canvas.off("mouse:up", this.handleMouseUp as any);

        this.canvas.selection = true;
        this.canvas.forEachObject((obj) => {
            if (obj instanceof CanvasMarcher) {
                obj.selectable = true;
                obj.evented = true;
            }
        });
    };

    private handleMouseDown(fabricEvent: fabric.IEvent<MouseEvent>) {
        const evt = fabricEvent.e;

        if (evt.altKey) {
            evt.preventDefault();
            this.canvas.selection = false;
            this.canvas.isDragging = false;
            return;
        }

        if (evt.button === 1 || evt.button === 2) {
            evt.preventDefault();
            this.isMiddleMouseDown = true;
            this.lastMousePosition = { x: evt.clientX, y: evt.clientY };
            this.canvas.selection = false;
        }
    }

    private handleMouseMove(fabricEvent: fabric.IEvent<MouseEvent>) {
        const e = fabricEvent.e;
        const vpt = this.canvas.viewportTransform;

        if (!vpt) {
            return;
        }

        if (this.isMiddleMouseDown) {
            const deltaX = e.clientX - this.lastMousePosition.x;
            const deltaY = e.clientY - this.lastMousePosition.y;

            vpt[4] += deltaX;
            vpt[5] += deltaY;

            this.lastMousePosition = { x: e.clientX, y: e.clientY };
            this.canvas.requestRenderAll();
        }
    }

    private handleMouseUp(fabricEvent: fabric.IEvent<MouseEvent>) {
        const evt = fabricEvent.e;

        if (evt.button === 1 || this.isMiddleMouseDown) {
            this.isMiddleMouseDown = false;
        }

        if (!this.canvas.viewportTransform) {
            return;
        }

        this.canvas.setViewportTransform(this.canvas.viewportTransform);
        this.canvas.isDragging = false;
        this.canvas.selection = false;
    }
}
