import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    within,
} from "@testing-library/react";
import { TolgeeProvider } from "@tolgee/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import tolgee from "@/global/singletons/Tolgee";
import CommandPalette from "../palette/CommandPalette";
import { registerPaletteSource } from "../palette/sources";
import { registerActionHandler, runAction } from "../registry";
import { getPaletteUsageScores, recordPaletteUsage } from "../palette/usage";

const offs: Array<() => void> = [];
function handle(
    id: Parameters<typeof registerActionHandler>[0],
    enabled = true,
) {
    const run = vi.fn();
    offs.push(registerActionHandler(id, { run, isEnabled: () => enabled }));
    return run;
}

function renderPalette() {
    render(
        <TolgeeProvider tolgee={tolgee} fallback="Loading...">
            <CommandPalette />
        </TolgeeProvider>,
    );
    act(() => {
        runAction("openCommandPalette");
    });
    return screen.getByRole("combobox");
}

const optionLabels = () =>
    screen.getAllByRole("option").map((o) => o.textContent);

describe("CommandPalette", () => {
    beforeAll(async () => {
        // jsdom has no layout, so it doesn't implement scrollIntoView.
        Element.prototype.scrollIntoView = vi.fn();
        await tolgee.run();
    });
    afterEach(() => {
        offs.splice(0).forEach((off) => off());
        cleanup();
        localStorage.clear();
    });

    it("lists handled actions and searches by keywords", () => {
        handle("exportCoordinateSheets");
        handle("exportVideo");
        const input = renderPalette();
        expect(optionLabels().some((l) => l?.startsWith("Export video"))).toBe(
            true,
        );
        expect(optionLabels().some((l) => l?.startsWith("Next page"))).toBe(
            false,
        );

        fireEvent.change(input, { target: { value: "print" } });
        expect(optionLabels()).toEqual([
            expect.stringMatching(/^Export coordinate sheets/),
        ]);
    });

    it("runs the chosen action after closing", async () => {
        const run = handle("exportVideo");
        const input = renderPalette();
        fireEvent.change(input, { target: { value: "video" } });
        fireEvent.keyDown(input, { key: "Enter" });
        await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
        expect(screen.queryByRole("combobox")).toBeNull();
    });

    it("moves the selection with the arrow keys", () => {
        handle("exportVideo");
        handle("exportDrillCharts");
        const input = renderPalette();
        fireEvent.change(input, { target: { value: "export" } });
        const selected = () =>
            screen
                .getAllByRole("option")
                .findIndex((o) => o.getAttribute("aria-selected") === "true");
        expect(selected()).toBe(0);
        fireEvent.keyDown(input, { key: "ArrowDown" });
        expect(selected()).toBe(1);
        fireEvent.keyDown(input, { key: "ArrowUp" });
        fireEvent.keyDown(input, { key: "ArrowUp" });
        expect(selected()).toBe(optionLabels().length - 1);
    });

    it("shows disabled actions last and doesn't run them", () => {
        const run = handle("exportVideo", false);
        handle("exportDrillCharts");
        const input = renderPalette();
        fireEvent.change(input, { target: { value: "export" } });
        const options = screen.getAllByRole("option");
        const last = options[options.length - 1];
        expect(last).toHaveTextContent(/Export video/);
        expect(last).toHaveAttribute("aria-disabled", "true");
        fireEvent.click(last);
        expect(run).not.toHaveBeenCalled();
    });

    it("includes items from registered sources", async () => {
        const run = vi.fn();
        offs.push(
            registerPaletteSource({
                id: "test",
                getItems: () => [
                    {
                        id: "page:3",
                        label: "Go to page 3",
                        group: "Pages",
                        run,
                    },
                ],
            }),
        );
        const input = renderPalette();
        fireEvent.change(input, { target: { value: "page 3" } });
        fireEvent.keyDown(input, { key: "Enter" });
        await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    });

    it("opens with curated suggestions first", () => {
        handle("nextPage");
        handle("swapMarchers");
        handle("createCircle");
        renderPalette();
        const suggested = screen.getByRole("group", { name: "Suggested" });
        expect(
            within(suggested)
                .getAllByRole("option")
                .map((o) => o.textContent),
        ).toEqual([
            expect.stringMatching(/^Create circle/),
            expect.stringMatching(/^Swap two marchers/),
        ]);
        expect(optionLabels()[2]).toMatch(/^Next page/);
    });

    it("puts runnable suggestions before unavailable ones", () => {
        handle("createCircle", false);
        handle("swapMarchers");
        renderPalette();
        const suggested = screen.getByRole("group", { name: "Suggested" });
        const [first, second] = within(suggested).getAllByRole("option");
        expect(first).toHaveTextContent(/^Swap two marchers/);
        expect(first).toHaveAttribute("aria-selected", "true");
        expect(second).toHaveAttribute("aria-disabled", "true");
    });

    it("positions the selection highlight once the portal content mounts", () => {
        handle("swapMarchers");
        renderPalette();
        const highlight =
            document.querySelector<HTMLElement>(".palette-highlight")!;
        expect(highlight.style.transform).toMatch(/^translateY\(/);
        expect(highlight.style.opacity).toBe("1");
    });

    it("puts frequently used commands first", () => {
        handle("nextPage");
        handle("createCircle");
        recordPaletteUsage("action:nextPage");
        recordPaletteUsage("action:nextPage");
        renderPalette();
        const suggested = screen.getByRole("group", { name: "Suggested" });
        expect(within(suggested).getAllByRole("option")[0]).toHaveTextContent(
            /^Next page/,
        );
    });

    it("records usage when a command runs", async () => {
        handle("exportVideo");
        const input = renderPalette();
        fireEvent.change(input, { target: { value: "video" } });
        fireEvent.keyDown(input, { key: "Enter" });
        await vi.waitFor(() =>
            expect(getPaletteUsageScores().get("action:exportVideo")).toBe(100),
        );
    });
});

describe("palette usage", () => {
    it("weights recent use above old use", () => {
        const now = Date.now();
        const day = 24 * 60 * 60 * 1000;
        recordPaletteUsage("old", now - 60 * day);
        recordPaletteUsage("old", now - 60 * day);
        recordPaletteUsage("old", now - 60 * day);
        recordPaletteUsage("recent", now);
        const scores = getPaletteUsageScores(now);
        expect(scores.get("recent")).toBe(100);
        expect(scores.get("old")).toBe(90);
        localStorage.clear();
    });
});
