import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type Beat from "@/global/classes/Beat";
import type Page from "@/global/classes/Page";
import { Timeline, type TimelineInput, type TimelineProps } from "../Timeline";

/**
 * The read-only timeline (Preview's): the drill
 * timeline's ruler and playhead with lanes in place of the clips, where page boxes and scrubs
 * only seek and nothing edits the drill.
 */

afterEach(cleanup);

/** The zero-length beat 0, then `count` timed beats */
const appBeats = (count: number): Beat[] =>
    Array.from({ length: count + 1 }, (_, index) => ({
        id: index + 1,
        position: index,
        duration: index === 0 ? 0 : 0.5,
        includeInMeasure: true,
        notes: null,
        index,
        timestamp: index === 0 ? 0 : (index - 1) * 0.5,
    })) as unknown as Beat[];

const beats = appBeats(16);
const pages = [
    { id: 10, name: "0", beats: [beats[0]!], previousPageId: null, counts: 0 },
    {
        id: 11,
        name: "1",
        beats: beats.slice(1, 9),
        previousPageId: 10,
        counts: 8,
    },
    { id: 12, name: "2", beats: beats.slice(9), previousPageId: 11, counts: 8 },
] as unknown as Page[];

// A move off the page boxes, which the drill timeline would draw as a clip
const clip: TimelineInput = {
    id: "A",
    linkId: 1,
    targetId: "A",
    targetType: "marcher",
    label: "A",
    color: "#2fc4b2",
    startBeatIndex: 3,
    endBeatIndex: 7,
    legs: [
        { id: "A-leg", startBeatIndex: 3, endBeatIndex: 7, texture: "move" },
    ],
    activitySpans: [{ startBeatIndex: 3, endBeatIndex: 7, active: true }],
};

const renderTimeline = (props: Partial<TimelineProps> = {}) => {
    const onSeek = vi.fn();
    const onSelectionChange = vi.fn();
    const editing = {
        onSelectionChange,
        onAddPageFlag: vi.fn(),
        onTimelineRangeCommit: vi.fn(),
        selection: {
            kind: "range",
            range: { startBeatIndex: 1, endBeatIndex: 9 },
        },
        pageFlagMove: { limits: vi.fn(), commit: vi.fn() },
    } as const satisfies Partial<TimelineProps>;
    render(
        <Timeline
            mode="expanded"
            beats={beats}
            pages={pages}
            measures={[]}
            timelines={[clip]}
            showTransport={false}
            playback={{ positionBeat: 5, isPlaying: false, onSeek }}
            {...editing}
            {...props}
        />,
    );
    return { onSeek, onSelectionChange };
};

describe("the read-only timeline", () => {
    it("still draws the start flag, with no handles: Play starts there", () => {
        renderTimeline({
            readOnly: true,
            selection: {
                kind: "range",
                range: { startBeatIndex: 9, endBeatIndex: 13 },
            },
        });
        const flag = screen.getByTestId("timeline-start-flag-mark");
        // view beats: the hidden beat 0 shifts them one left
        expect(flag).toHaveAttribute("data-beat", "8");
        expect(flag.querySelector("button")).toBeNull();
        expect(
            screen.queryByTestId("timeline-start-pennant"),
        ).not.toBeInTheDocument();
    });

    it("draws no start flag without a window", () => {
        renderTimeline({ readOnly: true, selection: { kind: "home" } });
        expect(
            screen.queryByTestId("timeline-start-flag-mark"),
        ).not.toBeInTheDocument();
    });

    it("draws no clips, no window, no add-page menu and no flag grips, though it's given them", () => {
        renderTimeline({ readOnly: true });
        expect(screen.queryByTestId("timeline-clip")).not.toBeInTheDocument();
        expect(
            screen.queryByTestId("timeline-selection-range"),
        ).not.toBeInTheDocument();
        fireEvent.contextMenu(screen.getByTestId("timeline-playhead"));
        expect(
            screen.queryByTestId("timeline-add-page-flag-menu"),
        ).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Page 1" })).toHaveAttribute(
            "aria-pressed",
            "false",
        );
    });

    it("draws them all without readOnly", () => {
        renderTimeline();
        expect(screen.getByTestId("timeline-clip")).toBeInTheDocument();
        expect(
            screen.getByTestId("timeline-selection-range"),
        ).toBeInTheDocument();
        fireEvent.contextMenu(screen.getByTestId("timeline-playhead"));
        expect(
            screen.getByTestId("timeline-add-page-flag-menu"),
        ).toBeInTheDocument();
    });

    it("selects a page box or home, to go there, and draws no window for it", () => {
        const { onSelectionChange } = renderTimeline({ readOnly: true });
        fireEvent.click(screen.getByRole("button", { name: "Page 2" }));
        expect(onSelectionChange).toHaveBeenLastCalledWith({
            kind: "range",
            range: { startBeatIndex: 9, endBeatIndex: 17 },
        });
        fireEvent.click(screen.getByTestId("timeline-initial-page"));
        expect(onSelectionChange).toHaveBeenLastCalledWith({ kind: "home" });
        expect(
            screen.queryByTestId("timeline-selection-range"),
        ).not.toBeInTheDocument();
    });

    it("draws no range on Ctrl+drag", () => {
        const { onSelectionChange } = renderTimeline({ readOnly: true });
        const surface = screen.getByTestId("timeline-pointer-surface");
        const event = (type: string, clientX: number) =>
            fireEvent(
                surface,
                new MouseEvent(type, {
                    bubbles: true,
                    button: 0,
                    clientX,
                    altKey: true,
                    ctrlKey: true,
                }),
            );
        event("pointerdown", 3 * 16);
        event("pointermove", 6 * 16);
        expect(
            screen.queryByTestId("timeline-range-preview"),
        ).not.toBeInTheDocument();
        event("pointerup", 6 * 16);
        expect(onSelectionChange).not.toHaveBeenCalled();
    });
});
