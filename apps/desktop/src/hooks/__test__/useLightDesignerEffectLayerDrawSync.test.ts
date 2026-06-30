import { useLightDesignerEffectLayerDrawStore } from "@/stores/LightDesignerEffectLayerDrawStore";
import { useLightDesignerSelectedEffectStore } from "@/stores/LightDesignerSelectedEffectStore";
import { useWorkspaceViewStore } from "@/stores/WorkspaceViewStore";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useLightDesignerEffectLayerDrawSync } from "../useLightDesignerEffectLayerDrawSync";

describe("useLightDesignerEffectLayerDrawSync", () => {
    beforeEach(() => {
        act(() => {
            useWorkspaceViewStore.getState().setMode("lightDesigner");
            useLightDesignerEffectLayerDrawStore.getState().cancelDrawMode();
            useLightDesignerSelectedEffectStore
                .getState()
                .clearSelectedEffect();
        });
    });

    afterEach(() => {
        act(() => {
            useWorkspaceViewStore.getState().setMode("editor");
        });
    });

    it("does not cancel completed draw when selection is cleared", () => {
        act(() => {
            useLightDesignerEffectLayerDrawStore.getState().startDrawMode(7);
            useLightDesignerEffectLayerDrawStore.getState().completeDraw({
                top: 1,
                left: 2,
                width: 3,
                height: 4,
            });
        });

        const { rerender } = renderHook(
            ({ sceneId }) => useLightDesignerEffectLayerDrawSync(sceneId),
            { initialProps: { sceneId: 1 as number | undefined } },
        );

        act(() => {
            useLightDesignerSelectedEffectStore
                .getState()
                .clearSelectedEffect();
        });
        rerender({ sceneId: 1 });

        expect(
            useLightDesignerEffectLayerDrawStore.getState().drawState.status,
        ).toBe("completed");
    });

    it("cancels drawing when selection is cleared", () => {
        act(() => {
            useLightDesignerEffectLayerDrawStore.getState().startDrawMode(7);
        });

        const { rerender } = renderHook(
            ({ sceneId }) => useLightDesignerEffectLayerDrawSync(sceneId),
            { initialProps: { sceneId: 1 as number | undefined } },
        );

        act(() => {
            useLightDesignerSelectedEffectStore
                .getState()
                .clearSelectedEffect();
        });
        rerender({ sceneId: 1 });

        expect(
            useLightDesignerEffectLayerDrawStore.getState().drawState.status,
        ).toBe("idle");
    });
});
