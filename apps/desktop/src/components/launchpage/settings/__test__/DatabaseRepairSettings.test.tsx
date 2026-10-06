import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import DatabaseRepairSettings from "../DatabaseRepairSettings";

const renderWith = (ready: boolean | Error) => {
    Object.assign(window, {
        electron: {
            databaseIsReady:
                ready instanceof Error
                    ? vi.fn().mockRejectedValue(ready)
                    : vi.fn().mockResolvedValue(ready),
        },
    });
    return render(
        <TolgeeProvider tolgee={tolgee} fallback="loading">
            <DatabaseRepairSettings />
        </TolgeeProvider>,
    );
};

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("DatabaseRepairSettings", () => {
    it("asks for an open show when no database is ready", async () => {
        renderWith(false);
        expect(
            await screen.findByText("Open a show to repair its file."),
        ).toBeInTheDocument();
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("offers the repair button when a database is ready", async () => {
        renderWith(true);
        expect(await screen.findByRole("button")).toBeInTheDocument();
        expect(
            screen.queryByText("Open a show to repair its file."),
        ).not.toBeInTheDocument();
    });

    it("falls back to the no-show message when the check rejects", async () => {
        const consoleError = vi
            .spyOn(console, "error")
            .mockImplementation(() => {});
        renderWith(new Error("ipc failed"));
        expect(
            await screen.findByText("Open a show to repair its file."),
        ).toBeInTheDocument();
        expect(consoleError).toHaveBeenCalled();
        consoleError.mockRestore();
    });
});
