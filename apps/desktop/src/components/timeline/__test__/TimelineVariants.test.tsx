import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    CollapsedTimeline,
    ExpandedTimeline,
    fitBackZoom,
} from "../TimelineVariants";
import { scrubLineBeat, snapSeekBeat } from "../TimelinePrimitives";
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

        // UI-12: clicking a clip selects its timeline's range (ui.md U-Q5)
        fireEvent.click(screen.getByLabelText(/SH timeline/));
        expect(onSelectionChange).toHaveBeenCalledWith(
            expect.objectContaining({ kind: "range" }),
        );
    });

    it("selects home from the initial box and a page's range from its box (UI-9)", () => {
        const onSelectionChange = vi.fn();
        render(
            <ExpandedTimeline
                {...commonProps}
                showTransport={false}
                onSelectionChange={onSelectionChange}
            />,
        );
        fireEvent.click(screen.getByTestId("timeline-initial-page"));
        expect(onSelectionChange).toHaveBeenLastCalledWith({ kind: "home" });
        fireEvent.click(screen.getByRole("button", { name: "Page 2" }));
        expect(onSelectionChange).toHaveBeenLastCalledWith({
            kind: "range",
            range: { startBeatIndex: 8, endBeatIndex: 16 },
        });
    });

    it("presses the initial box for home", () => {
        render(
            <ExpandedTimeline
                {...commonProps}
                showTransport={false}
                selection={{ kind: "home" }}
            />,
        );
        expect(screen.getByTestId("timeline-initial-page")).toHaveAttribute(
            "aria-pressed",
            "true",
        );
        expect(
            screen.queryByTestId("timeline-selection-range"),
        ).not.toBeInTheDocument();
    });

    it("Ctrl+drag draws a range on empty space, and a click seeks (UI-9, UI-12)", () => {
        const onSelectionChange = vi.fn();
        const onSeek = vi.fn();
        render(
            <ExpandedTimeline
                {...commonProps}
                showTransport={false}
                onSelectionChange={onSelectionChange}
                onSeek={onSeek}
            />,
        );
        const surface = screen.getByTestId("timeline-pointer-surface");
        // jsdom lays the surface out at x = 0; Alt turns page snapping off. jsdom isn't macOS, so
        // the range modifier is Ctrl
        fireEvent(
            surface,
            new MouseEvent("pointerdown", {
                bubbles: true,
                button: 0,
                clientX: 3 * 16,
                altKey: true,
                ctrlKey: true,
            }),
        );
        fireEvent(
            surface,
            new MouseEvent("pointermove", {
                bubbles: true,
                clientX: 6 * 16,
                altKey: true,
            }),
        );
        expect(screen.getByTestId("timeline-range-preview")).toHaveStyle({
            left: "48px",
            width: "48px",
        });
        fireEvent(
            surface,
            new MouseEvent("pointerup", {
                bubbles: true,
                clientX: 6 * 16,
                altKey: true,
            }),
        );
        // Marked drawn, which turns From start on in the app (UI-11)
        expect(onSelectionChange).toHaveBeenCalledWith({
            kind: "range",
            range: { startBeatIndex: 3, endBeatIndex: 6 },
            drawn: true,
        });
        expect(onSeek).not.toHaveBeenCalled();
        expect(
            screen.queryByTestId("timeline-range-preview"),
        ).not.toBeInTheDocument();

        // A click (no drag) seeks and leaves the selection alone
        fireEvent(
            surface,
            new MouseEvent("pointerdown", {
                bubbles: true,
                button: 0,
                clientX: 10 * 16,
            }),
        );
        fireEvent(
            surface,
            new MouseEvent("pointerup", { bubbles: true, clientX: 10 * 16 }),
        );
        // A press, then its release (UI-12 review: the release ends the gesture)
        expect(onSeek).toHaveBeenCalledWith(10, { gesture: "press" });
        expect(onSeek).toHaveBeenLastCalledWith(10, { gesture: "end" });
        expect(onSelectionChange).toHaveBeenCalledTimes(1);
    });

    it("forwards transport playback, and zooms with Fit and Ctrl+scroll in both densities (UI-12)", async () => {
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
        expect(onPlayingChange).toHaveBeenCalledWith(true);
        expect(
            screen.queryByRole("button", { name: "Zoom in" }),
        ).not.toBeInTheDocument();
        fireEvent.wheel(screen.getByTestId("timeline-viewport"), {
            deltaY: -100,
            ctrlKey: true,
        });
        // Wheel and pinch events are applied once a frame
        await act(
            () => new Promise((resolve) => requestAnimationFrame(resolve)),
        );
        expect(onPixelsPerBeatChange).toHaveBeenCalledTimes(1);
        expect(onPixelsPerBeatChange.mock.calls[0][0]).toBeGreaterThan(16);
        // A plain scroll scrolls; it doesn't zoom
        fireEvent.wheel(screen.getByTestId("timeline-viewport"), {
            deltaY: -100,
        });
        await act(
            () => new Promise((resolve) => requestAnimationFrame(resolve)),
        );
        expect(onPixelsPerBeatChange).toHaveBeenCalledTimes(1);

        rerender(
            <CollapsedTimeline
                {...commonProps}
                showTransport
                onPixelsPerBeatChange={onPixelsPerBeatChange}
            />,
        );
        expect(
            screen.getByRole("button", { name: /^Fit the show/ }),
        ).toBeInTheDocument();
    });

    it("synchronizes page boxes and clips with the selected range", () => {
        const onSelectionChange = vi.fn();
        const { rerender } = render(
            <ExpandedTimeline
                {...commonProps}
                showTransport={false}
                selection={{
                    kind: "range",
                    range: { startBeatIndex: 8, endBeatIndex: 16 },
                }}
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
                selection={{
                    kind: "range",
                    range: { startBeatIndex: 8, endBeatIndex: 24 },
                }}
                onSelectionChange={onSelectionChange}
            />,
        );
        expect(screen.getByLabelText(/SH timeline/)).toHaveAttribute(
            "aria-pressed",
            "true",
        );
        expect(screen.getByRole("button", { name: "Page 2" })).toHaveAttribute(
            "aria-pressed",
            "false",
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

    it("shows the window's counts only when it starts off a page line (UI-13)", () => {
        const onCreateTrack = vi.fn();
        const { rerender } = render(
            <ExpandedTimeline
                {...commonProps}
                showTransport={false}
                selection={{
                    kind: "range",
                    range: { startBeatIndex: 8, endBeatIndex: 16 },
                }}
            />,
        );

        // From a page line, the window's count is the playhead's count, which the transport shows
        expect(
            screen.queryByTestId("timeline-selection-count"),
        ).not.toBeInTheDocument();

        rerender(
            <ExpandedTimeline
                {...commonProps}
                showTransport={false}
                selection={{
                    kind: "range",
                    range: { startBeatIndex: 8, endBeatIndex: 24 },
                }}
                onCreateTrack={onCreateTrack}
            />,
        );
        expect(
            screen.queryByTestId("timeline-selection-count"),
        ).not.toBeInTheDocument();
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
                selection={{ kind: "home" }}
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
        const start = screen.getByRole("button", { name: /^Start flag/ });
        const actions = screen.getByTestId("timeline-selection-actions");

        // Alt turns page snapping off, so the flag stops at beat 7 rather than the page line at 8
        fireEvent(
            start,
            new MouseEvent("pointerdown", {
                bubbles: true,
                button: 0,
                clientX: 80,
                altKey: true,
            }),
        );
        fireEvent(
            start,
            new MouseEvent("pointermove", {
                bubbles: true,
                clientX: 112,
                altKey: true,
            }),
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
        // UI-13: released on page 1's start line, the window's count is the playhead's, so it hides
        expect(
            screen.queryByTestId("timeline-selection-count"),
        ).not.toBeInTheDocument();
        expect(actions.firstElementChild).toBe(create);
        fireEvent.click(create);
        expect(onCreateTrack).toHaveBeenCalledWith({
            target: { id: "marcher-1", type: "marcher" },
            range: { startBeatIndex: 0, endBeatIndex: 9 },
        });
    });

    it("has no end handle: the playhead is the window's end (UI-10)", () => {
        render(
            <ExpandedTimeline
                {...commonProps}
                showTransport={false}
                selection={{
                    kind: "range",
                    range: { startBeatIndex: 5, endBeatIndex: 9 },
                }}
                onSelectionChange={vi.fn()}
            />,
        );
        expect(
            screen.getByRole("button", { name: /^Start flag/ }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: "Selection end" }),
        ).not.toBeInTheDocument();
    });

    it("draws the start flag where the store has it when the window falls back (after Stop)", () => {
        render(
            <ExpandedTimeline
                {...commonProps}
                showTransport={false}
                selection={{
                    kind: "range",
                    range: { startBeatIndex: 1, endBeatIndex: 9 },
                    startFlagBeatIndex: 9,
                }}
                onSelectionChange={vi.fn()}
            />,
        );
        expect(
            screen.getByRole("button", { name: "Start flag, beat 9" }),
        ).toBeInTheDocument();
    });

    it("after Stop, arrow keys on the start flag never cross the playhead", () => {
        const onSelectionChange = vi.fn();
        render(
            <ExpandedTimeline
                {...commonProps}
                showTransport={false}
                selection={{
                    kind: "range",
                    range: { startBeatIndex: 1, endBeatIndex: 9 },
                    startFlagBeatIndex: 9,
                }}
                onSelectionChange={onSelectionChange}
            />,
        );
        const flag = screen.getByRole("button", { name: /^Start flag/ });
        fireEvent.keyDown(flag, { key: "ArrowRight" });
        expect(onSelectionChange).not.toHaveBeenCalled();
        fireEvent.keyDown(flag, { key: "ArrowLeft" });
        expect(onSelectionChange).toHaveBeenCalledWith({
            kind: "range",
            range: { startBeatIndex: 8, endBeatIndex: 9 },
        });
    });
    it("after Stop, a click on the start flag changes nothing (review: P8.17)", () => {
        const onSelectionChange = vi.fn();
        render(
            <ExpandedTimeline
                {...commonProps}
                showTransport={false}
                selection={{
                    kind: "range",
                    range: { startBeatIndex: 1, endBeatIndex: 9 },
                    startFlagBeatIndex: 9,
                }}
                onSelectionChange={onSelectionChange}
            />,
        );
        const flag = screen.getByRole("button", { name: /^Start flag/ });
        fireEvent(
            flag,
            new MouseEvent("pointerdown", {
                bubbles: true,
                button: 0,
                clientX: 200,
            }),
        );
        fireEvent(
            flag,
            new MouseEvent("pointerup", {
                bubbles: true,
                button: 0,
                clientX: 201,
            }),
        );
        expect(onSelectionChange).not.toHaveBeenCalled();
        expect(flag).toHaveAccessibleName("Start flag, beat 9");
    });

    it("an arrow key on the start flag doesn't reach the window's nudge keys (review: P8.17)", () => {
        const onWindowKey = vi.fn();
        window.addEventListener("keydown", onWindowKey);
        try {
            render(
                <ExpandedTimeline
                    {...commonProps}
                    showTransport={false}
                    selection={{
                        kind: "range",
                        range: { startBeatIndex: 5, endBeatIndex: 9 },
                    }}
                    onSelectionChange={vi.fn()}
                />,
            );
            fireEvent.keyDown(
                screen.getByRole("button", { name: /^Start flag/ }),
                { key: "ArrowLeft" },
            );
            expect(onWindowKey).not.toHaveBeenCalled();
        } finally {
            window.removeEventListener("keydown", onWindowKey);
        }
    });

    it("scrubs on drag, with no hover tooltip over the transport (UI-13)", () => {
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
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
        expect(playhead).toHaveAccessibleName(
            "Playback position: Page 2, count 3 of 8, measure 3 beat 4",
        );

        fireEvent(
            surface,
            new MouseEvent("pointerdown", {
                bubbles: true,
                button: 0,
                clientX: 64,
            }),
        );
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
        fireEvent(
            surface,
            new MouseEvent("pointermove", { bubbles: true, clientX: 96 }),
        );
        fireEvent(
            surface,
            new MouseEvent("pointerup", { bubbles: true, clientX: 96 }),
        );
        expect(onSeek).toHaveBeenCalledWith(4, { gesture: "press" });
        expect(onSeek).toHaveBeenCalledWith(6, { gesture: "drag" });
        expect(onSeek).toHaveBeenLastCalledWith(6, { gesture: "end" });
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
            screen.getByRole("button", { name: /^Rehearsal A, measure / }),
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
        // The grid, and the waveform in its rest and played tones (UI-12)
        expect(container.querySelectorAll("canvas")).toHaveLength(3);
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

    it("maps where a scrub's seek landed back to the timeline's beats", () => {
        // A converted show: spec beat 0 has no duration, so view beat v is spec beat v + 1
        const beats = [
            { ...timelineStoryData.beats[0]!, duration: 0 },
            ...timelineStoryData.beats.slice(1),
        ];
        const held = { current: null as number | null };
        const onSeek = vi.fn((spec: number) => held.current ?? spec);
        render(
            <TimelineWaveformProvider waveform={timelineStoryData.waveform}>
                <Timeline
                    {...shared}
                    beats={beats}
                    mode="expanded"
                    showTransport={false}
                    // Spec 12 is view 11, at 176px
                    playback={{ positionBeat: 12, isPlaying: false, onSeek }}
                />
            </TimelineWaveformProvider>,
        );
        const surface = screen.getByTestId("timeline-pointer-surface");
        const playhead = screen.getByTestId("timeline-playhead");
        expect(playhead).toHaveStyle({ left: "176px" });
        const press = (type: string, clientX: number) =>
            fireEvent(
                surface,
                new MouseEvent(type, { bubbles: true, button: 0, clientX }),
            );
        // Landed where sent (view 5, spec 6): the line is on view 5, at 80px
        press("pointerdown", 5 * 16 + 2);
        expect(onSeek).toHaveBeenLastCalledWith(6, { gesture: "press" });
        expect(playhead.style.transform).toBe(`translateX(${80 - 176}px)`);
        // Held on spec 12 (view 11) while view 5 was sent: the line stays on it
        held.current = 12;
        press("pointermove", 5 * 16 + 4);
        expect(playhead.style.transform).toBe("translateX(0px)");
        press("pointerup", 5 * 16 + 4);
        expect(playhead.style.transform).toBe("");
    });

    it("supports exactly the collapsed view with the controlled selection", () => {
        render(
            <TimelineWaveformProvider waveform={timelineStoryData.waveform}>
                <Timeline
                    {...shared}
                    mode="collapsed"
                    selection={{
                        kind: "range",
                        range: { startBeatIndex: 8, endBeatIndex: 16 },
                    }}
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
                    selection={{
                        kind: "range",
                        range: { startBeatIndex: 8, endBeatIndex: 16 },
                    }}
                    onSelectionChange={onSelectionChange}
                />
            </TimelineWaveformProvider>,
        );
        const start = screen.getByRole("button", {
            name: /^Start flag/,
        });

        fireEvent.keyDown(start, { key: "ArrowRight" });
        expect(onSelectionChange).toHaveBeenCalledWith({
            kind: "range",
            range: { startBeatIndex: 9, endBeatIndex: 16 },
        });
    });
});

describe("page snapping in drags (UI-2)", () => {
    const pointer = (
        target: Element,
        type: "pointerdown" | "pointermove" | "pointerup",
        clientX: number,
        altKey = false,
    ) =>
        fireEvent(
            target,
            new MouseEvent(type, { bubbles: true, button: 0, clientX, altKey }),
        );

    const renderRange = (onSelectionChange = vi.fn()) => {
        render(
            <ExpandedTimeline
                {...commonProps}
                showTransport={false}
                selection={{
                    kind: "range",
                    range: { startBeatIndex: 5, endBeatIndex: 9 },
                }}
                onSelectionChange={onSelectionChange}
            />,
        );
        return {
            onSelectionChange,
            start: screen.getByRole("button", { name: /^Start flag/ }),
        };
    };

    it("snaps a dragged start flag to a page line by default", () => {
        const { onSelectionChange, start } = renderRange();

        // Beat 7 is 16 px from the page line at 8
        pointer(start, "pointerdown", 80);
        pointer(start, "pointermove", 112);
        pointer(start, "pointerup", 112);

        expect(onSelectionChange).toHaveBeenCalledWith({
            kind: "range",
            range: { startBeatIndex: 8, endBeatIndex: 9 },
        });
    });

    it("drags the start flag by its pennant, which sits above the playhead (UI-11)", () => {
        const { onSelectionChange } = renderRange();
        const pennant = screen.getByTestId("timeline-start-pennant");
        expect(pennant).toHaveClass("z-[55]");

        pointer(pennant, "pointerdown", 80);
        pointer(pennant, "pointermove", 112);
        pointer(pennant, "pointerup", 112);

        expect(onSelectionChange).toHaveBeenCalledWith({
            kind: "range",
            range: { startBeatIndex: 8, endBeatIndex: 9 },
        });
    });

    it("places a dragged start flag on any beat while Alt is held", () => {
        const { onSelectionChange, start } = renderRange();

        pointer(start, "pointerdown", 80, true);
        pointer(start, "pointermove", 112, true);
        expect(screen.getByText("2 counts")).toBeInTheDocument();
        pointer(start, "pointerup", 112, true);

        expect(onSelectionChange).toHaveBeenCalledWith({
            kind: "range",
            range: { startBeatIndex: 7, endBeatIndex: 9 },
        });
    });

    it("snaps a moved clip's edge to a page line unless Alt is held", () => {
        const onTimelineRangeCommit = vi.fn();
        render(
            <ExpandedTimeline
                {...commonProps}
                showTransport={false}
                onTimelineRangeCommit={onTimelineRangeCommit}
            />,
        );
        const track = screen.getByLabelText(/M1 timeline/);

        // M1 covers [0, 16). A 7-beat drag puts its start 16 px from the page line at 8.
        pointer(track, "pointerdown", 0);
        pointer(track, "pointermove", 112);
        pointer(track, "pointerup", 112);
        expect(onTimelineRangeCommit).toHaveBeenLastCalledWith({
            timelineId: "m1",
            startBeatIndex: 8,
            endBeatIndex: 24,
        });

        pointer(track, "pointerdown", 0, true);
        pointer(track, "pointermove", 112, true);
        pointer(track, "pointerup", 112, true);
        expect(onTimelineRangeCommit).toHaveBeenLastCalledWith({
            timelineId: "m1",
            startBeatIndex: 7,
            endBeatIndex: 23,
        });
    });

    it("snaps again when Alt is released mid-drag", () => {
        const onTimelineRangeCommit = vi.fn();
        render(
            <ExpandedTimeline
                {...commonProps}
                showTransport={false}
                onTimelineRangeCommit={onTimelineRangeCommit}
            />,
        );
        const track = screen.getByLabelText(/M1 timeline/);

        pointer(track, "pointerdown", 0, true);
        pointer(track, "pointermove", 112, true);
        pointer(track, "pointermove", 112, false);
        pointer(track, "pointerup", 112, false);
        expect(onTimelineRangeCommit).toHaveBeenCalledWith({
            timelineId: "m1",
            startBeatIndex: 8,
            endBeatIndex: 24,
        });
    });
});

describe("review follow-ups", () => {
    it("commits a clip move with the modifier state at release", () => {
        const onTimelineRangeCommit = vi.fn();
        render(
            <ExpandedTimeline
                {...commonProps}
                showTransport={false}
                onTimelineRangeCommit={onTimelineRangeCommit}
            />,
        );
        const track = screen.getByLabelText(/M1 timeline/);
        const pointer = (
            type: "pointerdown" | "pointermove" | "pointerup",
            altKey: boolean,
        ) =>
            fireEvent(
                track,
                new MouseEvent(type, {
                    bubbles: true,
                    button: 0,
                    clientX: type === "pointerdown" ? 0 : 112,
                    altKey,
                }),
            );

        // Alt held through the last move, released before the button comes up: snaps to 8
        pointer("pointerdown", true);
        pointer("pointermove", true);
        pointer("pointerup", false);
        expect(onTimelineRangeCommit).toHaveBeenLastCalledWith({
            timelineId: "m1",
            startBeatIndex: 8,
            endBeatIndex: 24,
        });

        // Alt pressed only at release: lands on beat 7
        pointer("pointerdown", false);
        pointer("pointermove", false);
        pointer("pointerup", true);
        expect(onTimelineRangeCommit).toHaveBeenLastCalledWith({
            timelineId: "m1",
            startBeatIndex: 7,
            endBeatIndex: 23,
        });
    });

    it("names the page ending on a flag in the transport and the playhead alike (UI-13)", () => {
        render(
            <ExpandedTimeline
                {...commonProps}
                positionBeat={16}
                showTransport
            />,
        );
        // Beat 16 is page 2's flag and page 2A's first beat: both name page 2, its last count
        expect(screen.getByTestId("timeline-readout")).toHaveTextContent(
            "Pg 2 · ct 8/8m5 beat 1",
        );
        expect(
            screen.getByRole("button", { name: /^Playback position:/ }),
        ).toHaveAccessibleName(
            "Playback position: Page 2, count 8 of 8, measure 5 beat 1",
        );
    });
});

describe("the playhead while playing", () => {
    it("follows the live position between beats, and rests on the beat once paused", () => {
        vi.useFakeTimers({
            toFake: ["requestAnimationFrame", "cancelAnimationFrame"],
        });
        try {
            let live = 11.5;
            const { rerender } = render(
                <ExpandedTimeline
                    {...commonProps}
                    showTransport={false}
                    isPlaying
                    livePositionBeat={() => live}
                />,
            );
            const playhead = screen.getByTestId("timeline-playhead");
            act(() => {
                vi.advanceTimersToNextFrame();
            });
            expect(playhead).toHaveStyle({ left: "184px" });
            live = 11.75;
            act(() => {
                vi.advanceTimersToNextFrame();
            });
            expect(playhead).toHaveStyle({ left: "188px" });

            rerender(
                <ExpandedTimeline {...commonProps} showTransport={false} />,
            );
            expect(playhead).toHaveStyle({ left: "176px" });
        } finally {
            vi.useRealTimers();
        }
    });
});

describe("a calmer timeline (UI-12)", () => {
    const press = (target: Element, type: string, clientX: number) =>
        fireEvent(
            target,
            new MouseEvent(type, { bubbles: true, button: 0, clientX }),
        );

    it("a plain drag on empty space scrubs instead of drawing a range", () => {
        const onSeek = vi.fn();
        const onSelectionChange = vi.fn();
        render(
            <ExpandedTimeline
                {...commonProps}
                showTransport={false}
                onSeek={onSeek}
                onSelectionChange={onSelectionChange}
            />,
        );
        const surface = screen.getByTestId("timeline-pointer-surface");
        press(surface, "pointerdown", 3 * 16);
        press(surface, "pointermove", 6 * 16);
        expect(screen.queryByTestId("timeline-range-preview")).toBeNull();
        press(surface, "pointerup", 6 * 16);
        expect(onSeek).toHaveBeenLastCalledWith(6, { gesture: "end" });
        expect(onSelectionChange).not.toHaveBeenCalled();
    });

    it("a scrub's line steps beat by beat with the playhead (UI-12, 2026-10-07)", () => {
        const onSeek = vi.fn();
        // The owner moves the playhead to each seek, as the app does
        const Seeking = () => {
            const [position, setPosition] = useState(11);
            return (
                <ExpandedTimeline
                    {...commonProps}
                    positionBeat={position}
                    // The window [S, P), with the start flag on beat 2
                    selection={{
                        kind: "range",
                        range: { startBeatIndex: 2, endBeatIndex: position },
                    }}
                    showTransport={false}
                    onSeek={(beat, options) => {
                        onSeek(beat, options);
                        setPosition(beat);
                    }}
                />
            );
        };
        render(<Seeking />);
        const surface = screen.getByTestId("timeline-pointer-surface");
        const playhead = screen.getByTestId("timeline-playhead");
        expect(playhead).toHaveStyle({ left: "176px" });
        press(surface, "pointerdown", 3 * 16);
        expect(playhead).toHaveStyle({ left: "48px" });
        expect(playhead.style.transform).toBe("translateX(0px)");
        // 4px past beat 6 (96px): the line is on beat 6, where React also puts it
        press(surface, "pointermove", 100);
        expect(onSeek).toHaveBeenLastCalledWith(6, { gesture: "drag" });
        expect(playhead).toHaveStyle({ left: "96px" });
        expect(playhead.style.transform).toBe("translateX(0px)");
        // The window's tint ends on the line: 64px from the start flag (32px) to 96px
        const tint = screen
            .getByTestId("timeline-selection-range")
            .querySelector("span")!;
        expect(tint).toHaveStyle({ left: "32px", width: "64px" });
        expect(tint.style.transform).toBe("scaleX(1)");
        // Within the same beat the line doesn't move
        press(surface, "pointermove", 102);
        expect(playhead.style.transform).toBe("translateX(0px)");
        press(surface, "pointerup", 102);
        expect(onSeek).toHaveBeenLastCalledWith(6, { gesture: "end" });
        // Released, the line and the window settle on the beat
        expect(playhead.style.transform).toBe("");
        expect(tint.style.transform).toBe("");
        expect(playhead).toHaveStyle({ left: "96px" });
    });

    it("a scrub's line stays on a playhead that can't follow", () => {
        // As inside an isolated range: the owner holds the playhead on beat 11, and says so
        render(
            <ExpandedTimeline
                {...commonProps}
                showTransport={false}
                onSeek={() => 11}
            />,
        );
        const surface = screen.getByTestId("timeline-pointer-surface");
        const playhead = screen.getByTestId("timeline-playhead");
        const plus = screen.queryByTestId("timeline-add-page-flag");
        press(surface, "pointerdown", 3 * 16);
        press(surface, "pointermove", 4 * 16);
        expect(playhead.style.transform).toBe("translateX(0px)");
        // On or past the held beat it stays on the held playhead too
        press(surface, "pointermove", 11 * 16 - 4);
        expect(playhead.style.transform).toBe("translateX(0px)");
        press(surface, "pointermove", 11 * 16 + 4);
        expect(playhead.style.transform).toBe("translateX(0px)");
        press(surface, "pointermove", 14 * 16);
        expect(playhead.style.transform).toBe("translateX(0px)");
        expect(plus?.style.transform ?? "").toBe(plus ? "translateX(0px)" : "");
        press(surface, "pointerup", 14 * 16);
        expect(playhead.style.transform).toBe("");
    });

    it("a scrub's line is on the downbeat a release would land on (UI-12)", () => {
        const onSeek = vi.fn((beat: number) => beat);
        render(
            <ExpandedTimeline
                {...commonProps}
                showTransport={false}
                onSeek={onSeek}
            />,
        );
        const surface = screen.getByTestId("timeline-pointer-surface");
        const playhead = screen.getByTestId("timeline-playhead");
        press(surface, "pointerdown", 3 * 16);
        // 4px past downbeat 8 (128px): the seek and the line land on it
        press(surface, "pointermove", 132);
        expect(onSeek).toHaveBeenLastCalledWith(8, { gesture: "drag" });
        expect(playhead.style.transform).toBe(`translateX(${128 - 176}px)`);
        press(surface, "pointermove", 125);
        expect(onSeek).toHaveBeenLastCalledWith(8, { gesture: "drag" });
        expect(playhead.style.transform).toBe(`translateX(${128 - 176}px)`);
        press(surface, "pointerup", 125);
        expect(onSeek).toHaveBeenLastCalledWith(8, { gesture: "end" });
        expect(playhead.style.transform).toBe("");
    });

    it("a scrub's line doesn't wait for the owner to render the beat it seeked to", () => {
        // The owner takes each seek but hasn't re-rendered yet: positionBeat stays 11
        render(
            <ExpandedTimeline
                {...commonProps}
                showTransport={false}
                onSeek={(beat) => beat}
            />,
        );
        const surface = screen.getByTestId("timeline-pointer-surface");
        const playhead = screen.getByTestId("timeline-playhead");
        press(surface, "pointerdown", 3 * 16);
        expect(playhead.style.transform).toBe(`translateX(${48 - 176}px)`);
        // Beat 20.3 seeks 20 (320px): the line steps there without a render
        press(surface, "pointermove", 20 * 16 + 5);
        expect(playhead.style.transform).toBe(`translateX(${320 - 176}px)`);
        press(surface, "pointerup", 20 * 16 + 5);
        expect(playhead.style.transform).toBe("");
    });

    it("a scrub along the page boxes stays on a playhead that can't follow", () => {
        render(
            <ExpandedTimeline
                {...commonProps}
                showTransport={false}
                onSeek={() => 11}
            />,
        );
        const box = screen.getByRole("button", { name: "Page 2" });
        const playhead = screen.getByTestId("timeline-playhead");
        press(box, "pointerdown", 130);
        // Beat 12.5 seeks 13; the playhead is held on 11
        press(box, "pointermove", 200);
        expect(playhead.style.transform).toBe("translateX(0px)");
        // Beat 10.6 seeks 11, where it is: the line is on beat 11
        press(box, "pointermove", 170);
        expect(playhead.style.transform).toBe("translateX(0px)");
        press(box, "pointerup", 170);
        expect(playhead.style.transform).toBe("");
    });

    it("a cancelled scrub ends where it was (UI-12 review)", () => {
        const onSeek = vi.fn();
        render(
            <ExpandedTimeline
                {...commonProps}
                showTransport={false}
                onSeek={onSeek}
            />,
        );
        const surface = screen.getByTestId("timeline-pointer-surface");
        press(surface, "pointerdown", 3 * 16);
        press(surface, "pointermove", 7 * 16);
        press(surface, "pointercancel", 7 * 16);
        expect(onSeek).toHaveBeenLastCalledWith(7, { gesture: "end" });
    });

    it("arrow keys on the playhead step as one gesture, ending when they settle (UI-12 review)", () => {
        vi.useFakeTimers();
        try {
            const onSeek = vi.fn();
            const { rerender } = render(
                <ExpandedTimeline
                    {...commonProps}
                    showTransport={false}
                    onSeek={onSeek}
                />,
            );
            const playhead = screen.getByTestId("timeline-playhead");
            fireEvent.keyDown(playhead, { key: "ArrowRight" });
            fireEvent.keyUp(playhead, { key: "ArrowRight" });
            fireEvent.keyDown(playhead, { key: "ArrowRight" });
            expect(onSeek.mock.calls).toEqual([
                [12, { gesture: "press" }],
                [13, { gesture: "drag" }],
            ]);
            act(() => {
                vi.advanceTimersByTime(300);
            });
            expect(onSeek).toHaveBeenLastCalledWith(13, { gesture: "end" });

            // A held key ends when it comes up
            onSeek.mockClear();
            fireEvent.keyDown(playhead, { key: "ArrowLeft" });
            fireEvent.keyDown(playhead, { key: "ArrowLeft", repeat: true });
            fireEvent.keyUp(playhead, { key: "ArrowLeft" });
            expect(onSeek.mock.calls).toEqual([
                [10, { gesture: "press" }],
                [9, { gesture: "drag" }],
                [9, { gesture: "end" }],
            ]);

            // While playing, each key jumps on its own
            onSeek.mockClear();
            rerender(
                <ExpandedTimeline
                    {...commonProps}
                    isPlaying
                    showTransport={false}
                    onSeek={onSeek}
                />,
            );
            fireEvent.keyDown(screen.getByTestId("timeline-playhead"), {
                key: "ArrowRight",
            });
            expect(onSeek.mock.calls).toEqual([[12]]);
        } finally {
            vi.useRealTimers();
        }
    });

    it("Ctrl+drag across the page boxes draws a range, and doesn't select a box", () => {
        const onSelectionChange = vi.fn();
        render(
            <ExpandedTimeline
                {...commonProps}
                showTransport={false}
                onSelectionChange={onSelectionChange}
            />,
        );
        const box = screen.getByRole("button", { name: "Page 2" });
        const ctrl = (type: string, clientX: number) =>
            fireEvent(
                box,
                new MouseEvent(type, {
                    bubbles: true,
                    button: 0,
                    clientX,
                    ctrlKey: true,
                    altKey: true,
                }),
            );
        ctrl("pointerdown", 9 * 16);
        ctrl("pointermove", 13 * 16);
        ctrl("pointerup", 13 * 16);
        fireEvent.click(box, { ctrlKey: true });
        expect(onSelectionChange).toHaveBeenCalledTimes(1);
        expect(onSelectionChange).toHaveBeenCalledWith({
            kind: "range",
            range: { startBeatIndex: 9, endBeatIndex: 13 },
            drawn: true,
        });
    });

    it("dragging along the page boxes scrubs, and doesn't select the box under the release", () => {
        const onSeek = vi.fn();
        const onSelectionChange = vi.fn();
        render(
            <ExpandedTimeline
                {...commonProps}
                showTransport={false}
                onSeek={onSeek}
                onSelectionChange={onSelectionChange}
            />,
        );
        const box = screen.getByRole("button", { name: "Page 2" });
        press(box, "pointerdown", 130);
        press(box, "pointermove", 200);
        press(box, "pointerup", 200);
        fireEvent.click(box, { detail: 1 });
        // The surface starts at x = 0 in jsdom: 200px at 16px a beat is beat 12.5, rounded to 13
        expect(onSeek).toHaveBeenCalledWith(13, { gesture: "drag" });
        expect(onSeek).toHaveBeenLastCalledWith(13, { gesture: "end" });
        expect(onSelectionChange).not.toHaveBeenCalled();

        // A press that doesn't move is still a click that selects the box
        press(box, "pointerdown", 130);
        press(box, "pointerup", 131);
        fireEvent.click(box, { detail: 1 });
        expect(onSelectionChange).toHaveBeenCalledTimes(1);

        // A keyboard click (detail 0) after a scrub still selects: nothing stale swallows it
        press(box, "pointerdown", 130);
        press(box, "pointermove", 200);
        press(box, "pointerup", 200);
        fireEvent.click(box, { detail: 0 });
        expect(onSelectionChange).toHaveBeenCalledTimes(2);
    });

    it("a dragged clip moves without also selecting it; a click selects it", () => {
        const onSelectionChange = vi.fn();
        const onTimelineRangeCommit = vi.fn();
        render(
            <ExpandedTimeline
                {...commonProps}
                showTransport={false}
                onSelectionChange={onSelectionChange}
                onTimelineRangeCommit={onTimelineRangeCommit}
            />,
        );
        const clip = screen.getByLabelText(/SH timeline/);
        press(clip, "pointerdown", 100);
        press(clip, "pointermove", 132);
        press(clip, "pointerup", 132);
        fireEvent.click(clip);
        expect(onTimelineRangeCommit).toHaveBeenCalledTimes(1);
        expect(onSelectionChange).not.toHaveBeenCalled();

        fireEvent.click(clip);
        expect(onSelectionChange).toHaveBeenCalledWith(
            expect.objectContaining({ kind: "range" }),
        );
    });

    it("draws a pin on a pinned start flag, which unpins it", () => {
        const onUnpinStart = vi.fn();
        const { rerender } = render(
            <ExpandedTimeline
                {...commonProps}
                showTransport={false}
                selection={{
                    kind: "range",
                    range: { startBeatIndex: 5, endBeatIndex: 11 },
                }}
                onUnpinStart={onUnpinStart}
            />,
        );
        expect(screen.queryByTestId("timeline-start-pin")).toBeNull();
        rerender(
            <ExpandedTimeline
                {...commonProps}
                showTransport={false}
                selection={{
                    kind: "range",
                    range: { startBeatIndex: 5, endBeatIndex: 11 },
                    startPinned: true,
                }}
                onUnpinStart={onUnpinStart}
            />,
        );
        fireEvent.click(screen.getByTestId("timeline-start-pin"));
        expect(onUnpinStart).toHaveBeenCalledTimes(1);
    });

    it("keeps a steady height: one clip row kept without clips, no waveform without peaks", () => {
        const { container } = render(
            <ExpandedTimeline
                {...commonProps}
                model={{
                    ...timelineStoryModel,
                    tracks: [],
                    waveform: {
                        peaksByBeat:
                            timelineStoryModel.waveform.peaksByBeat.map(
                                () => [],
                            ),
                    },
                }}
                showTransport={false}
            />,
        );
        expect(
            container.querySelector('[data-testid="timeline-waveform-canvas"]'),
        ).toBeNull();
        // The ruler (28), the measure row (20) and a 2px gap, one kept clip row (22) and a 2px foot,
        // so the first off-page clip doesn't move the ruler
        expect(screen.getByTestId("timeline-pointer-surface")).toHaveStyle({
            height: "74px",
        });
    });

    it("reads the page and count at the playhead, counted to the page's flag", () => {
        render(
            <ExpandedTimeline
                {...commonProps}
                positionBeat={8}
                showTransport
            />,
        );
        expect(screen.getByTestId("timeline-readout")).toHaveTextContent(
            "Pg 1 · ct 8/8",
        );
    });

    it("Shift+click on Previous and Next goes to the first and last page", () => {
        const onNavigate = vi.fn();
        render(
            <ExpandedTimeline
                {...commonProps}
                showTransport
                onNavigate={onNavigate}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: /^Next page/ }));
        fireEvent.click(screen.getByRole("button", { name: /^Next page/ }), {
            shiftKey: true,
        });
        fireEvent.click(
            screen.getByRole("button", { name: /^Previous page/ }),
            { shiftKey: true },
        );
        expect(onNavigate.mock.calls).toEqual([
            ["next-page"],
            ["last-page"],
            ["first-page"],
        ]);
    });

    it("keeps page navigation live while playing, where it jumps playback", () => {
        const onNavigate = vi.fn();
        render(
            <ExpandedTimeline
                {...commonProps}
                isPlaying
                showTransport
                onNavigate={onNavigate}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: /^Next page/ }));
        expect(onNavigate).toHaveBeenCalledWith("next-page");
    });
});

describe("where a scrub draws the line", () => {
    it("is on the beat the playhead lands on: whole beats, with the release's snap", () => {
        // The pointer at 13.4: the seek sends 13 and lands there
        expect(scrubLineBeat(13, 13)).toBe(13);
        // 4px from beat 12 at 16px a beat: the seek snaps to it, and so does the line
        expect(snapSeekBeat(12.25, [12, 16], 16, false)).toBe(12);
        expect(scrubLineBeat(12, 12)).toBe(12);
        // An owner that doesn't say where the seek landed: the beat sent
        expect(scrubLineBeat(12, undefined)).toBe(12);
        expect(scrubLineBeat(12, null)).toBe(12);
    });

    it("stays on a playhead held short of the beat sent", () => {
        // Held at the end of an isolated range, beat 20
        expect(scrubLineBeat(23, 20)).toBe(20);
        // Held at the start of the range, beat 13
        expect(scrubLineBeat(10, 13)).toBe(13);
    });
});

describe("where a click or scrub lands (UI-12)", () => {
    it("lands on a downbeat or page line within 6px, else the nearest beat; Alt turns it off", () => {
        // 16px a beat: 0.25 beat is 4px, 0.5 beat is 8px
        expect(snapSeekBeat(12.25, [12, 16], 16, false)).toBe(12);
        expect(snapSeekBeat(12.5, [12, 16], 16, false)).toBe(13);
        expect(snapSeekBeat(15.7, [12, 16], 16, false)).toBe(16);
        expect(snapSeekBeat(12.25, [12, 16], 16, true)).toBe(12);
        expect(snapSeekBeat(12.4, [12, 16], 16, true)).toBe(12);
        expect(snapSeekBeat(15.7, [12, 16], 2, true)).toBe(16);
        // Zoomed out, 6px spans several beats
        expect(snapSeekBeat(14, [12, 16], 2, false)).toBe(12);
    });
});

describe("the transport's go-to box (UI-12)", () => {
    it("jumps to a page, a measure or a rehearsal mark, and says when nothing matches", () => {
        const onSeek = vi.fn();
        const onSelectionChange = vi.fn();
        render(
            <ExpandedTimeline
                {...commonProps}
                showTransport
                onSeek={onSeek}
                onSelectionChange={onSelectionChange}
            />,
        );
        const go = (text: string) => {
            fireEvent.click(screen.getByTestId("timeline-readout"));
            const input = screen.getByTestId("timeline-go-to");
            fireEvent.change(input, { target: { value: text } });
            fireEvent.keyDown(input, { key: "Enter" });
        };
        go("2");
        expect(onSelectionChange).toHaveBeenLastCalledWith({
            kind: "range",
            range: { startBeatIndex: 8, endBeatIndex: 16 },
        });
        go("a");
        expect(onSeek).toHaveBeenLastCalledWith(24);
        go("nope");
        expect(screen.getByTestId("timeline-go-to")).toHaveAttribute(
            "aria-invalid",
            "true",
        );
        fireEvent.keyDown(screen.getByTestId("timeline-go-to"), {
            key: "Escape",
        });
        expect(screen.queryByTestId("timeline-go-to")).toBeNull();
    });

    it("opens with G", () => {
        render(
            <ExpandedTimeline
                {...commonProps}
                showTransport
                onSeek={vi.fn()}
            />,
        );
        fireEvent.keyDown(window, { key: "g" });
        expect(screen.getByTestId("timeline-go-to")).toBeInTheDocument();
    });
});

describe("Fit (UI-12 review)", () => {
    // The story show has 32 beats: at 360px, less the 40px home box, it fits at 10px a beat
    let width = 360;
    let observers: (() => void)[] = [];
    beforeEach(() => {
        vi.spyOn(
            HTMLElement.prototype,
            "clientWidth",
            "get",
        ).mockImplementation(() => width);
        vi.stubGlobal(
            "ResizeObserver",
            class {
                constructor(callback: () => void) {
                    observers.push(callback);
                }
                observe() {}
                disconnect() {}
            },
        );
    });
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        observers = [];
        width = 360;
    });

    const Zoomed = ({
        initial,
        fitted,
        onZoom,
        onFittedChange,
    }: {
        initial: number;
        fitted: boolean;
        onZoom: (pixelsPerBeat: number) => void;
        onFittedChange: (fitted: boolean) => void;
    }) => {
        const [pixelsPerBeat, setPixelsPerBeat] = useState(initial);
        const [zoomFitted, setZoomFitted] = useState(fitted);
        return (
            <ExpandedTimeline
                {...commonProps}
                showTransport={false}
                pixelsPerBeat={pixelsPerBeat}
                onPixelsPerBeatChange={(next) => {
                    onZoom(next);
                    setPixelsPerBeat(next);
                }}
                zoomFitted={zoomFitted}
                onZoomFittedChange={(next) => {
                    onFittedChange(next);
                    setZoomFitted(next);
                }}
            />
        );
    };
    const shiftZ = () =>
        act(() => {
            fireEvent.keyDown(window, { key: "Z", shiftKey: true });
        });

    it("goes back to the zoom from before Fit", () => {
        const onZoom = vi.fn();
        render(
            <Zoomed
                initial={32}
                fitted={false}
                onZoom={onZoom}
                onFittedChange={vi.fn()}
            />,
        );
        shiftZ();
        expect(onZoom).toHaveBeenLastCalledWith(10);
        shiftZ();
        expect(onZoom).toHaveBeenLastCalledWith(32);
    });

    it("zooms in from a show that opened fitted, where there is no zoom to go back to", () => {
        // Fitted at 25px a beat, closer in than the starting zoom of 16
        width = 840;
        const onZoom = vi.fn();
        render(
            <Zoomed
                initial={25}
                fitted
                onZoom={onZoom}
                onFittedChange={vi.fn()}
            />,
        );
        shiftZ();
        expect(onZoom).toHaveBeenLastCalledWith(50);
    });

    it("stays fitted through a resize without saving the fit again", () => {
        const onZoom = vi.fn();
        const onFittedChange = vi.fn();
        render(
            <Zoomed
                initial={10}
                fitted
                onZoom={onZoom}
                onFittedChange={onFittedChange}
            />,
        );
        width = 680;
        act(() => observers.forEach((observe) => observe()));
        expect(onZoom).toHaveBeenLastCalledWith(20);
        expect(onFittedChange).not.toHaveBeenCalled();
    });

    it("leaves Shift+Z to an open dialog, and ignores a held key", () => {
        const onZoom = vi.fn();
        render(
            <Zoomed
                initial={32}
                fitted={false}
                onZoom={onZoom}
                onFittedChange={vi.fn()}
            />,
        );
        act(() => {
            fireEvent.keyDown(window, {
                key: "Z",
                shiftKey: true,
                repeat: true,
            });
        });
        const dialog = document.createElement("div");
        dialog.setAttribute("role", "dialog");
        dialog.setAttribute("data-state", "open");
        document.body.appendChild(dialog);
        try {
            shiftZ();
        } finally {
            dialog.remove();
        }
        expect(onZoom).not.toHaveBeenCalled();
    });
});

describe("fitBackZoom (UI-12 review)", () => {
    it("goes back to a zoom closer in than the fit", () => {
        expect(fitBackZoom(32, 10)).toBe(32);
    });

    it("zooms in from the fit when the zoom before was at or under it, or unknown", () => {
        expect(fitBackZoom(null, 10)).toBe(20);
        expect(fitBackZoom(10.2, 10)).toBe(20);
        expect(fitBackZoom(null, 4)).toBe(16);
        expect(fitBackZoom(null, 50)).toBe(64);
    });
});

describe("a cancelled clip drag (UI-12 review)", () => {
    it("doesn't select the clip when dragged back to where it started", () => {
        const onSelectionChange = vi.fn();
        const onTimelineRangeCommit = vi.fn();
        render(
            <ExpandedTimeline
                {...commonProps}
                showTransport={false}
                onSelectionChange={onSelectionChange}
                onTimelineRangeCommit={onTimelineRangeCommit}
            />,
        );
        const track = screen.getByLabelText(/M1 timeline/);
        const pointer = (
            type: "pointerdown" | "pointermove" | "pointerup",
            clientX: number,
        ) =>
            fireEvent(
                track,
                new MouseEvent(type, { bubbles: true, button: 0, clientX }),
            );
        pointer("pointerdown", 0);
        pointer("pointermove", 112);
        pointer("pointermove", 0);
        pointer("pointerup", 0);
        fireEvent.click(track);
        expect(onTimelineRangeCommit).not.toHaveBeenCalled();
        expect(onSelectionChange).not.toHaveBeenCalled();

        // The next plain click still selects it
        pointer("pointerdown", 0);
        pointer("pointerup", 0);
        fireEvent.click(track);
        expect(onSelectionChange).toHaveBeenCalledTimes(1);
    });
});

describe("G behind overlays (UI-12 review)", () => {
    it("leaves G to an open menu", () => {
        render(
            <ExpandedTimeline
                {...commonProps}
                showTransport
                onSeek={vi.fn()}
            />,
        );
        const menu = document.createElement("div");
        menu.setAttribute("role", "menu");
        document.body.appendChild(menu);
        try {
            fireEvent.keyDown(window, { key: "g" });
        } finally {
            menu.remove();
        }
        expect(screen.queryByTestId("timeline-go-to")).toBeNull();
        fireEvent.keyDown(window, { key: "g" });
        expect(screen.getByTestId("timeline-go-to")).toBeInTheDocument();
    });
});
