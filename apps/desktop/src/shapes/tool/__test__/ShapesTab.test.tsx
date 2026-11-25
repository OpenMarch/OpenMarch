import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TolgeeProvider } from "@tolgee/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import tolgee from "@/global/singletons/Tolgee";
import { useInputModeStore } from "@/stores/InputModeStore";
import { resetKeyboardSeen } from "@/stores/KeyboardSeenStore";
import { registerActionHandler } from "@/shortcuts/registry";
import ShapesTab from "../ShapesTab";

// The Shapes tab in the tablet layout (tablet plan 2.2): a finger has no R to hold, so the tab
// gets a Ring button that runs the same action, and the "Hold R" hint waits for a keyboard.

const setMode = (preference: "touch" | "mouse") =>
    act(() => {
        useInputModeStore.getState().setPreference(preference);
    });

const renderTab = () =>
    render(
        <QueryClientProvider client={new QueryClient()}>
            <TolgeeProvider tolgee={tolgee} fallback="">
                <TooltipProvider>
                    <ShapesTab />
                </TooltipProvider>
            </TolgeeProvider>
        </QueryClientProvider>,
    );

const pressKey = (key: string) =>
    act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key }));
    });

describe("ShapesTab", () => {
    const run = vi.fn();
    let unregister: () => void;

    beforeEach(() => {
        resetKeyboardSeen();
        run.mockClear();
        unregister = registerActionHandler("openShapeRing", {
            run,
            isEnabled: () => true,
        });
    });
    afterEach(() => {
        cleanup();
        unregister();
        localStorage.clear();
        setMode("mouse");
    });

    it("on a tablet, a Ring button opens the ring at the field, latched", () => {
        setMode("touch");
        renderTab();
        fireEvent.click(screen.getByTestId("shapes-tab-ring"));
        expect(run).toHaveBeenCalledWith({ latched: true, atField: true });
    });

    it("on a tablet, the Hold R hint shows only once a keyboard is used", () => {
        setMode("touch");
        renderTab();
        expect(screen.queryByTestId("shapes-tab-ring-hint")).toBeNull();
        pressKey("Shift");
        expect(screen.getByTestId("shapes-tab-ring-hint")).toBeInTheDocument();
        // The button stays: the ring is still a tap away
        expect(screen.getByTestId("shapes-tab-ring")).toBeInTheDocument();
    });

    it("on a tablet, each shape kind is an icon named for a long press, with no caption (#1292)", () => {
        setMode("touch");
        renderTab();
        const box = screen.getByRole("button", { name: "Box" });
        expect(box.querySelector("[data-touch-caption]")).toBeNull();
        expect(screen.getByTestId("shapes-tab-ring")).toHaveAccessibleName();
        expect(document.querySelector("[data-touch-caption]")).toBeNull();
    });

    it("with a mouse, the tab is unchanged: the hint, no Ring button, no captions", () => {
        setMode("mouse");
        renderTab();
        expect(screen.getByTestId("shapes-tab-ring-hint")).toBeInTheDocument();
        expect(screen.queryByTestId("shapes-tab-ring")).toBeNull();
        expect(document.querySelector("[data-touch-caption]")).toBeNull();
    });
});
