import { describe, expect, it, afterEach, beforeAll, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import PerformersStep from "../PerformersStep";
import type { NewShowPerformersData } from "../../newShowTypes";

function renderPerformersStep(
    ui: React.ReactElement,
    options?: Parameters<typeof render>[1],
) {
    const queryClient = new QueryClient();
    return render(
        <QueryClientProvider client={queryClient}>
            <TolgeeProvider tolgee={tolgee} fallback="">
                {ui}
            </TolgeeProvider>
        </QueryClientProvider>,
        options,
    );
}

beforeAll(async () => {
    await tolgee.run();
});

describe("PerformersStep", () => {
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it("assigns a defined tempId to every preset marcher on prefill", () => {
        const onChange = vi.fn();

        renderPerformersStep(
            <PerformersStep
                ensemble={{ activity: "Marching Band", size: "Small" }}
                performers={null}
                onChange={onChange}
            />,
        );

        expect(onChange).toHaveBeenCalledTimes(1);
        const payload: NewShowPerformersData = onChange.mock.calls[0][0];
        expect(payload.marchers.length).toBeGreaterThan(0);
        for (const marcher of payload.marchers) {
            expect(marcher.tempId).toBeDefined();
        }
    });

    it("deletes a preset marcher when its trash button is clicked", async () => {
        const onChange = vi.fn();
        const { user } = await import("@testing-library/user-event").then(
            (mod) => ({ user: mod.default.setup() }),
        );

        const { rerender } = renderPerformersStep(
            <PerformersStep
                ensemble={{ activity: "Marching Band", size: "Small" }}
                performers={null}
                onChange={onChange}
            />,
        );

        expect(onChange).toHaveBeenCalledTimes(1);
        const prefillPayload: NewShowPerformersData = onChange.mock.calls[0][0];
        const originalCount = prefillPayload.marchers.length;

        onChange.mockClear();

        // Re-render with the prefilled roster, as the wizard would after the state update
        rerender(
            <QueryClientProvider client={new QueryClient()}>
                <TolgeeProvider tolgee={tolgee} fallback="">
                    <PerformersStep
                        ensemble={{ activity: "Marching Band", size: "Small" }}
                        performers={prefillPayload}
                        onChange={onChange}
                    />
                </TolgeeProvider>
            </QueryClientProvider>,
        );

        // Open the first section so its trash buttons are in the accessibility tree
        const trigger = screen.getAllByRole("button", { expanded: false })[0];
        await user.click(trigger);

        const deleteButtons = screen.getAllByRole("button", { name: "" });
        const trashButton = deleteButtons.find((btn) =>
            btn.querySelector("svg"),
        );
        expect(trashButton).toBeDefined();
        await user.click(trashButton!);

        expect(onChange).toHaveBeenCalledTimes(1);
        const deletePayload: NewShowPerformersData = onChange.mock.calls[0][0];
        expect(deletePayload.marchers.length).toBe(originalCount - 1);
    });
});
