import DefaultListeners from "./DefaultListeners";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import { useLightDesignerSelectedEffectLayerStore } from "@/stores/LightDesignerSelectedEffectLayerStore";
import {
    getLightingEffectLayerIdFromRect,
    isLightingEffectLayerRect,
} from "@/utilities/effectLayerCanvasRect";
import {
    clampEffectLayerRectToField,
    fabricRectToEffectLayerRect,
    isEffectLayerRectLargeEnough,
} from "@/utilities/effectLayerCoordinates";
import { fabric } from "fabric";

/**
 * Select, move, and resize persisted lighting effect layers on the field canvas.
 */
export default class EffectLayerEditListeners extends DefaultListeners {
    constructor({ canvas }: { canvas: OpenMarchCanvas }) {
        super({ canvas, persistMarcherEdits: false });
        this.handleEffectLayerModified =
            this.handleEffectLayerModified.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        window.addEventListener("keydown", this.handleKeyDown);
    }

    initiateListeners = () => {
        this.canvas.on("mouse:down", this.handleMouseDown);
        this.canvas.on("mouse:move", this.handleMouseMove);
        this.canvas.on("mouse:up", this.handleMouseUp);
        this.canvas.on("before:transform", this.handleBeforeTransform);
        this.canvas.on("object:modified", this.handleEffectLayerModified);
    };

    cleanupListeners = () => {
        this.canvas.off("mouse:down", this.handleMouseDown as any);
        this.canvas.off("mouse:move", this.handleMouseMove as any);
        this.canvas.off("mouse:up", this.handleMouseUp as any);
        this.canvas.off("before:transform", this.handleBeforeTransform as any);
        this.canvas.off(
            "object:modified",
            this.handleEffectLayerModified as any,
        );
        window.removeEventListener("keydown", this.handleKeyDown);
    };

    private handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
            this.canvas.discardActiveObject();
            useLightDesignerSelectedEffectLayerStore
                .getState()
                .clearSelectedLayer();
            return;
        }

        if (event.key !== "Delete" && event.key !== "Backspace") return;

        if (
            document.activeElement?.matches(
                "input, textarea, select, [contenteditable]",
            )
        ) {
            return;
        }

        const selectedLayerId =
            useLightDesignerSelectedEffectLayerStore.getState().selectedLayerId;
        if (selectedLayerId == null) return;

        event.preventDefault();
        event.stopPropagation();

        this.canvas.discardActiveObject();
        useLightDesignerSelectedEffectLayerStore
            .getState()
            .clearSelectedLayer();
        this.canvas.deleteLightingEffectLayerFunction?.(selectedLayerId);
    };

    private handleEffectLayerModified(fabricEvent?: fabric.IEvent<MouseEvent>) {
        const target = fabricEvent?.target;
        if (!target || !isLightingEffectLayerRect(target)) return;

        const layerId = getLightingEffectLayerIdFromRect(target);
        if (layerId == null) return;

        const fieldWidth = this.canvas.fieldProperties.width;
        const fieldHeight = this.canvas.fieldProperties.height;
        const normalized = fabricRectToEffectLayerRect(target);
        const clamped = clampEffectLayerRectToField(
            normalized,
            fieldWidth,
            fieldHeight,
        );

        if (!isEffectLayerRectLargeEnough(clamped)) {
            this.canvas.discardActiveObject();
            useLightDesignerSelectedEffectLayerStore
                .getState()
                .clearSelectedLayer();
            this.canvas.revertLightingEffectLayersFunction?.();
            return;
        }

        target.set({
            left: clamped.left,
            top: clamped.top,
            width: clamped.width,
            height: clamped.height,
            scaleX: 1,
            scaleY: 1,
        });
        target.setCoords();
        this.canvas.requestRenderAll();

        this.canvas.updateLightingEffectLayerFunction?.({
            id: layerId,
            ...clamped,
        });
    }

    handleMouseDown(fabricEvent: fabric.IEvent<MouseEvent>) {
        const evt = fabricEvent.e;

        if (evt.altKey || evt.button === 1 || evt.button === 2) {
            super.handleMouseDown(fabricEvent);
            return;
        }

        const target = fabricEvent.target;
        if (target && isLightingEffectLayerRect(target)) {
            const layerId = getLightingEffectLayerIdFromRect(target);
            if (layerId != null) {
                useLightDesignerSelectedEffectLayerStore
                    .getState()
                    .selectLayer(layerId);
                this.canvas.setActiveObject(target);
                this.canvas.requestRenderAll();
                return;
            }
        }

        if (!target) {
            useLightDesignerSelectedEffectLayerStore
                .getState()
                .clearSelectedLayer();
            this.canvas.discardActiveObject();
        }

        super.handleMouseDown(fabricEvent);
    }
}
