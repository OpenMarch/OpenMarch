import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MarcherForm from "../MarcherForm";
import type { NewMarcherArgs } from "@/db-functions";

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

const renderForm = (onMarchersCreate: (m: NewMarcherArgs[]) => void) =>
    render(
        <MarcherForm
            hideInfoNote
            skipSidebarContent
            onMarchersCreate={onMarchersCreate}
            existingMarchers={[]}
            wizardMode
        />,
        { wrapper: Providers },
    );

const quantityInput = () =>
    screen.getByLabelText(/quantity/i) as HTMLInputElement;
const createButton = () => screen.getByRole("button", { name: /create/i });

describe("MarcherForm quantity", () => {
    beforeAll(async () => {
        await tolgee.run();
    });
    afterEach(() => cleanup());

    it("creates the typed quantity of marchers", async () => {
        const user = userEvent.setup();
        const onMarchersCreate = vi.fn<(m: NewMarcherArgs[]) => void>();
        renderForm(onMarchersCreate);

        await user.tripleClick(quantityInput());
        await user.keyboard("12");

        expect(createButton()).toHaveTextContent("Create 12 Other Marchers");

        await user.click(createButton());

        expect(onMarchersCreate.mock.calls[0][0]).toHaveLength(12);
    });

    /**
     * Regression test for issue #1004.
     *
     * resetForm() calls formRef.current.reset(), which changes the input's DOM
     * value without going through React. If the quantity input is uncontrolled,
     * React's internal value tracker keeps the pre-reset value, and it then
     * suppresses the change event when the user retypes that same value — the
     * button label stays singular and only one marcher gets created.
     */
    it("creates the typed quantity again when the same number is reused after a reset", async () => {
        const user = userEvent.setup();
        const onMarchersCreate = vi.fn<(m: NewMarcherArgs[]) => void>();
        renderForm(onMarchersCreate);

        // First batch of 4 — this submit resets the form.
        await user.tripleClick(quantityInput());
        await user.keyboard("4");
        await user.click(createButton());
        expect(onMarchersCreate.mock.calls[0][0]).toHaveLength(4);

        // The form resets back to 1 after a successful create.
        expect(quantityInput().value).toBe("1");

        // Second batch, retyping the SAME quantity as before.
        await user.tripleClick(quantityInput());
        await user.keyboard("4");

        expect(createButton()).toHaveTextContent("Create 4 Other Marchers");

        await user.click(createButton());

        expect(onMarchersCreate.mock.calls[1][0]).toHaveLength(4);
    });

    it("can be cleared while typing and treats an empty field as 1", async () => {
        const user = userEvent.setup();
        const onMarchersCreate = vi.fn<(m: NewMarcherArgs[]) => void>();
        renderForm(onMarchersCreate);

        await user.clear(quantityInput());

        expect(quantityInput().value).toBe("");
        expect(createButton()).toHaveTextContent("Create Other Marcher");

        // Typing after clearing starts fresh rather than appending to a "1".
        await user.keyboard("25");
        expect(quantityInput().value).toBe("25");
        expect(createButton()).toHaveTextContent("Create 25 Other Marchers");
    });
});
