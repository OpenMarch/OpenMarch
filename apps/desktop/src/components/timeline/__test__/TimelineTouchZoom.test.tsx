import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ExpandedTimeline } from "../TimelineVariants";
import { timelineStoryModel } from "../TimelineStoryFixtures";
import { TIMELINE_MAX_PX_PER_BEAT } from "../TimelinePrimitives";
import { useInputModeStore } from "@/stores/InputModeStore";
import { isActionEnabled, runAction } from "@/shortcuts/registry";

// Tablet 3.2 (#885): the timeline's zoom steps are actions (timelineZoomIn / timelineZoomOut),
// and the touch layout shows them as ± buttons over the timeline. The mouse layout doesn't.

afterEach(() => {
    cleanup();
    act(() => {
        useInputModeStore.getState().setPreference("auto");
    });
});

let zoom = 0;

function ZoomOwner({
    start = 16,
    zoomButtons = false,
    zoomOwner = true,
    transport = true,
}: {
    start?: number;
    zoomButtons?: boolean;
    zoomOwner?: boolean;
    /** With the transport row */
    transport?: boolean;
}) {
    const [pixelsPerBeat, setPixelsPerBeat] = useState(start);
    zoom = pixelsPerBeat;
    return (
        <ExpandedTimeline
            model={timelineStoryModel}
            positionBeat={0}
            isPlaying={false}
            pixelsPerBeat={pixelsPerBeat}
            onPixelsPerBeatChange={zoomOwner ? setPixelsPerBeat : undefined}
            zoomButtons={zoomButtons}
            showTransport={transport}
        />
    );
}

const touchLayout = () => {
    act(() => {
        useInputModeStore.getState().setPreference("touch");
    });
};

describe("the timeline's zoom actions", () => {
    it("step the zoom in and out by the zoom buttons' step", () => {
        render(<ZoomOwner />);
        act(() => {
            runAction("timelineZoomIn");
        });
        expect(zoom).toBe(32);
        act(() => {
            runAction("timelineZoomOut");
        });
        expect(zoom).toBe(16);
    });

    it("can't zoom in past the limit", () => {
        render(<ZoomOwner start={TIMELINE_MAX_PX_PER_BEAT} />);
        expect(isActionEnabled("timelineZoomIn")).toBe(false);
        expect(isActionEnabled("timelineZoomOut")).toBe(true);
    });

    it("aren't registered on a timeline that doesn't own its zoom", () => {
        render(<ZoomOwner zoomOwner={false} />);
        expect(isActionEnabled("timelineZoomIn")).toBe(false);
        expect(isActionEnabled("timelineZoomOut")).toBe(false);
    });
});

describe("the touch layout's ± buttons", () => {
    it("aren't in the mouse layout", () => {
        act(() => {
            useInputModeStore.getState().setPreference("mouse");
        });
        render(<ZoomOwner />);
        expect(screen.queryByTestId("timeline-touch-zoom")).toBeNull();
    });

    it("zoom the timeline in the touch layout, and grey out at the limit", () => {
        touchLayout();
        render(<ZoomOwner start={TIMELINE_MAX_PX_PER_BEAT / 2} />);
        const zoomIn = screen.getByTestId("timeline-touch-zoom-in");
        const zoomOut = screen.getByTestId("timeline-touch-zoom-out");
        expect(zoomIn.getAttribute("aria-label")).toBe("Zoom the timeline in");
        fireEvent.click(zoomIn);
        expect(zoom).toBe(TIMELINE_MAX_PX_PER_BEAT);
        expect((zoomIn as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(zoomOut);
        expect(zoom).toBe(TIMELINE_MAX_PX_PER_BEAT / 2);
        expect((zoomIn as HTMLButtonElement).disabled).toBe(false);
    });

    it("sit in the touch transport's row when the timeline has a transport (3.5)", () => {
        touchLayout();
        render(<ZoomOwner zoomButtons />);
        const zoom = screen.getByTestId("timeline-touch-zoom");
        expect(screen.getByTestId("timeline-transport").contains(zoom)).toBe(
            true,
        );
        // Once: the desktop row's own zoom buttons (tempo mode) aren't drawn too
        expect(screen.getAllByTestId("timeline-touch-zoom")).toHaveLength(1);
        expect(screen.queryByTestId("timeline-zoom-in")).toBeNull();
    });

    it("float over a timeline without a transport", () => {
        touchLayout();
        render(<ZoomOwner transport={false} />);
        expect(screen.getByTestId("timeline-touch-zoom").className).toContain(
            "absolute",
        );
    });

    it("aren't there when the timeline doesn't own its zoom", () => {
        touchLayout();
        render(<ZoomOwner zoomOwner={false} />);
        expect(screen.queryByTestId("timeline-touch-zoom")).toBeNull();
    });
});
