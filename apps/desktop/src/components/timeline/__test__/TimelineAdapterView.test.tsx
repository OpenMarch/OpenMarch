import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type Beat from "@/global/classes/Beat";
import type Page from "@/global/classes/Page";
import { Timeline, type TimelineInput } from "../Timeline";

/**
 * What the view-model adapter (P8.8) adds to the timeline: linked clips, diagnostic badges, and
 * the view axis that hides the zero-length beat 0 while the props and commands stay in spec
 * beats.
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
    }));

const input = (
    id: string,
    linkId: number,
    start: number,
    end: number,
    extra: Partial<TimelineInput> = {},
): TimelineInput => ({
    id,
    linkId,
    targetId: id,
    targetType: "marcher",
    label: id,
    color: "#2fc4b2",
    startBeatIndex: start,
    endBeatIndex: end,
    legs: [
        {
            id: `${id}-leg`,
            startBeatIndex: start,
            endBeatIndex: end,
            texture: "move",
        },
    ],
    activitySpans: [{ startBeatIndex: start, endBeatIndex: end, active: true }],
    ...extra,
});

const pointer = (target: Element, type: string, clientX: number) =>
    fireEvent(
        target,
        new MouseEvent(type, { bubbles: true, button: 0, clientX }),
    );

describe("the timeline with adapter tracks", () => {
    it("selects a page box's spec range, previous flag to its own, behind the hidden beat 0 (UI-9)", () => {
        const beats = appBeats(16);
        // Page 0 holds the zero-length beat 0; page 1 is beats 1-8 (flag 9); page 2 is 9-16 (flag 17)
        const pages = [
            {
                id: 10,
                name: "0",
                beats: [beats[0]!],
                previousPageId: null,
                counts: 0,
            },
            {
                id: 11,
                name: "1",
                beats: beats.slice(1, 9),
                previousPageId: 10,
                counts: 8,
            },
            {
                id: 12,
                name: "2",
                beats: beats.slice(9),
                previousPageId: 11,
                counts: 8,
            },
        ] as unknown as Page[];
        const onSelectionChange = vi.fn();
        render(
            <Timeline
                mode="expanded"
                beats={beats}
                pages={pages}
                measures={[]}
                timelines={[]}
                showTransport={false}
                onSelectionChange={onSelectionChange}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Page 1" }));
        expect(onSelectionChange).toHaveBeenLastCalledWith({
            kind: "range",
            range: { startBeatIndex: 1, endBeatIndex: 9 },
        });
        fireEvent.click(screen.getByRole("button", { name: "Page 2" }));
        expect(onSelectionChange).toHaveBeenLastCalledWith({
            kind: "range",
            range: { startBeatIndex: 9, endBeatIndex: 17 },
        });
        fireEvent.click(screen.getByTestId("timeline-initial-page"));
        expect(onSelectionChange).toHaveBeenLastCalledWith({ kind: "home" });
    });

    it("ends the last page's box at its flag, not at the end of the beats", () => {
        // 24 timed beats, but the last page (2) ends at its flag, beat 17
        const beats = appBeats(24);
        const pages = [
            {
                id: 10,
                name: "0",
                beats: [beats[0]!],
                previousPageId: null,
                counts: 0,
            },
            {
                id: 11,
                name: "1",
                beats: beats.slice(1, 9),
                previousPageId: 10,
                counts: 8,
            },
            {
                id: 12,
                name: "2",
                beats: beats.slice(9, 17),
                previousPageId: 11,
                counts: 8,
            },
        ] as unknown as Page[];
        const onSelectionChange = vi.fn();
        const { rerender } = render(
            <Timeline
                mode="expanded"
                beats={beats}
                pages={pages}
                measures={[]}
                timelines={[]}
                showTransport={false}
                onSelectionChange={onSelectionChange}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Page 2" }));
        expect(onSelectionChange).toHaveBeenLastCalledWith({
            kind: "range",
            range: { startBeatIndex: 9, endBeatIndex: 17 },
        });
        // The box is pressed for the range the last-page action selects
        rerender(
            <Timeline
                mode="expanded"
                beats={beats}
                pages={pages}
                measures={[]}
                timelines={[]}
                showTransport={false}
                selection={{
                    kind: "range",
                    range: { startBeatIndex: 9, endBeatIndex: 17 },
                }}
            />,
        );
        expect(screen.getByRole("button", { name: "Page 2" })).toHaveAttribute(
            "aria-pressed",
            "true",
        );
    });

    it("presses the page box whose spec range is selected", () => {
        const beats = appBeats(16);
        const pages = [
            {
                id: 10,
                name: "0",
                beats: [beats[0]!],
                previousPageId: null,
                counts: 0,
            },
            {
                id: 11,
                name: "1",
                beats: beats.slice(1, 9),
                previousPageId: 10,
                counts: 8,
            },
            {
                id: 12,
                name: "2",
                beats: beats.slice(9),
                previousPageId: 11,
                counts: 8,
            },
        ] as unknown as Page[];
        render(
            <Timeline
                mode="expanded"
                beats={beats}
                pages={pages}
                measures={[]}
                timelines={[]}
                showTransport={false}
                selection={{
                    kind: "range",
                    range: { startBeatIndex: 1, endBeatIndex: 9 },
                }}
            />,
        );
        expect(screen.getByRole("button", { name: "Page 1" })).toHaveAttribute(
            "aria-pressed",
            "true",
        );
        expect(screen.getByRole("button", { name: "Page 2" })).toHaveAttribute(
            "aria-pressed",
            "false",
        );
    });

    it("shows the clip whose range is the selected range as selected (UI-9)", () => {
        const timelines = [input("A", 1, 1, 9), input("C", 2, 9, 13)];
        render(
            <Timeline
                mode="expanded"
                beats={appBeats(16)}
                pages={[]}
                measures={[]}
                timelines={timelines}
                showTransport={false}
                // Spec beats, as the store holds them
                selection={{
                    kind: "range",
                    range: { startBeatIndex: 9, endBeatIndex: 13 },
                }}
            />,
        );
        const clip = (name: string) =>
            screen.getByLabelText(new RegExp(`^${name} timeline`));
        expect(clip("C")).toHaveAttribute("aria-pressed", "true");
        expect(clip("A")).toHaveAttribute("aria-pressed", "false");
        expect(screen.getByText("4 counts")).toBeInTheDocument();
    });

    it("badges a clip that has diagnostics", () => {
        render(
            <Timeline
                mode="expanded"
                beats={appBeats(16)}
                pages={[]}
                measures={[]}
                timelines={[
                    input("A", 1, 1, 9, {
                        diagnostics: {
                            level: "warning",
                            messages: ["D-VACANT: Slot 1 of transition 1"],
                        },
                    }),
                    input("B", 1, 1, 9),
                ]}
                showTransport={false}
            />,
        );
        const badges = screen.getAllByTestId("timeline-track-diagnostics");
        expect(badges).toHaveLength(1);
        expect(badges[0]).toHaveAttribute("data-level", "warning");
        expect(
            screen.getByLabelText(/^A timeline, .*1 diagnostic$/),
        ).toHaveAttribute("title", "A\nD-VACANT: Slot 1 of transition 1");
    });

    it("draws spec beat 1 at x = 0 and sends spec beats back", () => {
        const onTimelineRangeCommit = vi.fn();
        render(
            <Timeline
                mode="expanded"
                beats={appBeats(16)}
                pages={[]}
                measures={[]}
                timelines={[input("A", 1, 1, 9), input("Z", 2, 0, 4)]}
                showTransport={false}
                onTimelineRangeCommit={onTimelineRangeCommit}
            />,
        );
        // Spec [1, 9) is view [0, 8): at 16 px per beat, x = 0 and 128 px wide
        const clip = screen.getByLabelText(/^A timeline/);
        expect(clip).toHaveStyle({ left: "0px", width: "128px" });

        // A 2-beat drag moves the spec range by 2
        pointer(clip, "pointerdown", 0);
        pointer(clip, "pointermove", 32);
        pointer(clip, "pointerup", 32);
        expect(onTimelineRangeCommit).toHaveBeenLastCalledWith({
            timelineId: "A",
            startBeatIndex: 3,
            endBeatIndex: 11,
        });

        // A clip from spec 0 shows from view 0 too, and still moves by exactly the drag
        const z = screen.getByLabelText(/^Z timeline/);
        expect(z).toHaveStyle({ left: "0px", width: "48px" });
        pointer(z, "pointerdown", 0);
        pointer(z, "pointermove", 32);
        pointer(z, "pointerup", 32);
        expect(onTimelineRangeCommit).toHaveBeenLastCalledWith({
            timelineId: "Z",
            startBeatIndex: 2,
            endBeatIndex: 6,
        });
    });
});
