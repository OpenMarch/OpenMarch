import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useSnapOnWhenFileOpens } from "../useSnapOnWhenFileOpens";

/**
 * The Snap toggle (modifier roles, version A) isn't kept when a file opens, so a forgotten toggle
 * doesn't leave the next show off the half steps.
 */

afterEach(() => {
    act(() => {
        useUiSettingsStore.getState().setSnap(true);
    });
    localStorage.clear();
});

describe("useSnapOnWhenFileOpens", () => {
    it("turns back on when a file opens", () => {
        act(() => {
            useUiSettingsStore.getState().setSnap(false);
        });
        const { rerender } = renderHook(
            ({ open }) => useSnapOnWhenFileOpens(open),
            { initialProps: { open: false } },
        );
        expect(useUiSettingsStore.getState().uiSettings.snap).toBe(false);
        rerender({ open: true });
        expect(useUiSettingsStore.getState().uiSettings.snap).toBe(true);

        // Turned off again while the file is open, it stays off
        act(() => {
            useUiSettingsStore.getState().setSnap(false);
        });
        rerender({ open: true });
        expect(useUiSettingsStore.getState().uiSettings.snap).toBe(false);
    });
});
