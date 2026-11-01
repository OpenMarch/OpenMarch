import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { boxTool } from "../../box/boxTool";
import { drawBox } from "../../box/boxGeometry";
import {
    distributionOf,
    parseSeed,
    reshuffle,
    withMode,
    withSeed,
} from "../../distribute/modes";
import {
    reshuffled,
    SEED_MAX,
    spreadDistribution,
} from "../../distribute/distribution";
import type { ToolEnv } from "../../tool/toolKind";
import { ReshuffleButton } from "../ReshuffleButton";

/** Reshuffle in the editor (#391): only in Spread, the next seed in one change; its seed menu (#437) */

afterEach(cleanup);

const env: ToolEnv = {
    stepPx: 10,
    snap: true,
    constrain: false,
    gridSnap: (p) => p,
    hitRadius: 3,
};
const N = 12;
const files = drawBox({ x: 0, y: 0 }, { x: 40, y: 20 }, N, env)!;
const spread = withMode(boxTool, files, N, "spread", env);

/** The button for `params`; a change, whole or worked out from the shape, lands in `apply` */
const shown = (params: unknown, apply = vi.fn()) =>
    render(
        <ReshuffleButton
            target={{
                kind: boxTool,
                params,
                spots: N,
                apply,
                update: (change) => apply(change(params)),
            }}
            envFor={() => env}
            testId="reshuffle"
        />,
    );

/** Opens the seed menu and types `text` into its seed */
const typeSeed = (text: string) => {
    fireEvent.click(screen.getByTestId("reshuffle-seed"));
    const input = screen.getByTestId("reshuffle-seed-input");
    fireEvent.change(input, { target: { value: text } });
    return input;
};

describe("the Reshuffle button", () => {
    it("shows only for a spread", () => {
        const { container } = shown(files);
        expect(container).toBeEmptyDOMElement();
        cleanup();
        shown(spread);
        expect(screen.getByRole("button", { name: "Reshuffle" })).toBeVisible();
    });

    it("applies the next seed as one change", () => {
        const apply = vi.fn();
        shown(spread, apply);
        fireEvent.click(screen.getByTestId("reshuffle"));
        expect(apply).toHaveBeenCalledTimes(1);
        expect(
            distributionOf(boxTool, apply.mock.calls[0]![0], N),
        ).toMatchObject({ mode: "spread", seed: 2, count: N });
    });

    it("shows the seed in its menu, and a typed seed lays out the same spots as that seed's spread, as one change", () => {
        const second = reshuffle(boxTool, spread, N, env);
        const apply = vi.fn();
        shown(second, apply);
        fireEvent.click(screen.getByTestId("reshuffle-seed"));
        const input = screen.getByTestId("reshuffle-seed-input");
        expect(input).toHaveValue("2");
        // The seed holds for this count and shape: both said beside it
        expect(screen.getByTestId("reshuffle-seed-count")).toHaveTextContent(
            `for ${N} marchers`,
        );
        expect(
            screen.getByText(
                "Same seed and count in the same shape: same spread. The spacing only scales it.",
            ),
        ).toBeVisible();
        fireEvent.change(input, { target: { value: "1" } });
        fireEvent.keyDown(input, { key: "Enter" });
        expect(apply).toHaveBeenCalledTimes(1);
        const typed = apply.mock.calls[0]![0];
        expect(distributionOf(boxTool, typed, N)).toMatchObject({
            mode: "spread",
            seed: 1,
        });
        const ctx = { stepPx: env.stepPx, snapPoint: env.gridSnap };
        expect(boxTool.shape.generate(typed, N, ctx)).toEqual(
            boxTool.shape.generate(spread, N, ctx),
        );
    });

    it("leaves the shape alone for a typed seed that isn't a whole number from 1", () => {
        const apply = vi.fn();
        shown(spread, apply);
        fireEvent.click(screen.getByTestId("reshuffle-seed"));
        const input = screen.getByTestId("reshuffle-seed-input");
        for (const text of ["0", "-3", "2.5", "abc", ""]) {
            fireEvent.change(input, { target: { value: text } });
            fireEvent.keyDown(input, { key: "Enter" });
        }
        expect(apply).not.toHaveBeenCalled();
        expect(input).toHaveAttribute("aria-invalid", "true");
    });

    it("parses and applies seeds only for a spread", () => {
        expect(parseSeed(" 42 ")).toBe(42);
        expect(parseSeed("0")).toBeNull();
        expect(withSeed(boxTool, files, N, 3, env)).toBeNull();
        expect(
            distributionOf(boxTool, withSeed(boxTool, spread, N, 3, env), N),
        ).toMatchObject({ mode: "spread", seed: 3, count: N });
    });

    it("cancels a typed seed with Escape, and commits it when the menu closes another way", () => {
        const apply = vi.fn();
        shown(spread, apply);
        const input = typeSeed("7");
        fireEvent.keyDown(input, { key: "Escape" });
        expect(screen.queryByTestId("reshuffle-seed-menu")).toBeNull();
        expect(apply).not.toHaveBeenCalled();
        // Typed and closed by its button, not Escape: kept
        typeSeed("7");
        fireEvent.click(screen.getByTestId("reshuffle-seed"));
        expect(apply).toHaveBeenCalledTimes(1);
        expect(
            distributionOf(boxTool, apply.mock.calls[0]![0], N),
        ).toMatchObject({ seed: 7 });
    });

    it("caps seeds at 2³¹ − 1, and Reshuffle wraps back to 1 after it", () => {
        expect(parseSeed(String(SEED_MAX))).toBe(SEED_MAX);
        expect(parseSeed(String(SEED_MAX + 1))).toBeNull();
        expect(parseSeed("99999999999999999999")).toBeNull();
        expect(withSeed(boxTool, spread, N, SEED_MAX + 1, env)).toBeNull();
        expect(reshuffled(spreadDistribution(SEED_MAX, N), N).seed).toBe(1);
        expect(reshuffled(spreadDistribution(41, N), N).seed).toBe(42);
    });

    it("says when a copy fails, and offers none without a clipboard", async () => {
        const clipboard = Object.getOwnPropertyDescriptor(
            navigator,
            "clipboard",
        );
        try {
            Object.defineProperty(navigator, "clipboard", {
                configurable: true,
                value: { writeText: () => Promise.reject(new Error("denied")) },
            });
            shown(spread);
            fireEvent.click(screen.getByTestId("reshuffle-seed"));
            fireEvent.click(screen.getByTestId("reshuffle-seed-copy"));
            await vi.waitFor(() =>
                expect(
                    screen.getByTestId("reshuffle-seed-copy"),
                ).toHaveAttribute("data-copy", "failed"),
            );
            cleanup();
            Object.defineProperty(navigator, "clipboard", {
                configurable: true,
                value: undefined,
            });
            shown(spread);
            fireEvent.click(screen.getByTestId("reshuffle-seed"));
            expect(screen.queryByTestId("reshuffle-seed-copy")).toBeNull();
        } finally {
            if (clipboard)
                Object.defineProperty(navigator, "clipboard", clipboard);
            else delete (navigator as { clipboard?: unknown }).clipboard;
        }
    });
});
