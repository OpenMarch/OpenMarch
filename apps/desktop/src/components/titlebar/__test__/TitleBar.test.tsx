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

    it("hides the file path when asked", () => {
        renderBar({ showFilePath: false });
        expect(screen.queryByText("Halftime.dots")).not.toBeInTheDocument();
    });
});
