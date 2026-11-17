import { act, cleanup, render, screen } from "@testing-library/react";
import { TolgeeProvider } from "@tolgee/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import tolgee from "@/global/singletons/Tolgee";
import { useInputModeStore } from "@/stores/InputModeStore";
import CoordinateRoundingSettings from "../CoordinateRoundingSettings";

const setMode = (preference: "touch" | "mouse") =>
    act(() => {
        useInputModeStore.getState().setPreference(preference);
    });

const show = () =>
    render(
        <TolgeeProvider tolgee={tolgee} fallback="Loading...">
            <CoordinateRoundingSettings />
        </TolgeeProvider>,
    );

const chips = () => [
    screen.getByRole("button", { name: /^X: / }),
    screen.getByRole("button", { name: /^Y: / }),
];

describe("CoordinateRoundingSettings step chips", () => {
    beforeAll(async () => {
        await tolgee.run();
    });
    afterEach(() => {
        cleanup();
        setMode("mouse");
        localStorage.clear();
    });

    it("with a mouse, describe themselves in their tooltips and have no info tip", () => {
        setMode("mouse");
        show();
        for (const chip of chips())
            expect(chip.getAttribute("title")).toMatch(/^Left-click/);
        expect(
            screen.queryByRole("button", { name: "About the rounding steps" }),
        ).toBeNull();
    });

    it("in touch mode, explain themselves in an info tip in touch words", () => {
        setMode("touch");
        show();
        for (const chip of chips()) expect(chip).not.toHaveAttribute("title");
        const tip = screen.getByRole("button", {
            name: "About the rounding steps",
        });
        act(() => tip.click());
        expect(screen.getByTestId("info-tip-content").textContent).toMatch(
            /^Tap X or Y/,
        );
    });
});
