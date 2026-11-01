import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { boxTool } from "../../box/boxTool";
import { drawBox } from "../../box/boxGeometry";
import { distributionOf, withEdge, withMode } from "../../distribute/modes";
import type { ToolEnv } from "../../tool/toolKind";
import { EdgeToggle } from "../EdgeToggle";

/** Edge in the editor (#450): only in Spread, on and off in one change, its tip the split */

afterEach(cleanup);

const env: ToolEnv = {
    stepPx: 10,
    snap: true,
    constrain: false,
    gridSnap: (p) => p,
    hitRadius: 3,
};

const shown = (params: unknown, n: number, apply = vi.fn()) =>
    render(
        <EdgeToggle
            target={{ kind: boxTool, params, spots: n, apply }}
            envFor={() => env}
            testId="edge"
        />,
    );

const spreadOf = (n: number) =>
    withMode(
        boxTool,
        drawBox({ x: 0, y: 0 }, { x: 120, y: 80 }, n, env)!,
        n,
        "spread",
        env,
    );

describe("the Edge toggle", () => {
    it("shows only for a spread", () => {
        const files = drawBox({ x: 0, y: 0 }, { x: 120, y: 80 }, 24, env)!;
        const { container } = shown(files, 24);
        expect(container).toBeEmptyDOMElement();
        cleanup();
        shown(spreadOf(24), 24);
        expect(screen.getByTestId("edge")).toHaveAttribute(
            "aria-pressed",
            "false",
        );
    });

    it("turns the edge on, then off, each as one change", () => {
        const apply = vi.fn();
        const spread = spreadOf(24);
        shown(spread, 24, apply);
        fireEvent.click(screen.getByTestId("edge"));
        expect(apply).toHaveBeenCalledTimes(1);
        const on = apply.mock.calls[0]![0];
        expect(distributionOf(boxTool, on, 24)).toMatchObject({ edge: true });
        cleanup();
        const off = vi.fn();
        shown(on, 24, off);
        expect(screen.getByTestId("edge")).toHaveAttribute(
            "aria-pressed",
            "true",
        );
        fireEvent.click(screen.getByTestId("edge"));
        expect(
            distributionOf(boxTool, off.mock.calls[0]![0], 24),
        ).not.toHaveProperty("edge");
    });

    it("says how many stand on the edge and inside, or that there are too few for an inside", () => {
        shown(withEdge(boxTool, spreadOf(40), 40, true, env), 40);
        fireEvent.focus(screen.getByTestId("edge"));
        expect(document.body.textContent).toMatch(
            /along the outline, \d+ spread inside/,
        );
        cleanup();
        shown(spreadOf(4), 4);
        fireEvent.focus(screen.getByTestId("edge"));
        expect(document.body.textContent).toMatch(
            /too few marchers for an inside/,
        );
    });
});
