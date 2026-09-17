import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    CollapsedTimeline,
    ExpandedTimeline,
    InspectorTimeline,
    SimpleTimeline,
} from "../TimelineVariants";
import {
    createLongTimelineStoryModel,
    timelineStoryModel,
} from "../TimelineStoryFixtures";

afterEach(cleanup);

const commonProps = {
    model: timelineStoryModel,
    positionBeat: 11,
    isPlaying: false,
    pixelsPerBeat: 16,
};

describe("new timeline variants", () => {
    it("renders expanded packed tracks over canvas layers", () => {
        const onTrackSelect = vi.fn();
        const { container } = render(
            <ExpandedTimeline
                {...commonProps}
                showTransport={false}
                onTrackSelect={onTrackSelect}
            />,
        );

        expect(screen.getByLabelText(/M1 timeline/)).toBeInTheDocument();
        expect(screen.getByLabelText(/SH timeline/)).toBeInTheDocument();
        expect(
            container.querySelectorAll('[data-testid="timeline-grid-canvas"]'),
        ).toHaveLength(1);
        expect(
            container.querySelectorAll(
                '[data-testid="timeline-waveform-canvas"]',
            ),
        ).toHaveLength(1);

        fireEvent.click(screen.getByLabelText(/SH timeline/));
        expect(onTrackSelect).toHaveBeenCalledWith("shape");
    });

    it("forwards transport playback and zoom controls", () => {
        const onPlayingChange = vi.fn();
        const onPixelsPerBeatChange = vi.fn();
        render(
            <ExpandedTimeline
                {...commonProps}
                showTransport
                onPlayingChange={onPlayingChange}
                onPixelsPerBeatChange={onPixelsPerBeatChange}
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: "Play" }));
        fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));

        expect(onPlayingChange).toHaveBeenCalledWith(true);
        expect(onPixelsPerBeatChange).toHaveBeenCalledWith(20);
    });

    it("keeps simple mode free of a playhead and exposes page controls", () => {
        const onPageSelect = vi.fn();
        render(
            <SimpleTimeline
                {...commonProps}
                showTransport={false}
                onPageSelect={onPageSelect}
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: "2" }));
        expect(onPageSelect).toHaveBeenCalledWith("page-2");
        expect(screen.queryByLabelText(/^Pg /)).not.toBeInTheDocument();
    });

    it("renders compact tracks in collapsed mode", () => {
        render(<CollapsedTimeline {...commonProps} />);

        expect(screen.getByLabelText(/M7 timeline/)).toBeInTheDocument();
        expect(screen.getByLabelText(/^Pg 2/)).toBeInTheDocument();
    });

    it("shows only the focused track in inspector mode", () => {
        render(
            <div style={{ width: 900 }}>
                <InspectorTimeline {...commonProps} focusedTrackId="shape" />
            </div>,
        );

        expect(screen.getByLabelText(/SH timeline/)).toBeInTheDocument();
        expect(screen.queryByLabelText(/M1 timeline/)).not.toBeInTheDocument();
    });

    it("scrubs from one pointer surface instead of beat DOM nodes", () => {
        const onSeek = vi.fn();
        render(
            <ExpandedTimeline
                {...commonProps}
                showTransport={false}
                onSeek={onSeek}
            />,
        );
        const viewport = screen.getByTestId("timeline-viewport");
        const surface = viewport.firstElementChild!;

        fireEvent(
            surface,
            new MouseEvent("pointerdown", {
                bubbles: true,
                button: 0,
                clientX: 64,
            }),
        );
        expect(onSeek).toHaveBeenCalledWith(4);
    });

    it("does not create one DOM node per beat for a long show", () => {
        const { container } = render(
            <ExpandedTimeline
                {...commonProps}
                model={createLongTimelineStoryModel()}
                pixelsPerBeat={8}
                showTransport={false}
            />,
        );

        expect(
            container.querySelectorAll('[data-testid="timeline-grid-canvas"]'),
        ).toHaveLength(1);
        expect(container.querySelectorAll("canvas")).toHaveLength(2);
        expect(container.querySelectorAll("*").length).toBeLessThan(500);
    });
});
