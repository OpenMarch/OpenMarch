import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExpandedTimeline } from "../TimelineVariants";
import { timelineStoryModel } from "../TimelineStoryFixtures";

afterEach(cleanup);

const pointer = (target: Element, type: string, clientX: number) =>
    fireEvent(
        target,
        // Alt: no page snapping, so the flag lands on the beat under the pointer
        new MouseEvent(type, {
            bubbles: true,
            button: 0,
            clientX,
            altKey: true,
        }),
    );

/** The window [5, 9) */
const renderWindow = () => {
    const onSelectionChange = vi.fn();
    render(
        <ExpandedTimeline
            model={timelineStoryModel}
            positionBeat={9}
            isPlaying={false}
            pixelsPerBeat={16}
            showTransport={false}
            selection={{
                kind: "range",
                range: { startBeatIndex: 5, endBeatIndex: 9 },
            }}
            selectedTarget={{ id: "marcher-1", type: "marcher" }}
            onSelectionChange={onSelectionChange}
        />,
    );
    expect(screen.getByText("4 counts")).toBeInTheDocument();
    return {
        onSelectionChange,
        start: screen.getByRole("button", { name: /^Start flag/ }),
    };
};

describe("a start flag drag that never gets its release", () => {
    it("is cancelled when its pointer capture is lost", () => {
        const { onSelectionChange, start } = renderWindow();
        pointer(start, "pointerdown", 80);
        pointer(start, "pointermove", 112);
        fireEvent(
            start,
            new MouseEvent("lostpointercapture", { bubbles: true }),
        );
        expect(screen.getByText("4 counts")).toBeInTheDocument();
        pointer(start, "pointerup", 112);
        expect(onSelectionChange).not.toHaveBeenCalled();
    });

    it("is cancelled by Escape", () => {
        const { onSelectionChange, start } = renderWindow();
        pointer(start, "pointerdown", 80);
        pointer(start, "pointermove", 112);
        fireEvent.keyDown(start, { key: "Escape" });
        expect(screen.getByText("4 counts")).toBeInTheDocument();
        pointer(start, "pointerup", 112);
        expect(onSelectionChange).not.toHaveBeenCalled();
    });
});
