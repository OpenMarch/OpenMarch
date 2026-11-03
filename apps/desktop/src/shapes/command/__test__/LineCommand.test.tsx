import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { TolgeeProvider } from "@tolgee/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import tolgee from "@/global/singletons/Tolgee";
import CommandPalette from "@/shortcuts/palette/CommandPalette";
import DockedCommandBar from "@/shortcuts/palette/DockedCommandBar";
import {
    useCommandBarStore,
    type CommandRun,
} from "@/shortcuts/palette/commandBar";
import { registerPaletteSource } from "@/shortcuts/palette/sources";
import { runAction } from "@/shortcuts/registry";
import { curveTool, lineTool } from "../../line/lineTool";
import type { LineParams } from "../../line/lineGeometry";
import { hasGroups } from "../../line/lineGeometry";
import type { ToolEnv } from "../../tool/toolKind";
import { fillAhead, shapeSteps, startingParams } from "../shapeSteps";

/**
 * Shape › Line and Shape › Curve in the command bar (#530): the real kinds' steps, one-liners
 * filling the interval, and live preview through the docked bar.
 */

const STEP = 10;
const half = STEP / 2;
const env: ToolEnv = {
    stepPx: STEP,
    snap: true,
    constrain: false,
    gridSnap: (p) => ({
        x: Math.round(p.x / half) * half,
        y: Math.round(p.y / half) * half,
    }),
    hitRadius: 3,
};
const N = 8;
const starts = Array.from({ length: N }, (_, i) => ({
    x: 300 + i * 7,
    y: 300,
}));

const offs: Array<() => void> = [];

function withLineKinds() {
    const line = {
        shape: null as unknown as LineParams,
        finish: vi.fn(),
    };
    const curve = { shape: null as unknown as LineParams, finish: vi.fn() };

    const run =
        (
            kind: typeof lineTool,
            label: string,
            box: typeof line,
        ): (() => CommandRun) =>
        () => {
            const base = startingParams(kind, starts, N, env);
            return {
                path: ["Shape", label],
                preview(answers) {
                    const { params, steps } = shapeSteps(
                        kind,
                        base,
                        N,
                        env,
                        answers,
                    );
                    box.shape = params as LineParams;
                    return steps.map((s) => ({
                        key: s.param.key,
                        label: s.param.label,
                        initial: s.initial,
                        invalid: s.invalid,
                    }));
                },
                fillAhead: (answers) => fillAhead(kind, answers),
                finish: box.finish,
                cancel: vi.fn(),
            };
        };

    offs.push(
        registerPaletteSource({
            id: "test-lines",
            getItems: () => [
                {
                    id: "shape",
                    label: "Shape",
                    group: "Shape",
                    children: () => [
                        {
                            id: "shape:line",
                            label: "Line",
                            group: "Shape",
                            keywords: ["line"],
                            command: { begin: run(lineTool, "Line", line) },
                        },
                        {
                            id: "shape:curve",
                            label: "Curve",
                            group: "Shape",
                            keywords: ["curve", "arc-like", "smooth"],
                            command: { begin: run(curveTool, "Curve", curve) },
                        },
                    ],
                },
            ],
        }),
    );
    return { line, curve };
}

const answer = () =>
    screen.getByTestId("docked-command-input") as HTMLInputElement;
const question = () =>
    screen.getByTestId("docked-command-bar").querySelector("label")!
        .textContent;
const key = (k: string) => fireEvent.keyDown(answer(), { key: k });

async function choose(query: string) {
    act(() => {
        runAction("openCommandPalette");
    });
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: query } });
    fireEvent.keyDown(input, { key: "Enter" });
    await vi.waitFor(() => screen.getByTestId("docked-command-bar"));
}

describe("Line and Curve in the command bar", () => {
    beforeAll(async () => {
        Element.prototype.scrollIntoView = vi.fn();
        await tolgee.run();
    });
    afterEach(() => {
        offs.splice(0).forEach((off) => off());
        void act(() =>
            useCommandBarStore.setState({ palette: null, docked: null }),
        );
        cleanup();
    });

    it('typing "line" finds Shape › Line from the top', async () => {
        withLineKinds();
        render(
            <TolgeeProvider tolgee={tolgee} fallback="">
                <CommandPalette />
                <DockedCommandBar />
            </TolgeeProvider>,
        );
        act(() => {
            runAction("openCommandPalette");
        });
        const input = screen.getByRole("combobox");
        fireEvent.change(input, { target: { value: "line" } });
        expect(screen.getAllByRole("option")[0]!.textContent).toMatch(
            /^Shape › Line/,
        );
    });

    it("docks Shape › Line and asks its interval with the default typed", async () => {
        const { line } = withLineKinds();
        render(
            <TolgeeProvider tolgee={tolgee} fallback="">
                <CommandPalette />
                <DockedCommandBar />
            </TolgeeProvider>,
        );
        await choose("line");
        expect(question()).toMatch(/Spacing between neighbors/);
        expect(answer().value).toBe("2");
        expect(line.shape).not.toBeNull();
        key("Enter");
        expect(line.finish).toHaveBeenCalledWith(["2"]);
    });

    it('a one-liner "line 2*3+4*2" fills the interval step', async () => {
        const { line } = withLineKinds();
        render(
            <TolgeeProvider tolgee={tolgee} fallback="">
                <CommandPalette />
                <DockedCommandBar />
            </TolgeeProvider>,
        );
        await choose("line 2*3+4*2");
        expect(answer().value.replace(/\s/g, "")).toBe("2x3+4x2");
        key("Enter");
        expect(hasGroups(line.shape!)).toBe(true);
        expect(line.shape!.spacing).toEqual({
            // Typing leaves the interval unlocked, the line sized to it
            mode: "fit",
            groups: [
                { count: 2, interval: 30 },
                { count: 4, interval: 20 },
            ],
        });
        expect(line.finish.mock.calls[0]![0]![0]!.replace(/\s/g, "")).toBe(
            "2x3+4x2",
        );
    });

    it('a one-liner "line 3" fills the interval step', async () => {
        const { line } = withLineKinds();
        render(
            <TolgeeProvider tolgee={tolgee} fallback="">
                <CommandPalette />
                <DockedCommandBar />
            </TolgeeProvider>,
        );
        await choose("line 3");
        expect(answer().value).toBe("3");
        key("Enter");
        expect(line.finish).toHaveBeenCalledWith(["3"]);
        expect(line.shape!.spacing).toEqual({
            // Typing leaves the interval unlocked, the line sized to it
            mode: "fit",
            groups: [{ interval: 30 }],
        });
    });

    it('a one-liner "curve 3" fills the Curve interval step', async () => {
        const { curve } = withLineKinds();
        render(
            <TolgeeProvider tolgee={tolgee} fallback="">
                <CommandPalette />
                <DockedCommandBar />
            </TolgeeProvider>,
        );
        await choose("curve 3");
        expect(answer().value).toBe("3");
        key("Enter");
        expect(curve.finish).toHaveBeenCalledWith(["3"]);
        expect(curve.shape!.spacing).toEqual({
            // Typing leaves the interval unlocked, the line sized to it
            mode: "fit",
            groups: [{ interval: 30 }],
        });
    });
});
