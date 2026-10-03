import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssignmentRow, SpanInfo, TransitionRow } from "@openmarch/core";
import type { DbConnection } from "@/db-functions/types";
import { TimelineWriteError } from "@/db-functions/timelineErrors";
import { buildAssignmentEditTarget } from "@/timeline/timelineAssignmentEditor";
import { MAX_CAST_SLOTS } from "@/timeline/timelineCasting";
import { TIMELINE_INSPECTOR_STRINGS } from "../timelineInspectorStrings";
import {
    MAX_LISTED_VACANT_SLOTS,
    TimelineAssignmentsEditor,
} from "../TimelineAssignmentsEditor";

/**
 * P8.4: the inspector's assignments editor shows the slots, the vacancies and the steals, sends
 * one db-function call per change, skips a change that writes nothing, says why a disabled action
 * is disabled, waits for a newer store version after an edit, and toasts a refusal.
 */

const mocks = vi.hoisted(() => ({
    cast: vi.fn(),
    recast: vi.fn(),
    slot: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    toast: vi.fn(),
    info: vi.fn(),
}));

vi.mock("@/db-functions/timelineAssignmentEdits", () => ({
    castMarchersIntoTransition: mocks.cast,
    recastTransition: mocks.recast,
    setAssignmentSlot: mocks.slot,
    updateAssignment: mocks.update,
}));
// The inspector's remove is UI-9's (P8.14)
vi.mock("@/db-functions/timelineMembership", () => ({
    removeAssignmentFromTimeline: mocks.remove,
}));
vi.mock("@/timeline/timelineErrorMessages", () => ({
    toastTimelineError: mocks.toast,
}));
vi.mock("sonner", () => ({ toast: { info: mocks.info } }));

const db = { name: "test-db" } as unknown as DbConnection;

const t = (
    key: keyof typeof TIMELINE_INSPECTOR_STRINGS,
    params: Record<string, string | number> = {},
) =>
    TIMELINE_INSPECTOR_STRINGS[key].replace(/\{(\w+)\}/g, (_, name: string) =>
        String(params[name]),
    );

const TRANSITION: TransitionRow = {
    id: 7,
    start: 0,
    end: 8,
    dest: 1,
    slots: 4,
    style: "direct",
    order: "inherit",
    params: null,
};

const row = (
    id: number,
    marcher: number,
    slot: number,
    over: Partial<AssignmentRow> = {},
): AssignmentRow => ({
    id,
    marcher,
    transition: 7,
    slot,
    start: 0,
    end: 8,
    layer: 0,
    ...over,
});

/** Marcher 1 in slot 0 and marcher 2 in slot 2; slots 1 and 3 vacant. */
const ROWS: AssignmentRow[] = [row(11, 1, 0), row(12, 2, 2)];

const span = (
    marcherId: number,
    start: number,
    end: number,
    assignmentId: number,
    transitionId: number,
): SpanInfo => ({
    marcherId,
    start,
    end,
    kind: "founding",
    assignmentId,
    transitionId,
    slot: 0,
});

/** Marcher 2 is stolen over [4, 8) by transition 9's row 30. */
const SPANS: Record<number, SpanInfo[]> = {
    1: [span(1, 0, 8, 11, 7)],
    2: [span(2, 0, 4, 12, 7), span(2, 4, 8, 30, 9)],
};

const LABELS = new Map([
    [1, "A1"],
    [2, "B2"],
    [3, "C3"],
    [4, "D4"],
]);

/** The editor for transition 7 at store `version`; a new target object each call. */
const editor = ({
    transition = TRANSITION,
    rows = ROWS,
    selected = [] as number[],
    version = 1,
} = {}) => (
    <TimelineAssignmentsEditor
        target={buildAssignmentEditTarget(transition, version, {
            assignments: rows,
            labels: new Map([
                ...LABELS,
                ...rows.map((r): [number, string] => [
                    r.marcher,
                    LABELS.get(r.marcher) ?? `M${r.marcher}`,
                ]),
            ]),
            spansOf: (id) => SPANS[id] ?? [],
        })}
        selectedMarcherIds={selected}
        labels={LABELS}
        database={db}
        t={t}
    />
);

const show = (...args: Parameters<typeof editor>) => render(editor(...args));

const click = async (el: HTMLElement) => {
    await act(async () => {
        fireEvent.click(el);
    });
};

const button = (name: string) => screen.getByRole("button", { name });

const commitNumber = async (label: string, value: string) => {
    const input = screen.getByRole("spinbutton", { name: label });
    await act(async () => {
        fireEvent.change(input, { target: { value } });
        fireEvent.keyDown(input, { key: "Enter" });
    });
};

afterEach(cleanup);
beforeEach(() => {
    for (const fn of [mocks.recast, mocks.slot, mocks.update, mocks.remove])
        fn.mockReset().mockResolvedValue([]);
    mocks.cast.mockReset().mockResolvedValue({ assignments: [], steals: [] });
    mocks.toast.mockReset();
    mocks.info.mockReset();
});

describe("TimelineAssignmentsEditor", () => {
    it("lists every slot: members by drill number, and the vacancies (D-13)", () => {
        show();
        expect(screen.getByText("2 of 4 slots filled")).toBeTruthy();
        expect(
            screen.getByTestId("timeline-assign-vacancies").textContent,
        ).toContain("Vacant slots, where nobody goes (2): 1, 3");
        expect(screen.getByTestId("timeline-slot-0").textContent).toContain(
            "Slot 0: A1",
        );
        expect(screen.getByTestId("timeline-slot-1").textContent).toBe(
            "Slot 1: vacant",
        );
        expect(screen.getByTestId("timeline-slot-2").textContent).toContain(
            "Slot 2: B2",
        );
        expect(screen.getByTestId("timeline-slot-3").textContent).toBe(
            "Slot 3: vacant",
        );
    });

    it("in a big transition, lists every member past slot 64 and caps only the vacant rows", async () => {
        const rows = [row(11, 1, 0), row(12, 2, 70), row(13, 3, 199)];
        show({ transition: { ...TRANSITION, slots: 200 }, rows });
        for (const slot of [0, 70, 199])
            expect(screen.getByTestId(`timeline-slot-${slot}`)).toBeTruthy();
        // And they can be edited
        await commitNumber("Layer for C3", "2");
        expect(mocks.update).toHaveBeenCalledWith({
            db,
            assignmentId: 13,
            change: { layer: 2 },
        });
        const vacantRows = screen
            .getAllByTestId(/^timeline-slot-/)
            .filter((el) => el.textContent?.endsWith("vacant"));
        expect(vacantRows).toHaveLength(MAX_LISTED_VACANT_SLOTS);
        expect(
            screen.getByTestId("timeline-assign-more-vacant").textContent,
        ).toBe(
            `${197 - MAX_LISTED_VACANT_SLOTS} more vacant slots aren't listed.`,
        );
        // The vacancy line is a short summary of ranges
        expect(
            screen.getByTestId("timeline-assign-vacancies").textContent,
        ).toBe("Vacant slots, where nobody goes (197): 1–69, 71–198");
    });

    it("says where a higher layer steals an assignment (R-2, UI-1)", () => {
        show();
        expect(
            within(screen.getByTestId("timeline-slot-0")).getByText(
                "Wins all of its beats.",
            ),
        ).toBeTruthy();
        expect(
            screen.getByTestId("timeline-assign-stolen-12").textContent,
        ).toBe("Stolen from beat 4 to 8 by transition 9 on a higher layer.");
    });

    it("says there are no vacancies when every slot is filled", () => {
        show({
            transition: { ...TRANSITION, slots: 3 },
            rows: [...ROWS, row(13, 3, 1)],
        });
        expect(screen.getByText("No vacant slots.")).toBeTruthy();
        expect(screen.queryByTestId("timeline-assign-vacancies")).toBeNull();
    });

    describe("casting", () => {
        const castButton = () => button("Cast selected marchers");
        const castHelp = () =>
            screen.getByTestId("timeline-assign-cast-help").textContent;

        it("is disabled without a selection, and says why", () => {
            show();
            expect(castButton().hasAttribute("disabled")).toBe(true);
            expect(castHelp()).toBe(
                "Select marchers to cast them into this transition.",
            );
        });

        it("is disabled when every selected marcher is in already", () => {
            show({ selected: [1, 2] });
            expect(castButton().hasAttribute("disabled")).toBe(true);
            expect(castHelp()).toBe(
                "Every selected marcher is already in this transition.",
            );
        });

        it("is disabled with too few vacancies, and names the counts", () => {
            show({
                transition: { ...TRANSITION, slots: 3 },
                selected: [3, 4],
            });
            expect(castButton().hasAttribute("disabled")).toBe(true);
            expect(castHelp()).toBe(
                "Selected marchers who need a slot: 2. Vacant slots: 1. Raise the slot count first.",
            );
        });

        it("is disabled past the casting limit, and says so", () => {
            show({
                transition: { ...TRANSITION, slots: MAX_CAST_SLOTS + 1 },
                selected: [3],
            });
            expect(castButton().hasAttribute("disabled")).toBe(true);
            expect(
                button("Recast by nearest slot").hasAttribute("disabled"),
            ).toBe(true);
            expect(
                screen.getByTestId("timeline-assign-recast-help").textContent,
            ).toContain(`up to ${MAX_CAST_SLOTS} slots`);
        });

        it("casts only the selected marchers not in the transition", async () => {
            show({ selected: [2, 3] });
            await click(castButton());
            expect(mocks.cast).toHaveBeenCalledWith({
                db,
                transitionId: 7,
                marcherIds: [3],
            });
            expect(mocks.info).not.toHaveBeenCalled();
        });

        it("names the moves a cast steals beats from", async () => {
            mocks.cast.mockResolvedValueOnce({
                assignments: [],
                steals: [
                    { marcherId: 3, transitionIds: [9] },
                    { marcherId: 4, transitionIds: [5, 9] },
                ],
            });
            show({ selected: [3, 4] });
            await click(castButton());
            expect(mocks.info).toHaveBeenCalledWith(
                "Cast on a higher layer, so these marchers now leave their other moves for these beats: C3 (transition 9); D4 (transition 5, 9)",
            );
        });

        it("follow the leader: casts into the lowest vacant slots at any size, says why, and can't be recast", () => {
            show({
                transition: {
                    ...TRANSITION,
                    style: "follow_the_leader",
                    params: { waypoints: [] },
                    slots: MAX_CAST_SLOTS + 1,
                },
                selected: [3],
            });
            expect(castButton().hasAttribute("disabled")).toBe(false);
            expect(castHelp()).toContain("into the lowest vacant slots");
            expect(
                button("Recast by nearest slot").hasAttribute("disabled"),
            ).toBe(true);
            expect(
                screen.getByTestId("timeline-assign-recast-help").textContent,
            ).toBe(
                "Follow the leader places marchers by their order on the trail, not by slot, so it can't be recast by nearest slot.",
            );
        });
    });

    it("recasts by nearest slot; with nobody in the transition it is disabled and says why", async () => {
        show();
        await click(button("Recast by nearest slot"));
        expect(mocks.recast).toHaveBeenCalledWith({ db, transitionId: 7 });
        cleanup();
        show({ rows: [] });
        expect(button("Recast by nearest slot").hasAttribute("disabled")).toBe(
            true,
        );
        expect(
            screen.getByTestId("timeline-assign-recast-help").textContent,
        ).toBe("Nobody is in this transition yet.");
    });

    it("moves a marcher to a typed slot; the same slot writes nothing", async () => {
        show();
        await commitNumber("Slot for A1", "0");
        expect(mocks.slot).not.toHaveBeenCalled();
        await commitNumber("Slot for A1", "3");
        expect(mocks.slot).toHaveBeenCalledWith({
            db,
            assignmentId: 11,
            slot: 3,
        });
    });

    it("changes a layer; unchanged text writes nothing", async () => {
        show();
        await commitNumber("Layer for A1", "0");
        expect(mocks.update).not.toHaveBeenCalled();
        await commitNumber("Layer for A1", "2");
        expect(mocks.update).toHaveBeenCalledWith({
            db,
            assignmentId: 11,
            change: { layer: 2 },
        });
    });

    it("changes the beats", async () => {
        show();
        await commitNumber("First beat for B2", "4");
        expect(mocks.update).toHaveBeenCalledWith({
            db,
            assignmentId: 12,
            change: { startBeat: 4, endBeat: 8 },
        });
    });

    it("removes a marcher, leaving its slot vacant", async () => {
        show();
        await click(button("Remove A1 from this transition"));
        expect(mocks.remove).toHaveBeenCalledWith({ db, assignmentId: 11 });
    });

    it("after an edit that replaces rows, waits for a newer store version; a rebuild from the same rows doesn't count", async () => {
        const { rerender } = show();
        // A trade deletes rows 11 and 12 and inserts them again under new ids
        await commitNumber("Slot for A1", "2");
        expect(mocks.slot).toHaveBeenCalledTimes(1);
        expect(
            button("Remove A1 from this transition").hasAttribute("disabled"),
        ).toBe(true);
        // Scrubbing rebuilds the target from the same rows: a new object, the same version
        rerender(editor({ version: 1 }));
        expect(
            button("Remove A1 from this transition").hasAttribute("disabled"),
        ).toBe(true);
        await click(button("Remove A1 from this transition"));
        expect(mocks.remove).not.toHaveBeenCalled();
        // The edit's rows arrive: new ids, a newer version
        rerender(editor({ version: 2, rows: [row(21, 2, 0), row(22, 1, 2)] }));
        await click(button("Remove A1 from this transition"));
        expect(mocks.remove).toHaveBeenCalledWith({ db, assignmentId: 22 });
    });

    it("toasts a refusal and keeps the controls usable", async () => {
        const refusal = new TimelineWriteError(
            "E-A3",
            "E-A3: overlapping assignments for one marcher at the same layer",
        );
        mocks.update.mockRejectedValueOnce(refusal);
        show();
        await commitNumber("Layer for A1", "1");
        expect(mocks.toast).toHaveBeenCalledWith(refusal);
        expect(
            button("Remove A1 from this transition").hasAttribute("disabled"),
        ).toBe(false);
    });
});
