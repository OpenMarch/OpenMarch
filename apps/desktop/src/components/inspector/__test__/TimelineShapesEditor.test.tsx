import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import {
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";
import type { ShapeRow, TransitionRow } from "@openmarch/core";
import type { DbConnection } from "@/db-functions/types";
import { TimelineWriteError } from "@/db-functions/timelineErrors";
import {
    buildShapeEditTargets,
    type ShapeFrame,
} from "@/timeline/timelineShapeEditor";
import { useTimelineShapeCanvasStore } from "@/timeline/timelineShapeCanvas";
import { TIMELINE_INSPECTOR_STRINGS } from "../timelineInspectorStrings";
import { TimelineShapesEditor } from "../TimelineShapesEditor";

/**
 * P8.2: the inspector's shape editor shows each shape's stored values, sends one db-function call
 * per change with the right payload, skips a change that writes nothing, disables what the
 * database would refuse with the reason, waits for a newer store version after an edit, and
 * toasts a refusal.
 */

const mocks = vi.hoisted(() => ({
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    toast: vi.fn(),
    warning: vi.fn(),
    settled: vi.fn(),
    positions: {} as Record<number, [number, number]>,
    positionAt: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { warning: mocks.warning } }));
vi.mock("@/db-functions/timelineShapes", () => ({
    createTimelineShape: mocks.create,
    updateTimelineShape: mocks.update,
    deleteTimelineShape: mocks.remove,
}));
vi.mock("@/timeline/timelineErrorMessages", () => ({
    toastTimelineError: mocks.toast,
}));
vi.mock("@/timeline/timelineCoordinateWrites", () => ({
    timelinePositionsSettled: mocks.settled,
    TimelineNotReadyError: class extends Error {},
}));
vi.mock("@/timeline/timelineStore", () => ({
    useTimelineResolverStore: {
        getState: () => ({
            resolver: {
                marcherIds: () =>
                    Object.keys(mocks.positions).map((id) => Number(id)),
                positionAt: mocks.positionAt,
            },
        }),
    },
}));

const db = { name: "test-db" } as unknown as DbConnection;
const FRAME: ShapeFrame = { center: [100, 50], size: 16, spacing: 2 };

const t = (
    key: keyof typeof TIMELINE_INSPECTOR_STRINGS,
    params: Record<string, string | number> = {},
) =>
    TIMELINE_INSPECTOR_STRINGS[key].replace(/\{(\w+)\}/g, (_, name: string) =>
        String(params[name]),
    );

const LINE: ShapeRow = {
    kind: "line",
    geometry: {
        points: [
            [0, 0],
            [10, 0],
        ],
    },
};
const FREEHAND: ShapeRow = {
    kind: "freehand",
    geometry: {
        points: [
            [0, 0],
            [4, 4],
        ],
    },
};
const CIRCLE: ShapeRow = {
    kind: "circle",
    geometry: { center: [5, 5], radius: 3, start_angle: 0, clockwise: false },
};
const BLOCK: ShapeRow = {
    kind: "block",
    geometry: { origin: [0, 0], rows: 2, cols: 3, spacing: [2, 2] },
};
const BOX: ShapeRow = {
    kind: "box",
    geometry: { origin: [1, 2], width: 8, height: 4 },
};

const SHAPES: Record<number, ShapeRow> = {
    1: LINE,
    2: BLOCK,
    3: BOX,
    4: CIRCLE,
    5: FREEHAND,
};
const NAMES = [{ id: 1, name: "Opener" }];

const transition = (over: Partial<TransitionRow>): TransitionRow => ({
    id: 7,
    start: 0,
    end: 8,
    dest: 1,
    slots: 2,
    style: "direct",
    order: "inherit",
    params: null,
    ...over,
});

/** Transition 7 follows the leader into the line; 8 moves 5 marchers into the block. */
const TRANSITIONS: Record<number, TransitionRow> = {
    7: transition({ style: "follow_the_leader", params: { waypoints: [] } }),
    8: transition({ id: 8, dest: 2, slots: 5 }),
};

const editor = ({
    version = 1,
    shapes = SHAPES,
    selected = [] as number[],
}: {
    version?: number;
    shapes?: Record<number, ShapeRow>;
    selected?: number[];
} = {}) => (
    <TimelineShapesEditor
        shapes={buildShapeEditTargets(shapes, NAMES, TRANSITIONS, version)}
        version={version}
        selectedMarcherIds={selected}
        beat={16}
        frame={FRAME}
        database={db}
        t={t}
    />
);

const show = (...args: Parameters<typeof editor>) => render(editor(...args));

const group = (label: string) => screen.getByRole("group", { name: label });
const option = (groupLabel: string, name: string) =>
    within(group(groupLabel)).getByRole("radio", { name });

const click = async (el: HTMLElement) => {
    await act(async () => {
        fireEvent.click(el);
    });
};

/** Types into a number field and commits it with Enter. */
const commit = async (label: string, value: string) => {
    const input = screen.getByRole("spinbutton", { name: label });
    fireEvent.change(input, { target: { value } });
    await act(async () => {
        fireEvent.keyDown(input, { key: "Enter" });
    });
};

/** Opens the `index`th select (0: the new shape's kind, 1: the shape to edit) and picks `name`. */
const pick = async (index: number, name: string) => {
    await act(async () => {
        fireEvent.keyDown(screen.getAllByRole("combobox")[index]!, {
            key: "Enter",
        });
    });
    const item = await screen.findByRole("option", { name });
    await act(async () => {
        fireEvent.keyDown(item, { key: "Enter" });
    });
};

const editShape = (name: string) => pick(1, name);

beforeAll(() => {
    // Radix Select uses these, which jsdom lacks
    Element.prototype.scrollIntoView ??= vi.fn();
    Element.prototype.hasPointerCapture ??= vi.fn(() => false);
    Element.prototype.releasePointerCapture ??= vi.fn();
});
afterEach(cleanup);
beforeEach(() => {
    mocks.create.mockReset().mockResolvedValue({ id: 9 });
    mocks.update.mockReset().mockResolvedValue({});
    mocks.remove.mockReset().mockResolvedValue(undefined);
    mocks.toast.mockReset();
    mocks.warning.mockReset();
    mocks.settled.mockReset().mockResolvedValue(undefined);
    mocks.positions = {};
    mocks.positionAt
        .mockReset()
        .mockImplementation((id: number) => mocks.positions[id]);
});

describe("picking", () => {
    it("lists every shape by name or id and kind, and shows none until one is picked", async () => {
        show();
        expect(screen.queryByTestId(/^timeline-shape-editor-/)).toBeNull();
        await act(async () => {
            fireEvent.keyDown(screen.getAllByRole("combobox")[1]!, {
                key: "Enter",
            });
        });
        const names = (await screen.findAllByRole("option")).map(
            (o) => o.textContent,
        );
        expect(names).toEqual([
            "Opener (Line)",
            "Shape 2 (Block)",
            "Shape 3 (Box)",
            "Shape 4 (Circle)",
            "Shape 5 (Freehand)",
        ]);
    });

    it("says there are no shapes yet", () => {
        show({ shapes: {} });
        expect(screen.getByText("No shapes yet.")).toBeTruthy();
        expect(screen.getAllByRole("combobox")).toHaveLength(1);
    });
});

describe("create", () => {
    it("draws a new shape through the selected marchers at the page's end beat", async () => {
        mocks.positions = {
            11: [0, 0],
            12: [20, 10],
            13: [5, 30],
        };
        show({ selected: [11, 12, 13, 99] });
        await pick(0, "Box");
        await click(screen.getByTestId("timeline-shape-create"));
        await waitFor(() =>
            expect(mocks.create).toHaveBeenCalledWith({
                db,
                newShape: {
                    kind: "box",
                    geometry: { origin: [0, 0], width: 20, height: 30 },
                },
            }),
        );
        // Positions were read after earlier writes settled, at the page's end beat
        expect(mocks.settled).toHaveBeenCalled();
        expect(mocks.positionAt).toHaveBeenCalledWith(11, 16);
        expect(mocks.positionAt).not.toHaveBeenCalledWith(99, 16);
    });

    it("with nobody selected, a new line goes across the field's middle", async () => {
        show();
        await click(screen.getByTestId("timeline-shape-create"));
        await waitFor(() =>
            expect(mocks.create).toHaveBeenCalledWith({
                db,
                newShape: {
                    kind: "line",
                    geometry: {
                        points: [
                            [92, 50],
                            [108, 50],
                        ],
                    },
                },
            }),
        );
    });

    it("a double click on New shape creates one shape", async () => {
        let finish: (row: { id: number }) => void = () => {};
        mocks.create.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                }),
        );
        const { rerender } = show();
        const button = () => screen.getByTestId("timeline-shape-create");
        await act(async () => {
            fireEvent.click(button());
            fireEvent.click(button());
        });
        await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
        // The store moves on (the create's batch, or another edit) before the call returns: a
        // second click still does nothing while the first is in flight
        rerender(editor({ version: 2 }));
        await click(button());
        expect(mocks.create).toHaveBeenCalledTimes(1);
        await act(async () => {
            finish({ id: 9 });
        });
        // Once it has returned, the next version's shapes allow a new one
        rerender(editor({ version: 3, shapes: { ...SHAPES, 9: BOX } }));
        await click(button());
        await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    });

    it("refuses, with a toast, when the selected marchers aren't in the timeline", async () => {
        mocks.positions = { 11: [0, 0] };
        show({ selected: [21, 22] });
        await click(screen.getByTestId("timeline-shape-create"));
        await waitFor(() => expect(mocks.toast).toHaveBeenCalledTimes(1));
        const error = mocks.toast.mock.calls[0]![0] as TimelineWriteError;
        expect(error).toBeInstanceOf(TimelineWriteError);
        expect(error.code).toBe("E-ARGS");
        expect(error.message).toBe(
            `E-ARGS: ${TIMELINE_INSPECTOR_STRINGS["inspector.timeline.shapes.noPositions"]}`,
        );
        expect(mocks.create).not.toHaveBeenCalled();
        // Nothing was written, so it can be tried again
        expect(
            screen
                .getByTestId("timeline-shape-create")
                .hasAttribute("disabled"),
        ).toBe(false);
    });

    it("picks the new shape once it arrives", async () => {
        const { rerender } = show();
        await click(screen.getByTestId("timeline-shape-create"));
        await waitFor(() => expect(mocks.create).toHaveBeenCalled());
        rerender(editor({ version: 2, shapes: { ...SHAPES, 9: BOX } }));
        expect(screen.getByTestId("timeline-shape-editor-9")).toBeTruthy();
    });
});

describe("editing", () => {
    it("renames on Enter, and a blur with the text unchanged writes nothing", async () => {
        show();
        await editShape("Opener (Line)");
        const name = screen.getByTestId("timeline-shape-name");
        expect((name as HTMLInputElement).value).toBe("Opener");
        await act(async () => {
            fireEvent.blur(name);
        });
        expect(mocks.update).not.toHaveBeenCalled();
        fireEvent.change(name, { target: { value: "Company front" } });
        await act(async () => {
            fireEvent.keyDown(name, { key: "Enter" });
        });
        expect(mocks.update).toHaveBeenCalledWith({
            db,
            modified: { id: 1, name: "Company front" },
        });
    });

    it("moves a line's end", async () => {
        show();
        await editShape("Opener (Line)");
        await commit("End x", "25");
        expect(mocks.update).toHaveBeenCalledWith({
            db,
            modified: {
                id: 1,
                geometry: {
                    points: [
                        [0, 0],
                        [25, 0],
                    ],
                },
            },
        });
    });

    it("a circle's start angle is typed in degrees and stored in radians", async () => {
        show();
        await editShape("Shape 4 (Circle)");
        await commit("Start angle (degrees)", "90");
        expect(mocks.update).toHaveBeenCalledWith({
            db,
            modified: {
                id: 4,
                geometry: { ...CIRCLE.geometry, start_angle: Math.PI / 2 },
            },
        });
        await click(option("Direction", "Clockwise"));
    });

    it("a freehand path keeps at least two points, and says so", async () => {
        show();
        await editShape("Shape 5 (Freehand)");
        expect(
            screen
                .getByRole("button", { name: "Remove point 1" })
                .hasAttribute("disabled"),
        ).toBe(true);
        expect(
            screen.getByTestId("timeline-shape-points-min").textContent,
        ).toBe("A freehand path needs at least two points.");
        await click(screen.getByRole("button", { name: "Add point" }));
        expect(mocks.update).toHaveBeenCalledWith({
            db,
            modified: {
                id: 5,
                geometry: {
                    points: [
                        [0, 0],
                        [4, 4],
                        [8, 8],
                    ],
                },
            },
        });
    });

    it("changes the kind, redrawing it over the same ground", async () => {
        show();
        await editShape("Shape 3 (Box)");
        await click(option("Kind", "Circle"));
        expect(mocks.update).toHaveBeenCalledWith({
            db,
            modified: {
                id: 3,
                kind: "circle",
                geometry: {
                    center: [5, 4],
                    radius: 4,
                    start_angle: 0,
                    clockwise: false,
                },
            },
        });
    });

    it("says a kind change re-spreads the slots of the transitions using the shape", async () => {
        show();
        await editShape("Shape 2 (Block)");
        expect(
            screen.getByTestId("timeline-shape-kind-in-use").textContent,
        ).toBe(
            "Transitions 8 use this shape. Changing its kind spreads their slots over the new shape, so their marchers end in new places.",
        );
        await editShape("Shape 3 (Box)");
        expect(screen.queryByTestId("timeline-shape-kind-in-use")).toBeNull();
    });

    it("a shape a follow-the-leader move ends in can't become a block, and says why (I-T3)", async () => {
        show();
        await editShape("Opener (Line)");
        expect(option("Kind", "Block").hasAttribute("disabled")).toBe(true);
        expect(screen.getByTestId("timeline-shape-no-block").textContent).toBe(
            "It can't become a block: transition 7 follows the leader into it, and a trail can't end on a block.",
        );
        expect(option("Kind", "Circle").hasAttribute("disabled")).toBe(false);
    });

    it("a block names the slots it must hold, and fewer rows go to the database, whose refusal is shown", async () => {
        const refusal = new TimelineWriteError(
            "E-T3/E-T4",
            "E-T3/E-T4: shape change invalidates a transition using it",
        );
        mocks.update.mockRejectedValueOnce(refusal);
        show();
        await editShape("Shape 2 (Block)");
        expect(screen.getByTestId("timeline-shape-cells").textContent).toBe(
            "2 × 3 = 6 places, filled row by row from the origin.",
        );
        expect(
            screen.getByTestId("timeline-shape-cells-needed").textContent,
        ).toBe(
            "Transition 8 has 5 slots, so the block needs at least 5 places.",
        );
        await commit("Rows", "1");
        expect(mocks.update).toHaveBeenCalledWith({
            db,
            modified: { id: 2, geometry: { ...BLOCK.geometry, rows: 1 } },
        });
        await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(refusal));
        // Nothing was written, so the controls are usable again
        expect(
            screen
                .getByRole("spinbutton", { name: "Rows" })
                .hasAttribute("disabled"),
        ).toBe(false);
    });

    it("an unchanged number writes nothing", async () => {
        show();
        await editShape("Shape 3 (Box)");
        await commit("Width", "8");
        expect(mocks.update).not.toHaveBeenCalled();
    });
});

describe("delete", () => {
    it("a shape in use can't be deleted, and says why (I-D1)", async () => {
        show();
        await editShape("Shape 2 (Block)");
        expect(
            screen
                .getByRole("button", { name: "Delete shape" })
                .hasAttribute("disabled"),
        ).toBe(true);
        expect(
            screen.getByTestId("timeline-shape-delete-blocker").textContent,
        ).toBe(
            "It can't be deleted while transitions 8 use it. Give them another destination first.",
        );
    });

    it("deletes an unused shape", async () => {
        show();
        await editShape("Shape 3 (Box)");
        await click(screen.getByRole("button", { name: "Delete shape" }));
        expect(mocks.remove).toHaveBeenCalledWith({ db, shapeId: 3 });
    });
});

describe("stale plans", () => {
    it("after an edit, waits for a newer store version; a rebuild at the same version doesn't count", async () => {
        const { rerender } = show();
        await editShape("Shape 3 (Box)");
        await commit("Width", "10");
        expect(mocks.update).toHaveBeenCalledTimes(1);
        const width = () => screen.getByRole("spinbutton", { name: "Width" });
        expect(width().hasAttribute("disabled")).toBe(true);
        // A rebuild from the same rows: still the shape before the edit
        rerender(editor({ version: 1 }));
        expect(width().hasAttribute("disabled")).toBe(true);
        await commit("Height", "6");
        expect(mocks.update).toHaveBeenCalledTimes(1);
        // The edit's rows arrive
        rerender(
            editor({
                version: 2,
                shapes: {
                    ...SHAPES,
                    3: {
                        kind: "box",
                        geometry: { ...BOX.geometry, width: 10 },
                    },
                },
            }),
        );
        expect(width().hasAttribute("disabled")).toBe(false);
        await commit("Height", "6");
        expect(mocks.update).toHaveBeenLastCalledWith({
            db,
            modified: {
                id: 3,
                geometry: { origin: [1, 2], width: 10, height: 6 },
            },
        });
    });
});

describe("the canvas link (P7.11)", () => {
    const canvasState = () => useTimelineShapeCanvasStore.getState();
    const dragTo = async (shape: ShapeRow) => {
        let result: string | undefined;
        await act(async () => {
            result = canvasState().commit!(shape);
        });
        return result;
    };
    const moved: ShapeRow = {
        kind: "box",
        geometry: { origin: [3, 4], width: 8, height: 4 },
    };

    it("publishes the picked shape, and nothing before a pick or after unmount", async () => {
        const { unmount } = show();
        expect(canvasState().target).toBeNull();
        expect(canvasState().commit).toBeNull();
        await editShape("Shape 3 (Box)");
        expect(canvasState().target?.id).toBe(3);
        expect(canvasState().target?.shape).toEqual(BOX);
        expect(canvasState().pending).toBe(false);
        expect(screen.getByTestId("timeline-shape-canvas-help")).toBeTruthy();
        unmount();
        expect(canvasState().target).toBeNull();
        expect(canvasState().commit).toBeNull();
    });

    it("a drag commits one geometry edit, then waits for a newer version like a typed one", async () => {
        const { rerender } = show();
        await editShape("Shape 3 (Box)");
        expect(await dragTo(moved)).toBe("started");
        expect(mocks.update).toHaveBeenCalledTimes(1);
        expect(mocks.update).toHaveBeenCalledWith({
            db,
            modified: { id: 3, geometry: moved.geometry },
        });
        expect(canvasState().pending).toBe(true);
        // The picker waits too, so nothing else is picked mid-edit
        expect(
            screen.getAllByRole("combobox")[1]!.hasAttribute("disabled"),
        ).toBe(true);
        // A second drag before the edit's rows arrive plans nothing, and says so
        expect(
            await dragTo({
                kind: "box",
                geometry: { origin: [5, 5], width: 8, height: 4 },
            }),
        ).toBe("busy");
        expect(mocks.update).toHaveBeenCalledTimes(1);
        expect(mocks.warning).toHaveBeenCalledWith(
            TIMELINE_INSPECTOR_STRINGS["inspector.timeline.shapes.dragDropped"],
        );
        rerender(editor({ version: 2, shapes: { ...SHAPES, 3: moved } }));
        expect(canvasState().pending).toBe(false);
        expect(canvasState().target?.shape).toEqual(moved);
    });

    it("a drag that ends where it started writes nothing", async () => {
        show();
        await editShape("Shape 3 (Box)");
        expect(await dragTo(BOX)).toBe("unchanged");
        expect(mocks.update).not.toHaveBeenCalled();
        expect(canvasState().pending).toBe(false);
        expect(mocks.warning).not.toHaveBeenCalled();
    });

    it("a drag of a shape drawn as another kind writes nothing", async () => {
        show();
        await editShape("Shape 3 (Box)");
        expect(await dragTo(LINE)).toBe("unchanged");
        expect(mocks.update).not.toHaveBeenCalled();
    });

    it("a drag released while a typed change is being saved is dropped, and says so", async () => {
        let finish: () => void = () => {};
        mocks.update.mockImplementationOnce(
            () => new Promise<void>((resolve) => (finish = resolve)),
        );
        show();
        await editShape("Shape 3 (Box)");
        await commit("Width", "10");
        expect(mocks.update).toHaveBeenCalledTimes(1);
        expect(await dragTo(moved)).toBe("busy");
        expect(mocks.update).toHaveBeenCalledTimes(1);
        expect(mocks.warning).toHaveBeenCalledTimes(1);
        await act(async () => finish());
    });

    it("a refused drag is toasted and the shape can be dragged again", async () => {
        const refusal = new TimelineWriteError("E-S1", "box geometry");
        mocks.update.mockRejectedValueOnce(refusal);
        show();
        await editShape("Shape 3 (Box)");
        await dragTo({
            kind: "box",
            geometry: { origin: [1, 2], width: -8, height: 4 },
        });
        expect(mocks.toast).toHaveBeenCalledWith(refusal);
        expect(canvasState().pending).toBe(false);
        await dragTo(moved);
        expect(mocks.update).toHaveBeenCalledTimes(2);
    });
});
