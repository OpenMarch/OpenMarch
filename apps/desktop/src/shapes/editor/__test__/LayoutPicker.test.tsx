import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    within,
} from "@testing-library/react";
import { boxTool } from "../../box/boxTool";
import { boxBlock, drawBox, type BoxParams } from "../../box/boxGeometry";
import { padTool, type PadParams } from "../../__test__/fakeRowKind";
import { useLastLayoutStore } from "../../tool/lastLayout";
import type { AnyToolKind, ToolEnv } from "../../tool/toolKind";
import { quarterTurn } from "../chip";
import { LayoutMenu } from "../LayoutPicker";
import userEvent from "@testing-library/user-event";

/** The app tooltip a control shows on hover */
async function tooltipOf(el: HTMLElement): Promise<string | null> {
    await userEvent.hover(el);
    return (await screen.findByRole("tooltip")).textContent;
}

/**
 * The box's layout menu (#387; owner lab feedback, 2026-10-23), on the floating editor's second row:
 * every layout in its place, the ones the count can't make greyed with what they need, what's
 * on, and what picking does.
 */

afterEach(cleanup);
beforeEach(() => useLastLayoutStore.setState({ family: "shortBack" }));

const env: ToolEnv = {
    stepPx: 10,
    snap: true,
    constrain: false,
    gridSnap: (p) => p,
    hitRadius: 3,
};

/** A box of `n`, drawn about square: Short back (6 × 4, 1 short, for 23) */
const boxOf = (n: number) => drawBox({ x: 0, y: 0 }, { x: 80, y: 80 }, n, env)!;

const target = (
    params: unknown,
    spots: number,
    apply = vi.fn(),
    kind: AnyToolKind = boxTool,
) => ({ kind, params, spots, apply });

const menu = (
    params: unknown,
    spots: number,
    apply = vi.fn(),
    kind: AnyToolKind = boxTool,
) =>
    render(
        <LayoutMenu
            target={target(params, spots, apply, kind)}
            envFor={() => env}
        />,
    );
const open = () => {
    act(() => {
        fireEvent.click(screen.getByTestId("shape-layout-menu"));
    });
    return screen.getByTestId("shape-layout-menu-content");
};

describe("the layout menu's versions", () => {
    it("puts the counts in the tooltip and marks the shape's own version", async () => {
        menu(boxOf(23), 23);
        const content = open();
        // Drawn square, 23 is Short back 6 × 4
        expect(
            within(content).getByTestId(
                "shape-layout-menu-version-shortBack-2",
            ),
        ).toHaveAttribute("aria-pressed", "true");
        fireEvent.pointerEnter(
            within(content).getByTestId("shape-layout-menu-row-stagger"),
        );
        const stagger = within(content).getByTestId(
            "shape-layout-menu-version-stagger-1",
        );
        expect(stagger).toHaveAttribute("aria-pressed", "false");
        expect(await tooltipOf(stagger)).toBe(
            "Stagger 5 × 5: 5 / 4 / 5 / 4 / 5, front to back",
        );
    });

    it("marks a version turned a quarter as that version", () => {
        const full = boxTool.closed!.withDistribution(
            boxOf(24),
            24,
            {
                mode: "files",
                layout: { family: "full", files: 8, byFile: false },
                stagger: [0, 1],
            },
            env,
        );
        menu(quarterTurn(boxTool, full, 24, env), 24);
        const content = open();
        expect(
            within(content).getByTestId("shape-layout-menu-version-full-0"),
        ).toHaveAttribute("aria-pressed", "true");
    });

    it("is hidden for a kind without layouts", () => {
        const pad: PadParams = { center: { x: 0, y: 0 }, gap: 20, rotation: 0 };
        const { container } = menu(pad, 5, vi.fn(), padTool);
        expect(container).toBeEmptyDOMElement();
    });
});

describe("the chip's layout menu", () => {
    it("shows the box's layout on its button", () => {
        menu(boxOf(23), 23);
        expect(screen.getByTestId("shape-layout-menu")).toHaveTextContent(
            "Short back",
        );
    });

    it("lists every layout, greying out those the count can't make with what they need", () => {
        menu(boxOf(23), 23);
        const content = open();
        const rows = [
            ...content.querySelectorAll(
                "[data-testid^=shape-layout-menu-row-]",
            ),
        ];
        expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual([
            "shape-layout-menu-row-full",
            "shape-layout-menu-row-stagger",
            "shape-layout-menu-row-rounded",
            "shape-layout-menu-row-shortBack",
            "shape-layout-menu-row-notched",
        ]);
        const full = within(content).getByTestId("shape-layout-menu-row-full");
        expect(full).toHaveAttribute("aria-disabled", "true");
        expect(full).toHaveTextContent("add 1 / remove 2");
    });

    it("shows the box's own layout's versions, and another's on hover or its arrow", () => {
        menu(boxOf(23), 23);
        const content = open();
        const versions = () =>
            [
                ...within(content)
                    .getByTestId("shape-layout-menu-versions")
                    .querySelectorAll("button"),
            ].map((b) => b.getAttribute("aria-label"));
        expect(versions()[0]).toMatch(/^Short back /);
        fireEvent.pointerEnter(
            within(content).getByTestId("shape-layout-menu-row-stagger"),
        );
        expect(versions()).toEqual([
            "Stagger 8 × 3",
            "Stagger 5 × 5",
            "Stagger 3 × 9",
        ]);
        fireEvent.click(
            within(content).getByTestId("shape-layout-menu-expand-rounded"),
        );
        expect(versions()).toEqual([
            "Rounded 9 × 3 straight",
            "Rounded 5 × 5 staggered",
        ]);
    });

    it("lays the box out in a version picked, and closes", () => {
        const apply = vi.fn();
        menu(boxOf(23), 23, apply);
        const content = open();
        fireEvent.pointerEnter(
            within(content).getByTestId("shape-layout-menu-row-stagger"),
        );
        fireEvent.click(
            within(content).getByTestId("shape-layout-menu-version-stagger-1"),
        );
        expect(
            boxBlock(apply.mock.calls[0]![0] as BoxParams, 23).lines,
        ).toEqual([5, 4, 5, 4, 5]);
        expect(screen.queryByTestId("shape-layout-menu-content")).toBeNull();
        expect(useLastLayoutStore.getState().family).toBe("stagger");
    });

    it("picks a layout's version nearest the box's proportions from its row", () => {
        const apply = vi.fn();
        menu(boxOf(23), 23, apply);
        const content = open();
        fireEvent.click(
            within(content).getByTestId("shape-layout-menu-row-notched"),
        );
        expect(
            boxBlock(apply.mock.calls[0]![0] as BoxParams, 23).layout.family,
        ).toBe("notched");
    });

    it("shows only the layout the box has on its button when the one picked can't be made, which the menu greys with what it needs", () => {
        const wanted = boxTool.closed!.withDistribution(
            boxOf(23),
            23,
            {
                mode: "files",
                layout: { family: "full", files: 6, byFile: false },
                stagger: [0, 1],
            },
            env,
        );
        const { container } = menu(wanted, 23);
        const button = screen.getByTestId("shape-layout-menu");
        expect(button).not.toHaveTextContent("Full");
        expect(container).not.toHaveTextContent("add 1");
        const full = within(open()).getByTestId("shape-layout-menu-row-full");
        expect(full).toHaveAttribute("aria-disabled", "true");
        expect(full).toHaveTextContent("add 1 / remove 2");
    });

    it("names a Short back with nothing short Full, and picking Full's same version is nothing (#437)", () => {
        // 15 at 3 across: five whole lines, a Full 3 × 5 stored as Short back
        const block = boxTool.closed!.withDistribution(
            boxOf(15),
            15,
            {
                mode: "files",
                layout: { family: "shortBack", files: 3, byFile: false },
                stagger: [0, 1],
            },
            env,
        );
        const apply = vi.fn();
        menu(block, 15, apply);
        expect(screen.getByTestId("shape-layout-menu")).toHaveTextContent(
            "Full",
        );
        const content = open();
        expect(
            within(content).getByTestId("shape-layout-menu-row-full"),
        ).toHaveClass("text-accent");
        const own = within(content)
            .getAllByRole("button", { pressed: true })
            .filter((b) => b.getAttribute("aria-label")?.startsWith("Full"));
        expect(own).toHaveLength(1);
        fireEvent.click(own[0]!);
        expect(apply).not.toHaveBeenCalled();
    });

    it("still names a Short back with a short line Short back", () => {
        const short = boxTool.closed!.withDistribution(
            boxOf(15),
            15,
            {
                mode: "files",
                layout: { family: "shortBack", files: 4, byFile: false },
                stagger: [0, 1],
            },
            env,
        );
        menu(short, 15);
        expect(screen.getByTestId("shape-layout-menu")).toHaveTextContent(
            "Short back",
        );
    });
});
