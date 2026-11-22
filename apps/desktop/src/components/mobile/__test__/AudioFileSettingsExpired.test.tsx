import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import { AudioFileSettings } from "../settings/AudioFileSettings";

const idleMutation = () => ({
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
});

vi.mock("../queries/useAudioFiles", () => ({
    useAudioFiles: () => ({
        data: [],
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
    }),
    useSetActiveAudioFileMutation: () => idleMutation(),
    useAddAudioFileMutation: () => idleMutation(),
}));
vi.mock("@/api/generated/audio-files/audio-files", () => ({
    usePatchApiEditorV1ProductionsProductionIdAudioFilesId: () =>
        idleMutation(),
    useDeleteApiEditorV1ProductionsProductionIdAudioFilesId: () =>
        idleMutation(),
    getGetApiEditorV1ProductionsProductionIdAudioFilesQueryKey: () => ["audio"],
}));

function renderSettings(expiredOn?: string) {
    const queryClient = new QueryClient();
    return render(
        <QueryClientProvider client={queryClient}>
            <TolgeeProvider tolgee={tolgee} fallback="">
                <AudioFileSettings
                    production={{ id: 7, default_audio_file_id: null }}
                    setDefaultAudioFileId={() => {}}
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
});

describe("AudioFileSettings for an expired ensemble", () => {
    it("says why adding audio is off and doesn't open the file picker", () => {
        const { container } = renderSettings("2026-12-31");
        const fileInput = container.querySelector(
            'input[type="file"]',
        ) as HTMLInputElement;
        const pickFile = vi.spyOn(fileInput, "click");

        const note = screen.getByTestId("expired-add-audio-note");
        expect(note).toHaveTextContent(
            /Can't add audio: this ensemble expired on .*2026/,
        );

        const button = screen.getByTestId("add-audio-button");
        expect(button).toHaveAttribute("aria-disabled", "true");
        expect(button).toHaveAttribute("aria-describedby", note.id);

        fireEvent.click(button);
        expect(pickFile).not.toHaveBeenCalled();
        // The click points at the reason
        expect(note.className).toContain("ring-2");
    });

    it("has no note and opens the file picker for an active ensemble", () => {
        const { container } = renderSettings(undefined);
        const fileInput = container.querySelector(
            'input[type="file"]',
        ) as HTMLInputElement;
        const pickFile = vi.spyOn(fileInput, "click");

        expect(
            screen.queryByTestId("expired-add-audio-note"),
        ).not.toBeInTheDocument();
        const button = screen.getByTestId("add-audio-button");
        expect(button).not.toHaveAttribute("aria-disabled");

        fireEvent.click(button);
        expect(pickFile).toHaveBeenCalledOnce();
    });
});
