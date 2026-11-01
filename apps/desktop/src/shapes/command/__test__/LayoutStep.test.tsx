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
import { boxTool } from "../../box/boxTool";
import { boxBlock, type BoxParams } from "../../box/boxGeometry";
import type { ToolEnv } from "../../tool/toolKind";
import { fillAhead, shapeSteps, startingParams } from "../shapeSteps";

/**
 * The layout step (#387) in the command bar: Shape › Box asks it after the box's numbers, from
 * the box's layout now, and a typed layout lays the box out. The steps are the real box's; only
 * the field is left out (the run keeps the shape it would show).
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
const N = 23;
const starts = Array.from({ length: N }, (_, i) => ({
    x: 300 + i * 7,
    y: 300,
}));

const offs: Array<() => void> = [];

/** Shape › Box over the real box's steps; `shape` is what the field would show */
function withBox() {
    const base = startingParams(boxTool, starts, N, env);
    const box = { shape: base as BoxParams, finish: vi.fn() };
    const run = (): CommandRun => ({
        path: ["Shape", "Box"],
        preview(answers) {
            const { params, steps } = shapeSteps(
                boxTool,
                base,
                N,
                env,
                answers,
            );
            box.shape = params as BoxParams;
            return steps.map((s) => ({
                key: s.param.key,
                label: s.param.label,
                initial: s.initial,
                invalid: s.invalid,
            }));
        },
        fillAhead: (answers) => fillAhead(boxTool, answers),
        finish: box.finish,
        cancel: vi.fn(),
    });
    offs.push(
        registerPaletteSource({
            id: "test-box",
            getItems: () => [
                {
                    id: "shape",
                    label: "Shape",
                    group: "Shape",
                    children: () => [
                        {
                            id: "shape:block",
                            label: "Box",
                            group: "Shape",
                            command: { begin: run },
                        },
                    ],
                },
            ],
        }),
    );
    return box;
}

const answer = () =>
    screen.getByTestId("docked-command-input") as HTMLInputElement;
const question = () =>
    screen.getByTestId("docked-command-bar").querySelector("label")!
        .textContent;
const key = (k: string) => fireEvent.keyDown(answer(), { key: k });
const type = (text: string) =>
    fireEvent.change(answer(), { target: { value: text } });

async function choose(query: string) {
    act(() => {
        runAction("openCommandPalette");
    });
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: query } });
    fireEvent.keyDown(input, { key: "Enter" });
    await vi.waitFor(() => screen.getByTestId("docked-command-bar"));
}

describe("the command bar's layout step", () => {
    beforeAll(async () => {
        Element.prototype.scrollIntoView = vi.fn();
        await tolgee.run();
    });
    afterEach(() => {
        offs.splice(0).forEach((off) => off());
        act(() => {
            useCommandBarStore.setState({ palette: null, docked: null });
        });
        cleanup();
    });

    const renderBar = () =>
        render(
            <TolgeeProvider tolgee={tolgee} fallback="Loading...">
                <CommandPalette />
                <DockedCommandBar />
            </TolgeeProvider>,
        );

    it("comes after the box's numbers, its layout now typed", async () => {
        withBox();
        renderBar();
        await choose("box");
        // Fill (the mode), size, and both spacings
        key("Enter");
        key("Enter");
        key("Enter");
        key("Enter");
        expect(question()).toBe(
            "Layout: Full, Stagger, Rounded, Short back, Notched",
        );
        expect(answer().value).toBe("Short back 6 × 4, 1 short");
    });

    it("lays the box out in the layout typed, and places with it", async () => {
        const box = withBox();
        renderBar();
        await choose("box");
        // Fill (the mode), size, and both spacings
        key("Enter");
        key("Enter");
        key("Enter");
        key("Enter");
        type("stagger 5x5");
        expect(boxBlock(box.shape, N).lines).toEqual([5, 4, 5, 4, 5]);
        key("Enter");
        expect(box.finish).toHaveBeenCalledWith([
            "Grid",
            "6 × 4",
            "2",
            "2",
            "stagger 5x5",
        ]);
    });

    it("keeps a layout it doesn't understand on its step", async () => {
        const box = withBox();
        renderBar();
        await choose("box");
        // Fill (the mode), size, and both spacings
        key("Enter");
        key("Enter");
        key("Enter");
        key("Enter");
        type("full");
        key("Enter");
        expect(question()).toMatch(/^Layout/);
        expect(box.finish).not.toHaveBeenCalled();
    });

    // The box's mode step comes first; a one-liner that names no mode skips it (fillAhead, #399)
    it('a one-liner such as "box 6x4 2" still fills the size and spacing', async () => {
        const box = withBox();
        renderBar();
        await choose("box 6x4 2");
        expect(question()).toBe("Front-to-back spacing, in steps");
        key("Enter");
        expect(question()).toMatch(/^Layout/);
        key("Enter");
        // The mode step left as it is
        expect(box.finish).toHaveBeenCalledWith([
            "",
            "6x4",
            "2",
            "2",
            "Short back 6 × 4, 1 short",
        ]);
    });
});
