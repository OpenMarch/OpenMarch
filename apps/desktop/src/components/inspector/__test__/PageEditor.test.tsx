import { useEffect } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, vi } from "vitest";
import { describeDbTests, schema } from "@/test/base";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useTimingObjects } from "@/hooks";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import PageEditor from "../PageEditor";

/** Selects the first page with more than one beat once the pages have loaded */
function SelectFirstMultiBeatPage() {
    const { pages } = useTimingObjects();
    const { selectedPage, setSelectedPage } = useSelectedPage()!;
    useEffect(() => {
        const page = pages.find((p) => p.beats.length > 1);
        if (!selectedPage && page) setSelectedPage(page);
    }, [pages, selectedPage, setSelectedPage]);
    return null;
}

beforeEach(() => {
    // jsdom lacks ResizeObserver, which the Radix collapsible needs.
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        },
    );
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describeDbTests("PageEditor", (it) => {
    it("splits once when Split page is clicked rapidly", async ({
        wrapper,
        db,
        marchersAndPages,
    }) => {
        const consoleError = vi.spyOn(console, "error");
        render(
            <TolgeeProvider tolgee={tolgee} fallback="Loading...">
                <SelectFirstMultiBeatPage />
                <PageEditor />
            </TolgeeProvider>,
            { wrapper },
        );
        const splitButton = await screen.findByRole(
            "button",
            { name: /split/i },
            { timeout: 5000 },
        );
        await waitFor(() => expect(splitButton).toBeEnabled());

        fireEvent.click(splitButton);
        fireEvent.click(splitButton);

        await waitFor(async () => {
            const pages = await db.select().from(schema.pages);
            expect(pages).toHaveLength(
                marchersAndPages.expectedPages.length + 1,
            );
        });
        // Let a second, stale split finish before checking it did not fail
        await new Promise((resolve) => setTimeout(resolve, 200));
        expect(consoleError).not.toHaveBeenCalledWith(
            tolgee.t("inspector.page.split.error"),
            expect.anything(),
        );
    });
});
