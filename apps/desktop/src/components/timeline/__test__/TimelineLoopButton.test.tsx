import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { TimelineLoopButton } from "../TimelineControls";
import { TransportTooltipProvider } from "../ShortcutTooltip";

const store = () => useTimelineSelectionStore.getState();
const BOXES = [
    { start: 1, end: 9 },
    { start: 9, end: 17 },
];

const renderButton = () =>
    render(
        <TransportTooltipProvider>
            <TimelineLoopButton />
        </TransportTooltipProvider>,
    );

describe("the Loop button (UI-17)", () => {
    beforeEach(() => {
        store().reset();
        store().setPageBoxes(BOXES);
        store().selectRange(9, 17);
    });
    afterEach(cleanup);

    it("toggles looping over the page being edited", () => {
        renderButton();
        const button = screen.getByTestId("timeline-loop");
        expect(button).toHaveAttribute("aria-pressed", "false");
        fireEvent.click(button);
        expect(store().loop).toEqual({ start: 9, end: 17 });
        expect(button).toHaveAttribute("aria-pressed", "true");
        fireEvent.click(button);
        expect(store().loop).toBeNull();
    });

    it("is lit and can't turn off while a move is isolated, which always loops", () => {
        store().setStoredTimelines([
            { id: 1, start: 9, end: 17, marcherIds: new Set([1]) },
        ]);
        store().isolate(1);
        renderButton();
        const button = screen.getByTestId("timeline-loop");
        expect(button).toHaveAttribute("aria-pressed", "true");
        expect(button).toHaveAttribute("aria-disabled", "true");
        fireEvent.click(button);
        expect(store().loop).toBeNull();
        expect(button).toHaveAttribute("aria-pressed", "true");
    });
});
