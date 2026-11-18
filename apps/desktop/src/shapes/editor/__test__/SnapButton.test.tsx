import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import type { ActionId } from "@/shortcuts/definitions";
import { useAlignmentActionHandlers } from "@/shortcuts/handlers/useAlignmentActionHandlers";
import { subscribeToActionRuns } from "@/shortcuts/registry";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { SnapButton } from "../ShapeEditorBar";
import { RichTips } from "@/components/ui/Tip";

/**
 * The floating editor's Snap button (modifier roles, version A): it turns the Snap toggle off and
 * on, and shows pressed while snapping is off, so a forgotten off state is in plain sight. Its
 * click runs the Toggle Snap action, as Shift+M and the touch pill do, so all three go one way.
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
        <QueryClientProvider client={new QueryClient()}>
            <Handlers />
            <RichTips>
                <SnapButton />
            </RichTips>
        </QueryClientProvider>,
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

    it("runs the Toggle Snap action rather than setting the store itself", () => {
        const button = shown();
        const runs: ActionId[] = [];
        const unsubscribe = subscribeToActionRuns((id) => runs.push(id));
        try {
            fireEvent.click(button);
        } finally {
            unsubscribe();
        }
        expect(runs).toEqual(["toggleSnap"]);
        expect(snapOn()).toBe(false);
    });
});

function Handlers() {
    useAlignmentActionHandlers();
    return null;
}
