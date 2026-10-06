import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import TitleBar from "../TitleBar";

beforeEach(() => {
    Object.assign(window, {
        electron: {
            isMacOS: true,
            databaseGetPath: vi.fn().mockResolvedValue("/shows/Halftime.dots"),
        },
    });
});

const renderBar = (props: Parameters<typeof TitleBar>[0] = {}) =>
    render(
        <TolgeeProvider tolgee={tolgee} fallback="">
            <TitleBar {...props} />
        </TolgeeProvider>,
    );

describe("TitleBar", () => {
    it("lays out leading, path and trailing as grid columns so they can't overlap", async () => {
        renderBar();
        const path = await screen.findByText("Halftime.dots");
        expect(path).toHaveClass("truncate");
        expect(path.closest(".main-app-titlebar")).toHaveClass("grid");
    });

    it("settings variant hides the file path", async () => {
        renderBar({ variant: "settings" });
        // Let any async path fetch settle before asserting it never showed up.
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(window.electron.databaseGetPath).not.toHaveBeenCalled();
        expect(screen.queryByText("Halftime.dots")).not.toBeInTheDocument();
    });

    it("settings variant skips the update check and version", async () => {
        const fetchSpy = vi.fn().mockResolvedValue({ ok: false });
        vi.stubGlobal("fetch", fetchSpy);
        renderBar({ variant: "settings" });
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(fetchSpy).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
    });

    it("main variant runs the update check", async () => {
        const fetchSpy = vi.fn().mockResolvedValue({ ok: false });
        vi.stubGlobal("fetch", fetchSpy);
        renderBar();
        await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
        vi.unstubAllGlobals();
    });
});
