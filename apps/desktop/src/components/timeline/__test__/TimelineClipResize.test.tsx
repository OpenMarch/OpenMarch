import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Beat from "@/global/classes/Beat";
import {
    useTimelineSelectionStore,
    type StoredTimelineMembership,
} from "@/stores/TimelineSelectionStore";
import { shiftTimeline } from "@/db-functions/timelineCommands";
import type { DbConnection } from "@/db-functions/types";
import { Timeline, type TimelineInput } from "../Timeline";
import {
    clipGestureActive,
    clipHandleWidth,
    clipResizeTagText,
    resizedRange,
    type ClipResizeLimits,
    type TimelineClipResizeCommands,
} from "../TimelineClipResize";
import type { TimelineSelection } from "../TimelineViewModel";
import { useTimelineCommands } from "../useTimelineCommands";
import { resizeBoundReason, timelineName } from "../useTimelineClipResize";

/**
 * Resizing a move by its clip's edges (docs/timeline/research/resize-move). The E-numbers are the
 * design note's edge cases.
 */

vi.mock("@/db-functions/timelineCommands", () => ({
    shiftTimeline: vi.fn(),
    createTrack: vi.fn(),
}));

const DB = {} as DbConnection;

afterEach(cleanup);
beforeEach(() => {
    vi.mocked(shiftTimeline).mockReset().mockResolvedValue(null);
});

describe("clipHandleWidth (V-120)", () => {
    it("is up to 6 px, a quarter of a short clip, and none below 8 px", () => {
        expect(clipHandleWidth(96)).toBe(6);
        // A 1-count clip at the default zoom keeps an 8 px body
        expect(clipHandleWidth(16)).toBe(4);
        expect(clipHandleWidth(8)).toBe(2);
        expect(clipHandleWidth(7)).toBe(0);
    });
});

describe("resizedRange", () => {
    const range = { startBeatIndex: 8, endBeatIndex: 16 };
    const base = {
        range,
        snapBeats: [] as number[],
        pixelsPerBeat: 16,
        beatCount: 64,
        limits: null,
    };

    it("rounds the dragged edge to a whole beat, and snaps to a page line in reach", () => {
        expect(
            resizedRange({ ...base, edge: "end", beat: 19.4 }),
        ).toMatchObject({ startBeatIndex: 8, endBeatIndex: 19 });
        expect(
            resizedRange({ ...base, edge: "end", beat: 19.4, snapBeats: [20] }),
        ).toMatchObject({ endBeatIndex: 20 });
        expect(
            resizedRange({ ...base, edge: "start", beat: 4.6 }),
        ).toMatchObject({ startBeatIndex: 5, endBeatIndex: 16 });
    });

    it("keeps one count and the show, before the limits arrive (E1, E2)", () => {
        expect(resizedRange({ ...base, edge: "end", beat: 2 })).toMatchObject({
            endBeatIndex: 9,
            stoppedBy: "1 count minimum",
        });
        expect(
            resizedRange({ ...base, edge: "start", beat: 30 }),
        ).toMatchObject({ startBeatIndex: 15, stoppedBy: "1 count minimum" });
        expect(
            resizedRange({ ...base, edge: "start", beat: -3 }),
        ).toMatchObject({ startBeatIndex: 0, stoppedBy: null });
        expect(resizedRange({ ...base, edge: "end", beat: 80 })).toMatchObject({
            endBeatIndex: 64,
            stoppedBy: null,
        });
    });

    it("stops at the limits and says why (E3), and marks another move's exact range (E8)", () => {
        const limits: ClipResizeLimits = {
            startEdge: {
                min: { beat: 4, reason: "stops at Move 2" },
                max: { beat: 15, reason: "1 count minimum" },
            },
            endEdge: {
                min: { beat: 9, reason: "1 count minimum" },
                max: { beat: 24, reason: "stops at Move 3" },
            },
            taken: [
                {
                    startBeatIndex: 8,
                    endBeatIndex: 20,
                    reason: "Page 2's move already has these counts",
                },
            ],
        };
        expect(
            resizedRange({ ...base, limits, edge: "end", beat: 30 }),
        ).toMatchObject({ endBeatIndex: 24, stoppedBy: "stops at Move 3" });
        expect(
            resizedRange({ ...base, limits, edge: "start", beat: 1 }),
        ).toMatchObject({ startBeatIndex: 4, stoppedBy: "stops at Move 2" });
        expect(
            resizedRange({ ...base, limits, edge: "end", beat: 20 }),
        ).toMatchObject({
            // UI-15: it waits on the nearest beat back toward where it started, and says why
            endBeatIndex: 19,
            blockedBy: "Page 2's move already has these counts",
        });
        // Past the forbidden beat it lands as usual
        expect(
            resizedRange({ ...base, limits, edge: "end", beat: 21 }),
        ).toMatchObject({ endBeatIndex: 21, blockedBy: null });
    });
});

describe("clipResizeTagText", () => {
    const from = { startBeatIndex: 8, endBeatIndex: 16 };
    const preview = (start: number, end: number, extra = {}) => ({
        startBeatIndex: start,
        endBeatIndex: end,
        edge: "end" as const,
        stoppedBy: null,
        blockedBy: null,
        ...extra,
    });

    it("gives the length change, then why it stopped, or the page flags it now crosses (E4)", () => {
        expect(clipResizeTagText(from, preview(8, 12), [])).toBe(
            "8 → 4 counts",
        );
        expect(
            clipResizeTagText(
                from,
                preview(8, 24, { stoppedBy: "stops at Move 3" }),
                [],
            ),
        ).toBe("8 → 16 counts · stops at Move 3");
        expect(clipResizeTagText(from, preview(8, 30), [12, 16, 24])).toBe(
            "8 → 22 counts · through 2 page flags",
        );
        expect(clipResizeTagText(from, preview(8, 9), [])).toBe("8 → 1 count");
        expect(clipResizeTagText(from, preview(8, 9), [], "Move 3")).toBe(
            "Move 3: 8 → 1 count",
        );
    });
});

describe("the panel's names for limits", () => {
    const timelines = [
        {
            id: "clip-7",
            linkId: 7,
            label: "Move 3",
        } as unknown as TimelineInput,
    ];
    const boxes = [{ start: 1, end: 9, name: "1" }];

    it("names a page's move by its page, and another move by its clip", () => {
        expect(timelineName({ start: 1, end: 9 }, 2, timelines, boxes)).toBe(
            "Page 1's move",
        );
        expect(timelineName({ start: 4, end: 12 }, 7, timelines, boxes)).toBe(
            "Move 3",
        );
        expect(timelineName({ start: 4, end: 12 }, 8, timelines, boxes)).toBe(
            "another move",
        );
        const nameOf = () => "Move 3";
        expect(
            resizeBoundReason(
                {
                    beat: 4,
                    stop: { kind: "move", timelineId: 7, start: 4, end: 12 },
                },
                nameOf,
            ),
        ).toBe("stops at Move 3");
        expect(
            resizeBoundReason({ beat: 0, stop: { kind: "show" } }, nameOf),
        ).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// The gesture, through the real `Timeline`
// ---------------------------------------------------------------------------

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
});

const pointer = (
    target: Element,
    type: string,
    clientX: number,
    init: MouseEventInit = {},
) =>
    fireEvent(
        target,
        new MouseEvent(type, { bubbles: true, button: 0, clientX, ...init }),
    );

const flush = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

/** Spec-beat limits with nothing in the way, except what a test gives. */
const openLimits = (
    extra: Partial<ClipResizeLimits> = {},
): ClipResizeLimits => ({
    startEdge: {
        min: { beat: 0, reason: null },
        max: { beat: 1000, reason: null },
    },
    endEdge: {
        min: { beat: 0, reason: null },
        max: { beat: 1000, reason: null },
    },
    taken: [],
    ...extra,
});

function Harness({
    timelines,
    resize,
    onSelection,
}: {
    timelines: TimelineInput[];
    resize: TimelineClipResizeCommands;
    onSelection?: (selection: TimelineSelection) => void;
}) {
    const [selection, setSelection] = useState<TimelineSelection>(null);
    const commands = useTimelineCommands({
        database: DB,
        timelines,
        selectedMarcherIds: new Set(),
    });
    return (
        <Timeline
            mode="expanded"
            beats={appBeats(32)}
            pages={[]}
            measures={[]}
            timelines={timelines}
            showTransport={false}
            selection={selection}
            onSelectionChange={(next) => {
                setSelection(next);
                onSelection?.(next);
            }}
            onTimelineRangeCommit={commands.commitTimelineRange}
            clipResize={resize}
        />
    );
}

const setup = (
    limits: ClipResizeLimits | null = openLimits(),
    timelines = [input("A", 7, 3, 9)],
) => {
    const resize = {
        limits: vi.fn(async () => limits),
        commit: vi.fn(),
    };
    const onSelection = vi.fn();
    render(
        <Harness
            timelines={timelines}
            resize={resize}
            onSelection={onSelection}
        />,
    );
    return { resize, onSelection };
};

describe("resizing a clip by its edges", () => {
    it("dragging the end edge commits the new spec range once, on release", async () => {
        const { resize, onSelection } = setup();
        const end = screen.getByTestId("timeline-clip-resize-end");
        // 16 px per beat: two beats longer
        pointer(end, "pointerdown", 0);
        pointer(end, "pointermove", 20);
        await flush();
        pointer(end, "pointermove", 32);
        expect(resize.commit).not.toHaveBeenCalled();
        expect(screen.getByTestId("timeline-clip-resize-tag").textContent).toBe(
            "A: 6 → 8 counts",
        );
        pointer(end, "pointerup", 32);
        fireEvent.click(end);
        expect(resize.limits).toHaveBeenCalledWith("A");
        expect(resize.commit).toHaveBeenCalledTimes(1);
        expect(resize.commit).toHaveBeenCalledWith({
            timelineId: "A",
            startBeatIndex: 3,
            endBeatIndex: 11,
        });
        // The click that ends a resize doesn't select, and no move drag ran
        expect(onSelection).not.toHaveBeenCalled();
        expect(shiftTimeline).not.toHaveBeenCalled();
    });

    it("dragging the start edge keeps the end; a clip from show time 0 keeps its stored start beat's fold", async () => {
        const { resize } = setup(openLimits(), [input("A", 7, 1, 9)]);
        const start = screen.getByTestId("timeline-clip-resize-start");
        pointer(start, "pointerdown", 0);
        pointer(start, "pointermove", 16);
        pointer(start, "pointerup", 16);
        await flush();
        expect(resize.commit).toHaveBeenCalledWith({
            timelineId: "A",
            startBeatIndex: 2,
            endBeatIndex: 9,
        });
    });

    it("stops at the limits and says why (E3)", async () => {
        // Spec end 11 is view 10
        const { resize } = setup(
            openLimits({
                endEdge: {
                    min: { beat: 4, reason: "1 count minimum" },
                    max: { beat: 11, reason: "stops at Move 4" },
                },
            }),
        );
        const end = screen.getByTestId("timeline-clip-resize-end");
        pointer(end, "pointerdown", 0);
        await flush();
        pointer(end, "pointermove", 160);
        expect(screen.getByTestId("timeline-clip-resize-tag").textContent).toBe(
            "A: 6 → 8 counts · stops at Move 4",
        );
        pointer(end, "pointerup", 160);
        expect(resize.commit).toHaveBeenCalledWith({
            timelineId: "A",
            startBeatIndex: 3,
            endBeatIndex: 11,
        });
    });

    it("never lands on another move's exact range: it waits a count short and commits there (E8, UI-15)", async () => {
        const { resize } = setup(
            openLimits({
                taken: [
                    {
                        startBeatIndex: 3,
                        endBeatIndex: 11,
                        reason: "Page 2's move already has these counts",
                    },
                ],
            }),
        );
        const end = screen.getByTestId("timeline-clip-resize-end");
        pointer(end, "pointerdown", 0);
        await flush();
        pointer(end, "pointermove", 32);
        expect(
            screen.getByTestId("timeline-clip-resize-tag").textContent,
        ).toContain("Page 2's move already has these counts");
        expect(
            screen.getByTestId("timeline-clip-resize-preview").className,
        ).toContain("border-dashed");
        pointer(end, "pointerup", 32);
        // View end 10 is forbidden: it waits on 9 (spec 10)
        expect(resize.commit).toHaveBeenCalledWith({
            timelineId: "A",
            startBeatIndex: 3,
            endBeatIndex: 10,
        });
    });

    it("Esc cancels: nothing is committed or selected (E14)", async () => {
        const { resize, onSelection } = setup();
        const end = screen.getByTestId("timeline-clip-resize-end");
        pointer(end, "pointerdown", 0);
        pointer(end, "pointermove", 48);
        expect(screen.getByTestId("timeline-clip-resize-tag")).toBeTruthy();
        fireEvent.keyDown(window, { key: "Escape" });
        expect(screen.queryByTestId("timeline-clip-resize-tag")).toBeNull();
        pointer(end, "pointerup", 48);
        fireEvent.click(end);
        expect(resize.commit).not.toHaveBeenCalled();
        expect(onSelection).not.toHaveBeenCalled();
    });

    it("a lost pointer capture cancels: no commit, no stuck preview (E14)", () => {
        const { resize, onSelection } = setup();
        const end = screen.getByTestId("timeline-clip-resize-end");
        pointer(end, "pointerdown", 0);
        pointer(end, "pointermove", 48);
        expect(screen.getByTestId("timeline-clip-resize-tag")).toBeTruthy();
        fireEvent(end, new MouseEvent("lostpointercapture", { bubbles: true }));
        expect(screen.queryByTestId("timeline-clip-resize-tag")).toBeNull();
        pointer(end, "pointerup", 48);
        fireEvent.click(end);
        expect(resize.commit).not.toHaveBeenCalled();
        expect(onSelection).not.toHaveBeenCalled();
    });

    it("dragged back to where it started, nothing is committed or selected (E14)", () => {
        const { resize, onSelection } = setup();
        const end = screen.getByTestId("timeline-clip-resize-end");
        pointer(end, "pointerdown", 0);
        pointer(end, "pointermove", 40);
        pointer(end, "pointermove", 2);
        pointer(end, "pointerup", 2);
        fireEvent.click(end);
        expect(resize.commit).not.toHaveBeenCalled();
        expect(onSelection).not.toHaveBeenCalled();
    });

    it("a press on a handle without a drag is a click: it selects the clip", () => {
        const { resize, onSelection } = setup();
        const end = screen.getByTestId("timeline-clip-resize-end");
        pointer(end, "pointerdown", 0);
        pointer(end, "pointerup", 1);
        fireEvent.click(end);
        expect(resize.commit).not.toHaveBeenCalled();
        expect(onSelection).toHaveBeenCalledTimes(1);
    });

    it("the body still moves the whole clip, and Esc cancels that too", () => {
        setup();
        const clip = screen.getByLabelText(/^A timeline/);
        pointer(clip, "pointerdown", 40);
        pointer(clip, "pointermove", 72);
        fireEvent.keyDown(window, { key: "Escape" });
        pointer(clip, "pointerup", 72);
        expect(shiftTimeline).not.toHaveBeenCalled();
        pointer(clip, "pointerdown", 40);
        pointer(clip, "pointermove", 72);
        pointer(clip, "pointerup", 72);
        expect(shiftTimeline).toHaveBeenCalledTimes(1);
    });

    it("while a resize or move runs, Esc belongs to it, not to isolation (review)", () => {
        setup();
        const end = screen.getByTestId("timeline-clip-resize-end");
        expect(clipGestureActive()).toBe(false);
        pointer(end, "pointerdown", 0);
        pointer(end, "pointermove", 32);
        expect(clipGestureActive()).toBe(true);
        fireEvent.keyDown(window, { key: "Escape" });
        expect(clipGestureActive()).toBe(false);
        pointer(end, "pointerup", 32);
        const clip = screen.getByLabelText(/^A timeline/);
        pointer(clip, "pointerdown", 40);
        pointer(clip, "pointermove", 72);
        // Back where it started, still a drag: Esc is still its own
        pointer(clip, "pointermove", 41);
        expect(clipGestureActive()).toBe(true);
        pointer(clip, "pointerup", 41);
        expect(clipGestureActive()).toBe(false);
    });

    it("a release before the limits arrive waits for them, and stops at them (review)", async () => {
        let arrive: (limits: ClipResizeLimits) => void = () => undefined;
        const resize = {
            limits: vi.fn(
                () =>
                    new Promise<ClipResizeLimits | null>((resolve) => {
                        arrive = resolve;
                    }),
            ),
            commit: vi.fn(),
        };
        render(<Harness timelines={[input("A", 7, 3, 9)]} resize={resize} />);
        const end = screen.getByTestId("timeline-clip-resize-end");
        pointer(end, "pointerdown", 0);
        pointer(end, "pointermove", 160);
        pointer(end, "pointerup", 160);
        expect(resize.commit).not.toHaveBeenCalled();
        arrive(
            openLimits({
                endEdge: {
                    min: { beat: 4, reason: null },
                    max: { beat: 11, reason: "stops at Move 4" },
                },
            }),
        );
        await flush();
        expect(resize.commit).toHaveBeenCalledWith({
            timelineId: "A",
            startBeatIndex: 3,
            endBeatIndex: 11,
        });
    });

    it("a move stored from spec beat 0 lands where its edge was drawn (review)", async () => {
        const { resize } = setup(openLimits(), [input("A", 7, 0, 9)]);
        const start = screen.getByTestId("timeline-clip-resize-start");
        // View [0, 8): the start to view 3 is spec 4
        pointer(start, "pointerdown", 0);
        pointer(start, "pointermove", 48);
        pointer(start, "pointerup", 48);
        await flush();
        expect(resize.commit).toHaveBeenCalledWith({
            timelineId: "A",
            startBeatIndex: 4,
            endBeatIndex: 9,
        });
    });

    it("a clip narrower than 8 px has no handles (V-120)", () => {
        render(
            <Timeline
                mode="expanded"
                beats={appBeats(32)}
                pages={[]}
                measures={[]}
                timelines={[input("A", 7, 3, 4)]}
                showTransport={false}
                pixelsPerBeat={4}
                clipResize={{ limits: vi.fn(), commit: vi.fn() }}
            />,
        );
        expect(screen.queryByTestId("timeline-clip-resize-end")).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// The window follows a resized clip
// ---------------------------------------------------------------------------

describe("followTimelineRange (E15, E16)", () => {
    const store = () => useTimelineSelectionStore.getState();
    const timeline = (
        id: number,
        start: number,
        end: number,
        marcherIds: number[],
    ): StoredTimelineMembership => ({
        id,
        start,
        end,
        marcherIds: new Set(marcherIds),
    });
    beforeEach(() => {
        store().reset();
        store().setPageBoxes([
            { start: 1, end: 9 },
            { start: 9, end: 17 },
            { start: 17, end: 25 },
        ]);
    });

    it("a selected clip's window takes the new range, with the playhead on its end", () => {
        store().setStoredTimelines([timeline(5, 4, 12, [1])]);
        store().selectRange(4, 12);
        store().followTimelineRange(
            { start: 4, end: 12 },
            { start: 4, end: 20 },
        );
        expect(store().selection).toEqual({ kind: "range", start: 4, end: 20 });
        expect(store().playheadBeat).toBe(20);
        expect(store().storedTimelines!.map((t) => [t.start, t.end])).toEqual([
            [4, 20],
        ]);
        // Another clip's resize leaves the window alone
        store().followTimelineRange(
            { start: 9, end: 17 },
            { start: 9, end: 13 },
        );
        expect(store().selection).toEqual({ kind: "range", start: 4, end: 20 });
    });

    it("isolation follows; a playhead inside stays, one on the old end follows it", () => {
        store().setStoredTimelines([timeline(3, 12, 20, [3])]);
        store().isolate(3);
        store().seek(15);
        store().followTimelineRange(
            { start: 12, end: 20 },
            { start: 10, end: 20 },
        );
        expect(store().isolation).toMatchObject({ start: 10, end: 20 });
        expect(store().playheadBeat).toBe(15);
        // Shrunk past the playhead: clamped into the move
        store().followTimelineRange(
            { start: 10, end: 20 },
            { start: 10, end: 14 },
        );
        expect(store().playheadBeat).toBe(14);
        store().followTimelineRange(
            { start: 10, end: 14 },
            { start: 10, end: 18 },
        );
        expect(store().playheadBeat).toBe(18);
    });

    it("a shift still carries the playhead along (followTimelineShift unchanged)", () => {
        store().setStoredTimelines([timeline(3, 12, 20, [3])]);
        store().isolate(3);
        store().seek(15);
        store().followTimelineShift({ start: 12, end: 20 }, 2);
        expect(store().isolation).toMatchObject({ start: 14, end: 22 });
        expect(store().playheadBeat).toBe(17);
    });
});
