import {
    act,
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
import { createTrack, shiftTimeline } from "@/db-functions/timelineCommands";
import { conToastError } from "@/utilities/utils";
import { timelineErrorMessage } from "@/timeline/timelineErrorMessages";
import { Timeline, type TimelineInput } from "../Timeline";
import type { TimelineSelection } from "../TimelineViewModel";
import {
    selectedTimelineTarget,
    timelineShiftFor,
    useTimelineCommands,
} from "../useTimelineCommands";

/**
 * The timeline's commands as the panel wires them (P8.9): a clip move shifts its spec timeline by
 * the dragged beats, Create Track sends its range in spec beats with the selected target, no-ops
 * write nothing, and a refusal is a toast with its error code.
 */

vi.mock("@/db-functions/timelineCommands", () => ({
    shiftTimeline: vi.fn(),
    createTrack: vi.fn(),
}));
vi.mock("@/utilities/utils", () => ({ conToastError: vi.fn() }));

const DB = {} as DbConnection;

afterEach(cleanup);
beforeEach(() => {
    vi.mocked(shiftTimeline).mockReset().mockResolvedValue(null);
    vi.mocked(createTrack)
        .mockReset()
        .mockResolvedValue({
            timelineId: 1,
            transitionId: 1,
            assignmentIds: [1],
            layer: 0,
        });
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
    selectedMarcherIds,
    initialSelection = null,
}: {
    timelines: TimelineInput[];
    selectedMarcherIds: ReadonlySet<number>;
    initialSelection?: TimelineSelection;
}) {
    const [selection, setSelection] =
        useState<TimelineSelection>(initialSelection);
    const commands = useTimelineCommands({
        database: DB,
        timelines,
        selectedMarcherIds,
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
            selectedTarget={commands.selectedTarget}
            onSelectionChange={(next) => {
                setSelection(next);
                commands.noteSelection(next);
            }}
            onTimelineRangeCommit={commands.commitTimelineRange}
            onCreateTrack={commands.createTrack}
        />
    );
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the timeline's commands", () => {
    it("a clip move shifts its whole spec timeline by the dragged beats", () => {
        render(
            <Harness
                timelines={[input("A", 7, 3, 9), input("B", 7, 1, 9)]}
                selectedMarcherIds={new Set()}
            />,
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
        render(
            <Harness
                timelines={[input("A", 7, 3, 9)]}
                selectedMarcherIds={new Set()}
            />,
        );
        const clip = screen.getByLabelText(/^A timeline/);
        pointer(clip, "pointerdown", 0);
        pointer(clip, "pointermove", 2);
        pointer(clip, "pointerup", 2);
        expect(shiftTimeline).not.toHaveBeenCalled();
    });

    it("a refused move shows its own message (E-ARGS) as a toast", async () => {
        const error = new TimelineWriteError(
            "E-ARGS",
            "the timeline starts at beat 1, so it can't move 2 beats earlier",
        );
        vi.mocked(shiftTimeline).mockRejectedValue(error);
        render(
            <Harness
                timelines={[input("A", 7, 3, 9)]}
                selectedMarcherIds={new Set()}
            />,
        );
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
        render(
            <Harness
                timelines={[input("A", 7, 3, 9)]}
                selectedMarcherIds={new Set()}
            />,
        );
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

    it("Create Track for the one selected marcher sends the range in spec beats", () => {
        render(
            <Harness
                timelines={[]}
                selectedMarcherIds={new Set([5])}
                // View beats [2, 6) are spec beats [3, 7)
                initialSelection={{
                    kind: "range",
                    range: { startBeatIndex: 2, endBeatIndex: 6 },
                }}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Create Track" }));
        expect(createTrack).toHaveBeenCalledWith({
            db: DB,
            target: { kind: "marcher", marcherId: 5 },
            startBeat: 3,
            endBeat: 7,
        });
    });

    it("Create Track for a shape picked by its track takes the selected marchers", () => {
        const shapeTrack = input("S", 3, 1, 9, {
            targetId: 11,
            targetType: "shape",
        });
        render(<ShapeThenRange shapeTrack={shapeTrack} marchers={[4, 2]} />);
        // Selecting the shape's track picks the shape; then a range is selected
        fireEvent.click(screen.getByLabelText(/^S timeline/));
        fireEvent.click(screen.getByRole("button", { name: "select range" }));
        fireEvent.click(screen.getByRole("button", { name: "Create Track" }));
        expect(createTrack).toHaveBeenCalledWith({
            db: DB,
            target: { kind: "shape", shapeId: 11, marcherIds: [4, 2] },
            startBeat: 1,
            endBeat: 5,
        });
    });

    it("hides Create Track with several marchers selected and no shape", () => {
        render(
            <Harness
                timelines={[]}
                selectedMarcherIds={new Set([1, 2])}
                initialSelection={{
                    kind: "range",
                    range: { startBeatIndex: 2, endBeatIndex: 6 },
                }}
            />,
        );
        expect(
            screen.queryByRole("button", { name: "Create Track" }),
        ).toBeNull();
    });
});

/** The panel's wiring, plus a button that selects view range [0, 4) once a track is picked. */
function ShapeThenRange({
    shapeTrack,
    marchers,
}: {
    shapeTrack: TimelineInput;
    marchers: number[];
}) {
    const [selection, setSelection] = useState<TimelineSelection>(null);
    const [selected] = useState(() => new Set(marchers));
    const commands = useTimelineCommands({
        database: DB,
        timelines: [shapeTrack],
        selectedMarcherIds: selected,
    });
    return (
        <>
            <button
                type="button"
                onClick={() =>
                    setSelection({
                        kind: "range",
                        range: { startBeatIndex: 0, endBeatIndex: 4 },
                    })
                }
            >
                select range
            </button>
            <Timeline
                mode="expanded"
                beats={appBeats(16)}
                pages={[]}
                measures={[]}
                timelines={[shapeTrack]}
                showTransport={false}
                selection={selection}
                selectedTarget={commands.selectedTarget}
                onSelectionChange={(next) => {
                    setSelection(next);
                    commands.noteSelection(next);
                }}
                onCreateTrack={commands.createTrack}
            />
        </>
    );
}

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

    it("selectedTimelineTarget prefers a picked shape, then one marcher", () => {
        expect(selectedTimelineTarget(null, new Set([3]))).toEqual({
            type: "marcher",
            id: 3,
        });
        expect(selectedTimelineTarget(null, new Set())).toBeNull();
        expect(selectedTimelineTarget(null, new Set([1, 2]))).toBeNull();
        expect(
            selectedTimelineTarget({ type: "shape", id: 9 }, new Set([1, 2])),
        ).toEqual({ type: "shape", id: 9 });
        // A shape with nobody to move into it is no target
        expect(
            selectedTimelineTarget({ type: "shape", id: 9 }, new Set()),
        ).toBeNull();
    });
});

describe("the picked shape", () => {
    const shapeTrack = input("S", 3, 1, 9, {
        targetId: 11,
        targetType: "shape",
    });
    const marcherTrack = input("M", 3, 1, 9, { targetId: 5 });
    const range: TimelineSelection = {
        kind: "range",
        range: { startBeatIndex: 0, endBeatIndex: 4 },
    };
    const SHAPE = { type: "shape", id: 11 };

    const renderCommands = (selected: ReadonlySet<number> = new Set([4])) =>
        renderHook(
            ({ timelines }: { timelines: TimelineInput[] }) =>
                useTimelineCommands({
                    database: DB,
                    timelines,
                    selectedMarcherIds: selected,
                }),
            { initialProps: { timelines: [shapeTrack, marcherTrack] } },
        );
    const pick = (result: { current: { noteSelection: Noter } }) =>
        act(() =>
            result.current.noteSelection({ kind: "track", trackId: "S" }),
        );
    type Noter = (next: TimelineSelection) => void;

    it("stays through a range selection, which is where Create Track is offered", () => {
        const { result } = renderCommands();
        pick(result);
        expect(result.current.selectedTarget).toEqual(SHAPE);
        act(() => result.current.noteSelection(range));
        expect(result.current.selectedTarget).toEqual(SHAPE);
    });

    it.each<[string, TimelineSelection]>([
        ["a page", { kind: "page", pageId: 2 }],
        ["nothing", null],
        ["a marcher's track", { kind: "track", trackId: "M" }],
    ])("is dropped when %s is selected", (_, next) => {
        const { result } = renderCommands();
        pick(result);
        act(() => result.current.noteSelection(next));
        // Back to the one selected marcher, and a later range doesn't bring the shape back
        expect(result.current.selectedTarget).toEqual({
            type: "marcher",
            id: 4,
        });
        act(() => result.current.noteSelection(range));
        expect(result.current.selectedTarget).toEqual({
            type: "marcher",
            id: 4,
        });
    });

    it("is dropped when its track disappears, and doesn't come back with it", () => {
        const { result, rerender } = renderCommands();
        pick(result);
        rerender({ timelines: [marcherTrack] });
        expect(result.current.selectedTarget).toEqual({
            type: "marcher",
            id: 4,
        });
        // An undo that brings the shape's track back doesn't pick it again
        rerender({ timelines: [shapeTrack, marcherTrack] });
        expect(result.current.selectedTarget).toEqual({
            type: "marcher",
            id: 4,
        });
    });

    it("hides Create Track while no marcher is selected", () => {
        const { result } = renderCommands(new Set());
        pick(result);
        expect(result.current.selectedTarget).toBeNull();
        render(
            <Timeline
                mode="expanded"
                beats={appBeats(16)}
                pages={[]}
                measures={[]}
                timelines={[shapeTrack]}
                showTransport={false}
                selection={range}
                selectedTarget={result.current.selectedTarget}
                onCreateTrack={result.current.createTrack}
            />,
        );
        expect(
            screen.queryByRole("button", { name: "Create Track" }),
        ).toBeNull();
    });
});
