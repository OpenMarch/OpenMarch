import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CollapsedTimeline, ExpandedTimeline } from "../TimelineVariants";
import { Timeline, TimelineWaveformProvider } from "../Timeline";
import {
    createLongTimelineStoryModel,
    timelineStoryData,
    timelineStoryModel,
} from "../TimelineStoryFixtures";

afterEach(cleanup);

const commonProps = {
    model: timelineStoryModel,
    positionBeat: 11,
    isPlaying: false,
    pixelsPerBeat: 16,
};

describe("timeline views", () => {
    it("renders expanded packed tracks over canvas layers", () => {
        const onSelectionChange = vi.fn();
        const { container } = render(
            <ExpandedTimeline
                {...commonProps}
                showTransport={false}
                onSelectionChange={onSelectionChange}
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
        expect(screen.getByTestId("timeline-initial-page")).toHaveStyle({
            width: "40px",
        });
        expect(screen.getByRole("button", { name: "Page 1" })).toHaveStyle({
            left: "40px",
        });
        expect(screen.getByRole("button", { name: "Page 1" })).toHaveClass(
            "justify-end",
        );
        expect(screen.getByTestId("timeline-pointer-surface")).toHaveStyle({
            left: "40px",
        });

        fireEvent.click(screen.getByLabelText(/SH timeline/));
        expect(onSelectionChange).toHaveBeenCalledWith({
            kind: "track",
            trackId: "shape",
        });
    });

    it("forwards transport playback and exposes zoom only when expanded", () => {
        const onPlayingChange = vi.fn();
        const onPixelsPerBeatChange = vi.fn();
        const { rerender } = render(
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

        rerender(
            <CollapsedTimeline
                {...commonProps}
                showTransport
                onPixelsPerBeatChange={onPixelsPerBeatChange}
            />,
        );
        expect(
            screen.queryByRole("button", { name: "Zoom in" }),
        ).not.toBeInTheDocument();
    });

    it("synchronizes page and track selections to one range overlay", () => {
        const onSelectionChange = vi.fn();
        const { rerender } = render(
            <ExpandedTimeline
                {...commonProps}
                showTransport={false}
                selection={{ kind: "page", pageId: "page-2" }}
                onSelectionChange={onSelectionChange}
            />,
        );

        expect(screen.getByRole("button", { name: "Page 2" })).toHaveAttribute(
            "aria-pressed",
            "true",
        );
        expect(
            screen.getByTestId("timeline-selection-range"),
        ).toBeInTheDocument();

        rerender(
            <ExpandedTimeline
                {...commonProps}
                showTransport={false}
                selection={{ kind: "track", trackId: "shape" }}
                onSelectionChange={onSelectionChange}
            />,
        );
        expect(screen.getByLabelText(/SH timeline/)).toHaveAttribute(
            "aria-pressed",
            "true",
        );
    });

    it("rounds only the outside edges of each track", () => {
        const { container, rerender } = render(
            <CollapsedTimeline {...commonProps} showTransport={false} />,
        );

        expect(
            container.querySelectorAll('[data-activity="active"]'),
        ).toHaveLength(6);
        expect(
            container.querySelectorAll('[data-activity="inactive"]'),
        ).toHaveLength(3);

        const collapsedSpans = screen
            .getByLabelText(/M1 timeline/)
            .querySelectorAll("[data-activity]");
        expect(collapsedSpans[0]).toHaveClass("rounded-l-full");
        expect(collapsedSpans[0]).not.toHaveClass("rounded-r-full");
        expect(collapsedSpans[1]).not.toHaveClass(
            "rounded-l-full",
            "rounded-r-full",
        );
        expect(collapsedSpans[2]).not.toHaveClass("rounded-l-full");
        expect(collapsedSpans[2]).toHaveClass("rounded-r-full");

        rerender(<ExpandedTimeline {...commonProps} showTransport={false} />);

        const expandedSpans = screen
            .getByLabelText(/M1 timeline/)
            .querySelectorAll("[data-activity]");
        expect(expandedSpans[0]).toHaveClass("rounded-l-4");
        expect(expandedSpans[0]).not.toHaveClass("rounded-r-4");
        expect(expandedSpans[1]).not.toHaveClass("rounded-l-4", "rounded-r-4");
        expect(expandedSpans[2]).not.toHaveClass("rounded-l-4");
        expect(expandedSpans[2]).toHaveClass("rounded-r-4");

        for (const inactive of container.querySelectorAll(
            '[data-activity="inactive"]',
        )) {
            expect(inactive).not.toHaveClass("rounded-l-4", "rounded-r-4");
        }
    });

    it("shows counts for any concrete selection range", () => {
        const onCreateTrack = vi.fn();
        const { rerender } = render(
            <ExpandedTimeline
                {...commonProps}
                showTransport={false}
                selection={{ kind: "page", pageId: "page-2" }}
                selectedTarget={{ id: "new-marcher", type: "marcher" }}
                onCreateTrack={onCreateTrack}
            />,
        );

        expect(
            screen.getByTestId("timeline-selection-count"),
        ).toHaveTextContent("8 counts");
        expect(
            screen.queryByRole("button", { name: "Create Track" }),
        ).not.toBeInTheDocument();

        rerender(
            <ExpandedTimeline
                {...commonProps}
                showTransport={false}
                selection={{ kind: "track", trackId: "shape" }}
                selectedTarget={{ id: "shape-1", type: "shape" }}
                onCreateTrack={onCreateTrack}
            />,
        );
        expect(
            screen.getByTestId("timeline-selection-count"),
        ).toHaveTextContent("16 counts");
        expect(
            screen.queryByRole("button", { name: "Create Track" }),
        ).not.toBeInTheDocument();

        rerender(
            <ExpandedTimeline
                {...commonProps}
                showTransport={false}
                selection={{
                    kind: "range",
                    range: { startBeatIndex: 5, endBeatIndex: 9 },
                }}
            />,
        );
        expect(
            screen.getByTestId("timeline-selection-count"),
        ).toHaveTextContent("4 counts");
        expect(
            screen.queryByRole("button", { name: "Create Track" }),
        ).not.toBeInTheDocument();

        rerender(
            <ExpandedTimeline
                {...commonProps}
                showTransport={false}
                selection={{ kind: "page", pageId: "page-0" }}
            />,
        );
        expect(
            screen.queryByTestId("timeline-selection-count"),
        ).not.toBeInTheDocument();

        rerender(
            <ExpandedTimeline
                {...commonProps}
                showTransport={false}
                selection={null}
            />,
        );
        expect(
            screen.queryByTestId("timeline-selection-count"),
        ).not.toBeInTheDocument();
    });

    it("shows create track for an explicit range regardless of coverage", () => {
        const onCreateTrack = vi.fn();
        render(
            <ExpandedTimeline
                {...commonProps}
                showTransport={false}
                selection={{
                    kind: "range",
                    range: { startBeatIndex: 5, endBeatIndex: 9 },
                }}
                selectedTarget={{ id: "marcher-1", type: "marcher" }}
                onCreateTrack={onCreateTrack}
            />,
        );
        const create = screen.getByRole("button", { name: "Create Track" });
        fireEvent.click(create);
        expect(onCreateTrack).toHaveBeenCalledWith({
            target: { id: "marcher-1", type: "marcher" },
            range: { startBeatIndex: 5, endBeatIndex: 9 },
        });
        expect(screen.getByText("4 counts")).toBeInTheDocument();
    });

    it("moves the count with the dragged start flag and reveals create on release", () => {
        const onSelectionChange = vi.fn();
        const onCreateTrack = vi.fn();
        render(
            <ExpandedTimeline
                {...commonProps}
                showTransport={false}
                selection={{
                    kind: "range",
                    range: { startBeatIndex: 5, endBeatIndex: 9 },
                }}
                selectedTarget={{ id: "marcher-1", type: "marcher" }}
                onSelectionChange={onSelectionChange}
                onCreateTrack={onCreateTrack}
            />,
        );
        const start = screen.getByRole("button", { name: "Selection start" });
        const actions = screen.getByTestId("timeline-selection-actions");

        fireEvent(
            start,
            new MouseEvent("pointerdown", {
                bubbles: true,
                button: 0,
                clientX: 80,
            }),
        );
        fireEvent(
            start,
            new MouseEvent("pointermove", { bubbles: true, clientX: 112 }),
        );

        expect(onSelectionChange).not.toHaveBeenCalled();
        expect(screen.getByText("2 counts")).toBeInTheDocument();
        expect(actions).toHaveStyle({
            left: "106px",
            transform: "translateX(-100%)",
        });
        expect(actions).toHaveClass("flex-col");
        expect(
            screen.queryByRole("button", { name: "Create Track" }),
        ).not.toBeInTheDocument();

        fireEvent(
            start,
            new MouseEvent("pointermove", { bubbles: true, clientX: 0 }),
        );
        expect(screen.getByText("9 counts")).toBeInTheDocument();
        expect(actions).toHaveStyle({ left: "6px", transform: "" });

        fireEvent(
            start,
            new MouseEvent("pointerup", { bubbles: true, clientX: 0 }),
        );

        expect(onSelectionChange).toHaveBeenCalledTimes(1);
        expect(onSelectionChange).toHaveBeenCalledWith({
            kind: "range",
            range: { startBeatIndex: 0, endBeatIndex: 9 },
        });
        expect(actions).toHaveStyle({ left: "150px", transform: "" });
        const create = screen.getByRole("button", { name: "Create Track" });
        expect(
            screen.getByTestId("timeline-selection-count").nextElementSibling,
        ).toBe(create);
        fireEvent.click(create);
        expect(onCreateTrack).toHaveBeenCalledWith({
            target: { id: "marcher-1", type: "marcher" },
            range: { startBeatIndex: 0, endBeatIndex: 9 },
        });
    });

    it("moves the count with the end flag and restores state on cancel", () => {
        const onSelectionChange = vi.fn();
        render(
            <ExpandedTimeline
                {...commonProps}
                showTransport={false}
                selection={{
                    kind: "range",
                    range: { startBeatIndex: 5, endBeatIndex: 9 },
                }}
                selectedTarget={{ id: "marcher-1", type: "marcher" }}
                onSelectionChange={onSelectionChange}
                onCreateTrack={vi.fn()}
            />,
        );
        const end = screen.getByRole("button", { name: "Selection end" });
        const actions = screen.getByTestId("timeline-selection-actions");

        fireEvent(
            end,
            new MouseEvent("pointerdown", {
                bubbles: true,
                button: 0,
                clientX: 144,
            }),
        );
        fireEvent(
            end,
            new MouseEvent("pointermove", { bubbles: true, clientX: 192 }),
        );

        expect(screen.getByText("7 counts")).toBeInTheDocument();
        expect(actions).toHaveStyle({ left: "198px", transform: "" });
        expect(
            screen.queryByRole("button", { name: "Create Track" }),
        ).not.toBeInTheDocument();

        fireEvent(
            end,
            new MouseEvent("pointermove", { bubbles: true, clientX: 512 }),
        );
        expect(screen.getByText("27 counts")).toBeInTheDocument();
        expect(actions).toHaveStyle({
            left: "506px",
            transform: "translateX(-100%)",
        });

        fireEvent(end, new MouseEvent("pointercancel", { bubbles: true }));

        expect(onSelectionChange).not.toHaveBeenCalled();
        expect(screen.getByText("4 counts")).toBeInTheDocument();
        expect(actions).toHaveStyle({ left: "150px", transform: "" });
        expect(
            screen.getByRole("button", { name: "Create Track" }),
        ).toBeInTheDocument();
    });

    it("uses the playhead as the only hover detail and scrubs on drag", () => {
        const onSeek = vi.fn();
        render(
            <ExpandedTimeline
                {...commonProps}
                showTransport={false}
                onSeek={onSeek}
            />,
        );
        const surface = screen.getByTestId("timeline-pointer-surface");
        const playhead = screen.getByRole("button", {
            name: /^Playback position:/,
        });

        fireEvent(
            surface,
            new MouseEvent("pointermove", { bubbles: true, clientX: 64 }),
        );
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
        expect(onSeek).not.toHaveBeenCalled();
        expect(screen.getAllByTestId("timeline-playhead")).toHaveLength(1);

        fireEvent.pointerEnter(playhead);
        const detail = screen.getByRole("tooltip");
        expect(detail).toHaveTextContent("Pg 2 · m3.4");
        expect(surface.contains(detail)).toBe(false);
        fireEvent.pointerLeave(playhead);
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
        fireEvent.focus(playhead);
        expect(screen.getByRole("tooltip")).toBeInTheDocument();
        fireEvent.blur(playhead);
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

        fireEvent(
            surface,
            new MouseEvent("pointerdown", {
                bubbles: true,
                button: 0,
                clientX: 64,
            }),
        );
        expect(screen.getByRole("tooltip")).toBeInTheDocument();
        fireEvent(
            surface,
            new MouseEvent("pointermove", { bubbles: true, clientX: 96 }),
        );
        fireEvent(
            surface,
            new MouseEvent("pointerup", { bubbles: true, clientX: 96 }),
        );
        expect(onSeek).toHaveBeenCalledWith(4);
        expect(onSeek).toHaveBeenLastCalledWith(6);
    });

    it("seeks from an accessible rehearsal marker", () => {
        const onSeek = vi.fn();
        render(
            <ExpandedTimeline
                {...commonProps}
                showTransport={false}
                onSeek={onSeek}
            />,
        );

        fireEvent.click(
            screen.getByRole("button", { name: "Rehearsal mark A" }),
        );
        expect(onSeek).toHaveBeenCalledWith(24);
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

    it("commits a timeline drag once on pointer release", () => {
        const onTimelineRangeCommit = vi.fn();
        render(
            <ExpandedTimeline
                {...commonProps}
                showTransport={false}
                onTimelineRangeCommit={onTimelineRangeCommit}
            />,
        );
        const track = screen.getByLabelText(/M1 timeline/);

        fireEvent(
            track,
            new MouseEvent("pointerdown", {
                bubbles: true,
                button: 0,
                clientX: 0,
            }),
        );
        fireEvent(
            track,
            new MouseEvent("pointermove", { bubbles: true, clientX: 32 }),
        );
        expect(onTimelineRangeCommit).not.toHaveBeenCalled();
        fireEvent(
            track,
            new MouseEvent("pointerup", { bubbles: true, clientX: 32 }),
        );

        expect(onTimelineRangeCommit).toHaveBeenCalledTimes(1);
        expect(onTimelineRangeCommit).toHaveBeenCalledWith({
            timelineId: "m1",
            startBeatIndex: 2,
            endBeatIndex: 18,
        });
    });
});

describe("production timeline interface", () => {
    const shared = {
        beats: timelineStoryData.beats,
        pages: timelineStoryData.pages,
        measures: timelineStoryData.measures,
        timelines: timelineStoryData.timelines,
    };

    it("supports exactly the collapsed view with the controlled selection", () => {
        render(
            <TimelineWaveformProvider waveform={timelineStoryData.waveform}>
                <Timeline
                    {...shared}
                    mode="collapsed"
                    selection={{ kind: "page", pageId: 3 }}
                />
            </TimelineWaveformProvider>,
        );

        expect(screen.getByRole("button", { name: "Page 2" })).toHaveAttribute(
            "aria-pressed",
            "true",
        );
        expect(
            screen.getByTestId("timeline-selection-range"),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: "Zoom in" }),
        ).not.toBeInTheDocument();
    });

    it("turns a handle edit into a free range selection", () => {
        const onSelectionChange = vi.fn();
        render(
            <TimelineWaveformProvider waveform={timelineStoryData.waveform}>
                <Timeline
                    {...shared}
                    mode="expanded"
                    selection={{ kind: "page", pageId: 3 }}
                    onSelectionChange={onSelectionChange}
                />
            </TimelineWaveformProvider>,
        );
        const start = screen.getByRole("button", {
            name: "Selection start",
        });

        fireEvent.keyDown(start, { key: "ArrowRight" });
        expect(onSelectionChange).toHaveBeenCalledWith({
            kind: "range",
            range: { startBeatIndex: 9, endBeatIndex: 16 },
        });
    });
});
