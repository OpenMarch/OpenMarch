import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { PathEditor } from "../PathEditor";
import {
    clearPath,
    openPath,
    setGroupCommands,
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

    it("open: only Remove path, and Big steps when the path is too long, in the bar's one text size", () => {
        // 64 steps of path in 8 counts: big steps
        act(() => {
            showPath(target(5, 32), "T4");
            openPath();
        });
        render(<PathEditor fieldProperties={fieldProperties} />);
        const el = bar();
        expect(el.dataset.phase).toBe("open");
        expect(
            screen.getByTestId("path-remove").getAttribute("aria-label"),
        ).toBe("Remove path");
        expect(screen.queryByTestId("path-finish")).toBeNull();
        const big = screen.getByTestId("path-big-steps");
        expect(big.textContent).toMatch(/^Big steps · /);
        // No size of its own: it reads the bar's
        expect(big.className).not.toMatch(/text-\[|text-(sub|body|xs|sm)\b/);
        expect(el.textContent).not.toMatch(PICTOGRAPHIC);
        expect(el.textContent).not.toContain("Path");
        expect(el.textContent).not.toContain("T4");
    });

    it("quiet (closed): the compact bar, Edit path and Remove path, no Big steps; none while hidden", () => {
        act(() => showPath(target(5, 32), "T4"));
        render(<PathEditor fieldProperties={fieldProperties} />);
        expect(bar().dataset.phase).toBe("closed");
        expect(screen.getByTestId("path-edit").textContent).toBe("Edit path");
        expect(screen.getByTestId("path-remove")).toBeTruthy();
        expect(screen.queryByTestId("path-big-steps")).toBeNull();
        expect(screen.queryByTestId("path-pen-banner")).toBeNull();
        act(() => setPathHidden(true));
        expect(screen.queryByTestId("path-editor")).toBeNull();
        act(() => setPathHidden(false));
        act(() => void openPath());
        expect(bar().dataset.phase).toBe("open");
        expect(screen.queryByTestId("path-edit")).toBeNull();
    });

    it("quiet on a group path: Detach for the selected members, the back slot by member state", () => {
        act(() => {
            showPath(groupTarget(), "3");
            setGroupCommands([10, 11], null);
        });
        render(<PathEditor fieldProperties={fieldProperties} />);
        expect(screen.getByTestId("path-detach").textContent).toBe("Detach 2");
        expect(screen.queryByTestId("path-adjust-reset")).toBeNull();
        expect(screen.queryByTestId("path-rejoin")).toBeNull();
        // One adjusted member selected: Reset adjustment
        act(() => setGroupCommands([12], null));
        expect(screen.getByTestId("path-detach").textContent).toBe("Detach");
        expect(screen.getByTestId("path-adjust-reset").textContent).toBe(
            "Reset adjustment",
        );
        // A plain member selected: no Reset adjustment
        act(() => setGroupCommands([10], null));
        expect(screen.queryByTestId("path-adjust-reset")).toBeNull();
        // A detached marcher selected with them: Rejoin takes the slot
        act(() =>
            setGroupCommands([10], {
                timelineId: 1,
                routeId: 9,
                marcherIds: [13],
            }),
        );
        expect(screen.getByTestId("path-rejoin").textContent).toBe("Rejoin");
    });

    it("open with an easy path: no Big steps", () => {
        act(() => {
            showPath(target(5), "T4");
            openPath();
        });
        render(<PathEditor fieldProperties={fieldProperties} />);
        expect(screen.queryByTestId("path-big-steps")).toBeNull();
        expect(screen.getByTestId("path-remove")).toBeTruthy();
    });
});
