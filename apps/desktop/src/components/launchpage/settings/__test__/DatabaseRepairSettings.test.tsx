import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import DatabaseRepairSettings from "../DatabaseRepairSettings";

const renderWith = (ready: boolean) => {
    Object.assign(window, {
        electron: { databaseIsReady: vi.fn().mockResolvedValue(ready) },
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
});
