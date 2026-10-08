import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useCanvasUiSettings } from "../useCanvasUiSettings";

const initial = useUiSettingsStore.getState();

describe("useCanvasUiSettings", () => {
    afterEach(() => useUiSettingsStore.setState(initial, true));

    it("sets the canvas's settings, then follows the store", () => {
        const setUiSettings = vi.fn();
        const canvas = { setUiSettings } as unknown as OpenMarchCanvas;
        renderHook(() => useCanvasUiSettings(canvas));
        expect(setUiSettings).toHaveBeenLastCalledWith(initial.uiSettings);
        const next = {
            ...initial.uiSettings,
            gridLines: !initial.uiSettings.gridLines,
        };
        act(() => {
            useUiSettingsStore.setState({ uiSettings: next });
        });
        expect(setUiSettings).toHaveBeenLastCalledWith(next);
    });

    it("a canvas that fails to take the settings doesn't stop the store's other listeners", () => {
        const setUiSettings = vi.fn();
        const canvas = { setUiSettings } as unknown as OpenMarchCanvas;
        renderHook(() => useCanvasUiSettings(canvas));
        setUiSettings.mockImplementation(() => {
            throw new Error("disposed canvas");
        });
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        const later = vi.fn();
        const unsubscribe = useUiSettingsStore.subscribe(later);
        try {
            const next = {
                ...initial.uiSettings,
                gridLines: !initial.uiSettings.gridLines,
            };
            expect(() =>
                act(() => {
                    useUiSettingsStore.setState({ uiSettings: next });
                }),
            ).not.toThrow();
            expect(later).toHaveBeenCalled();
            expect(error).toHaveBeenCalled();
        } finally {
            unsubscribe();
            error.mockRestore();
        }
    });
});
