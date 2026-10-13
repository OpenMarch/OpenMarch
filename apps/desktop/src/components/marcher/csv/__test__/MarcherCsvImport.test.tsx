import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { allMarchersQueryOptions } from "@/hooks/queries";
import MarcherCsvImport from "../MarcherCsvImport";

/** Marchers already in the show; the import waits for this query to load */
const renderImport = (loaded = true) => {
    const queryClient = new QueryClient();
    if (loaded)
        queryClient.setQueryData(allMarchersQueryOptions().queryKey, []);
    return render(
        <QueryClientProvider client={queryClient}>
            <TolgeeProvider tolgee={tolgee} fallback="Loading...">
                <MarcherCsvImport />
            </TolgeeProvider>
        </QueryClientProvider>,
    );
};

describe("MarcherCsvImport", () => {
    beforeAll(async () => {
        await tolgee.run();
    });
    afterEach(cleanup);

    it("previews a chosen file and shows row errors", async () => {
        renderImport();
        const file = new File(
            ["section,name\nFlute,Ada\nKazoo,Bob\n"],
            "band.csv",
            { type: "text/csv" },
        );
        await userEvent.upload(screen.getByLabelText("Marcher CSV file"), file);
        await waitFor(() => expect(screen.getByText(/band\.csv/)).toBeTruthy());
        expect(screen.getByText(/Unknown section "Kazoo"/)).toBeTruthy();
        expect(
            (
                screen.getByRole("button", {
                    name: /Import 1 marcher/,
                }) as HTMLButtonElement
            ).disabled,
        ).toBe(false);
    });

    it("disables import until a file with valid rows is chosen", () => {
        renderImport();
        expect(
            (
                screen.getByRole("button", {
                    name: /^Import/,
                }) as HTMLButtonElement
            ).disabled,
        ).toBe(true);
    });

    it("keeps import disabled until the existing marchers have loaded", async () => {
        renderImport(false);
        await userEvent.upload(
            screen.getByLabelText("Marcher CSV file"),
            new File(["section\nFlute\n"], "band.csv", { type: "text/csv" }),
        );
        await waitFor(() => expect(screen.getByText(/band\.csv/)).toBeTruthy());
        expect(
            (
                screen.getByRole("button", {
                    name: /^Import/,
                }) as HTMLButtonElement
            ).disabled,
        ).toBe(true);
    });
});
