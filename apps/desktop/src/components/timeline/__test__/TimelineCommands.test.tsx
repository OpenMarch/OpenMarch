import {
    cleanup,
    fireEvent,
    render,
    renderHook,
    screen,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Beat from "@/global/classes/Beat";
import type { DbConnection } from "@/db-functions/types";
import { TimelineWriteError } from "@/db-functions/timelineErrors";
import { text } from "@/timeline/timelineText";
import { shiftTimeline } from "@/db-functions/timelineCommands";
import { conToastError } from "@/utilities/utils";
import { timelineErrorMessage } from "@/timeline/timelineErrorMessages";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { Timeline, type TimelineInput } from "../Timeline";
import type { TimelineSelection } from "../TimelineViewModel";
import { timelineShiftFor, useTimelineCommands } from "../useTimelineCommands";

/**
 * The timeline's commands as the panel wires them (P8.9): a clip move shifts its spec timeline by
 * the dragged beats, no-ops write nothing, and a refusal is a toast with its error code.
 */

vi.mock("@/db-functions/timelineCommands", () => ({
    shiftTimeline: vi.fn(),
}));
vi.mock("@/utilities/utils", () => ({ conToastError: vi.fn() }));

const DB = {} as DbConnection;

afterEach(cleanup);
beforeEach(() => {
    vi.mocked(shiftTimeline).mockReset().mockResolvedValue(null);
    vi.mocked(conToastError).mockReset();
});

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

/** The panel's wiring, around the real `Timeline`. */
function Harness({
    timelines,
    initialSelection = null,
}: {
    timelines: TimelineInput[];
    initialSelection?: TimelineSelection;
}) {
    const [selection, setSelection] =
        useState<TimelineSelection>(initialSelection);
    const commands = useTimelineCommands({
        database: DB,
        timelines,
    });
    return (
        <Timeline
            mode="expanded"
            beats={appBeats(16)}
            pages={[]}
            measures={[]}
            timelines={timelines}
            showTransport={false}
            selection={selection}
            onSelectionChange={setSelection}
            onTimelineRangeCommit={commands.commitTimelineRange}
        />
    );
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the timeline's commands", () => {
    it("a clip move shifts its whole spec timeline by the dragged beats", () => {
        render(
            <Harness timelines={[input("A", 7, 3, 9), input("B", 7, 1, 9)]} />,
        );
        const clip = screen.getByLabelText(/^A timeline/);
        // 16 px per beat: a 2-beat drag right
        pointer(clip, "pointerdown", 0);
        pointer(clip, "pointermove", 32);
        pointer(clip, "pointerup", 32);
        expect(shiftTimeline).toHaveBeenCalledTimes(1);
        expect(shiftTimeline).toHaveBeenLastCalledWith({
            db: DB,
            timelineId: 7,
            delta: 2,
        });
    });

    it("a clip dropped where it started writes nothing", () => {
        render(<Harness timelines={[input("A", 7, 3, 9)]} />);
        const clip = screen.getByLabelText(/^A timeline/);
        pointer(clip, "pointerdown", 0);
        pointer(clip, "pointermove", 2);
        pointer(clip, "pointerup", 2);
        expect(shiftTimeline).not.toHaveBeenCalled();
    });

    it("a refused move shows its own message (E-ARGS) as a toast", async () => {
        const error = new TimelineWriteError(
            "E-ARGS",
            text.t("timeline.refusals.moveTimeline.tooEarly", {
                start: 1,
                count: 2,
            }),
        );
        vi.mocked(shiftTimeline).mockRejectedValue(error);
        render(<Harness timelines={[input("A", 7, 3, 9)]} />);
        const clip = screen.getByLabelText(/^A timeline/);
        pointer(clip, "pointerdown", 64);
        pointer(clip, "pointermove", 32);
        pointer(clip, "pointerup", 32);
        await flush();
        expect(conToastError).toHaveBeenCalledWith(
            "the timeline starts at beat 1, so it can't move 2 beats earlier",
            error,
        );
    });

    it("a refused move with a database code shows the mapped message, not the code", async () => {
        const error = new TimelineWriteError(
            "E-A3",
            "assignments overlap on layer 0",
        );
        vi.mocked(shiftTimeline).mockRejectedValue(error);
        render(<Harness timelines={[input("A", 7, 3, 9)]} />);
        const clip = screen.getByLabelText(/^A timeline/);
        pointer(clip, "pointerdown", 64);
        pointer(clip, "pointermove", 32);
        pointer(clip, "pointerup", 32);
        await flush();
        expect(conToastError).toHaveBeenCalledWith(
            timelineErrorMessage(error),
            error,
        );
        expect(vi.mocked(conToastError).mock.calls[0]![0]).not.toMatch(/E-A3/);
    });
});

describe("the commands' pure parts", () => {
    it("timelineShiftFor reads the spec timeline from the clip's link id", () => {
        const tracks = [input("A", 7, 3, 9)];
        expect(
            timelineShiftFor(
                { timelineId: "A", startBeatIndex: 1, endBeatIndex: 7 },
                tracks,
            ),
        ).toEqual({ timelineId: 7, delta: -2 });
        expect(
            timelineShiftFor(
                { timelineId: "A", startBeatIndex: 3, endBeatIndex: 9 },
                tracks,
            ),
        ).toBeNull();
        expect(
            timelineShiftFor(
                { timelineId: "missing", startBeatIndex: 1, endBeatIndex: 7 },
                tracks,
            ),
        ).toBeNull();
    });
});

describe("a clip move and the selection (UI-9)", () => {
    beforeEach(() => useTimelineSelectionStore.getState().reset());

    const drag = () => {
        const clip = screen.getByLabelText(/^A timeline/);
        pointer(clip, "pointerdown", 0);
        pointer(clip, "pointermove", 32);
        pointer(clip, "pointerup", 32);
    };

    it("moves a selection of the moved timeline's range with it", async () => {
        vi.mocked(shiftTimeline).mockResolvedValue({} as never);
        useTimelineSelectionStore.getState().selectRange(3, 9);
        render(<Harness timelines={[input("A", 7, 3, 9)]} />);
        drag();
        await flush();
        expect(useTimelineSelectionStore.getState().selection).toEqual({
            kind: "range",
            start: 5,
            end: 11,
        });
        // UI-10: the window's end is the playhead, so it moves with the clip
        expect(useTimelineSelectionStore.getState().playheadBeat).toBe(11);
    });

    it("leaves another selection, and a refused move, alone", async () => {
        vi.mocked(shiftTimeline).mockResolvedValue({} as never);
        useTimelineSelectionStore.getState().selectRange(9, 12);
        render(<Harness timelines={[input("A", 7, 3, 9)]} />);
        drag();
        await flush();
        expect(useTimelineSelectionStore.getState().selection).toEqual({
            kind: "range",
            start: 9,
            end: 12,
        });

        cleanup();
        vi.mocked(shiftTimeline).mockRejectedValue(
            new TimelineWriteError("E-ARGS", "refused"),
        );
        useTimelineSelectionStore.getState().selectRange(3, 9);
        render(<Harness timelines={[input("A", 7, 3, 9)]} />);
        drag();
        await flush();
        expect(useTimelineSelectionStore.getState().selection).toEqual({
            kind: "range",
            start: 3,
            end: 9,
        });
    });

    it("exposes only commitTimelineRange", () => {
        const { result } = renderHook(() =>
            useTimelineCommands({
                database: DB,
                timelines: [],
            }),
        );
        expect(Object.keys(result.current).sort()).toEqual([
            "commitTimelineRange",
        ]);
    });
});
