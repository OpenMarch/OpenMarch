import { afterEach, describe, expect, it } from "vitest";
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { PathEditor } from "../PathEditor";
import { PathBigStepsLine } from "../pathBigSteps";
import {
    editMemberLine,
    clearPath,
    openPath,
    setGroupCommands,
    setOwnLines,
    setPathHidden,
    showPath,
    startDrawing,
} from "../pathPenStore";
import type { AdjustProfile } from "@openmarch/core";
import type { PathTarget } from "../pathTarget";

/**
 * The path's floating editor (owner lab feedback on fork #674): the shape editor's bar, opaque,
 * with icons rather than emoji, no outline round every button, one text size, and only what a
 * path needs. No "Path" word and no drill number in it: Big steps when it applies, Remove last
 * corner, Cancel and Finish while drawing, Remove path once stored.
 */

const fieldProperties =
    FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
const STEP = fieldProperties.pixelsPerStep;

/** Characters a platform may draw as a color emoji */
const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;

const target = (routeId: number | null, steps = 8): PathTarget => ({
    timelineId: 1,
    transitionId: 7,
    marcherId: 3,
    start: 0,
    end: 8,
    from: { x: 0, y: 0 },
    to: { x: steps * STEP, y: 0 },
    routeId,
    points:
        routeId === null
            ? []
            : [{ id: "c1", at: [(steps / 2) * STEP, 4 * STEP] }],
});

/** A group path of three, 12 adjusted */
const groupTarget = (): PathTarget => ({
    ...target(9),
    marcherId: 10,
    group: {
        members: [10, 11, 12].map((m, i) => ({
            marcherId: m,
            transitionId: 7,
            drill: `B${i + 1}`,
            offset: { x: 0, y: i * 2 * STEP },
            from: { x: 0, y: i * 2 * STEP },
            to: { x: 8 * STEP, y: i * 2 * STEP },
            laneId: m,
            slot: i,
            adjust:
                m === 12 ? ({ keys: [] } as unknown as AdjustProfile) : null,
        })),
        outside: [],
    },
});

afterEach(() => {
    act(() => {
        clearPath();
        setGroupCommands([], null);
        setPathHidden(false);
    });
    cleanup();
});

const bar = () => screen.getByTestId("path-editor");

describe("the path's floating editor", () => {
    it("while drawing: Remove last point, Cancel and Finish, as icons and one word, opaque, no emoji, no name", () => {
        act(() => startDrawing(target(null), "T4"));
        render(<PathEditor fieldProperties={fieldProperties} />);
        const el = bar();
        expect(el.dataset.phase).toBe("drawing");
        expect(el.className).toContain("bg-bg-1");
        expect(el.className).toContain("text-sub");
        expect(el.textContent).not.toMatch(PICTOGRAPHIC);
        // Words: only Finish
        expect(el.textContent?.trim()).toBe("Finish");
        expect(el.textContent).not.toContain("T4");
        expect(
            screen.getByTestId("path-remove-last").querySelector("svg"),
        ).not.toBeNull();
        expect(
            screen.getByTestId("path-remove-last").getAttribute("aria-label"),
        ).toBe("Remove last point");
        expect(
            screen
                .getByTestId("path-remove-last")
                .getAttribute("aria-disabled"),
        ).toBe("true");
        expect(
            screen.getByTestId("path-cancel").getAttribute("aria-label"),
        ).toBe("Cancel");
        // No outline round each icon button, as the shape bar's; Finish is the primary pill, as
        // the shape bar's Place
        for (const b of el.querySelectorAll("button"))
            if (b.dataset.testid !== "path-finish")
                expect(b.className).not.toMatch(/\bborder\b/);
        // The hint over the field says whose path it is
        expect(screen.getByTestId("path-pen-banner").textContent).toContain(
            "T4",
        );
        expect(screen.getByTestId("path-pen-banner").textContent).not.toMatch(
            PICTOGRAPHIC,
        );
    });

    it("open: Edit path lit, the rest under More, no Big steps on the bar, in the bar's one text size", () => {
        // 64 steps of path in 8 counts: big steps, said in the inspector (round 2)
        act(() => {
            showPath(target(5, 32), "T4");
            openPath();
        });
        render(<PathEditor fieldProperties={fieldProperties} />);
        const el = bar();
        expect(el.dataset.phase).toBe("open");
        expect(
            screen.getByTestId("path-edit").getAttribute("aria-pressed"),
        ).toBe("true");
        expect(screen.getByTestId("path-more")).toBeTruthy();
        expect(screen.queryByTestId("path-finish")).toBeNull();
        expect(screen.queryByTestId("path-big-steps")).toBeNull();
        expect(el.textContent).not.toMatch(PICTOGRAPHIC);
        expect(el.textContent).not.toContain("T4");
    });

    it("several marchers each on their own path (after Detach all): a bar saying so, with Draw path (sim round 3)", () => {
        act(() =>
            setOwnLines([
                { target: target(5), drill: "T4" },
                { target: { ...target(6), marcherId: 4 }, drill: "T5" },
            ]),
        );
        render(<PathEditor fieldProperties={fieldProperties} />);
        const bar = screen.getByTestId("path-own-paths");
        expect(bar.textContent).toContain("2 own paths");
        expect(screen.getByTestId("path-own-draw")).toBeTruthy();
        act(() => setOwnLines([{ target: target(5), drill: "T4" }]));
        expect(screen.queryByTestId("path-own-paths")).toBeNull();
        act(() => setOwnLines([]));
    });

    it("quiet (closed): Edit path, Edit line greyed out for an own path, no Match group (sim round 3), More; none while hidden", () => {
        act(() => showPath(target(5, 32), "T4"));
        render(<PathEditor fieldProperties={fieldProperties} />);
        expect(bar().dataset.phase).toBe("closed");
        expect(screen.getByTestId("path-edit").textContent).toBe("Edit path");
        expect(
            screen.getByTestId("path-edit-line").getAttribute("aria-disabled"),
        ).toBe("true");
        expect(screen.queryByTestId("path-adjust-reset")).toBeNull();
        expect(screen.getByTestId("path-slot-empty")).toBeTruthy();
        expect(screen.queryByTestId("path-detach")).toBeNull();
        expect(screen.getByTestId("path-more")).toBeTruthy();
        expect(screen.queryByTestId("path-pen-banner")).toBeNull();
        act(() => setPathHidden(true));
        expect(screen.queryByTestId("path-editor")).toBeNull();
    });

    it("fixed slots on a group path: Edit group path · Edit <name>'s line · Match group or Rejoin · More, whoever is selected (round 6)", () => {
        act(() => {
            showPath(groupTarget(), "3");
            setGroupCommands([10, 11], null);
        });
        render(<PathEditor fieldProperties={fieldProperties} />);
        const order = () =>
            Array.from(bar().querySelectorAll("[data-testid]")).map((e) =>
                e.getAttribute("data-testid"),
            );
        const slots = [
            "path-edit",
            "path-edit-line",
            "path-adjust-reset",
            "path-more",
        ];
        expect(order()).toEqual(slots);
        expect(screen.getByTestId("path-edit").textContent).toBe(
            "Edit group path",
        );
        // Detach left the bar for ···
        expect(screen.queryByTestId("path-detach")).toBeNull();
        // Two selected: Edit <name>'s line and Match group greyed out, saying why
        const line = screen.getByTestId("path-edit-line");
        expect(line.getAttribute("aria-disabled")).toBe("true");
        expect(line.getAttribute("aria-label")).toBe(
            "Click one of them again to pick just that marcher, then edit their line",
        );
        expect(line.textContent).toBe("Edit marcher's line");
        expect(
            screen.getByTestId("path-adjust-reset").getAttribute("aria-label"),
        ).toBe(
            "Click one of them again to pick just that marcher, then match it to the group path",
        );
        // One bent member selected: every slot acts, in the same places
        act(() => setGroupCommands([12], null));
        expect(order()).toEqual(slots);
        expect(screen.getByTestId("path-edit-line").textContent).toBe(
            "Edit B3's line",
        );
        expect(screen.getByTestId("path-adjust-reset").textContent).toBe(
            "Match group",
        );
        for (const id of ["path-edit-line", "path-adjust-reset"])
            expect(
                screen.getByTestId(id).getAttribute("aria-disabled"),
            ).toBeNull();
        // A plain member: Match group greyed out, still in its place
        act(() => setGroupCommands([10], null));
        expect(order()).toEqual(slots);
        expect(
            screen.getByTestId("path-adjust-reset").getAttribute("aria-label"),
        ).toBe(
            "This marcher already walks the group path exactly: nothing to match",
        );
        // Only detached marchers selected: Rejoin takes the third slot, at Match group's width
        act(() =>
            setGroupCommands([], {
                timelineId: 1,
                routeId: 9,
                marcherIds: [13, 14],
            }),
        );
        expect(order()).toEqual([
            "path-edit",
            "path-edit-line",
            "path-rejoin",
            "path-more",
        ]);
        const rejoin = screen.getByTestId("path-rejoin");
        expect(rejoin.textContent).toBe("Rejoin 2");
        expect(rejoin.className).toContain("min-w-[104px]");
        act(() =>
            setGroupCommands([], {
                timelineId: 1,
                routeId: 9,
                marcherIds: [13],
            }),
        );
        expect(screen.getByTestId("path-rejoin").textContent).toBe("Rejoin");
        // A mixed selection (a member and a detached marcher): Match group stays in the slot
        act(() =>
            setGroupCommands([10], {
                timelineId: 1,
                routeId: 9,
                marcherIds: [13],
            }),
        );
        expect(order()).toEqual(slots);
        expect(screen.getByTestId("path-adjust-reset").className).toContain(
            "min-w-[104px]",
        );
    });

    const openMore = async () => {
        fireEvent.keyDown(screen.getByTestId("path-more"), {
            key: "ArrowDown",
        });
        await screen.findByTestId("path-more-menu");
    };

    it("one member selected: ··· has Detach from group path after the line, saying what it does, before Remove path (round 6)", async () => {
        act(() => {
            showPath(groupTarget(), "3");
            setGroupCommands([10], null);
        });
        render(<PathEditor fieldProperties={fieldProperties} />);
        await openMore();
        const detach = screen.getByTestId("path-more-detach");
        expect(detach.textContent).toBe(
            [
                "Detach from group path",
                "Stops following group path changes",
            ].join(""),
        );
        expect(detach.previousElementSibling?.getAttribute("role")).toBe(
            "separator",
        );
        expect(detach.nextElementSibling).toBe(
            screen.getByTestId("path-remove"),
        );
        expect(screen.queryByTestId("path-detach-all")).toBeNull();
        expect(screen.queryByTestId("path-more-rejoin")).toBeNull();
    });

    it("some of the group selected: Detach N from group path under ···, no Detach all", async () => {
        act(() => {
            showPath(groupTarget(), "3");
            setGroupCommands([10, 11], null);
        });
        render(<PathEditor fieldProperties={fieldProperties} />);
        await openMore();
        expect(screen.getByTestId("path-more-detach").textContent).toBe(
            [
                "Detach 2 from group path",
                "Stops following group path changes",
            ].join(""),
        );
        expect(screen.queryByTestId("path-detach-all")).toBeNull();
    });

    it("the whole group selected: no Detach under ···, Detach all beside Remove path saying what it does (round 5)", async () => {
        act(() => {
            showPath(groupTarget(), "3");
            setGroupCommands([10, 11, 12], null);
        });
        render(<PathEditor fieldProperties={fieldProperties} />);
        await openMore();
        expect(screen.queryByTestId("path-more-detach")).toBeNull();
        const all = screen.getByTestId("path-detach-all");
        expect(all.textContent).toBe(
            "Detach all 3 marchers" +
                "Ends the group path; each marcher gets their own copy",
        );
        // After the line, beside Remove path, apart from the routine commands
        expect(all.previousElementSibling?.getAttribute("role")).toBe(
            "separator",
        );
        expect(all.nextElementSibling).toBe(screen.getByTestId("path-remove"));
    });

    it("only detached marchers selected: no Detach under ··· (Rejoin is on the bar)", async () => {
        act(() => {
            showPath(groupTarget(), "3");
            setGroupCommands([], {
                timelineId: 1,
                routeId: 9,
                marcherIds: [13],
            });
        });
        render(<PathEditor fieldProperties={fieldProperties} />);
        await openMore();
        expect(screen.queryByTestId("path-more-detach")).toBeNull();
        expect(screen.queryByTestId("path-more-rejoin")).toBeNull();
    });

    it("Edit <name>'s line lights while that line is edited, and Edit group path goes back to the group path", () => {
        act(() => {
            showPath(groupTarget(), "3");
            setGroupCommands([11], null);
        });
        render(<PathEditor fieldProperties={fieldProperties} />);
        act(() => editMemberLine(11));
        expect(
            screen.getByTestId("path-edit-line").getAttribute("aria-pressed"),
        ).toBe("true");
        expect(screen.getByTestId("path-edit-line").textContent).toBe(
            "Edit B2's line",
        );
        expect(
            screen.getByTestId("path-edit").getAttribute("aria-pressed"),
        ).toBe("false");
        expect(screen.queryByTestId("path-group-label")).toBeNull();
        act(() => void openPath());
        expect(
            screen.getByTestId("path-edit").getAttribute("aria-pressed"),
        ).toBe("true");
        // Editing the group path: its line is named, with its member count
        expect(screen.getByTestId("path-group-label").textContent).toBe(
            "Group path · 3",
        );
    });

    it("Big steps shows in the inspector's line for a path too long for its counts, not otherwise", () => {
        act(() => showPath(target(5, 32), "T4"));
        const { unmount } = render(
            <PathBigStepsLine fieldProperties={fieldProperties} />,
        );
        expect(screen.getByTestId("path-big-steps").textContent).toMatch(
            /^Big steps · /,
        );
        unmount();
        act(() => showPath(target(5), "T4"));
        render(<PathBigStepsLine fieldProperties={fieldProperties} />);
        expect(screen.queryByTestId("path-big-steps")).toBeNull();
    });

    it("on a group path, the inspector's Big steps is for the marchers selected on it", () => {
        // A long detour: big steps for everybody along it
        act(() => {
            showPath(
                {
                    ...groupTarget(),
                    points: [{ id: "c1", at: [4 * STEP, 60 * STEP] }],
                },
                "3",
            );
            setGroupCommands([], {
                timelineId: 1,
                routeId: 9,
                marcherIds: [13],
            });
        });
        render(<PathBigStepsLine fieldProperties={fieldProperties} />);
        // Only a marcher off it selected: nothing about the others' steps
        expect(screen.queryByTestId("path-big-steps")).toBeNull();
        act(() => setGroupCommands([10], null));
        expect(screen.getByTestId("path-big-steps").textContent).toMatch(
            /^Big steps · /,
        );
    });

    it("··· opens its menu: Re-center group path, greyed out when centered, and Remove path", async () => {
        act(() => {
            showPath(groupTarget(), "3");
            setGroupCommands([10], null);
        });
        render(<PathEditor fieldProperties={fieldProperties} />);
        const more = screen.getByTestId("path-more");
        fireEvent.keyDown(more, { key: "ArrowDown" });
        const menu = await screen.findByTestId("path-more-menu");
        expect(menu.textContent).toContain("Re-center group path");
        expect(menu.textContent).toContain("Remove path");
        expect(screen.getByTestId("path-refit")).toHaveAttribute(
            "aria-disabled",
            "true",
        );
    });
});
