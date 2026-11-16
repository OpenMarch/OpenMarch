import { act, cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTempoModeKeys } from "../useTempoModeKeys";
import { useTempoModeStore } from "../tempoModeStore";

// Tablet 3.5 (#888): Shift+T and tempo mode's key guard belong to the timeline panel, not the
// Edit music button, which the touch transport doesn't show.

afterEach(() => {
    cleanup();
    act(() => {
        if (useTempoModeStore.getState().on)
            useTempoModeStore.getState().toggle();
    });
});

describe("useTempoModeKeys", () => {
    it("Shift+T turns tempo mode on and off", () => {
        renderHook(() => useTempoModeKeys());
        expect(useTempoModeStore.getState().on).toBe(false);
        act(() => {
            fireEvent.keyDown(document.body, { key: "T", shiftKey: true });
        });
        expect(useTempoModeStore.getState().on).toBe(true);
        act(() => {
            fireEvent.keyDown(document.body, { key: "T", shiftKey: true });
        });
        expect(useTempoModeStore.getState().on).toBe(false);
    });

    it("guards the keys while tempo mode is on: other keys don't reach the app's own handlers", () => {
        renderHook(() => useTempoModeKeys());
        const later = vi.fn();
        window.addEventListener("keydown", later);
        try {
            // Shift+Z is the timeline's own Fit key, not one tempo mode leaves on
            fireEvent.keyDown(document.body, {
                key: "Z",
                code: "KeyZ",
                shiftKey: true,
            });
            expect(later).toHaveBeenCalledTimes(1);
            act(() => {
                useTempoModeStore.getState().toggle();
            });
            fireEvent.keyDown(document.body, {
                key: "Z",
                code: "KeyZ",
                shiftKey: true,
            });
            expect(later).toHaveBeenCalledTimes(1);
            // Navigation still goes through (E is Next page)
            fireEvent.keyDown(document.body, { key: "e", code: "KeyE" });
            expect(later).toHaveBeenCalledTimes(2);
        } finally {
            window.removeEventListener("keydown", later);
        }
    });

    it("isn't left installed after the panel goes away", () => {
        const { unmount } = renderHook(() => useTempoModeKeys());
        unmount();
        fireEvent.keyDown(document.body, { key: "T", shiftKey: true });
        expect(useTempoModeStore.getState().on).toBe(false);
    });
});
