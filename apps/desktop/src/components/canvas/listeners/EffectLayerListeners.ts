import CanvasListeners from "./CanvasListeners";
import DefaultListeners from "./DefaultListeners";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import { useLightDesignerEffectLayerDrawStore } from "@/stores/LightDesignerEffectLayerDrawStore";
import { createEffectLayerCanvasRect } from "@/utilities/effectLayerCanvasRect";
import {
    clampEffectLayerRectToField,
    isEffectLayerRectLargeEnough,
    normalizeCanvasRect,
} from "@/utilities/effectLayerCoordinates";
import { fabric } from "fabric";

/**
 * Drag-to-draw rectangles for lighting effect layers on the field canvas.
 */
export default class EffectLayerListeners
    extends DefaultListeners
    implements CanvasListeners
{
    private _isDrawing = false;
    private _anchor: { x: number; y: number } | null = null;
    private _draftRect: fabric.Rect | null = null;

    constructor({ canvas }: { canvas: OpenMarchCanvas }) {
        super({ canvas, persistMarcherEdits: false });
        this.canvas.setCursor("crosshair");
        this.canvas.staticGridRef.hoverCursor = "crosshair";
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        window.addEventListener("keydown", this.handleKeyDown);
    }

    initiateListeners = () => {
        this.canvas.on("mouse:down", this.handleMouseDown);
        this.canvas.on("mouse:move", this.handleMouseMove);
        this.canvas.on("mouse:up", this.handleMouseUp);
    };

    cleanupListeners = () => {
        this.clearDraftRect();
        this.canvas.selection = true;
        this.canvas.resetCursorsToDefault();
        window.removeEventListener("keydown", this.handleKeyDown);

        this.canvas.off("mouse:down", this.handleMouseDown as any);
        this.canvas.off("mouse:move", this.handleMouseMove as any);
        this.canvas.off("mouse:up", this.handleMouseUp as any);
    };

    private clearDraftRect = () => {
        if (this._draftRect) {
            this.canvas.remove(this._draftRect);
            this._draftRect = null;
        }
        this._anchor = null;
        this._isDrawing = false;
    };

    private createDraftRect(left: number, top: number): fabric.Rect {
        return createEffectLayerCanvasRect({
            left,
            top,
            width: 0,
            height: 0,
            strokeColor: this.canvas.fieldProperties.theme.shape,
            style: "draft",
        });
    }

    private updateDraftRect(pointer: { x: number; y: number }) {
        if (!this._anchor || !this._draftRect) return;

        const normalized = normalizeCanvasRect(
            this._anchor.x,
            this._anchor.y,
            pointer.x,
            pointer.y,
        );
        this._draftRect.set({
            left: normalized.left,
            top: normalized.top,
            width: normalized.width,
            height: normalized.height,
        });
        this._draftRect.setCoords();
        this.canvas.requestRenderAll();
    }

    private finalizeDraw(pointer: { x: number; y: number }) {
        if (!this._anchor) return;

        const normalized = normalizeCanvasRect(
            this._anchor.x,
            this._anchor.y,
            pointer.x,
            pointer.y,
        );
        const fieldWidth = this.canvas.fieldProperties.width;
        const fieldHeight = this.canvas.fieldProperties.height;
        const clamped = clampEffectLayerRectToField(
            normalized,
            fieldWidth,
            fieldHeight,
        );

        this.clearDraftRect();
        this.canvas.selection = true;

        if (!isEffectLayerRectLargeEnough(clamped)) {
            useLightDesignerEffectLayerDrawStore.getState().cancelDrawMode();
            return;
        }

        useLightDesignerEffectLayerDrawStore.getState().completeDraw(clamped);
    }

    private handleKeyDown = (event: KeyboardEvent) => {
        if (event.key !== "Escape") return;
        this.clearDraftRect();
        this.canvas.selection = true;
        useLightDesignerEffectLayerDrawStore.getState().cancelDrawMode();
    };

    handleMouseDown(fabricEvent: fabric.IEvent<MouseEvent>) {
        const evt = fabricEvent.e;

        if (evt.altKey || evt.button === 1 || evt.button === 2) {
            super.handleMouseDown(fabricEvent);
            return;
        }

        if (evt.button !== 0) return;

        const pointer = this.canvas.getPointer(fabricEvent.e);
        this._anchor = { x: pointer.x, y: pointer.y };
        this._draftRect = this.createDraftRect(pointer.x, pointer.y);
        this.canvas.add(this._draftRect);
        this._isDrawing = true;
        this.canvas.selection = false;
        this.canvas.discardActiveObject();
        this.canvas.requestRenderAll();
    }

    handleMouseMove(fabricEvent: fabric.IEvent<MouseEvent>) {
        if (this._isDrawing && this._anchor) {
            const pointer = this.canvas.getPointer(fabricEvent.e);
            this.updateDraftRect(pointer);
            return;
        }

        super.handleMouseMove(fabricEvent);
    }

    handleMouseUp(fabricEvent: fabric.IEvent<MouseEvent>) {
        if (this._isDrawing && this._anchor && fabricEvent.e.button === 0) {
            const pointer = this.canvas.getPointer(fabricEvent.e);
            this.finalizeDraw(pointer);
            return;
        }

        super.handleMouseUp(fabricEvent);
    }
}
