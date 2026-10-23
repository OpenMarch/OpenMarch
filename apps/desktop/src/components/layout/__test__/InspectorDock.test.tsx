import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TolgeeProvider } from "@tolgee/react";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import tolgee from "@/global/singletons/Tolgee";
import type { InspectorPresentation } from "@/utilities/inspectorLayout";
import InspectorDock from "../InspectorDock";

function Harness({
    presentation,
    initiallyOpen,
}: {
    presentation: InspectorPresentation;
    initiallyOpen: boolean;
}) {
    const [open, setOpen] = useState(initiallyOpen);
    return (
        <TolgeeProvider tolgee={tolgee} fallback="Loading...">
            <div style={{ position: "relative" }}>
                <InspectorDock
                    layout={{
                        presentation,
                        open: presentation === "fixed" || open,
                    }}
                    onOpenChange={setOpen}
                >
                    <p>Inspector contents</p>
                </InspectorDock>
            </div>
        </TolgeeProvider>
    );
}

const panel = () => document.getElementById("inspector-panel")!;
const isShown = () => !panel().classList.contains("hidden");

describe("InspectorDock", () => {
    beforeAll(async () => {
        await tolgee.run();
    });
    afterEach(cleanup);

    it("has no tab or shade in the desktop layout", () => {
        render(<Harness presentation="fixed" initiallyOpen />);
        expect(screen.queryByTestId("inspector-tab")).toBeNull();
        expect(screen.queryByTestId("inspector-scrim")).toBeNull();
        expect(isShown()).toBe(true);
    });

    it("opens the drawer from the tab and closes it from the shade", () => {
        render(<Harness presentation="drawer" initiallyOpen={false} />);
        expect(isShown()).toBe(false);
        expect(screen.queryByTestId("inspector-scrim")).toBeNull();

        fireEvent.click(screen.getByRole("button", { name: "Show inspector" }));
        expect(isShown()).toBe(true);
        expect(screen.getByText("Inspector contents")).toBeTruthy();

        fireEvent.click(screen.getByTestId("inspector-scrim"));
        expect(isShown()).toBe(false);
        expect(screen.queryByTestId("inspector-scrim")).toBeNull();
    });

    it("closes the drawer with its tab and with Escape", () => {
        render(<Harness presentation="drawer" initiallyOpen />);
        fireEvent.click(screen.getByRole("button", { name: "Hide inspector" }));
        expect(isShown()).toBe(false);

        fireEvent.click(screen.getByRole("button", { name: "Show inspector" }));
        fireEvent.keyDown(window, { key: "Escape" });
        expect(isShown()).toBe(false);
    });

    it("hides the side panel without a shade, keeping its contents mounted", () => {
        render(<Harness presentation="side" initiallyOpen />);
        fireEvent.click(screen.getByRole("button", { name: "Hide inspector" }));
        expect(isShown()).toBe(false);
        expect(screen.queryByTestId("inspector-scrim")).toBeNull();
        expect(screen.getByText("Inspector contents")).toBeTruthy();
    });
});
