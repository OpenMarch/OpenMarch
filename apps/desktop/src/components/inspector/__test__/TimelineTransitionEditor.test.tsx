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
import type { ShapeRow, TransitionRow, XY } from "@openmarch/core";
import type { DbConnection } from "@/db-functions/types";
import { TimelineWriteError } from "@/db-functions/timelineErrors";
import {
    buildTransitionEditTarget,
    DEFAULT_BULGE,
    type TransitionShapeOption,
} from "@/timeline/timelineTransitionEditor";
import { TIMELINE_INSPECTOR_STRINGS } from "../timelineInspectorStrings";
import { TimelineTransitionEditor } from "../TimelineTransitionEditor";

/**
 * P8.3: each control of the inspector's transition editor shows the stored value, sends one
 * db-function call with the right payload, skips a change that writes nothing, and toasts a
 * refusal.
 */

const mocks = vi.hoisted(() => ({
    update: vi.fn(),
    destination: vi.fn(),
    toast: vi.fn(),
}));

vi.mock("@/db-functions/timelineTransitions", () => ({
    updateTimelineTransition: mocks.update,
    setTimelineTransitionDestination: mocks.destination,
}));
vi.mock("@/timeline/timelineErrorMessages", () => ({
    toastTimelineError: mocks.toast,
}));

const db = { name: "test-db" } as unknown as DbConnection;

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
const BLOCK: ShapeRow = {
    kind: "block",
    geometry: { origin: [0, 0], rows: 2, cols: 2, spacing: [2, 2] },
};
const SHAPES: TransitionShapeOption[] = [
    { id: 1, name: "Opener line", kind: "line", capacity: null },
    { id: 2, name: null, kind: "block", capacity: 4 },
];

const row = (over: Partial<TransitionRow> = {}): TransitionRow => ({
    id: 7,
    start: 0,
    end: 8,
    dest: 1,
    slots: 3,
    style: "direct",
    order: "inherit",
    params: null,
    ...over,
});

/** The editor for transition 7 as `over` describes it; a new target object each call. */
const editor = (
    over: Partial<TransitionRow> = {},
    { slotsTaken = [0], shapes = SHAPES } = {},
) => {
    const target = buildTransitionEditTarget(7, {
        transitions: { 7: row(over) },
        shapes: { 1: LINE, 2: BLOCK },
        assignments: slotsTaken.map((slot, i) => ({
            id: i + 1,
            marcher: i + 1,
            transition: 7,
            slot,
            start: 0,
            end: 8,
            layer: 0,
        })),
    })!;
    return (
        <TimelineTransitionEditor
            target={target}
            shapes={shapes}
            database={db}
            t={t}
        />
    );
};

const show = (...args: Parameters<typeof editor>) => render(editor(...args));

const group = (label: string) => screen.getByRole("group", { name: label });
const option = (groupLabel: string, name: string) =>
    within(group(groupLabel)).getByRole("radio", { name });
const pressed = (groupLabel: string) =>
    within(group(groupLabel))
        .getAllByRole("radio")
        .filter((el) => el.getAttribute("data-state") === "on")
        .map((el) => el.textContent);

/** Types into a number field and commits it with Enter. */
const commit = async (label: string, value: string) => {
    const input = screen.getByRole("spinbutton", { name: label });
    fireEvent.change(input, { target: { value } });
    await act(async () => {
        fireEvent.keyDown(input, { key: "Enter" });
    });
};

const click = async (el: HTMLElement) => {
    await act(async () => {
        fireEvent.click(el);
    });
};

beforeAll(() => {
    // Radix Select uses these, which jsdom lacks
    Element.prototype.scrollIntoView ??= vi.fn();
    Element.prototype.hasPointerCapture ??= vi.fn(() => false);
    Element.prototype.releasePointerCapture ??= vi.fn();
    // Radix Slider measures its thumb
    globalThis.ResizeObserver ??= class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
});
afterEach(cleanup);
beforeEach(() => {
    mocks.update.mockReset().mockResolvedValue({});
    mocks.destination.mockReset().mockResolvedValue({});
    mocks.toast.mockReset();
});

describe("rendering", () => {
    it("shows the stored style, order mode, destination and slot count", () => {
        show({ style: "arc", params: { bulge: -0.3 }, order: "slot" });
        expect(pressed("Path style")).toEqual(["Arc"]);
        expect(pressed("Order mode")).toEqual(["Slot order"]);
        expect(pressed("Destination")).toEqual(["Shape"]);
        expect(
            (
                screen.getByRole("spinbutton", {
                    name: "Bulge value",
                }) as HTMLInputElement
            ).value,
        ).toBe("-0.3");
        expect(
            (
                screen.getByRole("spinbutton", {
                    name: "Slots",
                }) as HTMLInputElement
            ).value,
        ).toBe("3");
        expect(screen.getByRole("combobox").textContent).toContain(
            "Opener line (line)",
        );
        expect(screen.getByText("Edit transition 7")).toBeTruthy();
        expect(screen.queryByText("Add waypoint")).toBeNull();
    });

    it("shows follow-the-leader waypoints", () => {
        show({
            style: "follow_the_leader",
            params: {
                waypoints: [
                    [1, 2],
                    [3, 4],
                ],
            },
        });
        expect(
            (
                screen.getByRole("spinbutton", {
                    name: "Waypoint 2 y",
                }) as HTMLInputElement
            ).value,
        ).toBe("4");
        expect(
            screen.queryByRole("spinbutton", { name: "Bulge value" }),
        ).toBeNull();
    });
});

describe("path style", () => {
    it("a style change is one update with the new style's parameters", async () => {
        show();
        await click(option("Path style", "Arc"));
        expect(mocks.update).toHaveBeenCalledTimes(1);
        expect(mocks.update).toHaveBeenCalledWith({
            db,
            modified: {
                id: 7,
                pathStyle: "arc",
                pathParams: { bulge: DEFAULT_BULGE },
            },
        });
    });

    it("clicking the current style writes nothing", async () => {
        show();
        await click(option("Path style", "Direct"));
        expect(mocks.update).not.toHaveBeenCalled();
    });

    it("follow the leader is disabled without a shape, and says why (I-T5)", () => {
        show({
            dest: null,
            points: [
                [0, 0],
                [1, 1],
                [2, 2],
            ],
        });
        expect(
            option("Path style", "Follow the leader").hasAttribute("disabled"),
        ).toBe(true);
        expect(
            screen.getByTestId("timeline-edit-ftl-blocker").textContent,
        ).toBe(
            TIMELINE_INSPECTOR_STRINGS["inspector.timeline.edit.ftlNeedsShape"],
        );
    });

    it("follow the leader is disabled for a block destination (I-T3)", () => {
        show({ dest: 2 });
        expect(
            option("Path style", "Follow the leader").hasAttribute("disabled"),
        ).toBe(true);
        expect(
            screen.getByTestId("timeline-edit-ftl-blocker").textContent,
        ).toBe(
            TIMELINE_INSPECTOR_STRINGS["inspector.timeline.edit.ftlNotBlock"],
        );
    });

    it("follow the leader is enabled with a path shape", async () => {
        show();
        expect(screen.queryByTestId("timeline-edit-ftl-blocker")).toBeNull();
        await click(option("Path style", "Follow the leader"));
        expect(mocks.update).toHaveBeenCalledWith({
            db,
            modified: {
                id: 7,
                pathStyle: "follow_the_leader",
                pathParams: { waypoints: [] },
            },
        });
    });

    it("a refusal is toasted with its friendly message", async () => {
        const error = new TimelineWriteError("E-P1", "path parameters");
        mocks.update.mockRejectedValueOnce(error);
        show();
        await click(option("Path style", "Arc"));
        expect(mocks.toast).toHaveBeenCalledWith(error);
    });
});

describe("bulge", () => {
    it("is clamped to ±½ and explains why larger arcs aren't supported (D-15)", async () => {
        show({ style: "arc", params: { bulge: 0.1 } });
        expect(
            screen.getByTestId("timeline-edit-bulge-help").textContent,
        ).toContain("Larger arcs aren't supported");
        await commit("Bulge value", "2");
        expect(mocks.update).toHaveBeenLastCalledWith({
            db,
            modified: { id: 7, pathParams: { bulge: 0.5 } },
        });
        cleanup();
        show({ style: "arc", params: { bulge: 0.1 } });
        await commit("Bulge value", "-0.75");
        expect(mocks.update).toHaveBeenLastCalledWith({
            db,
            modified: { id: 7, pathParams: { bulge: -0.5 } },
        });
        const slider = screen.getByRole("slider");
        expect(slider.getAttribute("aria-valuemin")).toBe("-0.5");
        expect(slider.getAttribute("aria-valuemax")).toBe("0.5");
    });

    it("the same value, or text that isn't a number, writes nothing", async () => {
        show({ style: "arc", params: { bulge: 0.1 } });
        await commit("Bulge value", "0.1");
        await commit("Bulge value", "abc");
        expect(mocks.update).not.toHaveBeenCalled();
    });

    it("focusing and leaving a non-round value writes nothing (the shown value is rounded)", async () => {
        show({ style: "arc", params: { bulge: 0.1234 } });
        const input = screen.getByRole("spinbutton", { name: "Bulge value" });
        expect((input as HTMLInputElement).value).toBe("0.123");
        await act(async () => {
            fireEvent.focus(input);
            fireEvent.blur(input);
        });
        await act(async () => {
            fireEvent.keyDown(input, { key: "Enter" });
        });
        expect(mocks.update).not.toHaveBeenCalled();
        // A real change still commits
        await commit("Bulge value", "0.2");
        expect(mocks.update).toHaveBeenCalledWith({
            db,
            modified: { id: 7, pathParams: { bulge: 0.2 } },
        });
    });

    it("the slider commits one edit when released", async () => {
        show({ style: "arc", params: { bulge: 0.1 } });
        await act(async () => {
            fireEvent.keyDown(screen.getByRole("slider"), {
                key: "ArrowRight",
            });
        });
        expect(mocks.update).toHaveBeenCalledTimes(1);
        const { modified } = mocks.update.mock.calls[0]![0] as {
            modified: { pathParams: { bulge: number } };
        };
        expect(modified.pathParams.bulge).toBeCloseTo(0.15, 9);
    });
});

describe("waypoints", () => {
    const ftl = () =>
        show({
            style: "follow_the_leader",
            params: {
                waypoints: [
                    [1, 2],
                    [3, 4],
                ],
            },
        });
    const lastWaypoints = () =>
        (
            mocks.update.mock.lastCall![0] as {
                modified: { pathParams: { waypoints: unknown } };
            }
        ).modified.pathParams.waypoints;

    it("adds one at the last waypoint", async () => {
        ftl();
        await click(screen.getByRole("button", { name: "Add waypoint" }));
        expect(lastWaypoints()).toEqual([
            [1, 2],
            [3, 4],
            [3, 4],
        ]);
    });

    it("removes and reorders", async () => {
        ftl();
        await click(screen.getByRole("button", { name: "Remove waypoint 1" }));
        expect(lastWaypoints()).toEqual([[3, 4]]);
        cleanup();
        ftl();
        await click(screen.getByRole("button", { name: "Move waypoint 2 up" }));
        expect(lastWaypoints()).toEqual([
            [3, 4],
            [1, 2],
        ]);
        expect(
            screen
                .getByRole("button", { name: "Move waypoint 1 up" })
                .hasAttribute("disabled"),
        ).toBe(true);
    });

    it("two quick edits: the second waits for the first to show, so it can't undo it", async () => {
        const three = {
            style: "follow_the_leader" as const,
            params: {
                waypoints: [
                    [1, 2],
                    [3, 4],
                    [5, 6],
                ] as XY[],
            },
        };
        const { rerender } = show(three);
        await click(screen.getByRole("button", { name: "Remove waypoint 2" }));
        expect(lastWaypoints()).toEqual([
            [1, 2],
            [5, 6],
        ]);
        // The edit landed, but the inspector still shows the old list: nothing is planned from it
        await click(screen.getByRole("button", { name: "Remove waypoint 3" }));
        await click(screen.getByRole("button", { name: "Add waypoint" }));
        expect(mocks.update).toHaveBeenCalledTimes(1);
        expect(
            screen
                .getByRole("button", { name: "Add waypoint" })
                .hasAttribute("disabled"),
        ).toBe(true);
        // The rebuilt target arrives; the next edit is planned from it
        rerender(
            editor({
                ...three,
                params: {
                    waypoints: [
                        [1, 2],
                        [5, 6],
                    ],
                },
            }),
        );
        await click(screen.getByRole("button", { name: "Remove waypoint 2" }));
        expect(mocks.update).toHaveBeenCalledTimes(2);
        expect(lastWaypoints()).toEqual([[1, 2]]);
    });

    it("after a refusal, the controls work again at once", async () => {
        mocks.update.mockRejectedValueOnce(
            new TimelineWriteError("E-P1", "waypoints"),
        );
        ftl();
        await click(screen.getByRole("button", { name: "Remove waypoint 1" }));
        expect(mocks.toast).toHaveBeenCalledTimes(1);
        await click(screen.getByRole("button", { name: "Remove waypoint 1" }));
        expect(mocks.update).toHaveBeenCalledTimes(2);
    });

    it("edits a coordinate, and the same value writes nothing", async () => {
        ftl();
        await commit("Waypoint 1 x", "1");
        expect(mocks.update).not.toHaveBeenCalled();
        await commit("Waypoint 1 x", "-5");
        expect(lastWaypoints()).toEqual([
            [-5, 2],
            [3, 4],
        ]);
    });
});

describe("order mode", () => {
    it("switches between inherit and slot, with a one-line explanation", async () => {
        show();
        expect(
            screen.getByText(
                TIMELINE_INSPECTOR_STRINGS[
                    "inspector.timeline.edit.orderInheritHelp"
                ],
            ),
        ).toBeTruthy();
        await click(option("Order mode", "Slot order"));
        expect(mocks.update).toHaveBeenCalledWith({
            db,
            modified: { id: 7, orderMode: "slot" },
        });
        await click(option("Order mode", "Inherit the upstream order"));
        expect(mocks.update).toHaveBeenCalledTimes(1);
    });
});

describe("destination", () => {
    it("switching to individual points copies the shape's samples (D-16)", async () => {
        show();
        await click(option("Destination", "Individual points"));
        expect(mocks.destination).toHaveBeenCalledWith({
            db,
            transitionId: 7,
            destination: {
                kind: "individual",
                points: [
                    [0, 0],
                    [5, 0],
                    [10, 0],
                ],
            },
        });
    });

    it("individual points are disabled for follow the leader, and say why", () => {
        show({ style: "follow_the_leader", params: { waypoints: [] } });
        expect(
            option("Destination", "Individual points").hasAttribute("disabled"),
        ).toBe(true);
        expect(screen.getByTestId("timeline-edit-individual-ftl")).toBeTruthy();
    });

    it("picking a shape sets it; picking the current one writes nothing", async () => {
        show({
            dest: null,
            points: [
                [0, 0],
                [1, 1],
                [2, 2],
            ],
        });
        expect(pressed("Destination")).toEqual(["Individual points"]);
        const pick = async (name: string) => {
            await act(async () => {
                fireEvent.keyDown(screen.getByRole("combobox"), {
                    key: "Enter",
                });
            });
            const item = await screen.findByRole("option", { name });
            await act(async () => {
                fireEvent.keyDown(item, { key: "Enter" });
            });
        };
        await pick("Shape 2 (block)");
        await waitFor(() =>
            expect(mocks.destination).toHaveBeenCalledWith({
                db,
                transitionId: 7,
                destination: { kind: "shape", shapeId: 2 },
            }),
        );
    });

    it("the picker disables the shapes the database would refuse, and says why", async () => {
        const open = async () => {
            await act(async () => {
                fireEvent.keyDown(screen.getByRole("combobox"), {
                    key: "Enter",
                });
            });
        };
        // A 2x2 block holds 4: too small for 5 slots (E-T4)
        show({ slots: 5 });
        await open();
        const small = await screen.findByRole("option", {
            name: "Shape 2 (block): holds only 4 of 5 slots",
        });
        expect(small.getAttribute("aria-disabled")).toBe("true");
        expect(
            screen
                .getByRole("option", { name: "Opener line (line)" })
                .getAttribute("aria-disabled"),
        ).not.toBe("true");
        cleanup();
        // Follow the leader can't end in a block (E-T3)
        show({ style: "follow_the_leader", params: { waypoints: [] } });
        await open();
        const ftlBlock = await screen.findByRole("option", {
            name: "Shape 2 (block): follow the leader can't end in a block",
        });
        expect(ftlBlock.getAttribute("aria-disabled")).toBe("true");
        await act(async () => {
            fireEvent.keyDown(ftlBlock, { key: "Enter" });
        });
        expect(mocks.destination).not.toHaveBeenCalled();
    });

    it("says so when there are no shapes to pick", () => {
        show({}, { shapes: [] });
        expect(
            screen.getByText(
                TIMELINE_INSPECTOR_STRINGS["inspector.timeline.edit.noShapes"],
            ),
        ).toBeTruthy();
    });
});

describe("slot count", () => {
    it("a shape transition changes only its slot count", async () => {
        show();
        await commit("Slots", "5");
        expect(mocks.update).toHaveBeenCalledWith({
            db,
            modified: { id: 7, slotCount: 5 },
        });
    });

    it("can't go below an occupied slot, and says which", async () => {
        show({ slots: 4 }, { slotsTaken: [0, 2] });
        expect(screen.getByTestId("timeline-edit-slot-min").textContent).toBe(
            "At least 3, because slot 2 has a marcher assigned.",
        );
        await commit("Slots", "1");
        expect(mocks.update).toHaveBeenCalledWith({
            db,
            modified: { id: 7, slotCount: 3 },
        });
    });

    it("is capped at 10000 (I-N2)", async () => {
        show();
        await commit("Slots", "1000000000");
        expect(mocks.update).toHaveBeenCalledWith({
            db,
            modified: { id: 7, slotCount: 10000 },
        });
    });

    it("the same count writes nothing", async () => {
        show();
        await commit("Slots", "3");
        expect(mocks.update).not.toHaveBeenCalled();
    });

    it("a shapeless transition gets a point for each new slot, at the last point", async () => {
        show({
            dest: null,
            points: [
                [0, 0],
                [1, 1],
                [2, 2],
            ],
        });
        await commit("Slots", "4");
        expect(mocks.update).toHaveBeenCalledWith({
            db,
            modified: {
                id: 7,
                slotCount: 4,
                points: [
                    [0, 0],
                    [1, 1],
                    [2, 2],
                    [2, 2],
                ],
            },
        });
    });

    it("a refused slot count is toasted", async () => {
        const error = new TimelineWriteError("E-T4", "block too small");
        mocks.update.mockRejectedValueOnce(error);
        show({ dest: 2 });
        await commit("Slots", "9");
        expect(mocks.toast).toHaveBeenCalledWith(error);
    });
});
