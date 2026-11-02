import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { boxTool } from "../../box/boxTool";
import { drawBox } from "../../box/boxGeometry";
import { padTool, type PadParams } from "../../__test__/fakeRowKind";
import type { AnyToolKind, ToolEnv } from "../../tool/toolKind";
import { ModeMenu } from "../ModeMenu";
import { DEFAULT_ODD_GAP } from "../../distribute/distribution";

/** The editor's mode menu (#386, #435): only the kind's modes, each pictured, hidden with one */

afterEach(cleanup);

const env: ToolEnv = {
    stepPx: 10,
    snap: true,
    constrain: false,
    gridSnap: (p) => p,
    hitRadius: 3,
};
const pad: PadParams = { center: { x: 0, y: 0 }, gap: 20, rotation: 0 };

/** The menu for the shape, opened */
const shown = (
    kind: AnyToolKind,
    params: unknown,
    apply = vi.fn(),
    spots = 5,
) => {
    const view = render(
        <ModeMenu target={{ kind, params, spots, apply }} envFor={() => env} />,
    );
    const button = screen.queryByTestId("shape-mode-menu");
    if (button) fireEvent.click(button);
    return view;
};

const names = () =>
    screen.getAllByRole("menuitemradio").map((b) => b.textContent);

describe("the mode switch", () => {
    it("shows the kind's own modes, the current one on", () => {
        shown(padTool, pad);
        expect(names()).toEqual(["Grid", "Outline"]);
        expect(screen.getByTestId("shape-mode-files")).toHaveAttribute(
            "aria-checked",
            "true",
        );
        expect(screen.getByTestId("shape-mode-menu")).toHaveTextContent("Grid");
    });

    it("shows the current mode's picture on its button (#559)", () => {
        shown(padTool, pad);
        expect(screen.getByTestId("shape-mode-menu-picture").innerHTML).toBe(
            screen.getByTestId("shape-mode-preview-files").innerHTML,
        );
    });

    it("fills the shape in the mode picked", () => {
        const apply = vi.fn();
        shown(padTool, pad, apply);
        fireEvent.click(screen.getByTestId("shape-mode-outline"));
        expect(apply).toHaveBeenCalledTimes(1);
        // Picking closes the menu
        expect(screen.queryByTestId("shape-mode-menu-content")).toBeNull();
        expect(apply.mock.calls[0]![0]).toEqual({
            ...pad,
            distribution: { mode: "outline", oddGap: DEFAULT_ODD_GAP },
        });
    });

    it("offers the box Grid, Outline and Spread", () => {
        const box = drawBox({ x: 0, y: 0 }, { x: 40, y: 20 }, 6, env);
        shown(boxTool, box, vi.fn(), 6);
        expect(names()).toEqual(["Grid", "Outline", "Spread"]);
    });

    it("pictures one example of each mode, the same for any shape: Grid fills the middle, Outline leaves it empty", () => {
        const box = drawBox({ x: 0, y: 0 }, { x: 40, y: 20 }, 8, env);
        shown(boxTool, box, vi.fn(), 8);
        const dots = (mode: string) =>
            [
                ...screen
                    .getByTestId(`shape-mode-preview-${mode}`)
                    .querySelectorAll("circle"),
            ].map((c) => ({
                x: Number(c.getAttribute("cx")),
                y: Number(c.getAttribute("cy")),
            }));
        /** Dots well inside the picture's dots' box */
        const inside = (spots: { x: number; y: number }[]) => {
            const xs = spots.map((p) => p.x);
            const ys = spots.map((p) => p.y);
            const [l, r] = [Math.min(...xs), Math.max(...xs)];
            const [t, b] = [Math.min(...ys), Math.max(...ys)];
            return spots.filter(
                (p) =>
                    p.x > l + 0.5 &&
                    p.x < r - 0.5 &&
                    p.y > t + 0.5 &&
                    p.y < b - 0.5,
            ).length;
        };
        expect(inside(dots("files"))).toBeGreaterThan(0);
        expect(inside(dots("outline"))).toBe(0);
        expect(inside(dots("spread"))).toBeGreaterThan(0);
    });

    it("is hidden while the kind has one mode", () => {
        const filesOnly: AnyToolKind = {
            ...padTool,
            closed: { ...padTool.closed!, modes: ["files"] },
        };
        const { container } = shown(filesOnly, pad);
        expect(container).toBeEmptyDOMElement();
    });
});
