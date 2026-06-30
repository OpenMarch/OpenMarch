import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { useLightDesignerEffectLayerDrawStore } from "../LightDesignerEffectLayerDrawStore";

describe("LightDesignerEffectLayerDrawStore", () => {
    beforeEach(() => {
        act(() => {
            useLightDesignerEffectLayerDrawStore.getState().cancelDrawMode();
        });
    });

    it("starts in idle state", () => {
        expect(
            useLightDesignerEffectLayerDrawStore.getState().drawState.status,
        ).toBe("idle");
    });

    it("enters drawing mode for an effect", () => {
        act(() => {
            useLightDesignerEffectLayerDrawStore.getState().startDrawMode(42);
        });

        const drawState =
            useLightDesignerEffectLayerDrawStore.getState().drawState;
        expect(drawState.status).toBe("drawing");
        if (drawState.status === "drawing") {
            expect(drawState.effectId).toBe(42);
        }
    });

    it("completes a draw with rect", () => {
        act(() => {
            useLightDesignerEffectLayerDrawStore.getState().startDrawMode(7);
        });
        act(() => {
            useLightDesignerEffectLayerDrawStore.getState().completeDraw({
                top: 10,
                left: 20,
                width: 30,
                height: 40,
            });
        });

        const drawState =
            useLightDesignerEffectLayerDrawStore.getState().drawState;
        expect(drawState.status).toBe("completed");
        if (drawState.status === "completed") {
            expect(drawState.effectId).toBe(7);
            expect(drawState.rect).toEqual({
                top: 10,
                left: 20,
                width: 30,
                height: 40,
            });
        }
    });

    it("ignores completeDraw when not drawing", () => {
        act(() => {
            useLightDesignerEffectLayerDrawStore.getState().completeDraw({
                top: 0,
                left: 0,
                width: 10,
                height: 10,
            });
        });

        expect(
            useLightDesignerEffectLayerDrawStore.getState().drawState.status,
        ).toBe("idle");
    });

    it("cancels draw mode", () => {
        act(() => {
            useLightDesignerEffectLayerDrawStore.getState().startDrawMode(3);
        });
        act(() => {
            useLightDesignerEffectLayerDrawStore.getState().cancelDrawMode();
        });

        expect(
            useLightDesignerEffectLayerDrawStore.getState().drawState.status,
        ).toBe("idle");
    });

    it("exposes drawState via selector hook", () => {
        const { result } = renderHook(() =>
            useLightDesignerEffectLayerDrawStore.use.drawState(),
        );
        expect(result.current.status).toBe("idle");
    });
});
