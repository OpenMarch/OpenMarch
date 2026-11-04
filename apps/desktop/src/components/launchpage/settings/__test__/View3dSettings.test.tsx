import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import View3dSettings from "../View3dSettings";

const renderSettings = () =>
    render(
        <TolgeeProvider tolgee={tolgee} fallback="loading">
            <View3dSettings />
        </TolgeeProvider>,
    );

afterEach(() => localStorage.clear());

describe("View3dSettings", () => {
    it("starts from the defaults", async () => {
        renderSettings();
        expect(
            await screen.findByRole("radio", { name: "Automatic" }),
        ).toHaveAttribute("data-state", "on");
        expect(screen.getByRole("radio", { name: "Sharp" })).toHaveAttribute(
            "data-state",
            "on",
        );
    });

    it("saves each choice where the 3D View reads it", async () => {
        const user = userEvent.setup();
        renderSettings();
        await user.click(await screen.findByRole("radio", { name: "Low" }));
        await user.click(screen.getByRole("radio", { name: "Balanced" }));

        expect(localStorage.getItem("view3d.quality")).toBe("low");
        expect(localStorage.getItem("view3d.resolution")).toBe("balanced");
        // The power behavior is fixed: nothing to save
        expect(screen.queryByRole("switch")).toBeNull();
    });

    it("shows what was saved before", async () => {
        localStorage.setItem("view3d.quality", "high");
        localStorage.setItem("view3d.resolution", "fast");
        renderSettings();
        expect(
            await screen.findByRole("radio", { name: "High" }),
        ).toHaveAttribute("data-state", "on");
        expect(screen.getByRole("radio", { name: "Fast" })).toHaveAttribute(
            "data-state",
            "on",
        );
    });
});
