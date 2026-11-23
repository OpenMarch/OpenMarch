import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import { SubmitRevisionForm } from "../MobileExportView";

const uploadMutationFn = vi.hoisted(() => vi.fn());

vi.mock("../queries/useProductions", () => ({
    uploadRevisionMutationOptions: () => ({ mutationFn: uploadMutationFn }),
}));
vi.mock("@/context/SelectedAudioFileContext", () => ({
    useSelectedAudioFile: () => ({ selectedAudioFile: null }),
}));
vi.mock("@/hooks", () => ({ useTimingObjects: () => ({ pages: [] }) }));
vi.mock("@/api/generated/audio-files/audio-files", () => ({
    getGetApiEditorV1ProductionsProductionIdAudioFilesQueryKey: () => ["audio"],
    getGetApiEditorV1ProductionsProductionIdAudioFilesQueryOptions: () => ({
        queryKey: ["audio"],
        queryFn: async () => ({ audio_files: [] }),
    }),
}));
vi.mock("../settings/MobileExportSettings", () => ({
    MobileExportSettingsDialog: () => null,
}));

function renderForm(expiredOn?: string) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <TolgeeProvider tolgee={tolgee} fallback="">
                <SubmitRevisionForm
                    isFirstRevision={false}
                    productionId={7}
                    expiredOn={expiredOn}
                />
            </TolgeeProvider>
        </QueryClientProvider>,
    );
}

beforeAll(async () => {
    await tolgee.run();
});

afterEach(() => {
    cleanup();
    uploadMutationFn.mockReset();
});

describe("SubmitRevisionForm for an expired ensemble", () => {
    it("explains why pushing is off and doesn't push", () => {
        renderForm("2026-12-31");

        const banner = screen.getByTestId("expired-push-banner");
        expect(banner).toHaveTextContent(/expired on .*2026/);
        expect(banner).toHaveTextContent("sales@openmarch.com");

        const button = screen.getByTestId("push-revision-button");
        expect(button).toHaveAttribute("aria-disabled", "true");
        expect(button).toHaveAttribute("aria-describedby", banner.id);

        fireEvent.change(screen.getByPlaceholderText(/Describe what changed/), {
            target: { value: "New drill" },
        });
        fireEvent.click(button);

        expect(uploadMutationFn).not.toHaveBeenCalled();
        // The click points at the reason
        expect(banner.className).toContain("ring-2");
    });

    it("has no banner and an enabled button for an active ensemble", () => {
        renderForm(undefined);
        expect(
            screen.queryByTestId("expired-push-banner"),
        ).not.toBeInTheDocument();
        expect(screen.getByTestId("push-revision-button")).not.toHaveAttribute(
            "aria-disabled",
        );
    });
});
