import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { SnapButton } from "../ShapeEditorBar";
import { RichTips } from "../Tip";

/**
 * The floating editor's Snap button (modifier roles, version A): it turns the Snap toggle off and
 * on, and shows pressed while snapping is off, so a forgotten off state is in plain sight.
 */

const snapOn = () => useUiSettingsStore.getState().uiSettings.snap;

afterEach(() => {
    cleanup();
    act(() => {
        useUiSettingsStore.getState().setSnap(true);
    });
    localStorage.clear();
});

const shown = () => {
    render(
        <RichTips>
            <SnapButton />
        </RichTips>,
    );
    return screen.getByTestId("shape-editor-snap");
};

describe("the floating editor's Snap button", () => {
    it("isn't pressed while snapping is on, and a click turns snapping off", () => {
        const button = shown();
        expect(button.getAttribute("aria-pressed")).toBe("false");
        expect(button.getAttribute("aria-label")).toBe("Turn Snap off");
        fireEvent.click(button);
        expect(snapOn()).toBe(false);
    });

    it("is pressed while snapping is off, and a click turns it back on", () => {
        act(() => {
            useUiSettingsStore.getState().setSnap(false);
        });
        const button = shown();
        expect(button.getAttribute("aria-pressed")).toBe("true");
        expect(button.getAttribute("aria-label")).toBe(
            "Snap off: turn it back on",
        );
        fireEvent.click(button);
        expect(snapOn()).toBe(true);
        expect(button.getAttribute("aria-pressed")).toBe("false");
    });
});
