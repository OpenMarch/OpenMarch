import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TolgeeProvider } from "@tolgee/react";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import tolgee from "@/global/singletons/Tolgee";
import { useInputModeStore } from "@/stores/InputModeStore";
import {
    DEFAULT_TOOLBAR_PANEL,
    useToolbarPanelStore,
} from "@/stores/ToolbarPanelStore";
import { setToolbarTabsSlot } from "@/components/titlebar/toolbarSlot";
import Toolbar, { PreviewToolbar } from "../Toolbar";

// The tabs' own controls need the database; these tests are about the touch toolbar's frame
vi.mock("../tabs/FileTab", () => ({ FileTab: () => <p>File controls</p> }));
vi.mock("../tabs/AlignmentTab", () => ({
    default: () => <p>Alignment controls</p>,
}));
vi.mock("../tabs/SelectTab", () => ({
    default: () => <p>Select controls</p>,
}));
vi.mock("@/shapes/tool/ShapesTab", () => ({
    default: () => <p>Shapes controls</p>,
}));

let slot: HTMLElement;

beforeEach(() => {
    localStorage.clear();
    useToolbarPanelStore.setState(DEFAULT_TOOLBAR_PANEL);
    useInputModeStore.setState({ mode: "touch" });
    // Stands in for the title bar's slot
    slot = document.createElement("div");
    slot.dataset.testid = "slot";
    document.body.append(slot);
    act(() => {
        setToolbarTabsSlot(slot);
    });
});

afterEach(() => {
    act(() => {
        setToolbarTabsSlot(null);
    });
    slot.remove();
    useInputModeStore.setState({ mode: "pointer" });
});

const renderWith = (ui: React.ReactNode) =>
    render(
        <TolgeeProvider tolgee={tolgee} fallback="">
            <TooltipProvider>{ui}</TooltipProvider>
        </TolgeeProvider>,
    );

const tab = (name: string) => screen.getByRole("tab", { name });

/** A finger's tap: the press, then the click it ends in */
const tapTab = (name: string) => {
    fireEvent.pointerDown(tab(name));
    fireEvent.mouseDown(tab(name));
    fireEvent.click(tab(name));
};

describe("touch toolbar", () => {
    it("puts the tabs in the title bar's slot, with the panel closed", () => {
        renderWith(<Toolbar />);
        expect(slot).toContainElement(tab("Alignment"));
        expect(screen.getByTestId("touch-toolbar")).not.toContainElement(
            tab("Alignment"),
        );
        expect(screen.getByTestId("toolbar-panel")).not.toBeVisible();
    });

    it("locks the title bar row in tempo mode, as App locks the rest", () => {
        const { rerender } = renderWith(
            <Toolbar
                tempoMode
                tempoModeClass="pointer-events-none opacity-30"
            />,
        );
        const row = screen.getByTestId("touch-toolbar-row");
        expect(row).toHaveAttribute("inert");
        expect(row).toHaveClass("pointer-events-none", "opacity-30");
        expect(slot).toContainElement(row);

        rerender(
            <TolgeeProvider tolgee={tolgee} fallback="">
                <TooltipProvider>
                    <Toolbar tempoMode={false} tempoModeClass="" />
                </TooltipProvider>
            </TolgeeProvider>,
        );
        expect(screen.getByTestId("touch-toolbar-row")).not.toHaveAttribute(
            "inert",
        );
    });

    it("a tap opens a tab, and a tap on the open tab closes it", () => {
        renderWith(<Toolbar />);
        tapTab("Select");
        expect(useToolbarPanelStore.getState()).toMatchObject({
            tab: "select",
            open: true,
        });
        tapTab("Select");
        expect(useToolbarPanelStore.getState().open).toBe(false);
    });

    it("a cancelled press doesn't carry over to the next tap", () => {
        useToolbarPanelStore.setState({ tab: "file", open: true });
        renderWith(<Toolbar />);
        // A press on the open tab that the system takes over (the row scrolled)
        fireEvent.pointerDown(tab("File"));
        fireEvent.pointerCancel(tab("File"));
        // Then the panel closes from the chevron, and a keyboard click opens the tab again
        fireEvent.click(screen.getByTestId("toolbar-panel-toggle"));
        fireEvent.click(tab("File"));
        expect(useToolbarPanelStore.getState().open).toBe(true);
    });

    it("Preview's switch takes the same title bar row", () => {
        renderWith(<PreviewToolbar />);
        expect(slot).toContainElement(
            screen.getByTestId("workspace-view-switch"),
        );
    });
});

describe("mouse toolbar", () => {
    it("keeps the tabs and their controls in place, on Alignment", () => {
        useInputModeStore.setState({ mode: "pointer" });
        renderWith(<Toolbar />);
        expect(slot).toBeEmptyDOMElement();
        expect(tab("Alignment")).toHaveAttribute("aria-selected", "true");
        expect(screen.getByText("Alignment controls")).toBeVisible();
        expect(screen.queryByTestId("toolbar-panel")).not.toBeInTheDocument();
    });
});
