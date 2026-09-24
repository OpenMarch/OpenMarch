import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import ProjectStep from "../steps/ProjectStep";
import type { NewShowProjectData } from "../../newShowTypes";

const Providers = ({ children }: { children: React.ReactNode }) => (
    <TolgeeProvider tolgee={tolgee} fallback="Loading...">
        {children}
    </TolgeeProvider>
);

const mockElectron = (chosenPath: string) => {
    (window as unknown as { electron: unknown }).electron = {
        getDefaultFilesDirectory: vi.fn(async () => "/Users/jo/Documents"),
        databaseGetPath: vi.fn(async () => ""),
        getDefaultDocumentsPath: vi.fn(async () => "/Users/jo/Documents"),
        fileExists: vi.fn(async () => false),
        showSaveDialog: vi.fn(async () => ({
            canceled: false,
            filePath: chosenPath,
        })),
    };
};

const lastLocation = (onChange: { mock: { calls: unknown[][] } }) =>
    (onChange.mock.calls.at(-1)?.[0] as NewShowProjectData | undefined)
        ?.fileLocation;

describe("ProjectStep file location", () => {
    beforeAll(async () => {
        await tolgee.run();
    });
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    it("renames the file when the show name changes after Browse, keeping the chosen folder", async () => {
        const user = userEvent.setup();
        const onChange = vi.fn<(p: NewShowProjectData) => void>();
        mockElectron("/Users/jo/Chosen/MyShow.dots");

        render(<ProjectStep project={null} onChange={onChange} />, {
            wrapper: Providers,
        });

        const nameInput = screen.getByPlaceholderText(/show name/i);
        await user.type(nameInput, "MyShow");
        await user.click(screen.getByRole("button", { name: /browse/i }));

        await waitFor(() =>
            expect(lastLocation(onChange)).toBe("/Users/jo/Chosen/MyShow.dots"),
        );

        await user.clear(nameInput);
        await user.type(nameInput, "Renamed");

        // The chosen directory is preserved and the filename follows the name.
        expect(lastLocation(onChange)).toBe("/Users/jo/Chosen/Renamed.dots");
        // The preview shown to the user matches what will actually be created.
        expect(screen.getByText("/Users/jo/Chosen/Renamed.dots")).toBeTruthy();
    });

    it("renames when the new name is a prefix of the current filename", async () => {
        const user = userEvent.setup();
        const onChange = vi.fn<(p: NewShowProjectData) => void>();
        mockElectron("/Users/jo/Chosen/Test.dots");

        render(<ProjectStep project={null} onChange={onChange} />, {
            wrapper: Providers,
        });

        const nameInput = screen.getByPlaceholderText(/show name/i);
        await user.type(nameInput, "Test");
        await user.click(screen.getByRole("button", { name: /browse/i }));

        await waitFor(() =>
            expect(lastLocation(onChange)).toBe("/Users/jo/Chosen/Test.dots"),
        );

        // Backspacing to a prefix of the existing filename must still rename.
        await user.type(nameInput, "{backspace}");

        expect(lastLocation(onChange)).toBe("/Users/jo/Chosen/Tes.dots");
    });

    it("keeps a filename customized through Browse, whatever the show name becomes", async () => {
        const user = userEvent.setup();
        const onChange = vi.fn<(p: NewShowProjectData) => void>();
        // A show's file need not be named after the show — a show may span
        // several movements (e.g. "-part1").
        mockElectron("/Users/jo/Chosen/MyShow-part1.dots");

        render(<ProjectStep project={null} onChange={onChange} />, {
            wrapper: Providers,
        });

        const nameInput = screen.getByPlaceholderText(/show name/i);
        await user.type(nameInput, "MyShow");
        await user.click(screen.getByRole("button", { name: /browse/i }));

        await waitFor(() =>
            expect(lastLocation(onChange)).toBe(
                "/Users/jo/Chosen/MyShow-part1.dots",
            ),
        );

        // Renaming the show to something unrelated must not rewrite the file.
        await user.clear(nameInput);
        await user.type(nameInput, "Totally Different");

        expect(lastLocation(onChange)).toBe(
            "/Users/jo/Chosen/MyShow-part1.dots",
        );
        expect(
            screen.getByText("/Users/jo/Chosen/MyShow-part1.dots"),
        ).toBeTruthy();
    });
});
