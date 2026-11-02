import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lineTool } from "../../line/lineTool";
import { drawLine } from "../../line/lineGeometry";
import type { ToolEnv } from "../../tool/toolKind";
import { SaveShapeButton } from "../SaveShapeButton";

/**
 * ☆ Save on a Line with mixed intervals (#526): a saved shape keeps one interval, so it's greyed
 * out with the reason as its label, and pressing it asks for no name.
 */

const STEP = 10;
const env: ToolEnv = {
    stepPx: STEP,
    snap: true,
    constrain: false,
    gridSnap: (p) => p,
    hitRadius: 3,
};
const interval = lineTool.params.find((p) => p.key === "interval")!;
const lineWith = (n: number, list: string) =>
    interval.type(
        drawLine({ x: 100, y: 100 }, { x: 150, y: 100 }, env)!,
        n,
        list,
        env,
    );

const renderSave = (params: unknown) =>
    render(
        <QueryClientProvider client={new QueryClient()}>
            <SaveShapeButton
                shape={{ kind: lineTool, params, spots: 6 }}
                stepPx={STEP}
                compact
            />
        </QueryClientProvider>,
    );

afterEach(cleanup);

describe("saving a line with mixed intervals", () => {
    it("is greyed out, saying why, and asks for no name", () => {
        renderSave(lineWith(6, "2*3+4*2"));
        const button = screen.getByTestId("save-shape");
        expect(button.getAttribute("aria-disabled")).toBe("true");
        expect(button.getAttribute("aria-label")).toBe(
            "Lines with mixed intervals can't be saved yet",
        );
        fireEvent.click(button);
        expect(screen.queryByTestId("save-shape-name")).toBeNull();
    });

    it("asks for a name for a line at one interval", () => {
        renderSave(lineWith(6, "2"));
        const button = screen.getByTestId("save-shape");
        expect(button.getAttribute("aria-disabled")).toBeNull();
        fireEvent.click(button);
        expect(screen.getByTestId("save-shape-name")).toBeTruthy();
    });
});
