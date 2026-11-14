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
import { useInputModeStore } from "@/stores/InputModeStore";
import {
    markKeyboardSeen,
    resetKeyboardSeen,
} from "@/stores/KeyboardSeenStore";
import CommandPalette from "../CommandPalette";
import DockedCommandBar from "../DockedCommandBar";
import {
    oneLinerAnswers,
    paramsCommand,
    parseParam,
    useCommandBarStore,
    type CommandRun,
} from "../commandBar";
import { registerPaletteSource, type PaletteItem } from "../sources";
import { registerActionHandler, runAction } from "../../registry";

/**
 * The command bar (#354): palette entries nest (Shape › Box), and a command that declares
 * parameters docks the bar and asks them one at a time. Driven with a fake command, so the bar
 * is shown not to depend on shapes.
 */

const offs: Array<() => void> = [];

/** A fake Box: three steps, sizes and steps as the box has them; "?" isn't understood */
function fakeBox() {
    const shown: string[][] = [];
    const finish = vi.fn();
    const cancel = vi.fn();
    const begin = vi.fn(
        (): CommandRun => ({
            path: ["Shape", "Box"],
            preview(answers) {
                shown.push([...answers]);
                const size = answers[0] || "4 × 3";
                return [
                    {
                        key: "size",
                        label: "Size",
                        initial: "4 × 3",
                        invalid: answers[0] === "?",
                    },
                    // A later step starts from the earlier answers
                    {
                        key: "across",
                        label: "Across",
                        initial: size.startsWith("6") ? "3" : "2",
                        invalid: answers[1] === "?",
                    },
                    { key: "deep", label: "Deep", initial: "2" },
                ];
            },
            finish,
            cancel,
        }),
    );
    return { shown, finish, cancel, begin };
}

function withShapeBranch(box = fakeBox()) {
    const kinds: PaletteItem[] = [
        {
            id: "shape:block",
            label: "Box",
            group: "Shape",
            keywords: ["block"],
            command: { begin: box.begin },
        },
    ];
    offs.push(
        registerPaletteSource({
            id: "test-shapes",
            getItems: () => [
                {
                    id: "shape",
                    label: "Shape",
                    group: "Shape",
                    children: () => kinds,
                },
            ],
        }),
    );
    return box;
}

function renderBar() {
    render(
        <TolgeeProvider tolgee={tolgee} fallback="Loading...">
            <CommandPalette />
            <DockedCommandBar />
        </TolgeeProvider>,
    );
}

function openWith(action: "openCommandPalette" | "openCommandBar") {
    act(() => {
        runAction(action);
    });
    return screen.getByRole("combobox");
}

const optionLabels = () =>
    screen.getAllByRole("option").map((o) => o.textContent);
const answer = () =>
    screen.getByTestId("docked-command-input") as HTMLInputElement;
const question = () =>
    screen.getByTestId("docked-command-bar").querySelector("label")!
        .textContent;
const key = (k: string) => fireEvent.keyDown(answer(), { key: k });
const type = (text: string) =>
    fireEvent.change(answer(), { target: { value: text } });

/** Searches the palette for `query` and chooses the first row, docking its command */
async function choose(query: string) {
    const input = openWith("openCommandPalette");
    fireEvent.change(input, { target: { value: query } });
    fireEvent.keyDown(input, { key: "Enter" });
    await vi.waitFor(() => screen.getByTestId("docked-command-bar"));
}

describe("the command bar", () => {
    beforeAll(async () => {
        Element.prototype.scrollIntoView = vi.fn();
        await tolgee.run();
    });
    afterEach(() => {
        offs.splice(0).forEach((off) => off());
        act(() => useCommandBarStore.setState({ palette: null, docked: null }));
        cleanup();
        localStorage.clear();
    });

    it("/ and ⌘K open the same bar", () => {
        withShapeBranch();
        renderBar();
        openWith("openCommandBar");
        const viaSlash = optionLabels();
        fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
        act(() => useCommandBarStore.setState({ palette: null }));
        openWith("openCommandPalette");
        expect(optionLabels()).toEqual(viaSlash);
        expect(viaSlash.some((l) => l?.startsWith("Shape"))).toBe(true);
    });

    it("a branch opens in place, and Backspace in an empty search goes back up", () => {
        withShapeBranch();
        renderBar();
        const input = openWith("openCommandPalette");
        fireEvent.change(input, { target: { value: "shape" } });
        fireEvent.keyDown(input, { key: "Enter" });
        expect(screen.getByTestId("palette-crumb")).toHaveTextContent("Shape");
        expect(optionLabels()).toEqual(["Box"]);
        fireEvent.keyDown(input, { key: "Backspace" });
        expect(screen.queryByTestId("palette-crumb")).toBeNull();
    });

    it('typing "box" finds Shape › Box from the top', () => {
        withShapeBranch();
        renderBar();
        const input = openWith("openCommandPalette");
        fireEvent.change(input, { target: { value: "box" } });
        expect(optionLabels()[0]).toMatch(/^Shape › Box/);
    });

    it("a command docks the bar and asks each step with its default typed", async () => {
        const box = withShapeBranch();
        renderBar();
        await choose("box");
        expect(screen.queryByRole("listbox")).toBeNull();
        expect(question()).toBe("Size");
        expect(answer().value).toBe("4 × 3");

        type("6x2");
        // What it makes follows the typing
        expect(box.shown.at(-1)).toEqual(["6x2"]);
        key("Enter");
        expect(question()).toBe("Across");
        // Started from the earlier answer
        expect(answer().value).toBe("3");
        key("Enter");
        expect(question()).toBe("Deep");
        key("Enter");
        expect(box.finish).toHaveBeenCalledWith(["6x2", "3", "2"]);
        expect(screen.queryByTestId("docked-command-bar")).toBeNull();
        expect(box.cancel).not.toHaveBeenCalled();
    });

    it('a one-liner such as "box 4x3 2" fills the answers ahead and opens at the first one it didn\'t fill', async () => {
        const box = withShapeBranch();
        renderBar();
        const input = openWith("openCommandPalette");
        fireEvent.change(input, { target: { value: "box 5 x 4 2½" } });
        expect(optionLabels()[0]).toMatch(/^Shape › Box 5x4 · 2½/);
        fireEvent.keyDown(input, { key: "Enter" });
        await vi.waitFor(() => screen.getByTestId("docked-command-bar"));
        expect(question()).toBe("Deep");
        expect(answer().value).toBe("2");
        // The whole line shows at once
        expect(box.shown.at(-1)).toEqual(["5x4", "2½", "2"]);
        // What it filled can still be gone back over
        type("");
        key("Backspace");
        expect(question()).toBe("Across");
        expect(answer().value).toBe("2½");
        key("Enter");
        key("Enter");
        expect(box.finish).toHaveBeenCalledWith(["5x4", "2½", "2"]);
    });

    it("a one-liner that fills every step finishes on one Enter", async () => {
        const box = withShapeBranch();
        renderBar();
        const input = openWith("openCommandPalette");
        fireEvent.change(input, { target: { value: "box 4x2 3 1½" } });
        fireEvent.keyDown(input, { key: "Enter" });
        await vi.waitFor(() => screen.getByTestId("docked-command-bar"));
        expect(question()).toBe("Deep");
        expect(answer().value).toBe("1½");
        key("Enter");
        expect(box.finish).toHaveBeenCalledWith(["4x2", "3", "1½"]);
    });

    it("Backspace in an empty answer goes back a step, keeping its answer", async () => {
        withShapeBranch();
        renderBar();
        await choose("box");
        type("6x2");
        key("Enter");
        type("");
        key("Backspace");
        expect(question()).toBe("Size");
        expect(answer().value).toBe("6x2");
    });

    it("Tab goes to the next step and Shift+Tab back, as in a form", async () => {
        const box = withShapeBranch();
        renderBar();
        await choose("box");
        type("6x2");
        key("Tab");
        expect(question()).toBe("Across");
        fireEvent.keyDown(answer(), { key: "Tab", shiftKey: true });
        expect(question()).toBe("Size");
        expect(answer().value).toBe("6x2");
        key("Tab");
        key("Tab");
        // Tab on the last step doesn't finish; Enter does
        key("Tab");
        expect(question()).toBe("Deep");
        expect(box.finish).not.toHaveBeenCalled();
    });

    it("Backspace in the first empty answer cancels back to the branch", async () => {
        const box = withShapeBranch();
        renderBar();
        await choose("box");
        type("");
        key("Backspace");
        expect(box.cancel).toHaveBeenCalledTimes(1);
        expect(screen.queryByTestId("docked-command-bar")).toBeNull();
        expect(screen.getByTestId("palette-crumb")).toHaveTextContent("Shape");
    });

    it("Escape cancels the whole command, so everything is as before", async () => {
        const box = withShapeBranch();
        renderBar();
        await choose("box");
        type("6x2");
        key("Enter");
        key("Escape");
        expect(box.cancel).toHaveBeenCalledTimes(1);
        expect(box.finish).not.toHaveBeenCalled();
        expect(screen.queryByTestId("docked-command-bar")).toBeNull();
    });

    it("an answer that isn't understood stays on its step", async () => {
        withShapeBranch();
        renderBar();
        await choose("box");
        type("?");
        key("Enter");
        expect(question()).toBe("Size");
        expect(answer()).toHaveAttribute("aria-invalid", "true");
    });

    it("plain actions still run from the centered palette", async () => {
        withShapeBranch();
        const run = vi.fn();
        offs.push(
            registerActionHandler("exportVideo", {
                run,
                isEnabled: () => true,
            }),
        );
        renderBar();
        const input = openWith("openCommandBar");
        fireEvent.change(input, { target: { value: "video" } });
        fireEvent.keyDown(input, { key: "Enter" });
        await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
        expect(screen.queryByTestId("docked-command-bar")).toBeNull();
    });

    it("a greyed-out command doesn't begin", () => {
        const box = fakeBox();
        offs.push(
            registerPaletteSource({
                id: "test-shapes",
                getItems: () => [
                    {
                        id: "shape:block",
                        label: "Box",
                        group: "Shape",
                        disabled: true,
                        disabledReason: "Select marchers first",
                        command: { begin: box.begin },
                    },
                ],
            }),
        );
        renderBar();
        const input = openWith("openCommandPalette");
        fireEvent.change(input, { target: { value: "box" } });
        fireEvent.keyDown(input, { key: "Enter" });
        expect(box.begin).not.toHaveBeenCalled();
        expect(screen.getByTestId("palette-item-reason")).toHaveTextContent(
            "Select marchers first",
        );
    });
});

describe("one-liners", () => {
    it("split after the command's name, keeping sizes whole", () => {
        expect(oneLinerAnswers("box 4x3 2", ["Box"])).toEqual(["4x3", "2"]);
        expect(oneLinerAnswers("Box 4 by 3, 2½", ["box"])).toEqual([
            "4x3",
            "2½",
        ]);
        expect(oneLinerAnswers("block 6 × 2", ["Box", "block"])).toEqual([
            "6x2",
        ]);
    });

    it("need the name, a space and an answer", () => {
        expect(oneLinerAnswers("box", ["Box"])).toBeNull();
        expect(oneLinerAnswers("box ", ["Box"])).toBeNull();
        expect(oneLinerAnswers("boxes 2", ["Box"])).toBeNull();
    });
});

describe("commands with typed parameters (an action's `params`)", () => {
    afterEach(() => offs.splice(0).forEach((off) => off()));
    const params = [
        {
            key: "counts",
            label: "Counts",
            unit: "count" as const,
            default: 8,
            range: { min: 1 },
        },
        {
            key: "interval",
            label: "Interval",
            unit: "steps" as const,
            default: 2.5,
        },
        { key: "turn", label: "Turn", unit: "degrees" as const },
    ];

    it("parse each answer in its unit, inside its range", () => {
        const [counts, interval, turn] = params;
        expect(parseParam(counts!, "16")).toBe(16);
        expect(parseParam(counts!, "1.5")).toBeNull();
        expect(parseParam(counts!, "0")).toBeNull();
        expect(parseParam(interval!, "2½")).toBe(2.5);
        expect(parseParam(interval!, "½")).toBe(0.5);
        expect(parseParam(interval!, "two")).toBeNull();
        expect(parseParam(turn!, "-45°")).toBe(-45);
    });

    it("ask each in turn from its default, and run with typed values by key", () => {
        const run = vi.fn();
        const bar = paramsCommand(["Make page"], params, run).begin()!;
        expect(bar.preview([]).map((s) => [s.key, s.initial])).toEqual([
            ["counts", "8"],
            ["interval", "2½"],
            ["turn", ""],
        ]);
        expect(bar.preview(["x"])[0]!.invalid).toBe(true);
        // An unanswered step without a default can't finish
        bar.finish(["", "3", ""]);
        expect(run).not.toHaveBeenCalled();
        bar.finish(["", "3", "90"]);
        expect(run).toHaveBeenCalledWith({ counts: 8, interval: 3, turn: 90 });
    });

    it("pass the answers to the action's handler over its own args", () => {
        const handler = vi.fn();
        offs.push(
            registerActionHandler("nextPage", {
                run: handler,
                isEnabled: () => true,
            }),
        );
        expect(runAction("nextPage", { counts: 4 })).toBe(true);
        expect(handler).toHaveBeenCalledWith({ counts: 4 });
    });
});

describe("the palette's input focus (tablet plan 4.3)", () => {
    beforeAll(async () => {
        Element.prototype.scrollIntoView = vi.fn();
        await tolgee.run();
    });
    afterEach(() => {
        act(() => {
            useCommandBarStore.setState({ palette: null, docked: null });
            useInputModeStore.getState().setPreference("mouse");
        });
        cleanup();
        resetKeyboardSeen();
        localStorage.clear();
    });

    it("with a mouse, the input has the focus as soon as it opens", () => {
        renderBar();
        expect(openWith("openCommandPalette")).toHaveFocus();
    });

    it("on a tablet with no keyboard, the input waits for a tap, so no keyboard pops up", () => {
        act(() => {
            useInputModeStore.getState().setPreference("touch");
        });
        resetKeyboardSeen();
        renderBar();
        const input = openWith("openCommandPalette");
        expect(input).not.toHaveFocus();
        // The dialog holds the focus instead, so Escape still closes it
        expect(screen.getByRole("dialog")).toHaveFocus();
        act(() => {
            input.focus();
        });
        expect(input).toHaveFocus();
    });

    it("on a tablet once a keyboard has been used, the input has the focus", () => {
        act(() => {
            useInputModeStore.getState().setPreference("touch");
        });
        // ⌘K on a hardware keyboard
        act(() => {
            markKeyboardSeen();
        });
        renderBar();
        expect(openWith("openCommandPalette")).toHaveFocus();
    });
});
