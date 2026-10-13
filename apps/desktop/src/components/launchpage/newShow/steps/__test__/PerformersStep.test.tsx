import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PerformersStep from "../PerformersStep";
import type { NewShowPerformersData } from "../../../newShowTypes";

const Providers = ({ children }: { children: React.ReactNode }) => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return (
        <QueryClientProvider client={queryClient}>
            <TolgeeProvider tolgee={tolgee} fallback="Loading...">
                {children}
            </TolgeeProvider>
        </QueryClientProvider>
    );
};

const csvFile = (contents: string) =>
    new File([contents], "band.csv", { type: "text/csv" });

describe("PerformersStep CSV import", () => {
    beforeAll(async () => {
        await tolgee.run();
    });
    afterEach(() => cleanup());

    it("adds marchers parsed from a CSV file", async () => {
        const user = userEvent.setup();
        const onChange = vi.fn<(performers: NewShowPerformersData) => void>();
        render(<PerformersStep performers={null} onChange={onChange} />, {
            wrapper: Providers,
        });

        await user.click(
            screen.getByRole("button", { name: /Import from CSV/ }),
        );
        await user.upload(
            screen.getByLabelText("Marcher CSV file"),
            csvFile("section,name,year,notes\nFlute,Ada,12,Lead\n"),
        );
        await waitFor(() => expect(screen.getByText(/band\.csv/)).toBeTruthy());

        await user.click(
            screen.getByRole("button", { name: /Import 1 marcher/ }),
        );

        expect(onChange).toHaveBeenCalledWith({
            method: "add",
            marchers: [
                expect.objectContaining({
                    section: "Flute",
                    drill_prefix: "F",
                    drill_order: 1,
                    name: "Ada",
                    year: "12",
                    notes: "Lead",
                    tempId: expect.any(String),
                }),
            ],
        });
    });

    it("rejects a drill number already added in this step", async () => {
        const user = userEvent.setup();
        render(
            <PerformersStep
                performers={{
                    method: "add",
                    marchers: [
                        {
                            section: "Flute",
                            drill_prefix: "F",
                            drill_order: 1,
                            tempId: "existing",
                        },
                    ],
                }}
                onChange={vi.fn()}
            />,
            { wrapper: Providers },
        );

        await user.click(
            screen.getByRole("button", { name: /Import from CSV/ }),
        );
        await user.click(
            screen.getByRole("radio", { name: /By drill number/ }),
        );
        await user.upload(
            screen.getByLabelText("Marcher CSV file"),
            csvFile("drill_number\nF1\n"),
        );

        await waitFor(() =>
            expect(
                screen.getByText(/already exists in this show/),
            ).toBeTruthy(),
        );
        expect(
            (
                screen.getByRole("button", {
                    name: /^Import/,
                }) as HTMLButtonElement
            ).disabled,
        ).toBe(true);
    });
});
