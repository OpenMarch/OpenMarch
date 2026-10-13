import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { allMarchersQueryOptions } from "@/hooks/queries";
import MarcherForm from "../../MarcherForm";

/** Marchers already in the show; the import waits for this query to load */
const renderImport = (loaded = true, disabledProp = false) => {
    const queryClient = new QueryClient();
    if (loaded)
        queryClient.setQueryData(allMarchersQueryOptions().queryKey, []);
    return render(
        <QueryClientProvider client={queryClient}>
            <TolgeeProvider tolgee={tolgee} fallback="Loading...">
                <MarcherForm
                    initialAddMethod="csv"
                    disabledProp={disabledProp}
                />
            </TolgeeProvider>
        </QueryClientProvider>,
    );
};

/** Holds FileReader results until the test finishes them, so reads can overlap */
const deferFileReads = () => {
    const pending: { finish: (text: string) => void }[] = [];
    const Original = window.FileReader;
    class DeferredReader {
        result: string | null = null;
        error: DOMException | null = null;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        readAsText() {
            pending.push({
                finish: (text: string) => {
                    this.result = text;
                    this.onload?.();
                },
            });
        }
    }
    window.FileReader = DeferredReader as unknown as typeof FileReader;
    return {
        pending,
        restore: () => {
            window.FileReader = Original;
        },
    };
};

const importButton = () =>
    screen.getByRole("button", { name: /^Import/ }) as HTMLButtonElement;

describe("MarcherForm CSV import", () => {
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
        expect(importButton().disabled).toBe(true);
    });

    it("describes a file with no marchers as empty", async () => {
        renderImport();
        await userEvent.upload(
            screen.getByLabelText("Marcher CSV file"),
            new File(["\n"], "empty.csv", { type: "text/csv" }),
        );
        await waitFor(() =>
            expect(
                screen.getByText("This file doesn't have any marchers in it"),
            ).toBeTruthy(),
        );
        expect(importButton().disabled).toBe(true);
    });

    it("keeps import disabled when the form is disabled", async () => {
        renderImport(true, true);
        await userEvent.upload(
            screen.getByLabelText("Marcher CSV file"),
            new File(["section\nFlute\n"], "band.csv", { type: "text/csv" }),
        );
        await waitFor(() => expect(screen.getByText(/band\.csv/)).toBeTruthy());
        expect(importButton().disabled).toBe(true);
    });

    it("hides the previous file until the newly chosen file has been read", async () => {
        renderImport();
        const input = screen.getByLabelText("Marcher CSV file");
        await userEvent.upload(
            input,
            new File(["section\nFlute\n"], "first.csv", { type: "text/csv" }),
        );
        await waitFor(() =>
            expect(screen.getByText(/first\.csv/)).toBeTruthy(),
        );

        const reads = deferFileReads();
        try {
            await userEvent.upload(
                input,
                new File(["section\nTrumpet\n"], "second.csv", {
                    type: "text/csv",
                }),
            );
            expect(screen.queryByText(/first\.csv/)).toBeNull();
            expect(importButton().disabled).toBe(true);

            reads.pending[0].finish("section\nTrumpet\n");
            await waitFor(() =>
                expect(screen.getByText(/second\.csv/)).toBeTruthy(),
            );
            expect(screen.queryByText(/first\.csv/)).toBeNull();
        } finally {
            reads.restore();
        }
    });

    it("ignores a file read that finishes after a newer file was chosen", async () => {
        renderImport();
        const input = screen.getByLabelText("Marcher CSV file");
        const reads = deferFileReads();
        try {
            await userEvent.upload(
                input,
                new File(["section\nFlute\n"], "first.csv", {
                    type: "text/csv",
                }),
            );
            await userEvent.upload(
                input,
                new File(["section\nTrumpet\n"], "second.csv", {
                    type: "text/csv",
                }),
            );
            expect(reads.pending).toHaveLength(2);

            reads.pending[1].finish("section\nTrumpet\n");
            await waitFor(() =>
                expect(screen.getByText(/second\.csv/)).toBeTruthy(),
            );
            await act(async () => {
                reads.pending[0].finish("section\nFlute\n");
            });
            expect(screen.queryByText(/first\.csv/)).toBeNull();
            expect(screen.getByText(/second\.csv/)).toBeTruthy();
        } finally {
            reads.restore();
        }
    });
});
