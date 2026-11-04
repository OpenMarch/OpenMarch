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
    RELEASED_PREVIEW_TIMEOUT_MS,
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

    it("says why a move split off a page can't grow, not that its own counts are taken (UI-25)", () => {
        // The page's own timeline shares the split move's range; the next page's move blocks it
        const limits: ClipResizeLimits = {
            startEdge: {
                min: { beat: 8, reason: "stops at Page 1's move" },
                max: { beat: 15, reason: "1 count minimum" },
            },
            endEdge: {
                min: { beat: 9, reason: "1 count minimum" },
                max: { beat: 16, reason: "stops at Page 3's move" },
            },
            taken: [
                {
                    startBeatIndex: 8,
                    endBeatIndex: 16,
                    reason: "Page 2's move already has these counts",
                },
            ],
        };
        expect(
            resizedRange({ ...base, limits, edge: "end", beat: 22 }),
        ).toMatchObject({
            endBeatIndex: 16,
            stoppedBy: "stops at Page 3's move",
            blockedBy: null,
        });
        expect(
            resizedRange({ ...base, limits, edge: "start", beat: 3 }),
        ).toMatchObject({
            startBeatIndex: 8,
            stoppedBy: "stops at Page 1's move",
            blockedBy: null,
        });
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
        // The page's own timeline is in the list too, with its fallback label
        {
            id: "clip-2",
            linkId: 2,
            label: "Timeline 2",
        } as unknown as TimelineInput,
        {
            id: "clip-7",
            linkId: 7,
            label: "Move 3",
        } as unknown as TimelineInput,
        // A move split off page 1's timeline (UI-25)
        {
            id: "clip-9",
            linkId: 9,
            label: "Move 5",
        } as unknown as TimelineInput,
    ];
    const boxes = [{ start: 1, end: 9, name: "1" }];
    const pages = new Set([2]);

    it("names a page's move by its page, and another move by its clip", () => {
        expect(
            timelineName({ start: 1, end: 9 }, 2, timelines, boxes, pages),
        ).toBe("Page 1's move");
        expect(
            timelineName({ start: 1, end: 9 }, 9, timelines, boxes, pages),
        ).toBe("Move 5");
        expect(
            timelineName({ start: 4, end: 12 }, 7, timelines, boxes, pages),
        ).toBe("Move 3");
        expect(
            timelineName({ start: 4, end: 12 }, 8, timelines, boxes, pages),
        ).toBe("another move");
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
// After release: drawn where it was dropped until the new range arrives
// ---------------------------------------------------------------------------

describe("a released drag until its range arrives (owner 2026-10-16)", () => {
    const clip = () => screen.getByLabelText(/^A timeline/) as HTMLElement;
    const drawn = () => ({
        left: clip().style.left,
        width: clip().style.width,
    });
    const renderWith = (
        resize: TimelineClipResizeCommands,
        start = 3,
        end = 9,
    ) =>
        render(
            <Harness timelines={[input("A", 7, start, end)]} resize={resize} />,
        );
    /** A commit that settles when the test says, as the database's write does */
    const pending = () => {
        let settle: (written: boolean) => void = () => undefined;
        const result = new Promise<boolean>((resolve) => {
            settle = resolve;
        });
        return { result, settle: (written: boolean) => settle(written) };
    };
    const dragEnd = async (to: number) => {
        const end = screen.getByTestId("timeline-clip-resize-end");
        pointer(end, "pointerdown", 0);
        pointer(end, "pointermove", 20);
        await flush();
        pointer(end, "pointermove", to);
        pointer(end, "pointerup", to);
        fireEvent.click(end);
    };

    afterEach(() => {
        vi.useRealTimers();
    });

    it("a resized clip keeps its new edge after release, without the tag, until the range changes", async () => {
        const commit = pending();
        const resize = {
            limits: vi.fn(async () => openLimits()),
            commit: vi.fn(() => commit.result),
        };
        const { rerender } = renderWith(resize);
        const before = drawn();
        await dragEnd(32);
        const dropped = drawn();
        expect(dropped.width).not.toBe(before.width);
        // Written, but the range hasn't come back yet: still drawn where it was dropped
        commit.settle(true);
        await flush();
        expect(drawn()).toEqual(dropped);
        expect(screen.getByTestId("timeline-clip-resize-preview")).toBeTruthy();
        expect(screen.queryByTestId("timeline-clip-resize-tag")).toBeNull();
        // The new range arrives: the clip draws it, the same as the preview
        rerender(
            <Harness timelines={[input("A", 7, 3, 11)]} resize={resize} />,
        );
        await flush();
        expect(screen.queryByTestId("timeline-clip-resize-preview")).toBeNull();
        expect(drawn()).toEqual(dropped);
    });

    it("a refused resize goes back at once", async () => {
        const commit = pending();
        renderWith({
            limits: vi.fn(async () => openLimits()),
            commit: vi.fn(() => commit.result),
        });
        const before = drawn();
        await dragEnd(32);
        expect(drawn()).not.toEqual(before);
        commit.settle(false);
        await flush();
        expect(drawn()).toEqual(before);
        expect(screen.queryByTestId("timeline-clip-resize-preview")).toBeNull();
    });

    it("a range that never arrives lets go after the timeout, so the preview can't stick", async () => {
        // Real time still runs, for `flush`; the timeout is stepped by hand
        vi.useFakeTimers({ shouldAdvanceTime: true });
        renderWith({
            limits: vi.fn(async () => openLimits()),
            commit: vi.fn(),
        });
        const before = drawn();
        await dragEnd(32);
        expect(drawn()).not.toEqual(before);
        act(() => {
            vi.advanceTimersByTime(RELEASED_PREVIEW_TIMEOUT_MS - 200);
        });
        expect(drawn()).not.toEqual(before);
        act(() => {
            vi.advanceTimersByTime(200);
        });
        expect(drawn()).toEqual(before);
    });

    it("a moved clip stays where it was dropped, and isn't shifted twice when its range arrives", async () => {
        let settle: (value: null) => void = () => undefined;
        vi.mocked(shiftTimeline).mockReturnValue(
            new Promise((resolve) => {
                settle = resolve;
            }),
        );
        const resize = {
            limits: vi.fn(async () => openLimits()),
            commit: vi.fn(),
        };
        const { rerender } = renderWith(resize);
        const before = drawn();
        pointer(clip(), "pointerdown", 40);
        pointer(clip(), "pointermove", 56);
        pointer(clip(), "pointermove", 72);
        pointer(clip(), "pointerup", 72);
        expect(shiftTimeline).toHaveBeenCalledTimes(1);
        await flush();
        const dropped = drawn();
        expect(dropped.left).not.toBe(before.left);
        // The moved range arrives: drawn there, not offset again, not even for the render
        // before the clip's effects run (every style the clip took is recorded)
        const records: MutationRecord[] = [];
        const styles = new MutationObserver((batch) => records.push(...batch));
        styles.observe(clip(), {
            attributes: true,
            attributeFilter: ["style"],
            attributeOldValue: true,
        });
        rerender(
            <Harness timelines={[input("A", 7, 5, 11)]} resize={resize} />,
        );
        await flush();
        records.push(...styles.takeRecords());
        styles.disconnect();
        const lefts = records.map(
            (record) => /left: ([^;]+)/.exec(record.oldValue ?? "")?.[1],
        );
        expect(lefts.every((left) => left === dropped.left)).toBe(true);
        expect(drawn()).toEqual(dropped);
        settle(null);
        await flush();
        expect(drawn()).toEqual(dropped);
    });

    it("a press on a handle during the wait, without a drag, still lets go on a refusal (review)", async () => {
        const commit = pending();
        renderWith({
            limits: vi.fn(async () => openLimits()),
            commit: vi.fn(() => commit.result),
        });
        const before = drawn();
        await dragEnd(32);
        const dropped = drawn();
        const end = screen.getByTestId("timeline-clip-resize-end");
        pointer(end, "pointerdown", 0);
        pointer(end, "pointerup", 1);
        fireEvent.click(end);
        await flush();
        // Still waiting: drawn where it was dropped, no tag
        expect(drawn()).toEqual(dropped);
        expect(screen.queryByTestId("timeline-clip-resize-tag")).toBeNull();
        commit.settle(false);
        await flush();
        expect(drawn()).toEqual(before);
        expect(screen.queryByTestId("timeline-clip-resize-preview")).toBeNull();
    });

    it("a click on a dropped clip during the wait doesn't send it back (review)", async () => {
        vi.mocked(shiftTimeline).mockReturnValue(new Promise(() => undefined));
        renderWith({
            limits: vi.fn(async () => openLimits()),
            commit: vi.fn(),
        });
        pointer(clip(), "pointerdown", 40);
        pointer(clip(), "pointermove", 56);
        pointer(clip(), "pointermove", 72);
        pointer(clip(), "pointerup", 72);
        fireEvent.click(clip());
        await flush();
        const dropped = drawn();
        pointer(clip(), "pointerdown", 80);
        pointer(clip(), "pointerup", 80);
        fireEvent.click(clip());
        await flush();
        expect(drawn()).toEqual(dropped);
    });

    it("limits that arrive after a newer press still commit the drop, and leave the newer drag alone (review)", async () => {
        const arrivals: ((limits: ClipResizeLimits) => void)[] = [];
        const resize = {
            limits: vi.fn(
                () =>
                    new Promise<ClipResizeLimits | null>((resolve) => {
                        arrivals.push(resolve);
                    }),
            ),
            commit: vi.fn(),
        };
        renderWith(resize);
        const end = screen.getByTestId("timeline-clip-resize-end");
        // Released before its limits arrive
        pointer(end, "pointerdown", 0);
        pointer(end, "pointermove", 32);
        pointer(end, "pointerup", 32);
        // A newer drag, still running when the first limits arrive
        pointer(end, "pointerdown", 32);
        pointer(end, "pointermove", 64);
        const newer = drawn();
        expect(screen.getByTestId("timeline-clip-resize-tag")).toBeTruthy();
        arrivals[0]!(openLimits());
        await flush();
        expect(resize.commit).toHaveBeenCalledTimes(1);
        expect(resize.commit).toHaveBeenCalledWith({
            timelineId: "A",
            startBeatIndex: 3,
            endBeatIndex: 11,
        });
        // The newer drag is untouched: same preview, its tag, and Esc still cancels it
        expect(drawn()).toEqual(newer);
        expect(screen.getByTestId("timeline-clip-resize-tag")).toBeTruthy();
        expect(clipGestureActive()).toBe(true);
        fireEvent.keyDown(window, { key: "Escape" });
        expect(clipGestureActive()).toBe(false);
    });

    it("a refused move goes back at once", async () => {
        let settle: (value: null) => void = () => undefined;
        vi.mocked(shiftTimeline).mockReturnValue(
            new Promise((resolve) => {
                settle = resolve;
            }),
        );
        renderWith({
            limits: vi.fn(async () => openLimits()),
            commit: vi.fn(),
        });
        const before = drawn();
        pointer(clip(), "pointerdown", 40);
        pointer(clip(), "pointermove", 56);
        pointer(clip(), "pointermove", 72);
        pointer(clip(), "pointerup", 72);
        await flush();
        expect(drawn()).not.toEqual(before);
        settle(null);
        await flush();
        expect(drawn()).toEqual(before);
    });

    /** Every left and width the clip took while `change` ran, then its last */
    const stylesDuring = async (change: () => void) => {
        const records: MutationRecord[] = [];
        const styles = new MutationObserver((batch) => records.push(...batch));
        styles.observe(clip(), {
            attributes: true,
            attributeFilter: ["style"],
            attributeOldValue: true,
        });
        change();
        await flush();
        records.push(...styles.takeRecords());
        styles.disconnect();
        return [
            ...records.map((record) => {
                const style = record.oldValue ?? "";
                return {
                    left: /left: ([^;]+)/.exec(style)?.[1],
                    width: /width: ([^;]+)/.exec(style)?.[1],
                };
            }),
            drawn(),
        ];
    };
    const moveBy = (from: number, to: number) => {
        pointer(clip(), "pointerdown", from);
        pointer(clip(), "pointermove", from + 10);
        pointer(clip(), "pointermove", to);
        pointer(clip(), "pointerup", to);
        fireEvent.click(clip());
    };

    it("a move stored from spec beat 0 isn't shifted twice when its range arrives (review)", async () => {
        vi.mocked(shiftTimeline).mockReturnValue(new Promise(() => undefined));
        const resize = {
            limits: vi.fn(async () => openLimits()),
            commit: vi.fn(),
        };
        const { rerender } = renderWith(resize, 0, 8);
        // Spec [0, 8) is view [0, 7): one beat right
        moveBy(40, 56);
        await flush();
        expect(shiftTimeline).toHaveBeenCalledWith(
            expect.objectContaining({ delta: 1 }),
        );
        const dropped = drawn();
        expect(dropped).toEqual({ left: "16px", width: "112px" });
        // Spec [1, 9) is view [0, 8): its start doesn't move on the view, its end does
        const frames = await stylesDuring(() =>
            rerender(
                <Harness timelines={[input("A", 7, 1, 9)]} resize={resize} />,
            ),
        );
        expect(frames.at(-1)).toEqual({ left: "0px", width: "128px" });
        // Never the drop's start with the arrived range's length (style properties change one
        // at a time, so a record can also hold one of each, inside a single commit)
        expect(frames).not.toContainEqual({ left: "16px", width: "128px" });
    });

    it("a resize dragged again during the wait starts from the drop, and goes on when the drop's range arrives (review)", async () => {
        const resize = {
            limits: vi.fn(async () => openLimits()),
            commit: vi.fn(() => new Promise<boolean>(() => undefined)),
        };
        const { rerender } = renderWith(resize);
        // Spec [3, 9) is view [2, 8): the end two beats out, to view 10 (spec 11)
        await dragEnd(32);
        expect(drawn()).toEqual({ left: "32px", width: "128px" });
        const end = screen.getByTestId("timeline-clip-resize-end");
        pointer(end, "pointerdown", 100);
        await flush();
        pointer(end, "pointermove", 116);
        // One beat further than the drop, not than the range it replaces
        expect(drawn()).toEqual({ left: "32px", width: "144px" });
        expect(
            screen.getByTestId("timeline-clip-resize-tag").textContent,
        ).toMatch(/^A: 8 → 9 counts/);
        // The drop's range arrives mid-drag: the drag goes on
        rerender(
            <Harness timelines={[input("A", 7, 3, 11)]} resize={resize} />,
        );
        await flush();
        expect(drawn()).toEqual({ left: "32px", width: "144px" });
        pointer(end, "pointerup", 116);
        await flush();
        expect(resize.commit).toHaveBeenLastCalledWith({
            timelineId: "A",
            startBeatIndex: 3,
            endBeatIndex: 12,
        });
        expect(drawn()).toEqual({ left: "32px", width: "144px" });
    });

    it("a resize dragged again during the wait and back onto the drop commits nothing new, and waits on (review)", async () => {
        const resize = {
            limits: vi.fn(async () => openLimits()),
            commit: vi.fn(() => new Promise<boolean>(() => undefined)),
        };
        renderWith(resize);
        await dragEnd(32);
        const dropped = drawn();
        const end = screen.getByTestId("timeline-clip-resize-end");
        pointer(end, "pointerdown", 100);
        await flush();
        pointer(end, "pointermove", 132);
        pointer(end, "pointermove", 100);
        pointer(end, "pointerup", 100);
        await flush();
        expect(resize.commit).toHaveBeenCalledTimes(1);
        expect(drawn()).toEqual(dropped);
    });

    it("a resize dragged again during the wait, then cancelled with Esc, goes back to the drop (review)", async () => {
        renderWith({
            limits: vi.fn(async () => openLimits()),
            commit: vi.fn(() => new Promise<boolean>(() => undefined)),
        });
        await dragEnd(32);
        const dropped = drawn();
        const end = screen.getByTestId("timeline-clip-resize-end");
        pointer(end, "pointerdown", 100);
        await flush();
        pointer(end, "pointermove", 148);
        expect(drawn()).not.toEqual(dropped);
        fireEvent.keyDown(window, { key: "Escape" });
        await flush();
        expect(drawn()).toEqual(dropped);
    });

    it("a moved clip dragged again during the wait starts from the drop, and its commit adds to it (review)", async () => {
        vi.mocked(shiftTimeline).mockReturnValue(new Promise(() => undefined));
        const resize = {
            limits: vi.fn(async () => openLimits()),
            commit: vi.fn(),
        };
        const { rerender } = renderWith(resize);
        // Spec [3, 9) is view [2, 8): two beats right
        moveBy(40, 72);
        await flush();
        expect(drawn()).toEqual({ left: "64px", width: "96px" });
        // Grabbed where it's drawn and dragged one beat further
        pointer(clip(), "pointerdown", 100);
        pointer(clip(), "pointermove", 110);
        pointer(clip(), "pointermove", 116);
        expect(drawn()).toEqual({ left: "80px", width: "96px" });
        // The first drop's range arrives mid-drag: the drag goes on
        rerender(
            <Harness timelines={[input("A", 7, 5, 11)]} resize={resize} />,
        );
        await flush();
        expect(drawn()).toEqual({ left: "80px", width: "96px" });
        pointer(clip(), "pointerup", 116);
        await flush();
        expect(shiftTimeline).toHaveBeenCalledTimes(2);
        expect(shiftTimeline).toHaveBeenLastCalledWith(
            expect.objectContaining({ delta: 1 }),
        );
        expect(drawn()).toEqual({ left: "80px", width: "96px" });
    });

    it("a moved clip dragged again before the first range arrives shifts by the second drag only (review)", async () => {
        vi.mocked(shiftTimeline).mockReturnValue(new Promise(() => undefined));
        renderWith({
            limits: vi.fn(async () => openLimits()),
            commit: vi.fn(),
        });
        moveBy(40, 72);
        await flush();
        moveBy(100, 116);
        await flush();
        // `shiftTimeline` is relative: 2 then 1 lands 3 beats right, where it's drawn
        expect(
            vi.mocked(shiftTimeline).mock.calls.map(([args]) => args.delta),
        ).toEqual([2, 1]);
        expect(drawn()).toEqual({ left: "80px", width: "96px" });
    });

    it("a press during the wait that's cancelled leaves the drop alone (review)", async () => {
        vi.mocked(shiftTimeline).mockReturnValue(new Promise(() => undefined));
        const commit = pending();
        renderWith({
            limits: vi.fn(async () => openLimits()),
            commit: vi.fn(() => commit.result),
        });
        moveBy(40, 72);
        await flush();
        const moved = drawn();
        pointer(clip(), "pointerdown", 80);
        pointer(clip(), "pointercancel", 80);
        await flush();
        expect(drawn()).toEqual(moved);

        cleanup();
        renderWith({
            limits: vi.fn(async () => openLimits()),
            commit: vi.fn(() => commit.result),
        });
        await dragEnd(32);
        const resized = drawn();
        const end = screen.getByTestId("timeline-clip-resize-end");
        pointer(end, "pointerdown", 100);
        pointer(end, "pointercancel", 100);
        await flush();
        expect(drawn()).toEqual(resized);
        pointer(end, "pointerdown", 100);
        fireEvent(end, new MouseEvent("lostpointercapture", { bubbles: true }));
        await flush();
        expect(drawn()).toEqual(resized);
    });

    it("a refusal after the limits still lets go when a newer press hasn't moved (review)", async () => {
        const arrivals: ((limits: ClipResizeLimits) => void)[] = [];
        const commit = pending();
        renderWith({
            limits: vi.fn(
                () =>
                    new Promise<ClipResizeLimits | null>((resolve) => {
                        arrivals.push(resolve);
                    }),
            ),
            commit: vi.fn(() => commit.result),
        });
        const before = drawn();
        const end = screen.getByTestId("timeline-clip-resize-end");
        // Released before its limits arrive, then pressed again without a drag
        pointer(end, "pointerdown", 0);
        pointer(end, "pointermove", 32);
        pointer(end, "pointerup", 32);
        pointer(end, "pointerdown", 32);
        arrivals[0]!(openLimits());
        await flush();
        expect(drawn()).not.toEqual(before);
        commit.settle(false);
        await flush();
        expect(drawn()).toEqual(before);
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
